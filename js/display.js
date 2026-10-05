/**
 * Camry iDrive Web Simulator & Telemetry Dashboard
 * Display Engine & Dynamic Viewport Scaler
 * js/display.js
 * Milestone 1: Shell & Theming Foundation
 */

(function(window) {
  'use strict';

  // Ensure master namespace exists
  window.CamryApp = window.CamryApp || {};

  const VALID_THEMES = ['cic', 'mmi', 'panoramic'];
  const VALID_PALETTES = ['optitron', 'champagne', 'amber'];
  const VALID_MODES = ['night', 'day'];
  const VALID_VIEWS = ['home', 'nav', 'media', 'perf', 'trip', 'settings'];

  let clockTimerId = null;

  // ---------------------------------------------------------------------------
  // 1. Dynamic Display Scaler (Aspect Ratio & Letterbox Prevention)
  // ---------------------------------------------------------------------------
  const NATIVE_DISPLAY_WIDTH = 1280;
  const NATIVE_DISPLAY_HEIGHT = 800;
  const NATIVE_STAGE_WIDTH = 1668;
  const NATIVE_STAGE_HEIGHT = 800;

  const MIN_SCALE = 0.25;
  const MAX_SCALE = 1.00;

  let currentScale = 1.0;
  let resizeObserver = null;
  let rafId = null;

  function calculateScale(availableWidth, availableHeight) {
    if (!availableWidth || !availableHeight || availableWidth <= 0 || availableHeight <= 0) {
      return 1.0;
    }
    const scaleX = availableWidth / NATIVE_STAGE_WIDTH;
    const scaleY = availableHeight / NATIVE_STAGE_HEIGHT;
    const rawScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.max(MIN_SCALE, Math.min(rawScale, MAX_SCALE));
    return Math.floor(clampedScale * 1000) / 1000;
  }

  function applyScale(scale) {
    if (Math.abs(currentScale - scale) < 0.001) return;
    currentScale = scale;

    document.documentElement.style.setProperty('--stage-scale', scale.toString());
    document.documentElement.style.setProperty('--display-scale', scale.toString());

    const stage = document.getElementById('cockpit-stage') || document.querySelector('.cockpit-stage');
    if (stage) {
      stage.style.setProperty('--stage-scale', scale.toString());
      stage.dataset.scale = scale.toString();
    }

    const headUnit = document.getElementById('head-unit-display') || document.querySelector('.head-unit-container');
    if (headUnit) {
      headUnit.dataset.scale = scale.toString();
    }

    if (window.CamryApp.events && typeof window.CamryApp.events.emit === 'function') {
      window.CamryApp.events.emit('display:resize', { scale: scale, width: 1280 * scale, height: 800 * scale });
    }
  }

  function updateScale() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function() {
      const root = document.getElementById('camry-app-root') || document.body;
      let availW = root.clientWidth || window.innerWidth;
      let availH = root.clientHeight || window.innerHeight;

      // Account for safe margins
      const marginH = 32;
      const marginV = 32;
      availW = Math.max(200, availW - marginH);
      availH = Math.max(200, availH - marginV);

      // Narrow portrait mobile fallback (< 960px)
      if (window.innerWidth < 960) {
        const mobileScale = Math.max(MIN_SCALE, Math.min(1.0, (window.innerWidth - 20) / NATIVE_DISPLAY_WIDTH));
        applyScale(Math.floor(mobileScale * 1000) / 1000);
        return;
      }

      const nextScale = calculateScale(availW, availH);
      applyScale(nextScale);
    });
  }

  function initDisplayScaler() {
    const root = document.getElementById('camry-app-root') || document.body;
    if (typeof window.ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(function(entries) {
        for (let i = 0; i < entries.length; i++) {
          if (entries[i].contentRect.width > 0 && entries[i].contentRect.height > 0) {
            updateScale();
          }
        }
      });
      resizeObserver.observe(root);
    }

    window.addEventListener('resize', updateScale, { passive: true });
    window.addEventListener('orientationchange', updateScale, { passive: true });
    updateScale();
  }

  // ---------------------------------------------------------------------------
  // 2. Display Engine Core Implementation
  // ---------------------------------------------------------------------------
  const DisplayEngine = {
    /**
     * Initialize Display Engine
     */
    init: function() {
      initDisplayScaler();
      this.bindQuickToggles();
      this.startClock();

      const initial = (window.CamryApp && window.CamryApp.state) || {};
      this.setTheme(initial.theme || 'cic', true);
      this.setPalette(initial.palette || 'optitron', true);
      this.setMode(initial.mode || 'night', true);
      this.setView(initial.activeView || 'home', true);
    },

    /**
     * Set active infotainment theme
     * @param {string} themeName - 'cic' | 'mmi' | 'panoramic'
     * @param {boolean} [silent] - Suppress event emission if true
     */
    setTheme: function(themeName, silent) {
      let theme = (themeName || '').toLowerCase();
      if (VALID_THEMES.indexOf(theme) === -1) {
        theme = 'cic';
      }

      document.documentElement.setAttribute('data-theme', theme);
      const container = document.getElementById('head-unit-display');
      if (container) {
        container.setAttribute('data-theme', theme);
      }

      // Update badge UI
      const badgeVal = document.getElementById('badge-val-theme');
      if (badgeVal) {
        badgeVal.textContent = theme.toUpperCase();
      }

      // Update pill button active states
      document.querySelectorAll('[data-theme-target]').forEach(function(btn) {
        if (btn.getAttribute('data-theme-target') === theme) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      if (window.CamryApp && window.CamryApp.state) {
        window.CamryApp.state.theme = theme;
      }

      if (!silent && window.CamryApp && window.CamryApp.events) {
        window.CamryApp.events.emit('theme:change', { theme: theme });
        window.CamryApp.events.emit('display:theme', { theme: theme });
      }
      return true;
    },

    /**
     * Cycle through themes: cic -> mmi -> panoramic -> cic
     */
    cycleTheme: function() {
      const current = (window.CamryApp && window.CamryApp.state && window.CamryApp.state.theme) || 'cic';
      const idx = VALID_THEMES.indexOf(current);
      const nextIdx = (idx + 1) % VALID_THEMES.length;
      this.setTheme(VALID_THEMES[nextIdx]);
    },

    /**
     * Set active color palette
     * @param {string} paletteName - 'optitron' | 'champagne' | 'amber'
     * @param {boolean} [silent] - Suppress event emission if true
     */
    setPalette: function(paletteName, silent) {
      let palette = (paletteName || '').toLowerCase();
      if (VALID_PALETTES.indexOf(palette) === -1) {
        palette = 'optitron';
      }

      document.documentElement.setAttribute('data-palette', palette);
      const container = document.getElementById('head-unit-display');
      if (container) {
        container.setAttribute('data-palette', palette);
      }

      // Update badge UI
      const badgeVal = document.getElementById('badge-val-palette');
      if (badgeVal) {
        badgeVal.textContent = palette.toUpperCase();
      }

      // Update pill button active states
      document.querySelectorAll('[data-palette-target]').forEach(function(btn) {
        if (btn.getAttribute('data-palette-target') === palette) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      if (window.CamryApp && window.CamryApp.state) {
        window.CamryApp.state.palette = palette;
      }

      if (!silent && window.CamryApp && window.CamryApp.events) {
        window.CamryApp.events.emit('palette:change', { palette: palette });
        window.CamryApp.events.emit('display:palette', { palette: palette });
      }
      return true;
    },

    /**
     * Cycle through palettes: optitron -> champagne -> amber -> optitron
     */
    cyclePalette: function() {
      const current = (window.CamryApp && window.CamryApp.state && window.CamryApp.state.palette) || 'optitron';
      const idx = VALID_PALETTES.indexOf(current);
      const nextIdx = (idx + 1) % VALID_PALETTES.length;
      this.setPalette(VALID_PALETTES[nextIdx]);
    },

    /**
     * Set Day / Night lighting mode
     * @param {string} modeName - 'day' | 'night'
     * @param {boolean} [silent] - Suppress event emission if true
     */
    setMode: function(modeName, silent) {
      let mode = (modeName || '').toLowerCase();
      if (VALID_MODES.indexOf(mode) === -1) {
        mode = 'night';
      }

      document.documentElement.setAttribute('data-mode', mode);
      const container = document.getElementById('head-unit-display');
      if (container) {
        container.setAttribute('data-mode', mode);
      }

      // Update badge UI
      const badgeVal = document.getElementById('badge-val-mode');
      const badgeIcon = document.getElementById('badge-icon-mode');
      if (badgeVal) {
        badgeVal.textContent = mode.toUpperCase();
      }
      if (badgeIcon) {
        badgeIcon.textContent = (mode === 'night') ? '🌙' : '☀️';
      }

      // Toggle mode button icons if separate elements exist
      const iconNight = document.querySelector('.mode-icon-night');
      const iconDay = document.querySelector('.mode-icon-day');
      if (iconNight && iconDay) {
        if (mode === 'night') {
          iconNight.style.display = 'inline';
          iconDay.style.display = 'none';
        } else {
          iconNight.style.display = 'none';
          iconDay.style.display = 'inline';
        }
      }

      if (window.CamryApp && window.CamryApp.state) {
        window.CamryApp.state.mode = mode;
      }

      if (!silent && window.CamryApp && window.CamryApp.events) {
        window.CamryApp.events.emit('mode:change', { mode: mode });
        window.CamryApp.events.emit('display:mode', { mode: mode });
      }
      return true;
    },

    /**
     * Toggle Day / Night mode
     */
    toggleMode: function() {
      const current = (window.CamryApp && window.CamryApp.state && window.CamryApp.state.mode) || 'night';
      const next = (current === 'night') ? 'day' : 'night';
      this.setMode(next);
    },

    /**
     * Set active core view
     * @param {string} viewName - 'home' | 'nav' | 'media' | 'perf' | 'trip' | 'settings'
     * @param {boolean} [silent] - Suppress event emission if true
     */
    setView: function(viewName, silent) {
      const view = (viewName || '').toLowerCase();
      if (VALID_VIEWS.indexOf(view) === -1) {
        return false;
      }

      document.documentElement.setAttribute('data-view', view);
      const container = document.getElementById('head-unit-display');
      if (container) {
        container.setAttribute('data-view', view);
      }

      // Switch active view container
      const views = document.querySelectorAll('.display-view');
      views.forEach(function(el) {
        const id = el.getAttribute('data-view-id') || el.id.replace('view-', '');
        if (id === view) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });

      // Synchronize console hotkey active glow
      document.querySelectorAll('.hotkey-btn').forEach(function(btn) {
        const hk = (btn.getAttribute('data-hotkey') || '').toLowerCase();
        if (hk === view || (hk === 'nav/aa' && view === 'nav')) {
          btn.classList.add('active-route');
        } else {
          btn.classList.remove('active-route');
        }
      });

      if (window.CamryApp && window.CamryApp.state) {
        window.CamryApp.state.activeView = view;
        if (!window.CamryApp.state.viewStack) {
          window.CamryApp.state.viewStack = ['home'];
        }
        if (window.CamryApp.state.viewStack[window.CamryApp.state.viewStack.length - 1] !== view) {
          window.CamryApp.state.viewStack.push(view);
        }
      }

      if (!silent && window.CamryApp && window.CamryApp.events) {
        window.CamryApp.events.emit('view:change', { view: view });
        window.CamryApp.events.emit('display:view', { view: view });
      }
      return true;
    },

    /**
     * Navigate backward in view history stack
     */
    goBack: function() {
      const state = (window.CamryApp && window.CamryApp.state) || {};
      if (!state.viewStack) state.viewStack = ['home'];

      if (state.viewStack.length > 1) {
        state.viewStack.pop();
        const previousView = state.viewStack[state.viewStack.length - 1];
        this.setView(previousView);
      } else {
        this.setView('home');
        state.viewStack = ['home'];
      }
      return state.activeView || 'home';
    },

    /**
     * Bind click handlers to quick toggle buttons on status dock
     */
    bindQuickToggles: function() {
      const self = this;

      // Theme toggle buttons
      const btnTheme = document.getElementById('btn-toggle-theme');
      if (btnTheme) {
        btnTheme.addEventListener('click', function() { self.cycleTheme(); });
      }
      document.querySelectorAll('[data-theme-target]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const target = btn.getAttribute('data-theme-target');
          if (target) self.setTheme(target);
        });
      });

      // Palette toggle buttons
      const btnPalette = document.getElementById('btn-toggle-palette');
      if (btnPalette) {
        btnPalette.addEventListener('click', function() { self.cyclePalette(); });
      }
      document.querySelectorAll('[data-palette-target]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const target = btn.getAttribute('data-palette-target');
          if (target) self.setPalette(target);
        });
      });

      // Mode toggle buttons
      const btnMode = document.getElementById('btn-toggle-mode') || document.getElementById('btn-mode-toggle');
      if (btnMode) {
        btnMode.addEventListener('click', function() { self.toggleMode(); });
      }
    },

    /**
     * 1-second automotive digital clock ticker
     */
    startClock: function() {
      const clockElements = [
        document.getElementById('digital-clock'),
        document.getElementById('status-clock')
      ].filter(Boolean);

      function tick() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const minStr = minutes < 10 ? '0' + minutes : minutes;
        const timeString = hours + ':' + minStr + ' ' + ampm;

        for (let i = 0; i < clockElements.length; i++) {
          clockElements[i].textContent = timeString;
          if (clockElements[i].tagName === 'TIME') {
            clockElements[i].setAttribute('datetime', now.toISOString());
          }
        }
      }

      tick();
      if (clockTimerId) clearInterval(clockTimerId);
      clockTimerId = setInterval(tick, 1000);
    }
  };

  // Register public APIs
  window.CamryApp.display = DisplayEngine;
  window.CamryDisplayScaler = {
    init: initDisplayScaler,
    updateScale: updateScale,
    getScale: function() { return currentScale; },
    calculateScale: calculateScale,
    applyScale: applyScale,
    destroy: function() {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
      if (rafId) cancelAnimationFrame(rafId);
    }
  };

  window.camryDisplay = window.camryDisplay || {};
  window.camryDisplay.getScale = function() { return currentScale; };
  window.camryDisplay.updateScale = updateScale;

  // Auto-boot DisplayEngine when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        DisplayEngine.init();
      });
    } else {
      DisplayEngine.init();
    }
  }

})(typeof window !== 'undefined' ? window : this);
