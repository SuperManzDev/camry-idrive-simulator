/**
 * Camry iDrive Web Simulator & Telemetry Dashboard
 * Master Application State & Event Bus
 * js/app.js
 * Milestone 1: Shell & Theming Foundation
 */

(function(global) {
  'use strict';

  // Prevent double-initialization
  if (global.CamryApp && global.CamryApp._initialized) {
    return;
  }

  const LED_SEQUENCE = ['bootup', 'pairing', 'tablet', 'phone'];

  // Master Application Object
  const CamryApp = {
    _initialized: false,

    // -------------------------------------------------------------------------
    // 1. Centralized State Model (PROJECT.md Specification)
    // -------------------------------------------------------------------------
    state: {
      theme: 'cic',            // 'cic' | 'mmi' | 'panoramic'
      palette: 'optitron',      // 'optitron' | 'champagne' | 'amber'
      mode: 'night',            // 'day' | 'night'
      activeView: 'home',       // 'home' | 'nav' | 'media' | 'perf' | 'trip' | 'settings'
      viewStack: ['home'],
      volume: 65,               // 0 - 100
      isMuted: false,
      volumeBeforeMute: 65,
      ledState: 'bootup',       // 'bootup' | 'pairing' | 'tablet' | 'phone'
      engine: {
        isRunning: false,
        rpm: 0,                 // 0 - 8000
        speed: 0,               // 0 - 140 mph
        coolantTemp: 195,       // 100 - 260 deg F
        batteryVoltage: 12.4,   // 9.0 - 16.0 V
      },
      trip: {
        elapsedSeconds: 0,
        miles: 0.0,
        fuelGallons: 0.00,
        avgMpg: 0.0,
        instantMpg: 0.0,
      },
      tpms: {
        fl: 33, fr: 33, rl: 33, rr: 33 // 15 - 50 PSI
      },
      faults: {
        checkEngine: false,
        tpmsAlert: false,
        batteryAlert: false,
        overheatAlert: false,
      }
    },

    // -------------------------------------------------------------------------
    // 2. Dual-Dispatch Event Bus (Internal Listeners + Bubbling DOM Events)
    // -------------------------------------------------------------------------
    events: {
      _listeners: Object.create(null),

      /**
       * Subscribe to an event
       * @param {string} event - Event name
       * @param {Function} callback - Listener function
       */
      on: function(event, callback) {
        if (typeof event !== 'string' || !event || typeof callback !== 'function') return;
        if (!this._listeners) {
          this._listeners = Object.create(null);
        }
        if (!Array.isArray(this._listeners[event])) {
          this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
      },

      /**
       * Unsubscribe from an event
       * @param {string} event - Event name
       * @param {Function} callback - Listener function
       */
      off: function(event, callback) {
        if (typeof event !== 'string' || !event || !this._listeners || !Array.isArray(this._listeners[event])) return;
        if (typeof callback !== 'function') return;
        this._listeners[event] = this._listeners[event].filter(function(cb) {
          return cb !== callback;
        });
      },

      /**
       * Emit event to internal subscribers and dispatch DOM CustomEvent
       * @param {string} event - Event name
       * @param {*} data - Payload
       */
      emit: function(event, data) {
        if (typeof event !== 'string' || !event) return;

        // 1. Notify internal JavaScript subscribers
        if (this._listeners && Array.isArray(this._listeners[event])) {
          const subscribers = this._listeners[event].slice();
          for (let i = 0; i < subscribers.length; i++) {
            try {
              subscribers[i](data);
            } catch (err) {
              console.error('[CamryApp.events] Error in subscriber for "' + event + '":', err);
            }
          }
        }

        // 2. Dispatch bubbling DOM CustomEvent
        if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
          try {
            if (typeof event === 'string' && event.length > 0 && typeof CustomEvent === 'function') {
              const customName = event.indexOf('camry:') === 0 ? event : 'camry:' + event;
              const domEvent = new CustomEvent(customName, {
                detail: data,
                bubbles: true,
                cancelable: true
              });
              document.dispatchEvent(domEvent);
            }
          } catch (e) {
            // Ignore in headless environments lacking CustomEvent or dispatch errors
          }
        }
      }
    },

    // -------------------------------------------------------------------------
    // 3. Controller Actions API
    // -------------------------------------------------------------------------
    controller: {
      /**
       * Rotate rotary dial by step delta
       * @param {number} delta - +1 (Clockwise) or -1 (Counter-Clockwise)
       */
      rotateDial: function(delta) {
        const step = delta > 0 ? 1 : -1;
        if (CamryApp.audio && typeof CamryApp.audio.playDialDetent === 'function') {
          CamryApp.audio.playDialDetent();
        }

        // Animate dial disc momentarily
        const disc = document.getElementById('dial-brushed-disc');
        if (disc) {
          const currentRotation = parseFloat(disc.dataset.rotation || '0') + (step * 15);
          disc.dataset.rotation = currentRotation.toString();
          disc.style.transform = 'rotate(' + currentRotation + 'deg)';
        }

        CamryApp.events.emit('controller:dial_rotate', { delta: step });
        CamryApp.events.emit('controller:rotate', { direction: step });
        return step;
      },

      /**
       * Click dial center push button
       */
      clickDial: function() {
        if (CamryApp.audio && typeof CamryApp.audio.playDialSelect === 'function') {
          CamryApp.audio.playDialSelect();
        }

        const dialCap = document.getElementById('dial-center-socket');
        if (dialCap) {
          dialCap.classList.add('pressed');
          setTimeout(function() { dialCap.classList.remove('pressed'); }, 120);
        }

        CamryApp.events.emit('controller:dial_click', { source: 'dial_center' });
        CamryApp.events.emit('controller:select', { source: 'dial_center' });
        return true;
      },

      /**
       * Tilt sport volume rocker switch
       * @param {number} direction - +1 (Vol Up), -1 (Vol Down), 0 (Center/Mute)
       */
      tiltVolume: function(direction) {
        if (CamryApp.audio && typeof CamryApp.audio.playVolumeClack === 'function') {
          CamryApp.audio.playVolumeClack();
        }

        const rockerUp = document.getElementById('rocker-vol-up');
        const rockerDown = document.getElementById('rocker-vol-down');
        const muteDot = document.getElementById('rocker-mute-indicator');

        if (direction === 0) {
          // Toggle Mute
          if (CamryApp.state.isMuted) {
            CamryApp.state.isMuted = false;
            CamryApp.state.volume = CamryApp.state.volumeBeforeMute || 65;
          } else {
            CamryApp.state.volumeBeforeMute = CamryApp.state.volume;
            CamryApp.state.isMuted = true;
            CamryApp.state.volume = 0;
          }
        } else if (direction > 0) {
          // Volume Up
          const base = CamryApp.state.isMuted ? (CamryApp.state.volumeBeforeMute || 65) : CamryApp.state.volume;
          CamryApp.state.isMuted = false;
          CamryApp.state.volume = Math.min(100, base + 5);

          if (rockerUp) {
            rockerUp.classList.add('pressed');
            setTimeout(function() { rockerUp.classList.remove('pressed'); }, 150);
          }
        } else {
          // Volume Down
          const base = CamryApp.state.isMuted ? (CamryApp.state.volumeBeforeMute || 65) : CamryApp.state.volume;
          CamryApp.state.isMuted = false;
          CamryApp.state.volume = Math.max(0, base - 5);

          if (rockerDown) {
            rockerDown.classList.add('pressed');
            setTimeout(function() { rockerDown.classList.remove('pressed'); }, 150);
          }
        }

        if (muteDot) {
          if (CamryApp.state.isMuted) {
            muteDot.classList.add('muted');
          } else {
            muteDot.classList.remove('muted');
          }
        }

        CamryApp.events.emit('controller:volume_change', {
          volume: CamryApp.state.volume,
          isMuted: CamryApp.state.isMuted
        });
        CamryApp.events.emit('controller:volume', {
          volume: CamryApp.state.volume,
          isMuted: CamryApp.state.isMuted,
          delta: direction
        });
        return CamryApp.state.volume;
      },

      /**
       * Advance dual LED state machine
       */
      cycleLEDState: function() {
        if (CamryApp.audio && typeof CamryApp.audio.playButtonPress === 'function') {
          CamryApp.audio.playButtonPress();
        }

        const currentIdx = LED_SEQUENCE.indexOf(CamryApp.state.ledState);
        const nextIdx = (currentIdx + 1) % LED_SEQUENCE.length;
        const nextState = LED_SEQUENCE[nextIdx];
        CamryApp.state.ledState = nextState;

        // Update DOM LED domes
        const domes = document.querySelectorAll('.led-dome');
        domes.forEach(function(dome) {
          dome.className = 'led-dome led-state-' + nextState;
        });

        // Tactile button depression
        const btnConnect = document.getElementById('btn-socket-connect');
        if (btnConnect) {
          btnConnect.classList.add('pressed');
          setTimeout(function() { btnConnect.classList.remove('pressed'); }, 120);
        }

        CamryApp.events.emit('controller:led_change', { ledState: nextState });
        CamryApp.events.emit('controller:led', { state: nextState });
        return nextState;
      },

      /**
       * Press tactile hotkey
       * @param {string} key - 'HOME' | 'BACK' | 'NAV' | 'PERF' | 'MEDIA'
       */
      pressHotkey: function(key) {
        const normalized = (key || '').toUpperCase();
        if (CamryApp.audio && typeof CamryApp.audio.playButtonPress === 'function') {
          CamryApp.audio.playButtonPress();
        }

        // Animate corresponding DOM button
        const hotkeyButtons = document.querySelectorAll('.hotkey-btn');
        hotkeyButtons.forEach(function(btn) {
          const hk = (btn.getAttribute('data-hotkey') || '').toUpperCase();
          if (hk === normalized || (hk === 'NAV/AA' && normalized === 'NAV')) {
            btn.classList.add('pressed');
            setTimeout(function() { btn.classList.remove('pressed'); }, 120);
          }
        });

        CamryApp.events.emit('controller:hotkey', { key: normalized });

        if (CamryApp.display) {
          switch (normalized) {
            case 'HOME':
              CamryApp.display.setView('home');
              break;
            case 'BACK':
              CamryApp.display.goBack();
              break;
            case 'NAV':
            case 'NAV/AA':
              CamryApp.display.setView('nav');
              break;
            case 'PERF':
              CamryApp.display.setView('perf');
              break;
            case 'MEDIA':
              CamryApp.display.setView('media');
              break;
            default:
              break;
          }
        }
        return CamryApp.state.activeView;
      }
    },

    // -------------------------------------------------------------------------
    // 4. Audio Synthesizer Interface Stubs (Milestone 3 Implementation Anchor)
    // -------------------------------------------------------------------------
    audio: {
      _log: [],
      _getLog: function() { return this._log; },
      _clearLog: function() { this._log.length = 0; },
      playDialDetent: function() { this._log.push('dial_detent'); CamryApp.events.emit('audio:detent', {}); return true; },
      playDialSelect: function() { this._log.push('dial_select'); CamryApp.events.emit('audio:select', {}); return true; },
      playButtonPress: function() { this._log.push('button_press'); CamryApp.events.emit('audio:button', {}); return true; },
      playVolumeClack: function() { this._log.push('volume_clack'); CamryApp.events.emit('audio:rocker', {}); return true; },
      playWarningChime: function() { this._log.push('warning_chime'); CamryApp.events.emit('audio:chime', {}); return true; }
    },

    // -------------------------------------------------------------------------
    // 5. Telemetry Interface Stubs (Milestone 4 Implementation Anchor)
    // -------------------------------------------------------------------------
    telemetry: {
      _manualFaults: {
        checkEngine: false,
        tpmsAlert: false,
        batteryAlert: false,
        overheatAlert: false
      },
      recalculateDiagnostics: function() {
        const tpms = CamryApp.state.tpms;
        const sensorTPMS = tpms.fl < 25 || tpms.fr < 25 || tpms.rl < 25 || tpms.rr < 25 ||
                           tpms.fl > 38 || tpms.fr > 38 || tpms.rl > 38 || tpms.rr > 38;
        CamryApp.state.faults.tpmsAlert = sensorTPMS || CamryApp.telemetry._manualFaults.tpmsAlert;
        const sensorOverheat = CamryApp.state.engine.coolantTemp > 230;
        CamryApp.state.faults.overheatAlert = sensorOverheat || CamryApp.telemetry._manualFaults.overheatAlert;
        const sensorBattery = CamryApp.state.engine.batteryVoltage < 11.8 || CamryApp.state.engine.batteryVoltage > 15.0;
        CamryApp.state.faults.batteryAlert = sensorBattery || CamryApp.telemetry._manualFaults.batteryAlert;
        CamryApp.state.faults.checkEngine = CamryApp.telemetry._manualFaults.checkEngine;

        const anyFault = CamryApp.state.faults.checkEngine || CamryApp.state.faults.tpmsAlert ||
                         CamryApp.state.faults.batteryAlert || CamryApp.state.faults.overheatAlert;
        CamryApp.events.emit('diagnostics:update', {
          badgeText: anyFault ? 'SYSTEM ALERT' : 'ALL SYSTEMS OK',
          hasFault: anyFault,
          faults: { ...CamryApp.state.faults }
        });
        if (anyFault && CamryApp.audio && typeof CamryApp.audio.playWarningChime === 'function') {
          CamryApp.audio.playWarningChime();
        }
      },
      setEngineRunning: function(isRunning) {
        CamryApp.state.engine.isRunning = !!isRunning;
        if (isRunning) {
          CamryApp.state.engine.batteryVoltage = 14.2;
          if (CamryApp.state.engine.rpm === 0) CamryApp.state.engine.rpm = 800;
        } else {
          CamryApp.state.engine.batteryVoltage = 12.4;
          CamryApp.state.engine.rpm = 0;
          CamryApp.state.engine.speed = 0;
          CamryApp.state.trip.instantMpg = 0.0;
        }
        CamryApp.telemetry.recalculateDiagnostics();
        CamryApp.events.emit('telemetry:engine_change', { engine: { ...CamryApp.state.engine } });
        CamryApp.events.emit('telemetry:engine', { isRunning: CamryApp.state.engine.isRunning });
        return CamryApp.state.engine.isRunning;
      },
      setRPM: function(rpm) {
        const clamped = Math.max(0, Math.min(8000, Number(rpm) || 0));
        CamryApp.state.engine.rpm = clamped;
        if (CamryApp.state.engine.isRunning && clamped > 0) {
          CamryApp.state.engine.speed = Math.min(140, Math.round(clamped * 0.03125));
        } else {
          CamryApp.state.engine.speed = 0;
        }
        const needleAngle = -120 + (clamped / 8000) * 240;
        const isRedline = clamped >= 6200;
        CamryApp.events.emit('telemetry:rpm', { rpm: clamped, needleAngle, isRedline });
        CamryApp.events.emit('telemetry:rpm_change', { rpm: clamped, needleAngle, isRedline });
        return { clamped, needleAngle, isRedline };
      },
      setCoolantTemp: function(temp) {
        const clamped = Math.max(100, Math.min(260, Number(temp) || 100));
        CamryApp.state.engine.coolantTemp = clamped;
        let zone = 'normal';
        if (clamped < 140) zone = 'cold';
        else if (clamped >= 180 && clamped <= 210) zone = 'optimal';
        else if (clamped > 230) zone = 'overheat';
        CamryApp.telemetry.recalculateDiagnostics();
        CamryApp.events.emit('telemetry:coolant', { temp: clamped, zone });
        CamryApp.events.emit('telemetry:coolant_change', { coolantTemp: clamped, zone });
        return { clamped, zone };
      },
      setBatteryVoltage: function(volts) {
        const clamped = Math.max(9.0, Math.min(16.0, Number(volts) || 12.4));
        CamryApp.state.engine.batteryVoltage = clamped;
        CamryApp.telemetry.recalculateDiagnostics();
        CamryApp.events.emit('telemetry:battery', { volts: clamped });
        CamryApp.events.emit('telemetry:battery_change', { batteryVoltage: clamped });
        return clamped;
      },
      setTirePressure: function(tireKey, psi) {
        const validTires = ['fl', 'fr', 'rl', 'rr'];
        if (validTires.indexOf(tireKey) !== -1) {
          const numPsi = Number(psi);
          const clamped = Math.max(15, Math.min(50, isNaN(numPsi) ? 33 : numPsi));
          CamryApp.state.tpms[tireKey] = clamped;
          let status = 'normal';
          if (clamped < 25) status = 'critical';
          else if (clamped < 28) status = 'low';
          else if (clamped > 38) status = 'high';
          CamryApp.telemetry.recalculateDiagnostics();
          CamryApp.events.emit('telemetry:tpms', { tire: tireKey, psi: clamped, status });
          return { clamped, status };
        }
        return null;
      },
      injectFault: function(faultKey, isTriggered) {
        if (faultKey in CamryApp.state.faults) {
          CamryApp.telemetry._manualFaults[faultKey] = !!isTriggered;
          CamryApp.telemetry.recalculateDiagnostics();
          CamryApp.events.emit('telemetry:fault', { fault: faultKey, isTriggered: !!isTriggered });
          return true;
        }
        return false;
      },
      resetTrip: function() {
        CamryApp.state.trip.miles = 0.0;
        CamryApp.state.trip.fuelGallons = 0.00;
        CamryApp.state.trip.elapsedSeconds = 0;
        CamryApp.state.trip.avgMpg = 0.0;
        CamryApp.state.trip.instantMpg = 0.0;
        CamryApp.events.emit('telemetry:tripReset', {});
        CamryApp.events.emit('telemetry:trip_update', { trip: { ...CamryApp.state.trip } });
      },
      integrateTripStep: function(deltaSeconds) {
        if (!CamryApp.state.engine.isRunning || CamryApp.state.engine.speed <= 0 || deltaSeconds <= 0) {
          CamryApp.state.trip.instantMpg = 0.0;
          return;
        }
        CamryApp.state.trip.elapsedSeconds += deltaSeconds;
        const milesDelta = (CamryApp.state.engine.speed * deltaSeconds) / 3600;
        CamryApp.state.trip.miles = +(CamryApp.state.trip.miles + milesDelta).toFixed(2);
        const gph = Math.max(0.3, (CamryApp.state.engine.rpm / 8000) * 4.5);
        const fuelDelta = (gph * deltaSeconds) / 3600;
        CamryApp.state.trip.fuelGallons = +(CamryApp.state.trip.fuelGallons + fuelDelta).toFixed(3);
        CamryApp.state.trip.instantMpg = Math.min(99.9, +(CamryApp.state.engine.speed / gph).toFixed(1));
        if (CamryApp.state.trip.fuelGallons > 0) {
          CamryApp.state.trip.avgMpg = Math.min(99.9, +(CamryApp.state.trip.miles / CamryApp.state.trip.fuelGallons).toFixed(1));
        } else {
          CamryApp.state.trip.avgMpg = 0.0;
        }
        CamryApp.events.emit('telemetry:trip_update', { trip: { ...CamryApp.state.trip } });
      },
      startDynoScenario: function() {
        CamryApp.telemetry.setEngineRunning(true);
        CamryApp.telemetry.setRPM(1500);
        CamryApp.telemetry.integrateTripStep(2);
        CamryApp.events.emit('telemetry:dynoStart', {});
        return true;
      },
      stopDynoScenario: function() {
        CamryApp.telemetry.setRPM(800);
        CamryApp.events.emit('telemetry:dynoStop', {});
      }
    },

    // -------------------------------------------------------------------------
    // 6. Physical Keyboard Navigation & Event Dispatcher
    // -------------------------------------------------------------------------
    initKeyboard: function() {
      window.addEventListener('keydown', function(e) {
        // Typing Guard: Ignore shortcuts when focused on text fields
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
          return;
        }

        let handled = false;

        switch (e.key) {
          case 'ArrowLeft':
            CamryApp.controller.rotateDial(-1);
            handled = true;
            break;
          case 'ArrowRight':
            CamryApp.controller.rotateDial(1);
            handled = true;
            break;
          case 'Enter':
            CamryApp.controller.clickDial();
            handled = true;
            break;
          case 'ArrowUp':
            CamryApp.controller.tiltVolume(1);
            handled = true;
            break;
          case 'ArrowDown':
            CamryApp.controller.tiltVolume(-1);
            handled = true;
            break;
          case 'h':
          case 'H':
            if (!e.repeat) CamryApp.controller.pressHotkey('HOME');
            handled = true;
            break;
          case 'b':
          case 'B':
            if (!e.repeat) CamryApp.controller.pressHotkey('BACK');
            handled = true;
            break;
          case 'p':
          case 'P':
            if (!e.repeat) CamryApp.controller.pressHotkey('PERF');
            handled = true;
            break;
          case 'n':
          case 'N':
            if (!e.repeat) CamryApp.controller.pressHotkey('NAV');
            handled = true;
            break;
          case ' ':
            // Space: Toggle Media View
            if (!e.repeat) CamryApp.controller.pressHotkey('MEDIA');
            handled = true;
            break;
          case 'm':
          case 'M':
            if (!e.repeat) CamryApp.controller.tiltVolume(0);
            handled = true;
            break;
          case 'l':
          case 'L':
            if (!e.repeat) CamryApp.controller.cycleLEDState();
            handled = true;
            break;
          case '1':
            if (!e.repeat && CamryApp.display) CamryApp.display.setTheme('cic');
            handled = true;
            break;
          case '2':
            if (!e.repeat && CamryApp.display) CamryApp.display.setTheme('mmi');
            handled = true;
            break;
          case '3':
            if (!e.repeat && CamryApp.display) CamryApp.display.setTheme('panoramic');
            handled = true;
            break;
        }

        // Prevent browser viewport scrolling on navigation keys
        if (handled) {
          e.preventDefault();
        }
      });
    },

    // -------------------------------------------------------------------------
    // 7. Wire Up Virtual Console Socket Controls
    // -------------------------------------------------------------------------
    _wireConsoleControls: function() {
      // Hotkey buttons
      document.querySelectorAll('.hotkey-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const hk = btn.getAttribute('data-hotkey');
          if (hk) CamryApp.controller.pressHotkey(hk);
        });
      });

      // LED cycle button
      const btnConnect = document.getElementById('btn-socket-connect');
      if (btnConnect) {
        btnConnect.addEventListener('click', function() {
          CamryApp.controller.cycleLEDState();
        });
      }

      // Volume Rocker buttons
      const btnVolUp = document.getElementById('rocker-vol-up');
      const btnVolDown = document.getElementById('rocker-vol-down');
      const muteDot = document.getElementById('rocker-mute-indicator');

      if (btnVolUp) {
        btnVolUp.addEventListener('click', function() { CamryApp.controller.tiltVolume(1); });
      }
      if (btnVolDown) {
        btnVolDown.addEventListener('click', function() { CamryApp.controller.tiltVolume(-1); });
      }
      if (muteDot) {
        muteDot.addEventListener('click', function() { CamryApp.controller.tiltVolume(0); });
      }

      // Dial center click
      const dialCenter = document.getElementById('dial-center-socket');
      if (dialCenter) {
        dialCenter.addEventListener('click', function() {
          CamryApp.controller.clickDial();
        });
      }

      // Dial mouse wheel scroll
      const dialWell = document.getElementById('socket-dial-well') || document.querySelector('.dial-halo-ring');
      if (dialWell) {
        dialWell.addEventListener('wheel', function(e) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 1 : -1;
          CamryApp.controller.rotateDial(delta);
        }, { passive: false });
      }
    },

    // -------------------------------------------------------------------------
    // 8. Master Application Bootstrap
    // -------------------------------------------------------------------------
    init: function() {
      if (this._initialized) return;
      console.log('[CamryApp] Booting 2012 Toyota Camry iDrive Simulator...');

      // Initialize display engine if available
      if (this.display && typeof this.display.init === 'function') {
        this.display.init();
      }

      // Wire interactive controls and physical keyboard
      this._wireConsoleControls();
      this.initKeyboard();

      this._initialized = true;
      console.log('[CamryApp] Master initialization complete.');
      this.events.emit('app:ready', { timestamp: Date.now() });
    }
  };

  // Safely merge existing properties from global.CamryApp (e.g. display, audio, etc.)
  if (global.CamryApp) {
    for (const prop in global.CamryApp) {
      if (Object.prototype.hasOwnProperty.call(global.CamryApp, prop)) {
        if (!(prop in CamryApp)) {
          CamryApp[prop] = global.CamryApp[prop];
        } else if (typeof CamryApp[prop] === 'object' && typeof global.CamryApp[prop] === 'object') {
          Object.assign(CamryApp[prop], global.CamryApp[prop]);
        }
      }
    }
  }

  // Expose on global window object
  global.CamryApp = CamryApp;

  // Auto-boot when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        CamryApp.init();
      });
    } else {
      CamryApp.init();
    }
  }

})(typeof window !== 'undefined' ? window : this);
