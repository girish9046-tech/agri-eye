(function () {
  const GRID_VALUES = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2],
    [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 2, 2],
    [1, 0, 0, 0, 0, 0, 1, 1, 0, 2, 1, 0],
    [0, 0, 0, 0, 0, 1, 1, 0, 2, 2, 1, 1],
    [0, 0, 0, 0, 1, 1, 0, 2, 2, 1, 1, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 2, 2, 1, 0],
    [0, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 3, 3, 3, 0, 0, 0],
    [0, 0, 0, 0, 0, 3, 3, 3, 3, 0, 0, 0],
    [0, 0, 0, 0, 0, 3, 3, 3, 0, 0, 0, 0],
  ];

  const STATUS_STYLES = [
    {
      label: "Healthy Crops",
      description: "Crops growing well and showing balanced vigor.",
      color: "#22c55e",
      overlayOpacity: 0.4,
    },
    {
      label: "Needs Fertilizer",
      description: "Nutrient deficiency detected in these cells.",
      color: "#eab308",
      overlayOpacity: 0.48,
    },
    {
      label: "Pest Affected",
      description: "Likely insect activity or disease pressure.",
      color: "#ef4444",
      overlayOpacity: 0.5,
    },
    {
      label: "Waterlogged",
      description: "Excess water detected in low-lying patches.",
      color: "#3b82f6",
      overlayOpacity: 0.48,
    },
  ];

  const FIELD_BOUNDS = {
    north: 30.9478,
    south: 30.9046,
    west: 75.7765,
    east: 75.8293,
  };

  const DEFAULT_IMAGE_FALLBACK = "./assets/farm-topview-Bj11Aaqf.png";
  const HEADING_TEXT = "Field Heatmap";
  const SECTION_ID = "heatmaps";
  const SECTION_MARKER = "agri-field-analysis";
  const AUTH_KEY = "agri-eye-auth";
  const PROFILE_KEY = "agri-eye-profile";
  
  const PROTECTED_PATHS = ["/", "/index.html", "/dashboard", "/profile", "/history", "/help", "/contact", "/heatmaps.html"];

  const state = {
    section: null,
    defaultImage: "",
    baseImage: "",
    baseLabel: "Uploaded field scan",
    mode: "heatmap",
    notice: "Heatmap view uses the uploaded field image as the project base layer.",
    map: null,
    mapContainer: null,
    satelliteLayer: null,
    gridLayer: null,
    fieldOutline: null,
    capturePending: false,
  };

  let enhanceScheduled = false;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isDashboardRoute() {
    const path = window.location.pathname;
    const isRoot = path === "/" || path === "/index.html" || path.endsWith("/index.html");
    const isDashboard = path === "/dashboard" || path.endsWith("/dashboard");
    const isHeatmaps = path.includes("heatmaps.html") || path.endsWith("heatmaps.html");
    return isRoot || isDashboard || isHeatmaps;
  }

  function isHeatmapsPage() {
    const path = window.location.pathname;
    return path.includes("/heatmaps.html") || path.endsWith("/heatmaps.html");
  }

  function isProtectedPath(pathname) {
    return PROTECTED_PATHS.includes(pathname);
  }

  function isAuthenticated() {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(AUTH_KEY) === "true";
    } catch {
      return false;
    }
  }

  function getStoredProfile() {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(PROFILE_KEY) : null;

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getProfileDisplayName(profile) {
    if (!profile) {
      return "Profile";
    }

    const preferred = [profile.fullName, profile.email, profile.phone].find(function (value) {
      return typeof value === "string" && value.trim();
    });

    return preferred ? preferred.trim() : "Profile";
  }

  function getProfileInitials(profile) {
    if (!profile) {
      return "?";
    }

    const fullName = typeof profile.fullName === "string" ? profile.fullName.trim() : "";

    if (fullName) {
      const parts = fullName.split(/\s+/).slice(0, 2);
      return parts
        .map(function (part) {
          return part.charAt(0).toUpperCase();
        })
        .join("");
    }

    const fallback = (profile.email || profile.phone || "?").trim();
    return fallback ? fallback.charAt(0).toUpperCase() : "?";
  }

  function updateTopBarProfile() {
    const profile = getStoredProfile();
    const displayName = getProfileDisplayName(profile);
    const initials = getProfileInitials(profile);
    const header = document.querySelector("header.sticky.top-0.z-30");

    if (!header) {
      return;
    }

    const textNode = header.querySelector("span.text-sm.text-gray-500.hidden.sm\\:block");

    if (textNode) {
      textNode.textContent = displayName;
    }

    const avatarNode = Array.from(header.querySelectorAll('a[href="/profile"] div')).find(function (node) {
      return typeof node.className === "string" && node.className.includes("rounded-full");
    });

    if (avatarNode) {
      avatarNode.textContent = initials;
      avatarNode.setAttribute("title", displayName);
      avatarNode.setAttribute("aria-label", displayName);
    }

    // Update navigation links to point to heatmaps.html
    const navLinks = Array.from(document.querySelectorAll('nav a, header a, aside a'));
    let heatmapLinkFound = false;
    let dashboardLink = null;

    navLinks.forEach(function (link) {
      const href = link.getAttribute('href');
      const text = link.textContent.trim().toLowerCase();
      
      // Handle Heatmap Link
      if (text.includes('heatmap') || (href && href.includes('heatmap'))) {
        link.setAttribute('href', 'heatmaps.html');
        heatmapLinkFound = true;
        
        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = "true";
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'heatmaps.html';
          });
        }

        // Apply visual active state if on Heatmaps page
        if (isHeatmapsPage()) {
          link.classList.add('bg-gray-100', 'text-gray-900', 'font-semibold');
          link.classList.remove('text-gray-600', 'hover:bg-gray-50');
        } else {
          link.classList.remove('bg-gray-100', 'text-gray-900', 'font-semibold');
          link.classList.add('text-gray-600', 'hover:bg-gray-50');
        }
      }
      
      // Handle Dashboard Link
      if (text === 'dashboard' || (href && (href === '/' || href === '/dashboard' || href === 'index.html'))) {
        link.setAttribute('href', 'index.html');
        dashboardLink = link;
        
        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = "true";
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'index.html';
          });
        }

        // Remove active state if on Heatmaps page
        if (isHeatmapsPage()) {
          link.classList.remove('bg-gray-100', 'text-gray-900', 'font-semibold');
          link.classList.add('text-gray-600', 'hover:bg-gray-50');
        } else if (!isHeatmapsPage() && isDashboardRoute()) {
          link.classList.add('bg-gray-100', 'text-gray-900', 'font-semibold');
          link.classList.remove('text-gray-600', 'hover:bg-gray-50');
        }
      }
    });

    // If no Heatmap link was found, try to inject one after the Dashboard link
    if (!heatmapLinkFound && dashboardLink) {
      const heatmapLi = dashboardLink.parentElement.cloneNode(true);
      const newLink = heatmapLi.querySelector('a');
      if (newLink) {
        newLink.setAttribute('href', 'heatmaps.html');
        newLink.removeAttribute('data-agriHijacked');
        
        // Add click listener for new link too
        newLink.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = 'heatmaps.html';
        });
        
        // Update text and icon if possible
        const textSpan = newLink.querySelector('span:not(.sr-only)');
        if (textSpan) {
          textSpan.textContent = 'Heatmaps';
        } else {
          newLink.textContent = 'Heatmaps';
        }

        // Try to change the icon to something map-like if it's a Lucide icon (SVG)
        const svg = newLink.querySelector('svg');
        if (svg) {
          svg.innerHTML = '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"></path><path d="M15 5.764v15"></path><path d="M9 3.236v15"></path>';
        }

        // Handle active state for injected link
        if (isHeatmapsPage()) {
          newLink.classList.add('bg-gray-100', 'text-gray-900', 'font-semibold');
          dashboardLink.classList.remove('bg-gray-100', 'text-gray-900', 'font-semibold');
          dashboardLink.classList.add('text-gray-600', 'hover:bg-gray-50');
        }

        dashboardLink.parentElement.parentElement.insertBefore(heatmapLi, dashboardLink.parentElement.nextSibling);
      }
    }
  }

  function normalizeDashboardNav() {
    Array.from(document.querySelectorAll('a[href="/dashboard#field-analysis"]')).forEach(function (link) {
      link.style.display = "none";
    });

    if (window.location.pathname === "/dashboard" && window.location.hash === "#field-analysis") {
      window.history.replaceState(null, "", "/dashboard#heatmaps");
    }
  }

  function enforceAuthAccess() {
    const pathname = window.location.pathname;
    const isHeatmapFile = pathname.includes('heatmaps.html') || pathname.endsWith('heatmaps.html');
    const isIndexFile = pathname === '/' || pathname === '/index.html' || pathname.endsWith('index.html');

    // Skip auth check if we are already on a protected page that was loaded directly
    // This prevents the "flash" of the landing page
    if ((isHeatmapFile || isIndexFile) && isAuthenticated()) {
      return true;
    }

    if (isProtectedPath(pathname) && !isAuthenticated()) {
      const next = pathname + window.location.hash;
      window.location.replace("/auth?from=" + encodeURIComponent(next));
      return false;
    }

    return true;
  }

  function whenLeafletReady(callback) {
    if (window.L && typeof window.L.map === "function") {
      callback();
      return;
    }

    window.setTimeout(function () {
      whenLeafletReady(callback);
    }, 120);
  }

  function whenLeafletImageReady(callback) {
    if (typeof window.leafletImage === "function") {
      callback();
      return;
    }

    window.setTimeout(function () {
      whenLeafletImageReady(callback);
    }, 120);
  }

  function getMainElement() {
    return document.querySelector("main");
  }

  function getDefaultImageSrc() {
    if (state.defaultImage) {
      return state.defaultImage;
    }

    const existingImage = Array.from(document.querySelectorAll("img")).find(function (image) {
      return image.alt && image.alt.includes("Satellite top-down farm view");
    });

    state.defaultImage =
      (existingImage && (existingImage.currentSrc || existingImage.src)) || DEFAULT_IMAGE_FALLBACK;

    if (!state.baseImage) {
      state.baseImage = state.defaultImage;
    }

    return state.defaultImage;
  }

  function formatLocalTime(date) {
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function getFieldCenter() {
    return [
      (FIELD_BOUNDS.north + FIELD_BOUNDS.south) / 2,
      (FIELD_BOUNDS.west + FIELD_BOUNDS.east) / 2,
    ];
  }

  function hexToRgba(hex, alpha) {
    const sanitized = hex.replace("#", "");
    const red = parseInt(sanitized.substring(0, 2), 16);
    const green = parseInt(sanitized.substring(2, 4), 16);
    const blue = parseInt(sanitized.substring(4, 6), 16);
    return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
  }

  function macroSectorFor(rowIndex, columnIndex) {
    const columnLabel = String.fromCharCode(65 + Math.floor(columnIndex / 3));
    const rowLabel = Math.floor(rowIndex / 3) + 1;
    return columnLabel + rowLabel;
  }

  function buildGridGeoJson() {
    const rows = GRID_VALUES.length;
    const columns = GRID_VALUES[0].length;
    const latStep = (FIELD_BOUNDS.north - FIELD_BOUNDS.south) / rows;
    const lngStep = (FIELD_BOUNDS.east - FIELD_BOUNDS.west) / columns;

    return {
      type: "FeatureCollection",
      features: GRID_VALUES.flatMap(function (row, rowIndex) {
        return row.map(function (value, columnIndex) {
          const north = FIELD_BOUNDS.north - rowIndex * latStep;
          const south = north - latStep;
          const west = FIELD_BOUNDS.west + columnIndex * lngStep;
          const east = west + lngStep;
          const status = STATUS_STYLES[value];

          return {
            type: "Feature",
            properties: {
              category: value,
              label: status.label,
              description: status.description,
              color: status.color,
              sector: macroSectorFor(rowIndex, columnIndex),
              cellId: "R" + (rowIndex + 1) + "C" + (columnIndex + 1),
            },
            geometry: {
              type: "Polygon",
              coordinates: [[
                [west, north],
                [east, north],
                [east, south],
                [west, south],
                [west, north],
              ]],
            },
          };
        });
      }),
    };
  }

  function getStatusStats() {
    const totals = STATUS_STYLES.map(function (status) {
      return {
        label: status.label,
        description: status.description,
        color: status.color,
        count: 0,
        percentage: 0,
      };
    });

    GRID_VALUES.flat().forEach(function (value) {
      totals[value].count += 1;
    });

    const totalCells = GRID_VALUES.length * GRID_VALUES[0].length;

    totals.forEach(function (entry) {
      entry.percentage = Math.round((entry.count / totalCells) * 100);
    });

    return totals;
  }

  function buildHeatmapGridHtml() {
    return GRID_VALUES.flat()
      .map(function (value, index) {
        const status = STATUS_STYLES[value];
        const title = status.label + " | " + status.description;

        return (
          '<div class="agri-heatmap-grid__cell" title="' +
          escapeHtml(title) +
          '" style="background:' +
          hexToRgba(status.color, status.overlayOpacity) +
          ';"></div>'
        );
      })
      .join("");
  }

  function buildMacroLinesSvg() {
    const columns = GRID_VALUES[0].length;
    const rows = GRID_VALUES.length;
    const verticalLines = Array.from({ length: columns + 1 }, function (_, index) {
      return (
        '<line x1="' +
        index +
        '" y1="0" x2="' +
        index +
        '" y2="' +
        rows +
        '" stroke="rgba(255,255,255,0.14)" stroke-width="0.03"></line>'
      );
    }).join("");

    const horizontalLines = Array.from({ length: rows + 1 }, function (_, index) {
      return (
        '<line x1="0" y1="' +
        index +
        '" x2="' +
        columns +
        '" y2="' +
        index +
        '" stroke="rgba(255,255,255,0.14)" stroke-width="0.03"></line>'
      );
    }).join("");

    const macroVertical = Array.from({ length: Math.floor(columns / 3) + 1 }, function (_, index) {
      return (
        '<line x1="' +
        index * 3 +
        '" y1="0" x2="' +
        index * 3 +
        '" y2="' +
        rows +
        '" stroke="rgba(255,255,255,0.34)" stroke-width="0.08"></line>'
      );
    }).join("");

    const macroHorizontal = Array.from({ length: Math.floor(rows / 3) + 1 }, function (_, index) {
      return (
        '<line x1="0" y1="' +
        index * 3 +
        '" x2="' +
        columns +
        '" y2="' +
        index * 3 +
        '" stroke="rgba(255,255,255,0.34)" stroke-width="0.08"></line>'
      );
    }).join("");

    return (
      '<svg viewBox="0 0 ' +
      columns +
      " " +
      rows +
      '" preserveAspectRatio="none">' +
      verticalLines +
      horizontalLines +
      macroVertical +
      macroHorizontal +
      "</svg>"
    );
  }

  function buildLegendHtml() {
    return getStatusStats()
      .map(function (item) {
        return (
          '<div class="agri-legend-item">' +
          '<span class="agri-legend-item__swatch" style="background:' +
          escapeHtml(item.color) +
          ';"></span>' +
          '<div class="agri-legend-item__text">' +
          "<strong>" +
          escapeHtml(item.label) +
          " | " +
          item.percentage +
          "%</strong>" +
          "<span>" +
          escapeHtml(item.description) +
          "</span>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function buildHeatmapSidebarHtml() {
    const stats = getStatusStats();
    const highRiskCount = stats[2].count + stats[3].count;
    const imageLabel =
      state.baseImage && state.baseImage !== getDefaultImageSrc()
        ? "Captured satellite screenshot"
        : "Uploaded field scan";

    if (!isHeatmapsPage()) {
      return (
        '<div class="agri-side-card">' +
        '<div class="agri-side-card__header">' +
        "<div>" +
        '<h3 class="agri-side-card__title">Quick Summary</h3>' +
        '<p class="agri-side-card__meta">Snapshot of current field health.</p>' +
        "</div>" +
        "</div>" +
        '<div class="agri-side-card__body">' +
        '<div class="agri-heatmap-summary" style="margin-top:0;">' +
        '<div class="agri-summary-chip"><strong>144</strong><span>Cells scanned</span></div>' +
        '<div class="agri-summary-chip"><strong>' + stats[0].percentage + '%</strong><span>Healthy</span></div>' +
        "</div>" +
        '<div class="agri-info-item" style="margin-top:1rem;background:#fff7ed;border-color:#ffedd5;">' +
        '<strong>Attention Required</strong>' +
        '<span>' + highRiskCount + ' critical cells identified in the latest scan.</span>' +
        '</div>' +
        '<div style="margin-top:1.25rem;">' +
        '<button class="agri-action-button agri-action-button--primary" style="width:100%;" onclick="window.location.href=\'heatmaps.html\'">' +
        'Open Full Analysis Workspace' +
        '</button>' +
        '</div>' +
        "</div>" +
        "</div>"
      );
    }

    return (
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Heatmap Summary</h3>' +
      '<p class="agri-side-card__meta">Project grid overlay on the latest field image.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-info-list">' +
      '<div class="agri-info-item"><strong>Base Layer</strong><span>' +
      escapeHtml(imageLabel + " | " + state.baseLabel) +
      "</span></div>" +
      '<div class="agri-info-item"><strong>Current Focus</strong><span>12 x 12 project grid mapped over Sector A with four macro blocks in each direction.</span></div>' +
      '<div class="agri-info-item"><strong>Priority Cells</strong><span>' +
      highRiskCount +
      ' cells need attention first because they show pest pressure or waterlogging.</span></div>' +
      "</div>" +
      '<div class="agri-heatmap-summary">' +
      '<div class="agri-summary-chip"><strong>14.2 ha</strong><span>Mapped field area</span></div>' +
      '<div class="agri-summary-chip"><strong>45 min</strong><span>Since last scan</span></div>' +
      '<div class="agri-summary-chip"><strong>144</strong><span>Total grid cells</span></div>' +
      '<div class="agri-summary-chip"><strong>' +
      stats[0].percentage +
      '%</strong><span>Healthy coverage</span></div>' +
      "</div>" +
      '<div class="agri-side-card__header" style="padding-left:0;padding-right:0;padding-bottom:0.7rem;padding-top:1.15rem;">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Legend</h3>' +
      '<p class="agri-side-card__meta">These colors come from the current project grid.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-legend-list">' +
      buildLegendHtml() +
      "</div>" +
      '<div class="agri-capture-status">' +
      escapeHtml(state.notice) +
      "</div>" +
      (state.baseImage && state.baseImage !== getDefaultImageSrc()
        ? '<div style="margin-top:0.9rem;"><button class="agri-action-button agri-action-button--ghost" data-action="reset-image" type="button">Use Uploaded Image Again</button></div>'
        : "") +
      "</div>" +
      "</div>"
    );
  }

  function buildSatelliteSidebarHtml() {
    const center = getFieldCenter();

    return (
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Satellite Capture</h3>' +
      '<p class="agri-side-card__meta">Pan or zoom the live map, then capture the visible area into Heatmap view.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-instruction-list">' +
      '<div class="agri-instruction-item"><strong>1. Frame The Field</strong><span>Use the real satellite basemap to position the current project area exactly where you want it.</span></div>' +
      '<div class="agri-instruction-item"><strong>2. Capture Screenshot</strong><span>Click the capture button and the visible satellite canvas becomes the new heatmap base image.</span></div>' +
      '<div class="agri-instruction-item"><strong>3. Review Heatmap</strong><span>After capture, the app switches back to Heatmap view and overlays the same project grid on top of that screenshot.</span></div>' +
      "</div>" +
      '<div class="agri-status-box" style="margin-top:0.9rem;"><strong>Field Center</strong><span>' +
      escapeHtml(center[0].toFixed(5) + ", " + center[1].toFixed(5)) +
      "</span></div>" +
      '<div class="agri-status-box" style="margin-top:0.9rem;"><strong>Overlay On Map</strong><span>Subtle grid boundaries and field outline only, so Satellite view stays visually different from Heatmap view.</span></div>' +
      '<div class="agri-capture-status" data-role="satellite-status">' +
      escapeHtml(state.notice) +
      "</div>" +
      '<div style="display:flex;gap:0.65rem;flex-wrap:wrap;margin-top:0.95rem;">' +
      '<button class="agri-action-button agri-action-button--primary" data-action="capture-view" type="button"' +
      (state.capturePending ? " disabled" : "") +
      ">" +
      (state.capturePending ? "Capturing..." : "Capture Current Satellite View") +
      "</button>" +
      '<button class="agri-action-button agri-action-button--secondary" data-action="recenter-map" type="button">Recenter Field</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function buildHeatmapStageHtml() {
    const topLabels = ["A", "B", "C", "D"]
      .map(function (label) {
        return '<span class="agri-macro-label">' + label + "</span>";
      })
      .join("");

    const leftLabels = ["1", "2", "3", "4"]
      .map(function (label) {
        return '<span class="agri-macro-label">' + label + "</span>";
      })
      .join("");

    const uploadButton = isHeatmapsPage() ? 
      '<div style="margin-top: 0.5rem;">' +
      '<input type="file" id="agri-file-upload" class="agri-upload-input" accept="image/*" />' +
      '<button class="agri-action-button agri-action-button--secondary agri-upload-trigger" onclick="document.getElementById(\'agri-file-upload\').click()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>' +
      'Upload New Field Image' +
      '</button>' +
      '</div>' : '';

    return (
      '<div class="agri-stage-card">' +
      '<div class="agri-stage-card__header">' +
      "<div>" +
      '<h3 class="agri-stage-card__title">' + (isHeatmapsPage() ? 'Advanced Field Heatmap' : 'Heatmap View') + '</h3>' +
      '<p class="agri-stage-card__meta">' + (isHeatmapsPage() ? 'Full-scale analysis of crop health with custom imagery support.' : 'Uploaded imagery with the project heatmap grid applied directly on top.') + '</p>' +
      uploadButton +
      "</div>" +
      "</div>" +
      '<div class="agri-stage agri-stage--heatmap">' +
      '<img class="agri-stage__image" src="' +
      escapeHtml(state.baseImage || getDefaultImageSrc()) +
      '" alt="Field scan with heatmap overlay" />' +
      '<div class="agri-stage__scrim"></div>' +
      '<div class="agri-stage__top-labels">' +
      topLabels +
      "</div>" +
      '<div class="agri-stage__left-labels">' +
      leftLabels +
      "</div>" +
      '<div class="agri-stage__badge">' + (isHeatmapsPage() ? 'Enlarged View + Custom Uploads' : 'Uploaded Image + Project Heatmap') + '</div>' +
      '<div class="agri-stage__status">' +
      escapeHtml(state.baseLabel) +
      "</div>" +
      '<div class="agri-heatmap-grid">' +
      buildHeatmapGridHtml() +
      "</div>" +
      '<div class="agri-heatmap-grid__macro-lines">' +
      buildMacroLinesSvg() +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function buildSatelliteStageHtml() {
    return (
      '<div class="agri-stage-card">' +
      '<div class="agri-stage-card__header">' +
      "<div>" +
      '<h3 class="agri-stage-card__title">Satellite View</h3>' +
      '<p class="agri-stage-card__meta">Live Leaflet map with the field boundary and project grid outline only.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-stage agri-stage--satellite">' +
      '<div class="agri-map-overlay-badge">Live Satellite Basemap</div>' +
      '<div id="agri-satellite-map" class="agri-leaflet-map"></div>' +
      "</div>" +
      "</div>"
    );
  }

  function buildSectionHtml() {
    const sectionClass = isHeatmapsPage() ? SECTION_MARKER + " agri-field-analysis--enlarged" : SECTION_MARKER;
    const title = isHeatmapsPage() ? "Dedicated Heatmaps Hub" : "Heatmaps Workspace";
    const subtitle = isHeatmapsPage() 
      ? "Detailed field health monitoring. Upload custom imagery or capture live satellite data to generate precision heatmaps."
      : "Summary view of crop health. Click the button to enter the full workspace for advanced tools.";

    // Ensure the section has the correct class
    if (state.section) {
      state.section.className = sectionClass;
    }

    const actionsHtml = isHeatmapsPage() ? 
      '<div class="agri-field-analysis__actions">' +
      '<div class="agri-view-switch" role="tablist" aria-label="Heatmap views">' +
      '<button type="button" class="agri-view-switch__button ' +
      (state.mode === "heatmap" ? "is-active" : "") +
      '" data-action="switch-mode" data-mode="heatmap">Heatmap View</button>' +
      '<button type="button" class="agri-view-switch__button ' +
      (state.mode === "satellite" ? "is-active" : "") +
      '" data-action="switch-mode" data-mode="satellite">Satellite View</button>' +
      "</div>" +
      "</div>" : "";

    return (
      '<div class="agri-field-analysis__header">' +
      '<div>' +
      '<span class="agri-field-analysis__eyebrow">' + (isHeatmapsPage() ? 'Heatmaps Hub' : 'Heatmap Preview') + '</span>' +
      '<h2 class="agri-field-analysis__title">' + title + '</h2>' +
      '<p class="agri-field-analysis__subtitle">' + subtitle + '</p>' +
      "</div>" +
      actionsHtml +
      "</div>" +
      '<div class="agri-field-analysis__content">' +
      (state.mode === "heatmap" ? buildHeatmapStageHtml() : buildSatelliteStageHtml()) +
      (state.mode === "heatmap" ? buildHeatmapSidebarHtml() : buildSatelliteSidebarHtml()) +
      "</div>"
    );
  }

  function destroyMap() {
    if (state.map) {
      state.map.remove();
      state.map = null;
      state.mapContainer = null;
      state.satelliteLayer = null;
      state.gridLayer = null;
      state.fieldOutline = null;
    }
  }

  function renderSection() {
    if (!state.section) {
      return;
    }

    state.section.innerHTML = buildSectionHtml();
    state.section.dataset.agriRendered = "true";

    if (state.mode === "satellite") {
      mountSatelliteMap();
      return;
    }

    destroyMap();
  }

  function fitMapToField() {
    if (!state.map) {
      return;
    }

    state.map.fitBounds(
      [
        [FIELD_BOUNDS.south, FIELD_BOUNDS.west],
        [FIELD_BOUNDS.north, FIELD_BOUNDS.east],
      ],
      { padding: [28, 28] }
    );
  }

  function mountSatelliteMap() {
    whenLeafletReady(function () {
      const mapElement = document.getElementById("agri-satellite-map");

      if (!mapElement || state.mode !== "satellite") {
        return;
      }

      if (state.map && state.mapContainer === mapElement) {
        window.setTimeout(function () {
          state.map.invalidateSize();
        }, 0);
        return;
      }

      destroyMap();

      const map = window.L.map(mapElement, {
        preferCanvas: true,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      });

      const satelliteLayer = window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri",
          crossOrigin: true,
        }
      );

      satelliteLayer.addTo(map);

      const gridLayer = window.L.geoJSON(buildGridGeoJson(), {
        style: function () {
          return {
            color: "#ffffff",
            weight: 1,
            opacity: 0.82,
            fillColor: "#ffffff",
            fillOpacity: 0.02,
          };
        },
      }).addTo(map);

      const fieldOutline = window.L.rectangle(
        [
          [FIELD_BOUNDS.south, FIELD_BOUNDS.west],
          [FIELD_BOUNDS.north, FIELD_BOUNDS.east],
        ],
        {
          color: "#86efac",
          weight: 1.5,
          opacity: 0.95,
          fillOpacity: 0,
          interactive: false,
        }
      ).addTo(map);

      state.map = map;
      state.mapContainer = mapElement;
      state.satelliteLayer = satelliteLayer;
      state.gridLayer = gridLayer;
      state.fieldOutline = fieldOutline;

      fitMapToField();

      window.setTimeout(function () {
        map.invalidateSize();
      }, 0);
    });
  }

  function updateSatelliteStatus(message) {
    const statusElement = state.section && state.section.querySelector('[data-role="satellite-status"]');

    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  function captureSatelliteView() {
    if (state.capturePending) {
      return;
    }

    if (!state.map) {
      state.notice = "Satellite map is still loading. Please wait a moment and try again.";
      renderSection();
      return;
    }

    state.capturePending = true;
    updateSatelliteStatus("Capturing the current satellite canvas...");

    whenLeafletImageReady(function () {
      if (!state.map) {
        state.capturePending = false;
        return;
      }

      window.leafletImage(state.map, function (error, canvas) {
        state.capturePending = false;

        if (error || !canvas) {
          state.notice =
            "Capture failed on this basemap. Try recentering the field and capturing again.";
          renderSection();
          return;
        }

        try {
          state.baseImage = canvas.toDataURL("image/png");
          state.baseLabel = "Captured from Satellite View on " + formatLocalTime(new Date());
          state.mode = "heatmap";
          state.notice =
            "Satellite view captured successfully. The same project grid is now shown over the captured screenshot.";
          renderSection();
        } catch (captureError) {
          state.notice =
            "The browser blocked exporting the satellite canvas. Please try again after the map fully loads.";
          renderSection();
        }
      });
    });
  }

  function handleFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      state.baseImage = e.target.result;
      state.baseLabel = "Uploaded: " + file.name + " (" + formatLocalTime(new Date()) + ")";
      state.notice = "New field image uploaded successfully. Heatmap grid has been applied.";
      renderSection();
    };
    reader.readAsDataURL(file);
  }

  function handleSectionClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const action = button.getAttribute("data-action");

    if (action === "switch-mode") {
      const mode = button.getAttribute("data-mode");

      if (mode && mode !== state.mode) {
        state.mode = mode;
        state.notice =
          mode === "heatmap"
            ? "Heatmap view uses the uploaded field image as the project base layer."
            : "Satellite view is live. Frame the field and capture the visible area when ready.";
        renderSection();
      }
      return;
    }

    if (action === "capture-view") {
      captureSatelliteView();
      return;
    }

    if (action === "recenter-map") {
      fitMapToField();
      return;
    }

    if (action === "reset-image") {
      state.baseImage = getDefaultImageSrc();
      state.baseLabel = "Uploaded field scan";
      state.notice = "Reverted to the uploaded field image for Heatmap view.";
      renderSection();
    }
  }

  function findLegacyHeatmapCard() {
    const headings = Array.from(document.querySelectorAll("h3"));
    const heading = headings.find(function (node) {
      return node.textContent && node.textContent.includes(HEADING_TEXT);
    });

    return heading ? heading.closest("div.bg-white.rounded-xl") : null;
  }

  function normalizeLegacyLayout() {
    const legacyCard = findLegacyHeatmapCard();

    if (!legacyCard) {
      return null;
    }

    const legacyColumn = legacyCard.parentElement;
    const legacyRow = legacyColumn && legacyColumn.parentElement;

    if (legacyColumn && !legacyColumn.dataset.agriHidden) {
      legacyColumn.dataset.agriHidden = "true";
      legacyColumn.style.display = "none";
    }

    if (legacyRow) {
      const siblingColumns = Array.from(legacyRow.children).filter(function (node) {
        return node !== legacyColumn;
      });

      if (siblingColumns.length === 1) {
        legacyRow.style.gridTemplateColumns = "1fr";
        siblingColumns[0].style.gridColumn = "1 / -1";
      }
    }

    return legacyRow;
  }

  function ensureSection() {
    if (!isDashboardRoute()) {
      destroyMap();
      return;
    }

    const main = getMainElement();

    if (!main) {
      return;
    }

    if (state.section && !document.body.contains(state.section)) {
      state.section = null;
    }

    const legacyRow = normalizeLegacyLayout();
    const sectionClass = isHeatmapsPage() ? SECTION_MARKER + " agri-field-analysis--enlarged" : SECTION_MARKER;

    if (!state.section) {
      const existingSection = document.getElementById(SECTION_ID);

      if (existingSection && existingSection.classList.contains(SECTION_MARKER)) {
        state.section = existingSection;
      } else {
        state.section = document.createElement("section");
        state.section.id = SECTION_ID;
        state.section.className = sectionClass;
        state.section.addEventListener("click", handleSectionClick);
        state.section.addEventListener("change", function(event) {
          if (event.target.id === "agri-file-upload") {
            handleFileUpload(event);
          }
        });
      }
    }

    getDefaultImageSrc();

    let insertedNow = false;

    if (!state.section.isConnected) {
      if (legacyRow && legacyRow.parentElement) {
        legacyRow.parentElement.insertBefore(state.section, legacyRow);
      } else {
        main.appendChild(state.section);
      }
      insertedNow = true;
    }

    if (insertedNow || !state.section.dataset.agriRendered || !state.section.children.length) {
      renderSection();
    }
  }

  function scheduleEnhancement() {
    if (enhanceScheduled) {
      return;
    }

    enhanceScheduled = true;
    window.requestAnimationFrame(function () {
      enhanceScheduled = false;
      if (!enforceAuthAccess()) {
        return;
      }
      normalizeDashboardNav();
      updateTopBarProfile();
      ensureSection();
    });
  }

  document.addEventListener("DOMContentLoaded", scheduleEnhancement);
  window.addEventListener("load", scheduleEnhancement);
  window.addEventListener("hashchange", scheduleEnhancement);
  window.addEventListener("popstate", scheduleEnhancement);
  window.addEventListener("storage", scheduleEnhancement);

  document.addEventListener("submit", function (event) {
    const form = event.target;

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const hasProfileFields =
      form.querySelector('input[name="fullName"]') &&
      form.querySelector('input[name="farmLocation"]');

    if (hasProfileFields) {
      window.setTimeout(function () {
        updateTopBarProfile();
      }, 0);
    }
  });

  const observer = new MutationObserver(function () {
    scheduleEnhancement();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
