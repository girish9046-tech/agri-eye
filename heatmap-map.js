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

  const FIELD_AREA_HECTARES = 14.2;
  const DEFAULT_IMAGE_FALLBACK = "./assets/farm-topview-Bj11Aaqf.png";
  const HEADING_TEXT = "Field Heatmap";
  const SECTION_ID = "heatmaps";
  const SECTION_MARKER = "agri-field-analysis";
  const AUTH_KEY = "agri-eye-auth";
  const PROFILE_KEY = "agri-eye-profile";
  const DEFAULT_BASE_LABEL = "Default field image";
  const DEFAULT_HEATMAP_NOTICE = "Heatmap view uses the default field image as the project base layer.";
  const DEFAULT_SATELLITE_NOTICE = "Satellite view is live. Frame the field and capture the visible area when ready.";
  const RECOMMENDATION_ITEMS = [
    {
      title: "Apply Split Nitrogen Feeding",
      priority: "High",
      sector: "A2",
      score: 82,
      theme: "nutrient",
      description: "Use a split urea or NPK top-dress in low-vigor cells instead of a broad full-field dose, then verify response after 7 days.",
    },
    {
      title: "Correct Micronutrient Gap",
      priority: "High",
      sector: "B2",
      score: 74,
      theme: "nutrient",
      description: "Add zinc and sulphur support where yellowing continues after nitrogen correction, especially in sandy or low organic-matter soil.",
    },
    {
      title: "Irrigate By Soil Moisture",
      priority: "High",
      sector: "Full field",
      score: 68,
      theme: "water",
      description: "Keep moisture near the optimal band for the selected crop and avoid watering waterlogged cells until surface drying improves.",
    },
    {
      title: "Scout For Aphid Pressure",
      priority: "Urgent",
      sector: "C4",
      score: 91,
      theme: "pest",
      description: "Inspect the pest-affected cluster and spray only after confirming leaf curl or sticky residue in the flagged zone.",
    },
    {
      title: "Improve Drainage",
      priority: "Medium",
      sector: "C4",
      score: 57,
      theme: "water",
      description: "Open drainage channels and reduce standing water around the low-lying waterlogged strip before the next irrigation cycle.",
    },
    {
      title: "Choose Weather-Safe Crop Window",
      priority: "Medium",
      sector: "Full field",
      score: 63,
      theme: "weather",
      description: "Prefer short-duration crops if rainfall risk increases, and delay sowing or spraying if the upcoming forecast shows heavy rain.",
    },
    {
      title: "Prioritize Profit Crop Mix",
      priority: "Medium",
      sector: "A1-D4",
      score: 71,
      theme: "profit",
      description: "Match crop choice with soil moisture, heatmap health, and local price trend; keep high-input crops only in stable, well-drained blocks.",
    },
    {
      title: "Plan Verification Scan",
      priority: "Routine",
      sector: "Full field",
      score: 46,
      theme: "scan",
      description: "Capture a fresh heatmap after treatment so the next comparison clearly shows whether hotspot intensity is dropping.",
    },
  ];
  
  const PROTECTED_PATHS = ["/", "/index.html", "/dashboard", "/profile", "/history", "/help", "/contact", "/heatmaps.html", "/recommendations.html"];

  const state = {
    section: null,
    defaultImage: "",
    baseImage: "",
    baseCanvas: null,
    baseLabel: DEFAULT_BASE_LABEL,
    sourceType: "uploaded-default",
    mode: "heatmap",
    notice: DEFAULT_HEATMAP_NOTICE,
    map: null,
    mapContainer: null,
    satelliteLayer: null,
    gridLayer: null,
    fieldOutline: null,
    capturePending: false,
  };

  let enhanceScheduled = false;
  let cropHealthSection = null;
  let recommendationsSection = null;
  let pendingSectionFocus = "";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isDashboardRoute() {
    const hash = window.location.hash;
    const path = window.location.pathname;
    // HashRouter: dashboard is at /#/dashboard
    const isHashDashboard = hash === '#/dashboard' || hash.startsWith('#/dashboard');
    // Legacy: direct file access
    const isRoot = path === '/' || path === '/index.html' || path.endsWith('/index.html');
    const isDashboard = path === '/dashboard' || path.endsWith('/dashboard');
    const isHeatmaps = path.includes('heatmaps.html') || path.endsWith('heatmaps.html');
    const isRecommendations = path.includes('recommendations.html') || path.endsWith('recommendations.html');
    return isHashDashboard || ((isRoot || isDashboard) && hash === '') || isHeatmaps || isRecommendations;
  }

  function isHeatmapsPage() {
    try {
      return sessionStorage.getItem('agri-eye-heatmaps-mode') === 'true';
    } catch (e) {
      return false;
    }
  }

  function setHeatmapsMode(enabled) {
    try {
      if (enabled) {
        sessionStorage.setItem('agri-eye-heatmaps-mode', 'true');
        sessionStorage.removeItem('agri-eye-crop-health-mode');
        sessionStorage.removeItem('agri-eye-recommendations-mode');
      } else {
        sessionStorage.removeItem('agri-eye-heatmaps-mode');
      }
    } catch (e) { /* ignore */ }
  }

  function isCropHealthPage() {
    try {
      return sessionStorage.getItem('agri-eye-crop-health-mode') === 'true';
    } catch (e) {
      return false;
    }
  }

  function setCropHealthMode(enabled) {
    try {
      if (enabled) {
        sessionStorage.setItem('agri-eye-crop-health-mode', 'true');
        sessionStorage.removeItem('agri-eye-heatmaps-mode');
        sessionStorage.removeItem('agri-eye-recommendations-mode');
      } else {
        sessionStorage.removeItem('agri-eye-crop-health-mode');
      }
    } catch (e) { /* ignore */ }
  }

  function isRecommendationsPage() {
    try {
      return sessionStorage.getItem('agri-eye-recommendations-mode') === 'true';
    } catch (e) {
      return false;
    }
  }

  function setRecommendationsMode(enabled) {
    try {
      if (enabled) {
        sessionStorage.setItem('agri-eye-recommendations-mode', 'true');
        sessionStorage.removeItem('agri-eye-heatmaps-mode');
        sessionStorage.removeItem('agri-eye-crop-health-mode');
      } else {
        sessionStorage.removeItem('agri-eye-recommendations-mode');
      }
    } catch (e) { /* ignore */ }
  }

  /** Returns true if user is on a page mode that takes over the dashboard */
  function isSubPageActive() {
    return isHeatmapsPage() || isCropHealthPage() || isRecommendationsPage();
  }

  function clearPendingSectionFocus() {
    pendingSectionFocus = "";
  }

  function queueSectionFocus(sectionId) {
    pendingSectionFocus = sectionId || "";
  }

  function flushPendingSectionFocus() {
    if (!pendingSectionFocus) {
      return;
    }

    const sectionId = pendingSectionFocus;
    const target = document.getElementById(sectionId);

    if (!target || target.style.display === "none") {
      return;
    }

    pendingSectionFocus = "";

    window.setTimeout(function () {
      const resolvedTarget = document.getElementById(sectionId);

      if (resolvedTarget) {
        resolvedTarget.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 120);
  }

  /**
   * Navigate within the React SPA without a full page reload.
   * Works with HashRouter by setting window.location.hash.
   */
  function navigateSPA(hashRoute) {
    // hashRoute should be like '#/dashboard'
    if (window.location.hash === hashRoute) {
      // Already there, just trigger re-render
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    window.location.hash = hashRoute;
  }

  function restoreDashboardLayout(options) {
    const settings = options || {};

    setHeatmapsMode(false);
    setCropHealthMode(false);
    setRecommendationsMode(false);
    resetHeatmapState();

    if (state.section) {
      state.section.style.display = "";
      state.section.className = SECTION_MARKER;
      state.section.dataset.agriRendered = "";
    }

    if (cropHealthSection && cropHealthSection.isConnected) {
      cropHealthSection.style.display = "none";
      cropHealthSection.dataset.agriRendered = "";
    }

    if (recommendationsSection && recommendationsSection.isConnected) {
      recommendationsSection.style.display = "none";
      recommendationsSection.dataset.agriRendered = "";
    }

    if (isDashboardRoute()) {
      hideOtherDashboardContent(false);
    }

    if (settings.focusId) {
      queueSectionFocus(settings.focusId);
    } else {
      clearPendingSectionFocus();
    }
  }

  function openDashboardHome() {
    restoreDashboardLayout();
    navigateSPA('#/dashboard');
    scheduleEnhancement();
  }

  function openDashboardSection(sectionId) {
    if (sectionId === "recommendations") {
      openRecommendationsWorkspace();
      return;
    }

    restoreDashboardLayout({ focusId: sectionId });
    navigateSPA('#/dashboard');
    scheduleEnhancement();
  }

  function openHeatmapsWorkspace() {
    clearPendingSectionFocus();
    setHeatmapsMode(true);
    setCropHealthMode(false);

    if (isDashboardRoute()) {
      hideOtherDashboardContent(true);
    }

    if (cropHealthSection && cropHealthSection.isConnected) {
      cropHealthSection.style.display = "none";
    }

    navigateSPA('#/dashboard');

    if (state.section) {
      state.section.dataset.agriRendered = "";
    }

    scheduleEnhancement();
  }

  function openRecommendationsWorkspace() {
    clearPendingSectionFocus();
    setRecommendationsMode(true);
    resetHeatmapState();

    if (state.section) {
      state.section.className = SECTION_MARKER;
      state.section.dataset.agriRendered = "";
    }

    if (isDashboardRoute()) {
      hideOtherDashboardContent(true);
    }

    navigateSPA('#/dashboard');
    ensureRecommendationsSection();
    normalizeDashboardNav();
    scheduleEnhancement();
  }

  function openAlertsPage() {
    clearPendingSectionFocus();
    setHeatmapsMode(false);
    setCropHealthMode(false);
    setRecommendationsMode(false);
    window.location.href = "./alerts_v3.html";
  }

  function openCropHealthWorkspace() {
    clearPendingSectionFocus();
    setCropHealthMode(true);
    resetHeatmapState();

    if (state.section) {
      state.section.className = SECTION_MARKER;
      state.section.dataset.agriRendered = "";
    }

    if (isDashboardRoute()) {
      hideOtherDashboardContent(true);
    }

    navigateSPA('#/dashboard');
    ensureCropHealthSection();
    normalizeDashboardNav();
    scheduleEnhancement();
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

    // Find avatar node — works with both /profile and HashRouter #/profile hrefs
    const profileLinks = Array.from(header.querySelectorAll('a'));
    let avatarNode = null;
    profileLinks.forEach(function (pLink) {
      const h = pLink.getAttribute('href') || '';
      if (h.includes('profile')) {
        const circle = pLink.querySelector('div');
        if (circle && typeof circle.className === 'string' && circle.className.includes('rounded-full')) {
          avatarNode = circle;
        }
      }
    });

    if (avatarNode) {
      avatarNode.textContent = initials;
      avatarNode.setAttribute("title", displayName);
      avatarNode.setAttribute("aria-label", displayName);
    }

    // Update navigation links to use SPA navigation instead of full page reloads
    const navLinks = Array.from(document.querySelectorAll('nav a, header a, aside a'));
    let heatmapLinkFound = false;
    let cropHealthLinkFound = false;
    let recommendationsLinkFound = false;
    let dashboardLink = null;

    navLinks.forEach(function (link) {
      const href = link.getAttribute('href');
      const text = link.textContent.trim().toLowerCase();
      const isHeatmap = text.includes('heatmap') || (href && href.includes('heatmap'));
      const isDashboard = text === 'dashboard' || (href && (href === '/' || href === '/dashboard' || href === 'index.html' || href === 'dashboard'));
      const isRecommendations = !isHeatmap && !isDashboard && (text.includes('recommendation') || (href && href.includes('recommendation')));
      const isAlerts = !isHeatmap && !isDashboard && !isRecommendations && (text.includes('alert') || (href && href.includes('alert')));

      // Handle Heatmap Link — navigate to #/dashboard within the SPA, with heatmaps mode
      if (isHeatmap) {
        link.setAttribute('href', '#/dashboard');
        link.dataset.agriNavRole = 'heatmaps';
        heatmapLinkFound = true;
        
        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = "true";
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openHeatmapsWorkspace();
          });
        }

        // Apply visual active state if on Heatmaps page — use green styling to match sidebar theme
        if (isHeatmapsPage()) {
          link.setAttribute('data-agri-active', 'true');
          link.style.cssText = 'background-color: #f0fdf4 !important; color: #15803d !important; font-weight: 600 !important;';
        } else {
          link.removeAttribute('data-agri-active');
          link.style.cssText = '';
        }
      }

      // Handle Crop Health Link
      var isCropHealth = !isHeatmap && !isDashboard && (text.includes('crop health') || (text.includes('crop') && text.includes('health')) || (href && href.includes('crop-health')));
      if (isCropHealth) {
        link.setAttribute('href', '#/dashboard');
        cropHealthLinkFound = true;

        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = 'true';
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openCropHealthWorkspace();
          });
        }

        if (isCropHealthPage()) {
          link.setAttribute('data-agri-active', 'true');
          link.style.cssText = 'background-color: #f0fdf4 !important; color: #15803d !important; font-weight: 600 !important;';
        } else {
          link.removeAttribute('data-agri-active');
          link.style.cssText = '';
        }
      }

      if (isRecommendations) {
        link.setAttribute('href', '#/dashboard');
        link.dataset.agriNavRole = 'recommendations';
        recommendationsLinkFound = true;

        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = 'true';
          link.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openDashboardSection('recommendations');
          });
        }

        if (isRecommendationsPage()) {
          link.setAttribute('data-agri-active', 'true');
          link.style.cssText = 'background-color: #f0fdf4 !important; color: #15803d !important; font-weight: 600 !important;';
        } else {
          link.removeAttribute('data-agri-active');
          link.style.cssText = '';
        }
      }
      
      // Handle Dashboard Link — navigate to #/dashboard within the SPA
      if (isAlerts) {
        link.setAttribute('href', './alerts_v3.html');
        link.dataset.agriNavRole = 'alerts';

        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = 'true';
          link.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openAlertsPage();
          });
        }
      }

      if (isDashboard) {
        link.setAttribute('href', '#/dashboard');
        dashboardLink = link;
        
        if (!link.dataset.agriHijacked) {
          link.dataset.agriHijacked = "true";
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openDashboardHome();
          });
        }

        // Manage Dashboard active state — use !important inline styles to override React
        if (isSubPageActive()) {
          link.removeAttribute('data-agri-active');
          link.style.cssText = 'background-color: transparent !important; color: #6b7280 !important; font-weight: 500 !important;';
          link.dataset.agriDimmed = 'true';
        } else if (isDashboardRoute()) {
          if (link.dataset.agriDimmed) {
            link.style.cssText = '';
            delete link.dataset.agriDimmed;
          }
        }
      }
    });

    // If no Heatmap link was found, try to inject one after the Dashboard link
    if (!heatmapLinkFound && dashboardLink) {
      const existingInjected = document.querySelector('[data-agri-injected="true"]');
      if (!existingInjected) {
        const heatmapLi = dashboardLink.parentElement.cloneNode(true);
        heatmapLi.setAttribute('data-agri-injected', 'true');
        const newLink = heatmapLi.querySelector('a');
        if (newLink) {
          newLink.setAttribute('href', '#/dashboard');
          newLink.dataset.agriNavRole = 'heatmaps';
          newLink.removeAttribute('data-agriHijacked');
          
          // Add click listener — use SPA navigation with heatmaps mode
          newLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openHeatmapsWorkspace();
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

          // Handle active state for injected link — green to match sidebar theme
          if (isHeatmapsPage()) {
            newLink.style.backgroundColor = '#f0fdf4';
            newLink.style.color = '#15803d';
            newLink.style.fontWeight = '600';
            dashboardLink.style.backgroundColor = '';
            dashboardLink.style.color = '';
            dashboardLink.style.fontWeight = '';
          }

          dashboardLink.parentElement.parentElement.insertBefore(heatmapLi, dashboardLink.parentElement.nextSibling);
        }
      }
    }
  }

  function normalizeDashboardNav() {
    if (window.location.hash === "#/dashboard#alerts" || window.location.hash.endsWith("#alerts")) {
      openAlertsPage();
      return;
    }

    Array.from(document.querySelectorAll('a[href="/dashboard#field-analysis"]')).forEach(function (link) {
      link.style.display = "none";
    });

    if (window.location.pathname === "/dashboard" && window.location.hash === "#field-analysis") {
      window.history.replaceState(null, "", "/dashboard#heatmaps");
    }
  }

  function enforceAuthAccess() {
    const pathname = window.location.pathname;
    const isHeatmapFile = window.__AGRI_EYE_PAGE === 'heatmaps' || pathname.includes('heatmaps.html') || pathname.endsWith('heatmaps.html');
    const isRecommendationsFile = window.__AGRI_EYE_PAGE === 'recommendations' || pathname.includes('recommendations.html') || pathname.endsWith('recommendations.html');

    // If on legacy heatmaps.html, redirect to the SPA dashboard with heatmaps mode
    if (isHeatmapFile && isAuthenticated()) {
      setHeatmapsMode(true);
      // Redirect to index.html with hash route for dashboard
      window.location.replace('/#/dashboard');
      return false;
    }

    if (isRecommendationsFile && isAuthenticated()) {
      setRecommendationsMode(true);
      window.location.replace('/#/dashboard');
      return false;
    }

    // Let React's ProtectedRoute handle auth checks — don't do redundant redirects
    // that would cause the landing page to flash
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
      state.baseCanvas = null;
      state.baseLabel = DEFAULT_BASE_LABEL;
      state.sourceType = "uploaded-default";
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

  function getTotalCells() {
    return GRID_VALUES.length * GRID_VALUES[0].length;
  }

  function getHighRiskCount(stats) {
    const sourceStats = stats || getStatusStats();
    return sourceStats[2].count + sourceStats[3].count;
  }

  function getCellAreaHectares() {
    return (FIELD_AREA_HECTARES / getTotalCells()).toFixed(2);
  }

  function getHeatmapSourceLabel() {
    if (state.sourceType === "satellite-capture") {
      return "Captured satellite screenshot";
    }

    if (state.sourceType === "uploaded-custom") {
      return "Custom uploaded image";
    }

    return DEFAULT_BASE_LABEL;
  }

  function getPriorityMacroSectors(limit) {
    const sectors = {};

    GRID_VALUES.forEach(function (row, rowIndex) {
      row.forEach(function (value, columnIndex) {
        const sectorKey = macroSectorFor(rowIndex, columnIndex);
        const sector = sectors[sectorKey] || {
          sector: sectorKey,
          healthyCount: 0,
          nutrientCount: 0,
          pestCount: 0,
          waterloggedCount: 0,
          priorityCount: 0,
          totalCells: 0,
        };

        sector.totalCells += 1;

        if (value === 0) {
          sector.healthyCount += 1;
        } else if (value === 1) {
          sector.nutrientCount += 1;
        } else if (value === 2) {
          sector.pestCount += 1;
          sector.priorityCount += 1;
        } else if (value === 3) {
          sector.waterloggedCount += 1;
          sector.priorityCount += 1;
        }

        sectors[sectorKey] = sector;
      });
    });

    return Object.values(sectors)
      .sort(function (left, right) {
        if (right.priorityCount !== left.priorityCount) {
          return right.priorityCount - left.priorityCount;
        }

        if (right.nutrientCount !== left.nutrientCount) {
          return right.nutrientCount - left.nutrientCount;
        }

        return left.sector.localeCompare(right.sector);
      })
      .slice(0, limit || 4);
  }

  function describeHotspot(item) {
    const parts = [];

    if (item.pestCount) {
      parts.push(item.pestCount + " pest alerts");
    }

    if (item.waterloggedCount) {
      parts.push(item.waterloggedCount + " waterlogged cells");
    }

    if (!parts.length && item.nutrientCount) {
      parts.push(item.nutrientCount + " nutrient warning cells");
    }

    if (!parts.length) {
      parts.push(item.healthyCount + " stable cells");
    }

    return parts.join(", ");
  }

  function buildHotspotListHtml(limit) {
    const hotspots = getPriorityMacroSectors(limit);

    return hotspots
      .map(function (item, index) {
        const issueCount = item.priorityCount || item.nutrientCount || item.healthyCount;
        const issueLabel =
          item.priorityCount > 0
            ? issueCount + " critical cells"
            : item.nutrientCount > 0
              ? issueCount + " nutrient flags"
              : issueCount + " stable cells";

        return (
          '<div class="agri-hotspot-item">' +
          '<div class="agri-hotspot-item__rank">0' +
          (index + 1) +
          "</div>" +
          '<div class="agri-hotspot-item__content">' +
          "<strong>Sector " +
          escapeHtml(item.sector) +
          "</strong>" +
          "<span>" +
          escapeHtml(issueLabel + " | " + describeHotspot(item)) +
          "</span>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function getLeadHotspotSummary() {
    const hotspot = getPriorityMacroSectors(1)[0];

    if (!hotspot) {
      return "No concentrated hotspot is standing out in the current heatmap.";
    }

    return (
      "Sector " +
      hotspot.sector +
      " is the main hotspot with " +
      describeHotspot(hotspot) +
      "."
    );
  }

  function getOverallHealthScore(stats) {
    const sourceStats = stats || getStatusStats();
    const weightedTotal =
      sourceStats[0].count * 1 +
      sourceStats[1].count * 0.72 +
      sourceStats[2].count * 0.4 +
      sourceStats[3].count * 0.32;

    return Math.round((weightedTotal / getTotalCells()) * 100);
  }

  function getDominantStressLabel(stats) {
    const sourceStats = stats || getStatusStats();
    const stressStats = [sourceStats[1], sourceStats[2], sourceStats[3]].sort(function (left, right) {
      return right.count - left.count;
    });

    return stressStats[0] && stressStats[0].count > 0 ? stressStats[0].label : "Stable Conditions";
  }

  function resetHeatmapState() {
    const defaultImage = getDefaultImageSrc();

    destroyMap();
    state.baseImage = defaultImage;
    state.baseCanvas = null;
    state.baseLabel = DEFAULT_BASE_LABEL;
    state.sourceType = "uploaded-default";
    state.mode = "heatmap";
    state.notice = DEFAULT_HEATMAP_NOTICE;
    state.capturePending = false;
  }

  function syncHeatmapStateForMode() {
    if (isHeatmapsPage()) {
      return;
    }

    const defaultImage = getDefaultImageSrc();
    const needsReset =
      state.mode !== "heatmap" ||
      state.capturePending ||
      !!state.baseCanvas ||
      state.baseImage !== defaultImage ||
      state.baseLabel !== DEFAULT_BASE_LABEL ||
      state.sourceType !== "uploaded-default" ||
      state.notice !== DEFAULT_HEATMAP_NOTICE;

    if (needsReset) {
      resetHeatmapState();

      if (state.section) {
        state.section.dataset.agriRendered = "";
      }
    }
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
    const highRiskCount = getHighRiskCount(stats);
    const imageLabel = getHeatmapSourceLabel();

    if (!isHeatmapsPage()) {
      return (
        '<div class="agri-side-card">' +
        '<div class="agri-side-card__header">' +
        "<div>" +
        '<h3 class="agri-side-card__title">Heatmap Snapshot</h3>' +
        '<p class="agri-side-card__meta">A quick read of the current heatmap overlay.</p>' +
        "</div>" +
        "</div>" +
        '<div class="agri-side-card__body">' +
        '<div class="agri-heatmap-summary" style="margin-top:0;">' +
        '<div class="agri-summary-chip"><strong>' +
        getTotalCells() +
        '</strong><span>Cells rendered</span></div>' +
        '<div class="agri-summary-chip"><strong>4 x 4</strong><span>Macro sectors</span></div>' +
        '<div class="agri-summary-chip"><strong>' +
        highRiskCount +
        '</strong><span>Flagged cells</span></div>' +
        '<div class="agri-summary-chip"><strong>' +
        stats[0].percentage +
        '%</strong><span>Stable coverage</span></div>' +
        "</div>" +
        '<div class="agri-info-list" style="margin-top:1rem;">' +
        '<div class="agri-info-item"><strong>Base Layer</strong><span>' +
        escapeHtml(imageLabel) +
        "</span></div>" +
        '<div class="agri-info-item"><strong>Hotspot Focus</strong><span>' +
        escapeHtml(getLeadHotspotSummary()) +
        '</span></div>' +
        '</div>' +
        '<div style="margin-top:1.25rem;">' +
        '<button class="agri-action-button agri-action-button--primary" style="width:100%;" data-action="open-heatmaps-hub">' +
        'Open Heatmap Workspace' +
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
      '<h3 class="agri-side-card__title">Heatmap Overview</h3>' +
      '<p class="agri-side-card__meta">Read the overlay, confirm the source image, and inspect the densest hotspots.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-info-list">' +
      '<div class="agri-info-item"><strong>Source Layer</strong><span>' +
      escapeHtml(imageLabel + " | " + state.baseLabel) +
      "</span></div>" +
      '<div class="agri-info-item"><strong>Grid Resolution</strong><span>12 x 12 cells across ' +
      escapeHtml(String(FIELD_AREA_HECTARES)) +
      ' hectares, with each cell covering about ' +
      escapeHtml(getCellAreaHectares()) +
      ' hectares.</span></div>' +
      '<div class="agri-info-item"><strong>Priority Density</strong><span>' +
      highRiskCount +
      ' cells need fast follow-up because they show pest pressure or waterlogging on the heatmap.</span></div>' +
      "</div>" +
      '<div class="agri-heatmap-summary">' +
      '<div class="agri-summary-chip"><strong>' +
      escapeHtml(String(FIELD_AREA_HECTARES)) +
      ' ha</strong><span>Mapped area</span></div>' +
      '<div class="agri-summary-chip"><strong>45 min</strong><span>Since last scan</span></div>' +
      '<div class="agri-summary-chip"><strong>' +
      getTotalCells() +
      '</strong><span>Total cells</span></div>' +
      '<div class="agri-summary-chip"><strong>' +
      stats[0].percentage +
      '%</strong><span>Stable coverage</span></div>' +
      '<div class="agri-summary-chip"><strong>' +
      getPriorityMacroSectors(1)[0].sector +
      '</strong><span>Lead hotspot</span></div>' +
      '<div class="agri-summary-chip"><strong>' +
      getDominantStressLabel(stats) +
      '</strong><span>Dominant stress</span></div>' +
      "</div>" +
      '<div class="agri-side-card__header" style="padding-left:0;padding-right:0;padding-bottom:0.7rem;padding-top:1.15rem;">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Hotspot Priority</h3>' +
      '<p class="agri-side-card__meta">Macro sectors with the strongest concentration of flagged heatmap cells.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-hotspot-list">' +
      buildHotspotListHtml(3) +
      "</div>" +
      '<div class="agri-side-card__header" style="padding-left:0;padding-right:0;padding-bottom:0.7rem;padding-top:1.15rem;">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Legend</h3>' +
      '<p class="agri-side-card__meta">These colors describe the live heatmap classification.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-legend-list">' +
      buildLegendHtml() +
      "</div>" +
      '<div class="agri-capture-status">' +
      escapeHtml(state.notice) +
      "</div>" +
      (state.sourceType !== "uploaded-default"
        ? '<div style="margin-top:0.9rem;"><button class="agri-action-button agri-action-button--ghost" data-action="reset-image" type="button">Reset To Default Image</button></div>'
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
      '<button class="agri-action-button agri-action-button--secondary agri-upload-trigger" data-action="trigger-upload" type="button">' +
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>' +
      'Upload New Field Image' +
      '</button>' +
      '</div>' : '';

    const baseLayerHtml =
      state.sourceType === "satellite-capture" && state.baseCanvas
        ? '<canvas id="agri-stage-captured-canvas" class="agri-stage__image agri-stage__image--canvas" aria-label="Captured satellite heatmap"></canvas>'
        : '<img class="agri-stage__image" src="' +
          escapeHtml(state.baseImage || getDefaultImageSrc()) +
          '" alt="Field scan with heatmap overlay" />';

    return (
      '<div class="agri-stage-card">' +
      '<div class="agri-stage-card__header">' +
      "<div>" +
      '<h3 class="agri-stage-card__title">' + (isHeatmapsPage() ? 'Heatmap Layer' : 'Heatmap Preview') + '</h3>' +
      '<p class="agri-stage-card__meta">' + (isHeatmapsPage() ? 'Upload a new field image or keep the current layer while reviewing the full heatmap overlay.' : 'The project heatmap grid applied to the default field image.') + '</p>' +
      uploadButton +
      "</div>" +
      "</div>" +
      '<div class="agri-stage agri-stage--heatmap">' +
      baseLayerHtml +
      '<div class="agri-stage__scrim"></div>' +
      '<div class="agri-stage__top-labels">' +
      topLabels +
      "</div>" +
      '<div class="agri-stage__left-labels">' +
      leftLabels +
      "</div>" +
      '<div class="agri-stage__badge">' + (isHeatmapsPage() ? 'Full Heatmap Workspace' : 'Default Heatmap Preview') + '</div>' +
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
    const title = isHeatmapsPage() ? "Heatmap Analysis Workspace" : "Heatmap Preview";
    const subtitle = isHeatmapsPage() 
      ? "Inspect the heatmap layer, upload refreshed imagery, or capture a satellite frame without leaving the heatmap workflow."
      : "Review the current overlay, then open the full heatmap workspace for uploads or satellite capture.";

    // Ensure the section has the correct class
    if (state.section) {
      state.section.className = sectionClass;
    }

    const actionsHtml = isHeatmapsPage() ? 
      '<div class="agri-field-analysis__actions">' +
      '<div class="agri-view-switch" role="tablist" aria-label="Heatmap views">' +
      '<button type="button" class="agri-view-switch__button ' +
      (state.mode === "heatmap" ? "is-active" : "") +
      '" data-action="switch-mode" data-mode="heatmap">Heatmap</button>' +
      '<button type="button" class="agri-view-switch__button ' +
      (state.mode === "satellite" ? "is-active" : "") +
      '" data-action="switch-mode" data-mode="satellite">Satellite</button>' +
      "</div>" +
      "</div>" : "";

    return (
      '<div class="agri-field-analysis__header">' +
      '<div>' +
      '<span class="agri-field-analysis__eyebrow">' + (isHeatmapsPage() ? 'Heatmap Workspace' : 'Heatmap Preview') + '</span>' +
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

  function drawCanvasCover(sourceCanvas, targetCanvas) {
    if (!sourceCanvas || !targetCanvas) {
      return;
    }

    const rect = targetCanvas.getBoundingClientRect();
    const displayWidth = Math.max(1, rect.width || targetCanvas.clientWidth || sourceCanvas.width);
    const displayHeight = Math.max(1, rect.height || targetCanvas.clientHeight || sourceCanvas.height);
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(displayWidth * pixelRatio));
    const height = Math.max(1, Math.round(displayHeight * pixelRatio));

    if (targetCanvas.width !== width || targetCanvas.height !== height) {
      targetCanvas.width = width;
      targetCanvas.height = height;
    }

    const context = targetCanvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);
    context.save();
    context.scale(pixelRatio, pixelRatio);

    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;
    const sourceRatio = sourceWidth / sourceHeight;
    const displayRatio = displayWidth / displayHeight;
    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceRatio > displayRatio) {
      cropWidth = sourceHeight * displayRatio;
      cropX = (sourceWidth - cropWidth) / 2;
    } else {
      cropHeight = sourceWidth / displayRatio;
      cropY = (sourceHeight - cropHeight) / 2;
    }

    context.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      displayWidth,
      displayHeight
    );

    context.restore();
  }

  function mountHeatmapBaseLayer() {
    if (!state.baseCanvas || state.mode !== "heatmap") {
      return;
    }

    const canvasElement = document.getElementById("agri-stage-captured-canvas");

    if (canvasElement instanceof HTMLCanvasElement) {
      drawCanvasCover(state.baseCanvas, canvasElement);
    }
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

    // IMPORTANT: destroy the Leaflet map BEFORE replacing innerHTML
    // so the map can clean up while its DOM container still exists.
    // This prevents the black map bug when re-mounting satellite view.
    destroyMap();

    state.section.innerHTML = buildSectionHtml();
    state.section.dataset.agriRendered = "true";

    if (state.mode === "satellite") {
      mountSatelliteMap();
    } else {
      mountHeatmapBaseLayer();
    }
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

      // Add labels overlay (place names, roads, etc.) like Google Maps
      var labelsLayer = window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "",
          crossOrigin: true,
          pane: "overlayPane",
        }
      );
      labelsLayer.addTo(map);

      // Also add road/transportation labels
      var roadsLayer = window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "",
          crossOrigin: true,
          pane: "overlayPane",
        }
      );
      roadsLayer.addTo(map);

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
          state.baseCanvas = canvas;
          state.baseImage = "";
          state.baseLabel = "Captured from Satellite View on " + formatLocalTime(new Date());
          state.sourceType = "satellite-capture";
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
      state.baseCanvas = null;
      state.baseLabel = "Uploaded: " + file.name + " (" + formatLocalTime(new Date()) + ")";
      state.sourceType = "uploaded-custom";
      state.notice = "New field image uploaded successfully. Heatmap grid has been applied.";
      event.target.value = "";
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
            ? DEFAULT_HEATMAP_NOTICE
            : DEFAULT_SATELLITE_NOTICE;
        renderSection();
      }
      return;
    }

    if (action === "trigger-upload") {
      const input = state.section && state.section.querySelector("#agri-file-upload");

      if (input) {
        input.click();
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
      resetHeatmapState();
      state.notice = "Reverted to the default field image for Heatmap view.";
      renderSection();
      return;
    }

    if (action === "open-recommendations") {
      openDashboardSection("recommendations");
      return;
    }

    if (action === "open-heatmaps-hub") {
      openHeatmapsWorkspace();
      return;
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

  function buildCropHealthBreakdownHtml() {
    return getStatusStats()
      .map(function (item) {
        return (
          '<div class="agri-health-bar">' +
          '<div class="agri-health-bar__header">' +
          "<strong>" +
          escapeHtml(item.label) +
          "</strong>" +
          "<span>" +
          item.percentage +
          "%</span>" +
          "</div>" +
          '<div class="agri-health-bar__track"><span style="width:' +
          item.percentage +
          "%;background:" +
          escapeHtml(item.color) +
          ';"></span></div>' +
          '<p class="agri-health-bar__meta">' +
          escapeHtml(item.description) +
          "</p>" +
          "</div>"
        );
      })
      .join("");
  }

  function buildCropHealthActionsHtml() {
    const hotspots = getPriorityMacroSectors(4);
    const primary = hotspots[0];
    const nutrientHotspot = hotspots
      .slice()
      .sort(function (left, right) {
        return right.nutrientCount - left.nutrientCount;
      })[0];
    const waterHotspot = hotspots
      .slice()
      .sort(function (left, right) {
        return right.waterloggedCount - left.waterloggedCount;
      })[0];
    const pestHotspot = hotspots
      .slice()
      .sort(function (left, right) {
        return right.pestCount - left.pestCount;
      })[0];

    const actions = [
      {
        title: "First scouting pass",
        detail: primary
          ? "Start in Sector " + primary.sector + " where " + describeHotspot(primary) + " is clustering."
          : "Begin with the areas showing the strongest visible contrast in the latest grid.",
      },
      {
        title: "Nutrient follow-up",
        detail:
          nutrientHotspot && nutrientHotspot.nutrientCount
            ? "Check canopy color and fertilizer availability in Sector " +
              nutrientHotspot.sector +
              " where " +
              nutrientHotspot.nutrientCount +
              " cells show nutrient stress."
            : "No single sector is dominating the nutrient-stress pattern right now.",
      },
      {
        title: "Water and pest check",
        detail:
          waterHotspot && waterHotspot.waterloggedCount
            ? "Review drainage and irrigation balance in Sector " +
              waterHotspot.sector +
              " before the next scan because waterlogging is still active there."
            : pestHotspot && pestHotspot.pestCount
              ? "Prioritize pest scouting in Sector " +
                pestHotspot.sector +
                " where the densest pest-affected cells are concentrated."
              : "Continue routine scouting and compare the next scan against this baseline.",
      },
      {
        title: "Next scan target",
        detail: "Re-scan after treatment or irrigation adjustment so the heatmap can confirm whether hotspot intensity drops.",
      },
    ];

    return actions
      .map(function (item) {
        return (
          '<div class="agri-action-note">' +
          "<strong>" +
          escapeHtml(item.title) +
          "</strong>" +
          "<span>" +
          escapeHtml(item.detail) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function buildRecommendationsCardsHtml(limit) {
    return RECOMMENDATION_ITEMS.slice(0, limit || RECOMMENDATION_ITEMS.length)
      .map(function (item) {
        return (
          '<div class="agri-recommendation-card agri-recommendation-card--' +
          escapeHtml(item.theme || "profit") +
          '">' +
          '<div class="agri-recommendation-card__top">' +
          "<strong>" +
          escapeHtml(item.title) +
          "</strong>" +
          '<span class="agri-recommendation-card__badge agri-recommendation-card__badge--' +
          escapeHtml(String(item.priority).toLowerCase()) +
          '">' +
          escapeHtml(item.priority) +
          "</span>" +
          "</div>" +
          '<div class="agri-recommendation-card__signal">' +
          '<span style="width:' +
          escapeHtml(item.score || 50) +
          '%"></span>' +
          "</div>" +
          '<p class="agri-recommendation-card__score"><strong>' +
          escapeHtml(item.score || 50) +
          '%</strong><span>AI confidence</span></p>' +
          '<p class="agri-recommendation-card__meta">Focus area: ' +
          escapeHtml(item.sector) +
          "</p>" +
          '<p class="agri-recommendation-card__description">' +
          escapeHtml(item.description) +
          "</p>" +
          "</div>"
        );
      })
      .join("");
  }

  function buildRecommendationSignalBarsHtml() {
    const signals = [
      { label: "Pest urgency", value: 91, theme: "pest" },
      { label: "Fertilizer ROI", value: 82, theme: "nutrient" },
      { label: "Moisture balance", value: 68, theme: "water" },
      { label: "Weather timing", value: 63, theme: "weather" },
    ];

    return signals
      .map(function (item) {
        return (
          '<div class="agri-signal-bar agri-signal-bar--' +
          escapeHtml(item.theme) +
          '">' +
          '<div class="agri-signal-bar__header"><span>' +
          escapeHtml(item.label) +
          "</span><strong>" +
          escapeHtml(item.value) +
          "%</strong></div>" +
          '<div class="agri-signal-bar__track"><span style="width:' +
          escapeHtml(item.value) +
          '%"></span></div>' +
          "</div>"
        );
      })
      .join("");
  }

  function buildRecommendationsSectionHtml() {
    return (
      '<div class="agri-field-analysis__header">' +
      '<div>' +
      '<span class="agri-field-analysis__eyebrow">Recommendations</span>' +
      '<h2 class="agri-field-analysis__title">AI Profit Recommendations</h2>' +
      '<p class="agri-field-analysis__subtitle">Action-ready recommendations for fertilizer, irrigation, crop choice, weather timing, and the next validation scan.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-recommendation-hero">' +
      '<div class="agri-recommendation-hero__main">' +
      '<span>AI action score</span>' +
      '<strong>84%</strong>' +
      '<p>Focus spend on pest control, nitrogen correction, and moisture balance before the next scan.</p>' +
      "</div>" +
      '<div class="agri-recommendation-hero__bars">' +
      buildRecommendationSignalBarsHtml() +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Priority Queue</h3>' +
      '<p class="agri-side-card__meta">Use this order for field visits, input planning, crop decisions, irrigation scheduling, and the next validation scan.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-recommendation-grid">' +
      buildRecommendationsCardsHtml() +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card" style="margin-top:1rem;">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">AI Decision Rule</h3>' +
      '<p class="agri-side-card__meta">Treat only the blocks that need it first, protect the crop from avoidable water and pest stress, then confirm the result with a fresh scan.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-info-list">' +
      '<div class="agri-info-item"><strong>Fertilizer</strong><span>Use zone-based NPK or urea support for low-vigor cells, then add micronutrients only if yellowing remains.</span></div>' +
      '<div class="agri-info-item"><strong>Water</strong><span>Irrigate by crop demand and current soil moisture; skip wet zones until drainage improves.</span></div>' +
      '<div class="agri-info-item"><strong>Crop selection</strong><span>Prefer crops that match the current moisture pattern and upcoming weather instead of forcing one crop across every block.</span></div>' +
      '<div class="agri-info-item"><strong>Profit timing</strong><span>Spend first where stress reduction is most likely to protect yield, then re-scan to avoid repeated unnecessary input cost.</span></div>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function buildCropHealthSectionHtml() {
    const stats = getStatusStats();
    const hotspots = getPriorityMacroSectors(3);
    const leadHotspot = hotspots[0];
    const overallHealthScore = getOverallHealthScore(stats);
    const highRiskCount = getHighRiskCount(stats);
    const activeMacroSectors = hotspots.filter(function (item) {
      return item.priorityCount > 0 || item.nutrientCount > 0;
    }).length;

    return (
      '<div class="agri-field-analysis__header">' +
      '<div>' +
      '<span class="agri-field-analysis__eyebrow">Crop Health</span>' +
      '<h2 class="agri-field-analysis__title">Crop Health Review</h2>' +
      '<p class="agri-field-analysis__subtitle">Expanded crop-health context from the latest 12 x 12 field grid, including hotspot order and action-ready field notes.</p>' +
      "</div>" +
      '<div class="agri-field-analysis__actions">' +
      '<button class="agri-action-button agri-action-button--secondary" data-action="open-heatmaps-hub" type="button">Open Heatmap Workspace</button>' +
      "</div>" +
      "</div>" +
      '<div class="agri-crop-health__content">' +
      '<div class="agri-crop-health__main">' +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Field Overview</h3>' +
      '<p class="agri-side-card__meta">A focused summary of crop condition using the latest heatmap classifications.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-health-metrics">' +
      '<div class="agri-health-metric"><strong>' +
      overallHealthScore +
      '</strong><span>Health score</span><em>Weighted from all mapped cells</em></div>' +
      '<div class="agri-health-metric"><strong>' +
      stats[0].percentage +
      '%</strong><span>Stable coverage</span><em>Cells classified as healthy crops</em></div>' +
      '<div class="agri-health-metric"><strong>' +
      highRiskCount +
      '</strong><span>Critical cells</span><em>Pest or waterlogging alerts</em></div>' +
      '<div class="agri-health-metric"><strong>' +
      activeMacroSectors +
      '</strong><span>Priority sectors</span><em>Macro blocks needing follow-up</em></div>' +
      '<div class="agri-health-metric"><strong>' +
      escapeHtml(leadHotspot ? leadHotspot.sector : "None") +
      '</strong><span>Lead hotspot</span><em>First block to inspect on foot</em></div>' +
      '<div class="agri-health-metric"><strong>45 min</strong><span>Latest scan age</span><em>Best used as a same-day field guide</em></div>' +
      "</div>" +
      '<div class="agri-info-item" style="margin-top:1rem;"><strong>Current read</strong><span>' +
      escapeHtml("The map is largely stable, but " + highRiskCount + " cells still need near-term review and " + getDominantStressLabel(stats).toLowerCase() + " is the strongest active stress pattern.") +
      "</span></div>" +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Priority Zones</h3>' +
      '<p class="agri-side-card__meta">Recommended scouting order based on the concentration of abnormal cells.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-hotspot-list">' +
      buildHotspotListHtml(3) +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Action Notes</h3>' +
      '<p class="agri-side-card__meta">Short follow-up steps to turn the current crop-health read into field action.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-action-note-list">' +
      buildCropHealthActionsHtml() +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Recommended Next Steps</h3>' +
      '<p class="agri-side-card__meta">These recommendations extend the crop-health review and match the highest-risk zones on the current field map.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-recommendation-grid agri-recommendation-grid--compact">' +
      buildRecommendationsCardsHtml(3) +
      "</div>" +
      '<div style="margin-top:1rem;">' +
      '<button class="agri-action-button agri-action-button--primary" data-action="open-recommendations" type="button">Open Full Recommendations</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="agri-crop-health__side">' +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Condition Breakdown</h3>' +
      '<p class="agri-side-card__meta">Share of the field in each crop-health category.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-health-bar-list">' +
      buildCropHealthBreakdownHtml() +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card">' +
      '<div class="agri-side-card__header">' +
      "<div>" +
      '<h3 class="agri-side-card__title">Monitoring Notes</h3>' +
      '<p class="agri-side-card__meta">Extra context to help compare this crop-health read with the next scan.</p>' +
      "</div>" +
      "</div>" +
      '<div class="agri-side-card__body">' +
      '<div class="agri-info-list">' +
      '<div class="agri-info-item"><strong>Analysis source</strong><span>' +
      escapeHtml(getHeatmapSourceLabel() + " | " + state.baseLabel) +
      "</span></div>" +
      '<div class="agri-info-item"><strong>Mapped area</strong><span>' +
      escapeHtml(String(FIELD_AREA_HECTARES) + " hectares with cells of about " + getCellAreaHectares() + " hectares each.") +
      "</span></div>" +
      '<div class="agri-info-item"><strong>Lead hotspot</strong><span>' +
      escapeHtml(leadHotspot ? "Sector " + leadHotspot.sector + " is currently the first field-check target." : "No lead hotspot detected.") +
      "</span></div>" +
      '<div class="agri-info-item"><strong>Next comparison</strong><span>Capture another scan after the next treatment cycle to verify whether hotspot density drops in the same sectors.</span></div>' +
      '<div class="agri-info-item"><strong>Recommended workflow</strong><span>Scout the lead hotspot, apply the matching treatment, then jump to Recommendations for the full action queue and scheduling order.</span></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderCropHealthSection() {
    if (!cropHealthSection) {
      return;
    }

    cropHealthSection.innerHTML = buildCropHealthSectionHtml();
    cropHealthSection.dataset.agriRendered = "true";
  }

  function renderRecommendationsSection() {
    if (!recommendationsSection) {
      return;
    }

    recommendationsSection.innerHTML = buildRecommendationsSectionHtml();
    recommendationsSection.dataset.agriRendered = "true";
  }

  function ensureRecommendationsSection() {
    if (!isDashboardRoute()) {
      if (recommendationsSection && recommendationsSection.isConnected) {
        recommendationsSection.style.display = "none";
      }
      return;
    }

    const main = getMainElement();

    if (!main) {
      return;
    }

    if (!isRecommendationsPage()) {
      if (recommendationsSection && recommendationsSection.isConnected) {
        recommendationsSection.style.display = "none";
      }
      return;
    }

    if (recommendationsSection && !document.body.contains(recommendationsSection)) {
      recommendationsSection = null;
    }

    if (!recommendationsSection) {
      const existingSection = document.getElementById("recommendations");

      if (existingSection && existingSection.classList.contains("agri-recommendations")) {
        recommendationsSection = existingSection;
      } else {
        recommendationsSection = document.createElement("section");
        recommendationsSection.id = "recommendations";
        recommendationsSection.className = SECTION_MARKER + " agri-recommendations";
      }
    }

    recommendationsSection.className =
      SECTION_MARKER +
      " agri-recommendations" +
      (isRecommendationsPage() ? " agri-field-analysis--enlarged" : "");

    if (!recommendationsSection.isConnected) {
      if (state.section && state.section.isConnected && state.section.parentElement) {
        state.section.parentElement.insertBefore(recommendationsSection, state.section);
      } else {
        main.appendChild(recommendationsSection);
      }
    }

    recommendationsSection.style.display = "";

    hideOtherDashboardContent(true);

    if (state.section && state.section.isConnected) {
      state.section.style.display = "none";
    }

    if (cropHealthSection && cropHealthSection.isConnected) {
      cropHealthSection.style.display = "none";
    }

    renderRecommendationsSection();
  }

  function ensureCropHealthSection() {
    if (!isDashboardRoute()) {
      if (cropHealthSection && cropHealthSection.isConnected) {
        cropHealthSection.style.display = "none";
      }
      return;
    }

    const main = getMainElement();

    if (!main) {
      return;
    }

    if (cropHealthSection && !document.body.contains(cropHealthSection)) {
      cropHealthSection = null;
    }

    if (!cropHealthSection) {
      const existingSection = document.getElementById("crop-health-page");

      if (existingSection && existingSection.classList.contains("agri-crop-health")) {
        cropHealthSection = existingSection;
      } else {
        cropHealthSection = document.createElement("section");
        cropHealthSection.id = "crop-health-page";
        cropHealthSection.className = SECTION_MARKER + " agri-crop-health agri-field-analysis--enlarged";
        cropHealthSection.addEventListener("click", handleSectionClick);
      }
    }

    cropHealthSection.className = SECTION_MARKER + " agri-crop-health agri-field-analysis--enlarged";

    if (!isCropHealthPage()) {
      if (cropHealthSection.isConnected) {
        cropHealthSection.style.display = "none";
      }
      return;
    }

    const legacyRow = normalizeLegacyLayout();

    cropHealthSection.style.display = "";

    if (!cropHealthSection.isConnected) {
      if (state.section && state.section.isConnected && state.section.parentElement) {
        state.section.parentElement.insertBefore(cropHealthSection, state.section);
      } else if (legacyRow && legacyRow.parentElement) {
        legacyRow.parentElement.insertBefore(cropHealthSection, legacyRow);
      } else {
        main.appendChild(cropHealthSection);
      }
    }

    hideOtherDashboardContent(true);

    if (state.section && state.section.isConnected) {
      state.section.style.display = "none";
    }

    renderCropHealthSection();
  }

  function ensureSection() {
    // When a dedicated dashboard subpage is active, hide the heatmap section entirely
    if (isCropHealthPage() || isRecommendationsPage()) {
      destroyMap();
      if (state.section && state.section.isConnected) {
        state.section.style.display = 'none';
      }
      return;
    }

    // When returning from crop health, un-hide the heatmap section
    if (state.section) {
      state.section.style.display = '';
    }

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

    // Update section class in case mode changed
    state.section.className = sectionClass;

    getDefaultImageSrc();
    syncHeatmapStateForMode();

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

    // When in heatmaps or crop health mode, hide ALL other dashboard content
    hideOtherDashboardContent(isSubPageActive());
  }

  function hideOtherDashboardContent(hide) {
    const main = getMainElement();
    if (!main) return;

    Array.from(main.children).forEach(function (child) {
      // Don't hide the heatmap, crop health, or recommendations sections
      if (child === state.section || child.id === SECTION_ID) return;
      if (child === cropHealthSection || child.id === 'crop-health-page') return;
      if (child === recommendationsSection || child.id === 'recommendations') return;
      if (hide) {
        child.dataset.agriHiddenByMode = 'true';
        child.style.display = 'none';
      } else {
        if (child.dataset.agriHiddenByMode) {
          delete child.dataset.agriHiddenByMode;
          child.style.display = '';
        }
      }
    });
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
      ensureCropHealthSection();
      ensureRecommendationsSection();
      flushPendingSectionFocus();
    });
  }

  document.addEventListener("DOMContentLoaded", scheduleEnhancement);
  window.addEventListener("load", scheduleEnhancement);
  window.addEventListener("resize", scheduleEnhancement);
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
