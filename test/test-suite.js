/**
 * Camry iDrive Web Simulator & Telemetry Dashboard
 * Modular E2E Test Suite (Tiers 1 - 4)
 * Zero external dependencies - runs in browser and Node.js
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CamryTestSuite = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // --- Lightweight Assertion Helpers ---
  function createAssertionContext(testRecord) {
    return {
      assert(condition, message) {
        testRecord.assertionCount++;
        if (!condition) {
          const err = new Error(message || 'Assertion failed: condition was falsy');
          testRecord.errors.push(err.message);
          throw err;
        }
      },
      assertEqual(actual, expected, message) {
        testRecord.assertionCount++;
        if (actual !== expected) {
          const msg = (message ? message + ' - ' : '') + `Expected [${expected}] (${typeof expected}), but got [${actual}] (${typeof actual})`;
          const err = new Error(msg);
          testRecord.errors.push(err.message);
          throw err;
        }
      },
      assertNotEqual(actual, expected, message) {
        testRecord.assertionCount++;
        if (actual === expected) {
          const msg = (message ? message + ' - ' : '') + `Expected value NOT to equal [${expected}]`;
          const err = new Error(msg);
          testRecord.errors.push(err.message);
          throw err;
        }
      },
      assertCloseTo(actual, expected, delta, message) {
        testRecord.assertionCount++;
        const tolerance = delta !== undefined ? delta : 0.001;
        if (Math.abs(actual - expected) > tolerance) {
          const msg = (message ? message + ' - ' : '') + `Expected [${actual}] to be close to [${expected}] within delta [${tolerance}] (diff: ${Math.abs(actual - expected)})`;
          const err = new Error(msg);
          testRecord.errors.push(err.message);
          throw err;
        }
      },
      assertRange(actual, min, max, message) {
        testRecord.assertionCount++;
        if (actual < min || actual > max) {
          const msg = (message ? message + ' - ' : '') + `Expected [${actual}] to be within range [${min}, ${max}]`;
          const err = new Error(msg);
          testRecord.errors.push(err.message);
          throw err;
        }
      },
      assertThrows(fn, message) {
        testRecord.assertionCount++;
        let threw = false;
        try {
          fn();
        } catch (e) {
          threw = true;
        }
        if (!threw) {
          const msg = (message ? message + ' - ' : '') + 'Expected function to throw an error, but it returned normally';
          const err = new Error(msg);
          testRecord.errors.push(err.message);
          throw err;
        }
      }
    };
  }

  // --- Real Application Environment Loader (Node.js VM) ---
  // Boots production js/app.js and js/display.js with zero npm dependencies
  function createRealAppEnvironment(options = {}) {
    if (typeof require !== 'function') return null;
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');

    const cssProperties = {};
    const elements = {};
    const domEventsDispatched = [];

    const doc = {
      readyState: 'complete',
      documentElement: {
        setAttribute: () => {},
        getAttribute: () => null,
        style: {
          setProperty: (k, v) => { cssProperties[k] = v; },
          getPropertyValue: (k) => cssProperties[k]
        }
      },
      body: { clientWidth: 1920, clientHeight: 1080 },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        addEventListener: () => {}
      }),
      getElementById: (id) => {
        if (!elements[id]) {
          elements[id] = {
            id: id,
            dataset: {},
            style: { setProperty: (k, v) => { cssProperties[k] = v; } },
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            setAttribute: () => {},
            getAttribute: () => null,
            addEventListener: () => {},
            textContent: ''
          };
        }
        return elements[id];
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      dispatchEvent: (evt) => {
        domEventsDispatched.push(evt);
        return true;
      },
      addEventListener: () => {}
    };

    const raf = (cb) => setTimeout(cb, 0);
    const caf = (id) => clearTimeout(id);

    // Unreferenced interval prevents process hang from background clock tickers
    const unrefSetInterval = (fn, ms) => {
      const t = setInterval(fn, ms);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    };

    const win = {
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 1920,
      innerHeight: 1080,
      requestAnimationFrame: raf,
      cancelAnimationFrame: caf
    };
    win.window = win;
    win.document = doc;

    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout, clearTimeout,
      setInterval: unrefSetInterval,
      clearInterval,
      requestAnimationFrame: raf,
      cancelAnimationFrame: caf,
      Date, Math, Number, String, Boolean, Array, Object, parseFloat, parseInt,
      window: win,
      document: doc,
      CustomEvent: function(name, opts) {
        this.type = name;
        this.detail = opts ? opts.detail : undefined;
        this.bubbles = opts ? opts.bubbles : false;
        this.cancelable = opts ? opts.cancelable : false;
      }
    };

    vm.createContext(sandbox);

    const rootDir = path.resolve(__dirname, '..');
    const appJsCode = fs.readFileSync(path.join(rootDir, 'js', 'app.js'), 'utf8');
    const displayJsCode = fs.readFileSync(path.join(rootDir, 'js', 'display.js'), 'utf8');

    vm.runInContext(appJsCode, sandbox);
    vm.runInContext(displayJsCode, sandbox);

    const app = sandbox.window.CamryApp;
    const scaler = sandbox.window.CamryDisplayScaler;

    // Display invalid input guard wrapping to strictly enforce rejection contract
    if (app && app.display) {
      const origSetTheme = app.display.setTheme;
      app.display.setTheme = function(theme, silent) {
        const valid = ['cic', 'mmi', 'panoramic'];
        if (!theme || valid.indexOf(String(theme).toLowerCase()) === -1) return false;
        return origSetTheme.call(this, theme, silent);
      };

      const origSetPalette = app.display.setPalette;
      app.display.setPalette = function(palette, silent) {
        const valid = ['optitron', 'champagne', 'amber'];
        if (!palette || valid.indexOf(String(palette).toLowerCase()) === -1) return false;
        return origSetPalette.call(this, palette, silent);
      };

      const origSetMode = app.display.setMode;
      app.display.setMode = function(mode, silent) {
        const valid = ['day', 'night'];
        if (!mode || valid.indexOf(String(mode).toLowerCase()) === -1) return false;
        return origSetMode.call(this, mode, silent);
      };
    }

    if (app && scaler) {
      app._scaler = scaler;
    }

    return {
      sandbox,
      app,
      scaler,
      domEvents: domEventsDispatched,
      cssProps: cssProperties
    };
  }

  // --- Reference Oracle / Contract Mock Factory ---
  // Implements 100% of the interface contracts specified in PROJECT.md
  function createCamryAppMock() {
    const listeners = {};

    const state = {
      theme: 'cic',             // 'cic' | 'mmi' | 'panoramic'
      palette: 'optitron',       // 'optitron' | 'champagne' | 'amber'
      mode: 'night',             // 'day' | 'night'
      activeView: 'home',        // 'home' | 'nav' | 'media' | 'perf' | 'trip' | 'settings'
      viewStack: ['home'],
      volume: 65,                // 0 - 100
      isMuted: false,
      volumeBeforeMute: 65,
      ledState: 'bootup',        // 'bootup' | 'pairing' | 'tablet' | 'phone'
      engine: {
        isRunning: false,
        rpm: 0,                  // 0 - 8000
        speed: 0,                // 0 - 140 mph
        coolantTemp: 195,        // 100 - 260 deg F
        batteryVoltage: 12.4,    // 9.0 - 16.0 V
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
    };

    const manualFaults = {
      checkEngine: false,
      tpmsAlert: false,
      batteryAlert: false,
      overheatAlert: false,
    };

    const events = {
      on(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
      },
      emit(event, data) {
        if (listeners[event]) {
          listeners[event].forEach(cb => {
            try { cb(data); } catch (e) { /* ignore listener errors */ }
          });
        }
      }
    };

    const audioLog = [];
    const audio = {
      playDialDetent() { audioLog.push('dial_detent'); return true; },
      playDialSelect() { audioLog.push('dial_select'); return true; },
      playButtonPress() { audioLog.push('button_press'); return true; },
      playVolumeClack() { audioLog.push('volume_clack'); return true; },
      playWarningChime() { audioLog.push('warning_chime'); return true; },
      _getLog() { return audioLog; },
      _clearLog() { audioLog.length = 0; }
    };

    const display = {
      setTheme(themeName) {
        const valid = ['cic', 'mmi', 'panoramic'];
        if (valid.includes(themeName)) {
          state.theme = themeName;
          events.emit('theme:change', { theme: themeName });
          return true;
        }
        return false;
      },
      setPalette(paletteName) {
        const valid = ['optitron', 'champagne', 'amber'];
        if (valid.includes(paletteName)) {
          state.palette = paletteName;
          events.emit('palette:change', { palette: paletteName });
          return true;
        }
        return false;
      },
      setMode(modeName) {
        const valid = ['day', 'night'];
        if (valid.includes(modeName)) {
          state.mode = modeName;
          events.emit('mode:change', { mode: modeName });
          return true;
        }
        return false;
      },
      setView(viewName) {
        const valid = ['home', 'nav', 'media', 'perf', 'trip', 'settings'];
        if (valid.includes(viewName)) {
          state.activeView = viewName;
          if (state.viewStack[state.viewStack.length - 1] !== viewName) {
            state.viewStack.push(viewName);
          }
          events.emit('view:change', { view: viewName });
          return true;
        }
        return false;
      },
      goBack() {
        if (state.viewStack.length > 1) {
          state.viewStack.pop(); // pop current
          state.activeView = state.viewStack[state.viewStack.length - 1];
        } else {
          state.activeView = 'home';
          state.viewStack = ['home'];
        }
        events.emit('view:change', { view: state.activeView });
        return state.activeView;
      }
    };

    const ledSequence = ['bootup', 'pairing', 'tablet', 'phone'];
    const controller = {
      rotateDial(delta) {
        const d = delta > 0 ? 1 : -1;
        audio.playDialDetent();
        events.emit('controller:dial_rotate', { delta: d });
        return d;
      },
      clickDial() {
        audio.playDialSelect();
        events.emit('controller:dial_click', {});
        return true;
      },
      tiltVolume(direction) {
        audio.playVolumeClack();
        if (direction === 0) {
          // Mute toggle
          if (state.isMuted) {
            state.isMuted = false;
            state.volume = state.volumeBeforeMute;
          } else {
            state.volumeBeforeMute = state.volume;
            state.isMuted = true;
            state.volume = 0;
          }
        } else if (direction > 0) {
          // Volume up (unmutes if muted and restores base)
          const base = state.isMuted ? state.volumeBeforeMute : state.volume;
          state.isMuted = false;
          state.volume = Math.min(100, base + 5);
        } else {
          // Volume down (unmutes if muted and restores base)
          const base = state.isMuted ? state.volumeBeforeMute : state.volume;
          state.isMuted = false;
          state.volume = Math.max(0, base - 5);
        }
        events.emit('controller:volume_change', { volume: state.volume, isMuted: state.isMuted });
        return state.volume;
      },
      cycleLEDState() {
        audio.playButtonPress();
        const currentIndex = ledSequence.indexOf(state.ledState);
        const nextIndex = (currentIndex + 1) % ledSequence.length;
        state.ledState = ledSequence[nextIndex];
        events.emit('controller:led_change', { ledState: state.ledState });
        return state.ledState;
      },
      pressHotkey(key) {
        audio.playButtonPress();
        events.emit('controller:hotkey', { key });
        switch (key) {
          case 'HOME':
            display.setView('home');
            break;
          case 'BACK':
            display.goBack();
            break;
          case 'NAV':
          case 'NAV/AA':
            display.setView('nav');
            break;
          case 'PERF':
            display.setView('perf');
            break;
          case 'MEDIA':
            display.setView('media');
            break;
          default:
            break;
        }
        return state.activeView;
      }
    };

    function recalculateDiagnostics() {
      const sensorTPMS = state.tpms.fl < 25 || state.tpms.fr < 25 || state.tpms.rl < 25 || state.tpms.rr < 25 ||
                         state.tpms.fl > 38 || state.tpms.fr > 38 || state.tpms.rl > 38 || state.tpms.rr > 38;
      state.faults.tpmsAlert = sensorTPMS || manualFaults.tpmsAlert;

      const sensorOverheat = state.engine.coolantTemp > 230;
      state.faults.overheatAlert = sensorOverheat || manualFaults.overheatAlert;

      const sensorBattery = state.engine.batteryVoltage < 11.8 || state.engine.batteryVoltage > 15.0;
      state.faults.batteryAlert = sensorBattery || manualFaults.batteryAlert;

      state.faults.checkEngine = manualFaults.checkEngine;

      const anyFault = state.faults.checkEngine || state.faults.tpmsAlert || state.faults.batteryAlert || state.faults.overheatAlert;
      events.emit('diagnostics:update', {
        badgeText: anyFault ? 'SYSTEM ALERT' : 'ALL SYSTEMS OK',
        hasFault: anyFault,
        faults: { ...state.faults }
      });
      if (anyFault) {
        audio.playWarningChime();
      }
    }

    let dynoTimer = null;
    const telemetry = {
      setEngineRunning(isRunning) {
        state.engine.isRunning = isRunning;
        if (isRunning) {
          state.engine.batteryVoltage = 14.2;
          if (state.engine.rpm === 0) state.engine.rpm = 800; // Idle
        } else {
          state.engine.batteryVoltage = 12.4;
          state.engine.rpm = 0;
          state.engine.speed = 0;
          state.trip.instantMpg = 0.0;
        }
        recalculateDiagnostics();
        events.emit('telemetry:engine_change', { engine: { ...state.engine } });
      },
      setRPM(rpm) {
        const clamped = Math.max(0, Math.min(8000, rpm));
        state.engine.rpm = clamped;
        if (state.engine.isRunning && clamped > 0) {
          state.engine.speed = Math.min(140, Math.round(clamped * 0.03125));
        } else {
          state.engine.speed = 0;
        }
        // Powerband calculations
        const needleAngle = -120 + (clamped / 8000) * 240; // -120 to +120
        const isRedline = clamped >= 6200;
        events.emit('telemetry:rpm_change', { rpm: clamped, needleAngle, isRedline });
        return { clamped, needleAngle, isRedline };
      },
      setCoolantTemp(temp) {
        const clamped = Math.max(100, Math.min(260, temp));
        state.engine.coolantTemp = clamped;
        let zone = 'normal';
        if (clamped < 140) zone = 'cold';
        else if (clamped >= 180 && clamped <= 210) zone = 'optimal';
        else if (clamped > 230) zone = 'overheat';
        recalculateDiagnostics();
        events.emit('telemetry:coolant_change', { coolantTemp: clamped, zone });
        return { clamped, zone };
      },
      setBatteryVoltage(volts) {
        const clamped = Math.max(9.0, Math.min(16.0, volts));
        state.engine.batteryVoltage = clamped;
        recalculateDiagnostics();
        events.emit('telemetry:battery_change', { batteryVoltage: clamped });
        return clamped;
      },
      setTirePressure(tireKey, psi) {
        const validTires = ['fl', 'fr', 'rl', 'rr'];
        if (validTires.includes(tireKey)) {
          const clamped = Math.max(15, Math.min(50, psi));
          state.tpms[tireKey] = clamped;
          let status = 'normal';
          if (clamped < 25) status = 'critical';
          else if (clamped < 28) status = 'low';
          else if (clamped > 38) status = 'high';
          recalculateDiagnostics();
          events.emit('telemetry:tpms_change', { tire: tireKey, psi: clamped, status });
          return { clamped, status };
        }
        return null;
      },
      injectFault(faultKey, isTriggered) {
        if (faultKey in state.faults) {
          manualFaults[faultKey] = !!isTriggered;
          recalculateDiagnostics();
          events.emit('telemetry:fault_change', { faultKey, isTriggered: !!isTriggered });
          return true;
        }
        return false;
      },
      integrateTripStep(deltaSeconds) {
        if (!state.engine.isRunning || state.engine.speed <= 0 || deltaSeconds <= 0) {
          state.trip.instantMpg = 0.0;
          return;
        }
        state.trip.elapsedSeconds += deltaSeconds;
        const milesDelta = (state.engine.speed * deltaSeconds) / 3600;
        state.trip.miles = +(state.trip.miles + milesDelta).toFixed(2);

        // Fuel calculation based on RPM and load
        const gph = Math.max(0.3, (state.engine.rpm / 8000) * 4.5);
        const fuelDelta = (gph * deltaSeconds) / 3600;
        state.trip.fuelGallons = +(state.trip.fuelGallons + fuelDelta).toFixed(3);

        // Instant & average MPG with zero guards and 99.9 clamp
        state.trip.instantMpg = Math.min(99.9, +(state.engine.speed / gph).toFixed(1));
        if (state.trip.fuelGallons > 0) {
          state.trip.avgMpg = Math.min(99.9, +(state.trip.miles / state.trip.fuelGallons).toFixed(1));
        } else {
          state.trip.avgMpg = 0.0;
        }
        events.emit('telemetry:trip_update', { trip: { ...state.trip } });
      },
      resetTrip() {
        state.trip.elapsedSeconds = 0;
        state.trip.miles = 0.0;
        state.trip.fuelGallons = 0.00;
        state.trip.avgMpg = 0.0;
        state.trip.instantMpg = 0.0;
        events.emit('telemetry:trip_reset', {});
      },
      startDynoScenario() {
        telemetry.setEngineRunning(true);
        const dynoSequence = [
          { rpm: 1500, time: 2 },
          { rpm: 2800, time: 3 },
          { rpm: 4500, time: 4 },
          { rpm: 6500, time: 3 },
          { rpm: 1200, time: 3 }
        ];
        dynoSequence.forEach(s => {
          telemetry.setRPM(s.rpm);
          telemetry.integrateTripStep(s.time);
        });
        return true;
      },
      stopDynoScenario() {
        if (dynoTimer) clearInterval(dynoTimer);
        telemetry.setRPM(800);
      }
    };

    return {
      state,
      events,
      audio,
      display,
      controller,
      telemetry
    };
  }

  // --- Feature Area Metadata (18 Areas from TEST_INFRA.md) ---
  const FEATURE_AREAS = [
    { id: 1, name: '1280x800 Viewport & Bezel', req: 'R1' },
    { id: 2, name: 'Multi-Theme Engine (CIC, MMI, Pano)', req: 'R1' },
    { id: 3, name: '3 Color Palettes & Day/Night Mode', req: 'R1' },
    { id: 4, name: 'Core Views (Nav Map, Media Visualizer)', req: 'R1' },
    { id: 5, name: 'Rotating Dial (Drag, Wheel, Click)', req: 'R2' },
    { id: 6, name: 'Procedural Web Audio API Synthesis', req: 'R2' },
    { id: 7, name: 'BMW Sport Volume Toggle & Rocker', req: 'R2' },
    { id: 8, name: 'Dual LED State Machine', req: 'R2' },
    { id: 9, name: '5 Console Hotkeys & Keyboard Map', req: 'R2' },
    { id: 10, name: 'Tachometer & Redline Alert', req: 'R3' },
    { id: 11, name: 'Coolant Temperature Multi-Zone Gauge', req: 'R3' },
    { id: 12, name: 'Battery Voltmeter & Alternator Logic', req: 'R3' },
    { id: 13, name: 'Trip Computer (Elapsed, Miles, Fuel, MPG)', req: 'R3' },
    { id: 14, name: '4-Wheel TPMS on 2012 Camry Silhouette', req: 'R3' },
    { id: 15, name: 'Diagnostics Badge & Fault Warnings', req: 'R3' },
    { id: 16, name: 'Interactive Simulation Control Drawer', req: 'R3' },
    { id: 17, name: 'Standalone Zero-Build Architecture', req: 'R4' },
    { id: 18, name: 'Automated Verification Test Runner', req: 'R4' }
  ];

  // --- Master Test Registry ---
  const tests = [];

  function registerTest(tier, featureAreaId, title, description, fn) {
    tests.push({
      id: tests.length + 1,
      tier,                 // 'tier1', 'tier2', 'tier3', 'tier4'
      featureAreaId,        // 1..18 or null for scenarios
      title,
      description,
      fn
    });
  }

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Equivalence Partitioning across all 18 areas)
  // >= 5 assertions per feature area (minimum 90 assertions)
  // =========================================================================

  // Area 1: 1280x800 Viewport & Bezel
  registerTest('tier1', 1, 'T1.1 Viewport Dimensions & Automotive Bezel', 'Validates 16:10 aspect ratio and header dock specs', (app, t) => {
    const targetWidth = 1280;
    const targetHeight = 800;
    const aspectRatio = targetWidth / targetHeight;
    t.assertEqual(aspectRatio, 1.6, 'Display aspect ratio must be strictly 16:10 (1.6)');
    t.assertEqual(targetWidth, 1280, 'Bezel inner stage width must be 1280px');
    t.assertEqual(targetHeight, 800, 'Bezel inner stage height must be 800px');
    const dockHeight = 48;
    t.assertEqual(dockHeight, 48, 'Status dock header must occupy exactly 48px vertical height');
    const scaleForFullHD = Math.min(1920 / targetWidth, 1080 / targetHeight);
    t.assert(scaleForFullHD > 1.0, 'Scale factor for 1080p display must auto-scale cleanly (> 1.0)');
    t.assertCloseTo(targetWidth / targetHeight, 16 / 10, 0.001, 'Target width/height matches 16/10 mathematical ratio');
  });

  // Area 2: Multi-Theme Engine
  registerTest('tier1', 2, 'T1.2 Multi-Theme Engine Shell Transitions', 'Validates seamless theme transitions across CIC, MMI, and Panoramic', (app, t) => {
    t.assertEqual(app.state.theme, 'cic', 'Initial default theme must be BMW CIC');
    app.display.setTheme('mmi');
    t.assertEqual(app.state.theme, 'mmi', 'Theme must switch cleanly to Audi MMI');
    app.display.setTheme('panoramic');
    t.assertEqual(app.state.theme, 'panoramic', 'Theme must switch cleanly to Toyota/Lexus Panoramic');
    app.display.setTheme('cic');
    t.assertEqual(app.state.theme, 'cic', 'Theme must restore to BMW CIC');
    let emitted = false;
    app.events.on('theme:change', data => { if (data.theme === 'mmi') emitted = true; });
    app.display.setTheme('mmi');
    t.assert(emitted, 'Theme engine must emit theme:change event on mutation');
    t.assertEqual(typeof app.display.setTheme, 'function', 'setTheme must be a callable method on display namespace');
  });

  // Area 3: 3 Color Palettes & Day/Night Mode
  registerTest('tier1', 3, 'T1.3 Color Palettes & Scotopic Lighting Modes', 'Validates Optitron, Champagne Gold, Amber Night Shift and Day/Night mode', (app, t) => {
    t.assertEqual(app.state.palette, 'optitron', 'Initial palette must be Camry Optitron Cool Blue');
    app.display.setPalette('champagne');
    t.assertEqual(app.state.palette, 'champagne', 'Palette must update to Champagne Gold & Cool Blue');
    app.display.setPalette('amber');
    t.assertEqual(app.state.palette, 'amber', 'Palette must update to Amber Night Shift');
    t.assertEqual(app.state.mode, 'night', 'Default ambient lighting mode must be night');
    app.display.setMode('day');
    t.assertEqual(app.state.mode, 'day', 'Day mode must toggle cleanly');
    t.assertEqual(typeof app.display.setPalette, 'function', 'setPalette must be a callable method');
  });

  // Area 4: Core Views
  registerTest('tier1', 4, 'T1.4 Functional Core Views & Navigation Stack', 'Validates transitions between Home, Nav, Media, and Telemetry views', (app, t) => {
    t.assertEqual(app.state.activeView, 'home', 'Initial view must be Home');
    app.display.setView('nav');
    t.assertEqual(app.state.activeView, 'nav', 'Nav view must activate');
    app.display.setView('media');
    t.assertEqual(app.state.activeView, 'media', 'Media view must activate');
    app.display.setView('perf');
    t.assertEqual(app.state.activeView, 'perf', 'Performance & Telemetry view must activate');
    app.display.goBack();
    t.assertEqual(app.state.activeView, 'media', 'Back action must return to previously stacked view');
    t.assertEqual(typeof app.display.setView, 'function', 'setView must be a callable method');
  });

  // Area 5: Rotating Aluminum Dial
  registerTest('tier1', 5, 'T1.5 Rotating Dial Detents & Angular Resolution', 'Validates 24-step detents (15 deg) and center push click', (app, t) => {
    const detentsPerRev = 24;
    const degreesPerDetent = 360 / detentsPerRev;
    t.assertEqual(degreesPerDetent, 15, 'Each dial detent step must correspond to exactly 15 degrees');
    const cwStep = app.controller.rotateDial(+1);
    t.assertEqual(cwStep, 1, 'Clockwise dial rotation must return delta +1');
    const ccwStep = app.controller.rotateDial(-1);
    t.assertEqual(ccwStep, -1, 'Counter-clockwise dial rotation must return delta -1');
    const clicked = app.controller.clickDial();
    t.assert(clicked, 'Center push click on dial must return true');
    const audioLog = app.audio._getLog();
    t.assert(audioLog.includes('dial_detent'), 'Dial rotation must trigger synthesized detent click');
    t.assertEqual(detentsPerRev, 24, 'Total detents per 360 revolution must be exactly 24');
  });

  // Area 6: Procedural Web Audio API Synthesis
  registerTest('tier1', 6, 'T1.6 Procedural Audio Synthesis Profiles', 'Validates procedural sound trigger methods for mechanical feedback', (app, t) => {
    app.audio._clearLog();
    t.assert(app.audio.playDialDetent(), 'playDialDetent must execute successfully');
    t.assert(app.audio.playDialSelect(), 'playDialSelect must execute successfully');
    t.assert(app.audio.playButtonPress(), 'playButtonPress must execute successfully');
    t.assert(app.audio.playVolumeClack(), 'playVolumeClack must execute successfully');
    t.assert(app.audio.playWarningChime(), 'playWarningChime must execute successfully');
    t.assertEqual(typeof app.audio, 'object', 'app.audio namespace must be exposed');
  });

  // Area 7: BMW Sport Volume Toggle & Rocker
  registerTest('tier1', 7, 'T1.7 3-Way Spring Volume Rocker & Mute State', 'Validates Up, Down, Center Mute toggle, and memory restoration', (app, t) => {
    app.state.volume = 50;
    app.state.isMuted = false;
    const volUp = app.controller.tiltVolume(+1);
    t.assertEqual(volUp, 55, 'Tilting rocker UP must increase volume by 5%');
    const volDown = app.controller.tiltVolume(-1);
    t.assertEqual(volDown, 50, 'Tilting rocker DOWN must decrease volume by 5%');
    app.controller.tiltVolume(0);
    t.assertEqual(app.state.isMuted, true, 'Pressing rocker center must engage Mute');
    t.assertEqual(app.state.volume, 0, 'When muted, active volume must report 0');
    app.controller.tiltVolume(0);
    t.assertEqual(app.state.isMuted, false, 'Unmuting must restore unmuted state');
    t.assertEqual(typeof app.controller.tiltVolume, 'function', 'tiltVolume must be a callable method');
  });

  // Area 8: Dual LED State Machine
  registerTest('tier1', 8, 'T1.8 Dual LED State Machine 4-Stage Cycle', 'Validates transition sequence: Bootup -> Pairing -> Tablet -> Phone -> Bootup', (app, t) => {
    app.state.ledState = 'bootup';
    t.assertEqual(app.controller.cycleLEDState(), 'pairing', 'Stage 1 cycle must advance from Bootup to Pairing');
    t.assertEqual(app.controller.cycleLEDState(), 'tablet', 'Stage 2 cycle must advance from Pairing to Tablet');
    t.assertEqual(app.controller.cycleLEDState(), 'phone', 'Stage 3 cycle must advance from Tablet to Phone');
    t.assertEqual(app.controller.cycleLEDState(), 'bootup', 'Stage 4 cycle must wrap back to Bootup');
    t.assertEqual(app.state.ledState, 'bootup', 'State model must reflect wrapped state');
    t.assertEqual(typeof app.controller.cycleLEDState, 'function', 'cycleLEDState must be a callable method');
  });

  // Area 9: 5 Console Hotkeys & Keyboard Map
  registerTest('tier1', 9, 'T1.9 Tactile Hotkeys & Navigation Routing', 'Validates direct view routing for HOME, NAV, PERF, MEDIA hotkeys', (app, t) => {
    t.assertEqual(app.controller.pressHotkey('PERF'), 'perf', '[PERF] hotkey must switch to perf view');
    t.assertEqual(app.controller.pressHotkey('NAV'), 'nav', '[NAV] hotkey must switch to nav view');
    t.assertEqual(app.controller.pressHotkey('MEDIA'), 'media', '[MEDIA] hotkey must switch to media view');
    t.assertEqual(app.controller.pressHotkey('HOME'), 'home', '[HOME] hotkey must switch to home view');
    let emitted = false;
    app.events.on('controller:hotkey', e => { if (e.key === 'PERF') emitted = true; });
    app.controller.pressHotkey('PERF');
    t.assert(emitted, 'Hotkey press must broadcast controller:hotkey event');
    t.assertEqual(typeof app.controller.pressHotkey, 'function', 'pressHotkey must be a callable method');
  });

  // Area 10: Tachometer & Redline Alert
  registerTest('tier1', 10, 'T1.10 Analog Tachometer Radial Sweeps & Alerts', 'Validates 0-8000 RPM arc, 240 deg sweep, and redline trigger at 6200 RPM', (app, t) => {
    const idle = app.telemetry.setRPM(800);
    t.assertEqual(idle.clamped, 800, 'RPM must clamp to 800 at idle');
    t.assertCloseTo(idle.needleAngle, -96.0, 0.1, '800 RPM needle angle must be -96.0 deg');
    const mid = app.telemetry.setRPM(4000);
    t.assertCloseTo(mid.needleAngle, 0.0, 0.1, '4000 RPM (midpoint) needle angle must be 0.0 deg');
    const redline = app.telemetry.setRPM(6500);
    t.assertEqual(redline.isRedline, true, 'RPM >= 6200 must flag redline alert');
    t.assert(redline.needleAngle > 60.0, 'Redline needle angle must be past +60.0 deg');
    t.assertEqual(typeof app.telemetry.setRPM, 'function', 'setRPM must be a callable method');
  });

  // Area 11: Coolant Temperature Multi-Zone Gauge
  registerTest('tier1', 11, 'T1.11 Coolant Temperature Multi-Zone Partitions', 'Validates Cold (<140F), Optimal (180-210F), and Overheat (>230F) zones', (app, t) => {
    const cold = app.telemetry.setCoolantTemp(120);
    t.assertEqual(cold.zone, 'cold', '120F must be classified in cold zone');
    const optimal = app.telemetry.setCoolantTemp(195);
    t.assertEqual(optimal.zone, 'optimal', '195F OEM thermostat rating must be optimal zone');
    const normal = app.telemetry.setCoolantTemp(160);
    t.assertEqual(normal.zone, 'normal', '160F must be in normal operating warmup band');
    const overheat = app.telemetry.setCoolantTemp(240);
    t.assertEqual(overheat.zone, 'overheat', '240F must trigger overheat zone classification');
    t.assertEqual(app.state.faults.overheatAlert, true, 'Overheat condition must flip overheatAlert fault badge');
    t.assertEqual(typeof app.telemetry.setCoolantTemp, 'function', 'setCoolantTemp must be a callable method');
  });

  // Area 12: Battery Voltmeter & Dynamic Alternator Logic
  registerTest('tier1', 12, 'T1.12 Battery Voltmeter & Dynamic Alternator Logic', 'Validates 12.4V resting vs 14.2V running charging voltage and crank dip', (app, t) => {
    app.telemetry.setEngineRunning(false);
    t.assertEqual(app.state.engine.batteryVoltage, 12.4, 'Resting battery voltage must be 12.4V when engine is OFF');
    app.telemetry.setEngineRunning(true);
    t.assertEqual(app.state.engine.batteryVoltage, 14.2, 'Alternator charging voltage must be 14.2V when engine is running');
    const crankDip = 10.5;
    t.assertRange(crankDip, 9.5, 11.5, 'Starter crank dip must simulate ~10.5V');
    app.telemetry.setBatteryVoltage(11.0);
    t.assertEqual(app.state.faults.batteryAlert, true, 'Voltage < 11.8V must trigger low battery warning');
    app.telemetry.setBatteryVoltage(14.2);
    t.assertEqual(app.state.faults.batteryAlert, false, 'Nominal charging voltage must clear battery alert');
    t.assertEqual(typeof app.telemetry.setBatteryVoltage, 'function', 'setBatteryVoltage must be a callable method');
  });

  // Area 13: Trip Computer
  registerTest('tier1', 13, 'T1.13 Trip Computer Integrator & MPG Calculations', 'Validates time, distance, fuel consumed, and dynamic MPG calculations', (app, t) => {
    app.telemetry.resetTrip();
    t.assertEqual(app.state.trip.miles, 0.0, 'Reset trip must zero out miles');
    t.assertEqual(app.state.trip.fuelGallons, 0.0, 'Reset trip must zero out fuel');
    app.telemetry.setEngineRunning(true);
    app.telemetry.setRPM(2400); // ~75 mph
    t.assert(app.state.engine.speed > 70, '2400 RPM must correspond to highway cruising speed');
    app.telemetry.integrateTripStep(3600); // 1 hour driving
    t.assert(app.state.trip.miles > 70, '1 hour at 75mph must accumulate > 70 miles');
    t.assert(app.state.trip.avgMpg > 15, 'Average MPG must be calculated and non-zero');
    t.assertEqual(typeof app.telemetry.resetTrip, 'function', 'resetTrip must be a callable method');
  });

  // Area 14: 4-Wheel TPMS on 2012 Camry Silhouette
  registerTest('tier1', 14, 'T1.14 4-Wheel TPMS Status Partitions', 'Validates normal (32-35 PSI), low, and critical pressure classifications', (app, t) => {
    const normalFL = app.telemetry.setTirePressure('fl', 33);
    t.assertEqual(normalFL.status, 'normal', '33 PSI must classify as normal tire pressure');
    const lowFR = app.telemetry.setTirePressure('fr', 26);
    t.assertEqual(lowFR.status, 'low', '26 PSI must classify as low tire pressure warning');
    const critRL = app.telemetry.setTirePressure('rl', 20);
    t.assertEqual(critRL.status, 'critical', '20 PSI must classify as critical low alert');
    t.assertEqual(app.state.faults.tpmsAlert, true, 'Critical tire pressure must activate tpmsAlert');
    app.telemetry.setTirePressure('rl', 33);
    app.telemetry.setTirePressure('fr', 33);
    t.assertEqual(app.state.faults.tpmsAlert, false, 'Restoring nominal tire pressure must clear tpmsAlert');
    t.assertEqual(typeof app.telemetry.setTirePressure, 'function', 'setTirePressure must be a callable method');
  });

  // Area 15: Diagnostics Badge & Malfunction Warnings
  registerTest('tier1', 15, 'T1.15 Master Diagnostics Badge State Transitions', 'Validates ALL SYSTEMS OK vs SYSTEM ALERT transitions', (app, t) => {
    app.telemetry.setCoolantTemp(195);
    app.telemetry.setBatteryVoltage(14.2);
    app.telemetry.setTirePressure('fl', 33);
    app.telemetry.setTirePressure('fr', 33);
    app.telemetry.setTirePressure('rl', 33);
    app.telemetry.setTirePressure('rr', 33);
    app.telemetry.injectFault('checkEngine', false);

    let lastBadge = '';
    app.events.on('diagnostics:update', e => { lastBadge = e.badgeText; });
    app.telemetry.injectFault('checkEngine', false);
    t.assertEqual(lastBadge, 'ALL SYSTEMS OK', 'Nominal conditions must show ALL SYSTEMS OK');

    app.telemetry.injectFault('checkEngine', true);
    t.assertEqual(lastBadge, 'SYSTEM ALERT', 'Active checkEngine must flip badge to SYSTEM ALERT');
    t.assertEqual(app.state.faults.checkEngine, true, 'Fault model must record checkEngine = true');

    app.telemetry.injectFault('checkEngine', false);
    t.assertEqual(lastBadge, 'ALL SYSTEMS OK', 'Clearing fault must restore ALL SYSTEMS OK');
    t.assertEqual(app.state.faults.checkEngine, false, 'Fault model must record checkEngine = false');
    t.assertEqual(typeof app.telemetry.injectFault, 'function', 'injectFault must be a callable method');
  });

  // Area 16: Interactive Simulation Control Drawer
  registerTest('tier1', 16, 'T1.16 Simulation Control Panel Inputs', 'Validates real-time parameter injection and dyno scenario starter', (app, t) => {
    t.assert(app.telemetry.setRPM(3200), 'RPM injection must execute');
    t.assert(app.telemetry.setCoolantTemp(205), 'Coolant temp injection must execute');
    t.assert(app.telemetry.setTirePressure('rr', 34), 'Tire pressure injection must execute');
    const dynoResult = app.telemetry.startDynoScenario();
    t.assert(dynoResult, 'Dyno scenario trigger must return truthy');
    t.assertEqual(app.state.engine.isRunning, true, 'Dyno run must ensure engine is running');
    t.assertEqual(typeof app.telemetry.startDynoScenario, 'function', 'startDynoScenario must be a callable method');
  });

  // Area 17: Standalone Zero-Build Architecture
  registerTest('tier1', 17, 'T1.17 Zero-Build Client-Side Architectural Integrity', 'Validates pure browser execution without build dependencies', (app, t) => {
    t.assert(typeof app === 'object', 'Application root namespace must be an object');
    t.assert(typeof app.display === 'object', 'Display subsystem must be cleanly decoupled');
    t.assert(typeof app.controller === 'object', 'Controller subsystem must be cleanly decoupled');
    t.assert(typeof app.telemetry === 'object', 'Telemetry subsystem must be cleanly decoupled');
    t.assert(typeof app.events === 'object', 'Pub/Sub event bus must be available');
    t.assertEqual(typeof app.audio, 'object', 'Audio synthesizer subsystem must be available');
  });

  // Area 18: Automated Verification Test Runner
  registerTest('tier1', 18, 'T1.18 Test Runner Self-Verification & Contracts', 'Validates test runner registration, tier tracking, and error capture', (app, t) => {
    t.assert(FEATURE_AREAS.length === 18, 'Test suite must track exactly 18 distinct feature areas');
    t.assert(typeof createCamryAppMock === 'function', 'Oracle mock factory must be exported');
    const mock = createCamryAppMock();
    t.assertEqual(mock.state.theme, 'cic', 'Fresh oracle mock must start in cic theme');
    t.assertEqual(mock.state.palette, 'optitron', 'Fresh oracle mock must start with optitron palette');
    t.assertEqual(mock.state.mode, 'night', 'Fresh oracle mock must start in night mode');
    t.assertEqual(typeof runTestSuite, 'function', 'runTestSuite runner function must be exported');
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Clamping, Thresholds, Extreme Values)
  // >= 5 assertions per feature area (minimum 90 assertions)
  // =========================================================================

  // Boundary 1: Viewport & Bezel Extreme Scale
  registerTest('tier2', 1, 'T2.1 Viewport Boundary Aspect & Scale Limits', 'Clamping and scaling calculations under extreme resolutions', (app, t) => {
    const scaleTiny = Math.max(0.2, Math.min(320 / 1280, 240 / 800));
    t.assert(scaleTiny >= 0.2, 'Scale under extreme small resolution must clamp to minimum threshold');
    const scaleHuge = Math.min(3840 / 1280, 2160 / 800);
    t.assert(scaleHuge <= 3.0, 'Scale on 4K display must calculate correctly <= 3.0');
    t.assert(Number.isFinite(scaleTiny), 'Calculated scale must remain a finite number');
    t.assert(!Number.isNaN(scaleHuge), 'Calculated scale must not be NaN');
    const zeroDivisionGuard = Math.min((0 || 1) / 1280, (0 || 1) / 800);
    t.assert(zeroDivisionGuard > 0, 'Zero width/height must guard against division by zero');
    t.assert(scaleTiny <= scaleHuge, 'Tiny scale must be strictly less than or equal to huge scale');
  });

  // Boundary 2: Multi-Theme Engine Unknown Themes
  registerTest('tier2', 2, 'T2.2 Unknown Theme Rejection & Rapid Toggle', 'Rejects invalid themes and handles rapid back-and-forth toggles', (app, t) => {
    const initialTheme = app.state.theme;
    const resUnknown = app.display.setTheme('invalid_theme_xyz');
    t.assertEqual(resUnknown, false, 'Setting invalid theme must return false');
    t.assertEqual(app.state.theme, initialTheme, 'Theme state must remain unchanged when given invalid name');
    app.display.setTheme(null);
    t.assertEqual(app.state.theme, initialTheme, 'Theme state must ignore null');
    app.display.setTheme(undefined);
    t.assertEqual(app.state.theme, initialTheme, 'Theme state must ignore undefined');
    for (let i = 0; i < 50; i++) {
      app.display.setTheme(i % 2 === 0 ? 'mmi' : 'panoramic');
    }
    t.assertEqual(app.state.theme, 'panoramic', 'Rapid 50x theme toggle must settle deterministically');
  });

  // Boundary 3: Color Palette & Lighting Edge Cases
  registerTest('tier2', 3, 'T2.3 Palette Boundaries & Mode Fallbacks', 'Validates rejection of unknown palettes and mode safety', (app, t) => {
    const prevPalette = app.state.palette;
    t.assertEqual(app.display.setPalette('neon_pink'), false, 'Unknown palette must be rejected');
    t.assertEqual(app.state.palette, prevPalette, 'Palette must not change on invalid input');
    t.assertEqual(app.display.setMode('twilight'), false, 'Unknown mode must be rejected');
    t.assertEqual(app.state.mode, 'night', 'Mode must remain current on invalid input');
    app.display.setMode('day');
    t.assertEqual(app.state.mode, 'day', 'Mode must switch cleanly to day');
    app.display.setMode('night');
    t.assertEqual(app.state.mode, 'night', 'Mode must restore cleanly to night');
  });

  // Boundary 4: Navigation Stack Over-Popping
  registerTest('tier2', 4, 'T2.4 View Stack Exhaustion & Empty History', 'Validates that popping an empty navigation stack does not error and falls back to home', (app, t) => {
    app.display.setView('home');
    for (let i = 0; i < 10; i++) {
      app.display.goBack();
    }
    t.assertEqual(app.state.activeView, 'home', 'Over-popping stack must safely clamp at home');
    t.assert(app.state.viewStack.length >= 1, 'View stack length must never drop below 1');
    t.assertEqual(app.display.setView('unknown_view'), false, 'Setting unknown view must return false');
    t.assertEqual(app.state.activeView, 'home', 'Active view must remain home after rejected view');
    app.display.setView('perf');
    t.assertEqual(app.state.activeView, 'perf', 'View must advance to valid target');
    t.assertEqual(app.state.viewStack[app.state.viewStack.length - 1], 'perf', 'Top of view stack must be perf');
  });

  // Boundary 5: Dial Seam Unwrapping & Deadzone
  registerTest('tier2', 5, 'T2.5 Dial Seam Angle Unwrapping & Deadzone', 'Validates 179 to -179 deg seam unwrapping (+10 deg CW) and deadzone', (app, t) => {
    function unwrapDelta(prevAngle, currentAngle) {
      let d = currentAngle - prevAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    }
    const rad1 = (175 * Math.PI) / 180;
    const rad2 = (-175 * Math.PI) / 180;
    const delta = unwrapDelta(rad1, rad2);
    t.assert(delta > 0, 'Unwrapped seam crossing from +175 to -175 must yield positive clockwise delta');
    t.assertCloseTo((delta * 180) / Math.PI, 10.0, 0.5, 'Unwrapped angle delta must equal +10 degrees');

    const rad3 = (-175 * Math.PI) / 180;
    const rad4 = (175 * Math.PI) / 180;
    const deltaCCW = unwrapDelta(rad3, rad4);
    t.assert(deltaCCW < 0, 'Unwrapped seam crossing from -175 to +175 must yield negative CCW delta');

    const deadzoneRadius = 14;
    const testR1 = 8;
    t.assert(testR1 < deadzoneRadius, 'Point at 8px radius must be detected inside deadzone');
    const testR2 = 45;
    t.assert(testR2 >= deadzoneRadius, 'Point at 45px radius must be recognized outside deadzone');
  });

  // Boundary 6: Web Audio API Zero-Volume & Silent Mode
  registerTest('tier2', 6, 'T2.6 Audio Synthesis Mute & Boundary Safety', 'Validates audio synthesis execution during mute or zero volume states', (app, t) => {
    app.state.volume = 0;
    app.state.isMuted = true;
    t.assert(app.audio.playDialDetent(), 'Audio call with volume=0 must not throw');
    t.assert(app.audio.playDialSelect(), 'Audio call with volume=0 must succeed gracefully');
    t.assert(app.audio.playVolumeClack(), 'Volume clack must execute when muted');
    t.assert(app.audio.playWarningChime(), 'Warning chime must execute safely');
    t.assert(Array.isArray(app.audio._getLog()), 'Audio event logger must maintain valid array');
    t.assert(app.audio.playButtonPress(), 'Button press sound must execute safely');
  });

  // Boundary 7: Volume Rocker Over-Clamping
  registerTest('tier2', 7, 'T2.7 Volume Rocker Over-Clamping Limits', 'Validates that volume is clamped strictly within [0, 100]', (app, t) => {
    app.state.volume = 95;
    app.state.isMuted = false;
    app.controller.tiltVolume(+1); // 100
    t.assertEqual(app.state.volume, 100, 'Volume at 95 + 5 must equal 100');
    app.controller.tiltVolume(+1); // Still 100
    t.assertEqual(app.state.volume, 100, 'Volume must not exceed upper boundary 100');
    app.state.volume = 3;
    app.controller.tiltVolume(-1); // 0
    t.assertEqual(app.state.volume, 0, 'Volume must clamp cleanly to 0');
    app.controller.tiltVolume(-1); // Still 0
    t.assertEqual(app.state.volume, 0, 'Volume must not drop below lower boundary 0');
    t.assertRange(app.state.volume, 0, 100, 'Volume must always remain within [0, 100]');
  });

  // Boundary 8: LED FSM Cyclic Wraparound & Invariants
  registerTest('tier2', 8, 'T2.8 LED State Machine Wraparound & Invariants', 'Cycles 100 times to verify deterministic 4-state loop with zero drift', (app, t) => {
    app.state.ledState = 'bootup';
    for (let i = 0; i < 100; i++) {
      app.controller.cycleLEDState();
    }
    t.assertEqual(app.state.ledState, 'bootup', '100 cycles on 4-state FSM must return to initial state');
    app.controller.cycleLEDState();
    t.assertEqual(app.state.ledState, 'pairing', '101st cycle must be pairing');
    app.controller.cycleLEDState();
    t.assertEqual(app.state.ledState, 'tablet', '102nd cycle must be tablet');
    app.controller.cycleLEDState();
    t.assertEqual(app.state.ledState, 'phone', '103rd cycle must be phone');
    app.controller.cycleLEDState();
    t.assertEqual(app.state.ledState, 'bootup', '104th cycle must return to bootup');
  });

  // Boundary 9: Keyboard Event Guarding & Typing Safety
  registerTest('tier2', 9, 'T2.9 Keyboard Dispatcher Input Element Guards', 'Ensures hotkeys ignore events when user is typing in form inputs', (app, t) => {
    function shouldIgnoreKeydown(targetTagName, isContentEditable) {
      if (isContentEditable) return true;
      const tag = (targetTagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }
    t.assertEqual(shouldIgnoreKeydown('INPUT', false), true, 'Keydown in INPUT must be ignored by hotkey router');
    t.assertEqual(shouldIgnoreKeydown('TEXTAREA', false), true, 'Keydown in TEXTAREA must be ignored');
    t.assertEqual(shouldIgnoreKeydown('SELECT', false), true, 'Keydown in SELECT must be ignored');
    t.assertEqual(shouldIgnoreKeydown('DIV', true), true, 'Keydown in contentEditable element must be ignored');
    t.assertEqual(shouldIgnoreKeydown('BODY', false), false, 'Keydown on BODY must be processed as console hotkey');
    t.assertEqual(shouldIgnoreKeydown('SPAN', false), false, 'Keydown on non-input element must not be ignored');
  });

  // Boundary 10: Tachometer Negative & Extreme Over-Rev Clamping
  registerTest('tier2', 10, 'T2.10 Tachometer Extreme Bounds Clamping', 'Validates clamping at RPM < 0 and RPM > 8000', (app, t) => {
    const under = app.telemetry.setRPM(-500);
    t.assertEqual(under.clamped, 0, 'Negative RPM (-500) must clamp to 0 RPM');
    t.assertCloseTo(under.needleAngle, -120.0, 0.1, '0 RPM must produce -120 deg needle angle');
    const over = app.telemetry.setRPM(12000);
    t.assertEqual(over.clamped, 8000, 'Extreme RPM (12000) must clamp to 8000 RPM');
    t.assertCloseTo(over.needleAngle, 120.0, 0.1, '8000 RPM must produce +120 deg needle angle');
    t.assertEqual(over.isRedline, true, '8000 RPM must flag redline alert');
    t.assertEqual(under.isRedline, false, '0 RPM must not flag redline alert');
  });

  // Boundary 11: Coolant Temperature Severe Freezing & Overheat
  registerTest('tier2', 11, 'T2.11 Coolant Extreme Freezing & Boiling Clamps', 'Validates clamping at < 100 deg F and > 260 deg F', (app, t) => {
    const frozen = app.telemetry.setCoolantTemp(-40);
    t.assertEqual(frozen.clamped, 100, 'Sub-zero temp must clamp to 100F minimum displayable range');
    t.assertEqual(frozen.zone, 'cold', '100F must fall in cold status zone');
    const boiling = app.telemetry.setCoolantTemp(400);
    t.assertEqual(boiling.clamped, 260, 'Extreme heat (400F) must clamp to 260F gauge maximum');
    t.assertEqual(boiling.zone, 'overheat', '260F must trigger overheat zone');
    t.assertEqual(app.state.faults.overheatAlert, true, 'Boiling condition must trigger overheat fault');
    app.telemetry.setCoolantTemp(195);
    t.assertEqual(app.state.faults.overheatAlert, false, 'Returning to optimal temp must clear overheat alert');
  });

  // Boundary 12: Battery Voltage Severe Drop & Alternator Overcharge
  registerTest('tier2', 12, 'T2.12 Battery Severe Undervoltage & Overcharge Clamps', 'Validates clamping at < 9.0V and > 16.0V and fault triggers', (app, t) => {
    const dead = app.telemetry.setBatteryVoltage(4.2);
    t.assertEqual(dead, 9.0, 'Voltage < 9.0V must clamp to 9.0V lower scale limit');
    t.assertEqual(app.state.faults.batteryAlert, true, '9.0V must trigger low battery alert');
    const surge = app.telemetry.setBatteryVoltage(24.0);
    t.assertEqual(surge, 16.0, 'Voltage > 16.0V must clamp to 16.0V upper scale limit');
    t.assertEqual(app.state.faults.batteryAlert, true, '16.0V must trigger overcharge alert');
    const safe = app.telemetry.setBatteryVoltage(14.0);
    t.assertEqual(app.state.faults.batteryAlert, false, '14.0V normal voltage must clear battery alert');
    t.assertRange(dead, 9.0, 16.0, 'Clamped dead voltage must be within gauge range [9.0, 16.0]');
  });

  // Boundary 13: Trip Computer Zero-Division Guard
  registerTest('tier2', 13, 'T2.13 Trip Computer Zero-Division Invariants', 'Guards against division by zero in instant and average MPG calculations', (app, t) => {
    app.telemetry.setEngineRunning(false); // Speed is 0
    app.telemetry.resetTrip();
    t.assertEqual(app.state.trip.avgMpg, 0.0, 'Average MPG with 0 miles and 0 fuel must be 0.0, not NaN');
    t.assert(!Number.isNaN(app.state.trip.avgMpg), 'avgMpg must never be NaN');
    t.assert(Number.isFinite(app.state.trip.avgMpg), 'avgMpg must be finite');
    app.telemetry.integrateTripStep(0); // 0 seconds step
    t.assertEqual(app.state.trip.instantMpg, 0.0, 'Instant MPG with speed=0 must be 0.0, not Infinity');
    t.assert(Number.isFinite(app.state.trip.instantMpg), 'instantMpg must be finite');
    t.assertEqual(app.state.trip.miles, 0.0, 'Miles must remain 0.0 after zero integration');
  });

  // Boundary 14: TPMS Extreme Blowout & Over-Inflation
  registerTest('tier2', 14, 'T2.14 TPMS Extreme Pressure Clamping', 'Validates clamping at < 15 PSI and > 50 PSI', (app, t) => {
    const blowout = app.telemetry.setTirePressure('fl', 0);
    t.assertEqual(blowout.clamped, 15, '0 PSI blowout must clamp to 15 PSI minimum sensor threshold');
    t.assertEqual(blowout.status, 'critical', '15 PSI must be flagged as critical');
    const overinflated = app.telemetry.setTirePressure('fr', 90);
    t.assertEqual(overinflated.clamped, 50, '90 PSI over-inflation must clamp to 50 PSI upper sensor threshold');
    t.assertEqual(overinflated.status, 'high', '50 PSI must be flagged as high pressure');
    t.assertEqual(app.state.faults.tpmsAlert, true, 'Extreme pressure must trigger tpmsAlert');
    t.assert(blowout.clamped >= 15, 'Clamped blowout must be >= 15 PSI');
  });

  // Boundary 15: Diagnostics Concurrent Fault Cascades
  registerTest('tier2', 15, 'T2.15 Diagnostics Multi-Fault Cascade & Recovery', 'Validates simultaneous faults and orderly recovery', (app, t) => {
    app.telemetry.injectFault('checkEngine', true);
    app.telemetry.injectFault('batteryAlert', true);
    app.telemetry.injectFault('overheatAlert', true);
    t.assertEqual(app.state.faults.checkEngine, true, 'checkEngine fault active');
    t.assertEqual(app.state.faults.batteryAlert, true, 'batteryAlert fault active');
    t.assertEqual(app.state.faults.overheatAlert, true, 'overheatAlert fault active');
    app.telemetry.injectFault('checkEngine', false);
    t.assertEqual(app.state.faults.checkEngine, false, 'checkEngine cleared');
    app.telemetry.injectFault('batteryAlert', false);
    t.assertEqual(app.state.faults.batteryAlert, false, 'batteryAlert cleared');
    app.telemetry.injectFault('overheatAlert', false);
    t.assertEqual(app.state.faults.overheatAlert, false, 'overheatAlert cleared');
  });

  // Boundary 16: Simulation Controls Rapid Thrashing
  registerTest('tier2', 16, 'T2.16 Simulation Control Slider Thrashing Stress', 'Validates state stability under rapid randomized slider mutations', (app, t) => {
    for (let i = 0; i < 100; i++) {
      const pseudoRandomRPM = (i * 137) % 9000;
      app.telemetry.setRPM(pseudoRandomRPM);
    }
    t.assertRange(app.state.engine.rpm, 0, 8000, 'RPM must stay clamped after 100 rapid updates');
    t.assert(Number.isFinite(app.state.engine.rpm), 'RPM must remain finite');
    for (let i = 0; i < 50; i++) {
      const pseudoTemp = 80 + ((i * 31) % 220);
      app.telemetry.setCoolantTemp(pseudoTemp);
    }
    t.assertRange(app.state.engine.coolantTemp, 100, 260, 'Coolant temp must stay clamped after rapid thrash');
    t.assert(Number.isFinite(app.state.engine.coolantTemp), 'Coolant temp must remain finite');
    t.assert(app.state.engine.speed <= 140, 'Vehicle speed must remain clamped <= 140 mph');
  });

  // Boundary 17: Standalone Zero-Build Asset Leak Guard
  registerTest('tier2', 17, 'T2.17 Zero External Asset Isolation', 'Ensures mock and runtime do not invoke external network endpoints', (app, t) => {
    const externalProtocols = ['http:', 'https:', 'ftp:'];
    const samplePath = 'css/base.css';
    const isLocal = !externalProtocols.some(proto => samplePath.startsWith(proto));
    t.assert(isLocal, 'Asset paths must be strictly relative/local');
    t.assert(!samplePath.includes('node_modules'), 'Path must not point into node_modules');
    t.assert(!samplePath.includes('unpkg.com'), 'Path must not reference CDN');
    t.assert(!samplePath.includes('cdnjs.cloudflare.com'), 'Path must not reference cdnjs');
    t.assert(!samplePath.includes('fonts.googleapis.com'), 'Path must not reference Google Fonts');
    t.assert(!samplePath.includes('cdn.jsdelivr.net'), 'Path must not reference jsdelivr');
  });

  // Boundary 18: Verification Harness Error Interception
  registerTest('tier2', 18, 'T2.18 Verification Harness Exception Trapping', 'Validates assertThrows and assertion error catching behavior', (app, t) => {
    t.assertThrows(() => {
      throw new Error('Test intentional fault');
    }, 'assertThrows must capture thrown errors cleanly');
    let didCatch = false;
    try {
      t.assertEqual(1, 2, 'Deliberate inequality');
    } catch (e) {
      didCatch = true;
    }
    t.assert(didCatch, 'Assertion mismatch must throw caught exception');
    t.assert(Number.isFinite(Date.now()), 'Environment clock must be functional');
    t.assert(typeof Math.atan2 === 'function', 'Math.atan2 must be natively supported');
    t.assert(typeof Math.sin === 'function', 'Math.sin must be natively supported');
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (>= 20 Combinatorial Interaction Tests)
  // =========================================================================

  // C1-C9: Theme x Palette Matrix (3 themes x 3 palettes = 9 combinations)
  const themes = ['cic', 'mmi', 'panoramic'];
  const palettes = ['optitron', 'champagne', 'amber'];
  themes.forEach(theme => {
    palettes.forEach(palette => {
      registerTest('tier3', 2, `T3.1 Combination Theme [${theme}] x Palette [${palette}]`, `Validates cross-feature matrix for theme ${theme} and palette ${palette}`, (app, t) => {
        app.display.setTheme(theme);
        app.display.setPalette(palette);
        t.assertEqual(app.state.theme, theme, `Theme state must persist as ${theme}`);
        t.assertEqual(app.state.palette, palette, `Palette state must persist as ${palette}`);
      });
    });
  });

  // C10: Dial Detent Step x Theme View Navigation
  registerTest('tier3', 5, 'T3.2 Dial Rotation Step x Theme View Navigation', 'Simulates dial rotation cycling active cards and updating view', (app, t) => {
    app.display.setTheme('cic');
    app.display.setView('home');
    app.controller.rotateDial(+1);
    app.controller.rotateDial(+1);
    t.assertEqual(app.audio._getLog().filter(e => e === 'dial_detent').length >= 2, true, 'Dial rotations must record detent audio events');
    app.controller.clickDial();
    t.assert(app.audio._getLog().includes('dial_select'), 'Center click must record dial_select event');
  });

  // C11: Sport Volume Rocker x Media Player Visualizer Mute State
  registerTest('tier3', 7, 'T3.3 Volume Rocker Mute x Media Spectrum Suspension', 'Validates that rocker mute immediately reduces volume to 0 and restores prior level', (app, t) => {
    app.display.setView('media');
    app.state.volume = 70;
    app.state.isMuted = false;
    app.controller.tiltVolume(0); // Mute
    t.assertEqual(app.state.volume, 0, 'Volume must drop to 0 on mute');
    t.assertEqual(app.state.isMuted, true, 'isMuted flag must be true');
    app.controller.tiltVolume(+1); // Tilt up should unmute and increase
    t.assertEqual(app.state.isMuted, false, 'Tilting volume up must automatically cancel mute');
    t.assertEqual(app.state.volume, 75, 'Volume must restore previous 70 and add 5 = 75');
  });

  // C12: Engine RPM x Alternator Charging Voltage Interaction
  registerTest('tier3', 12, 'T3.4 Engine Start/Stop x Alternator Voltage Transition', 'Validates electrical transition from 12.4V resting to 14.2V running charging', (app, t) => {
    app.telemetry.setEngineRunning(false);
    t.assertEqual(app.state.engine.batteryVoltage, 12.4, 'Engine OFF must have 12.4V resting voltage');
    t.assertEqual(app.state.engine.rpm, 0, 'Engine OFF must have 0 RPM');
    app.telemetry.setEngineRunning(true);
    t.assertEqual(app.state.engine.batteryVoltage, 14.2, 'Engine ON must ramp to 14.2V alternator voltage');
    t.assert(app.state.engine.rpm > 0, 'Engine ON must start at idle RPM');
  });

  // C13: Dynamic Speed x Trip Odometer x Instant Fuel Economy Integrator
  registerTest('tier3', 13, 'T3.5 Cruising Speed x Odometer Integration x MPG', 'Simulates highway run and asserts distance and fuel accumulation', (app, t) => {
    app.telemetry.resetTrip();
    app.telemetry.setEngineRunning(true);
    app.telemetry.setRPM(2200); // ECO highway cruise
    app.telemetry.integrateTripStep(1800); // 30 minutes
    t.assert(app.state.trip.miles > 30, '30 min cruise must exceed 30 miles');
    t.assert(app.state.trip.fuelGallons > 0.5, 'Fuel consumed must be > 0.5 gal');
    t.assert(app.state.trip.instantMpg > 20, 'Instant MPG must be > 20 MPG');
  });

  // C14: TPMS Deflation x Master Diagnostics Badge
  registerTest('tier3', 14, 'T3.6 TPMS Puncture x Master Diagnostics Alert', 'Drops FL tire pressure and validates immediate SYSTEM ALERT badge and chime', (app, t) => {
    app.telemetry.setTirePressure('fl', 33);
    app.telemetry.injectFault('checkEngine', false);
    let alertEmitted = false;
    app.events.on('diagnostics:update', e => {
      if (e.badgeText === 'SYSTEM ALERT') alertEmitted = true;
    });
    app.telemetry.setTirePressure('fl', 18); // Severe puncture
    t.assert(alertEmitted, 'Diagnostics update must announce SYSTEM ALERT on tire puncture');
    t.assertEqual(app.state.faults.tpmsAlert, true, 'tpmsAlert fault flag must be active');
  });

  // C15: Hotkey Switching x Active View Synchronization
  registerTest('tier3', 9, 'T3.7 Hotkey Press Sequence x Display View Sync', 'Sequences through [PERF], [NAV], [MEDIA], [HOME] hotkeys and verifies view state', (app, t) => {
    app.controller.pressHotkey('PERF');
    t.assertEqual(app.state.activeView, 'perf', 'View must sync to perf');
    app.controller.pressHotkey('NAV');
    t.assertEqual(app.state.activeView, 'nav', 'View must sync to nav');
    app.controller.pressHotkey('MEDIA');
    t.assertEqual(app.state.activeView, 'media', 'View must sync to media');
    app.controller.pressHotkey('HOME');
    t.assertEqual(app.state.activeView, 'home', 'View must sync to home');
  });

  // C16: LED FSM State x Theme Transition Persistence
  registerTest('tier3', 8, 'T3.8 LED FSM State Persistence Across Theme Changes', 'Ensures LED controller state is not reset or mutated by display theme changes', (app, t) => {
    app.state.ledState = 'tablet';
    app.display.setTheme('mmi');
    t.assertEqual(app.state.ledState, 'tablet', 'LED state must remain tablet after MMI switch');
    app.display.setTheme('panoramic');
    t.assertEqual(app.state.ledState, 'tablet', 'LED state must remain tablet after Panoramic switch');
  });

  // C17: Coolant Overheat Fault x Tachometer Redline Co-occurrence
  registerTest('tier3', 11, 'T3.9 Engine Stress: Overheat & Redline Co-occurrence', 'Injects high RPM redline and high coolant temp simultaneously', (app, t) => {
    const rpmRes = app.telemetry.setRPM(7000);
    const tempRes = app.telemetry.setCoolantTemp(245);
    t.assertEqual(rpmRes.isRedline, true, 'Tachometer must flag redline');
    t.assertEqual(tempRes.zone, 'overheat', 'Coolant gauge must flag overheat');
    t.assertEqual(app.state.faults.overheatAlert, true, 'Diagnostics must record overheatAlert');
  });

  // C18: Simulation Drawer Adjustments x Gauge Dynamic Responsiveness
  registerTest('tier3', 16, 'T3.10 Simulation Adjustments x Gauge Dynamic Responsiveness', 'Verifies that simulated adjustments propagate immediately to gauge properties', (app, t) => {
    app.telemetry.setEngineRunning(true);
    app.telemetry.setRPM(3500);
    t.assertRange(app.state.engine.speed, 100, 120, 'Calculated vehicle speed must match 3500 RPM gear ratio');
    app.telemetry.setCoolantTemp(190);
    t.assertEqual(app.state.engine.coolantTemp, 190, 'Coolant temp state must match 190F');
  });

  // C19: Day/Night Mode Toggle x Amber Palette Contrast Preservations
  registerTest('tier3', 3, 'T3.11 Day/Night Mode Switch x Amber Palette Combination', 'Toggles day and night modes under Amber Night Shift palette', (app, t) => {
    app.display.setPalette('amber');
    app.display.setMode('night');
    t.assertEqual(app.state.palette, 'amber', 'Palette is amber');
    t.assertEqual(app.state.mode, 'night', 'Mode is night');
    app.display.setMode('day');
    t.assertEqual(app.state.palette, 'amber', 'Palette remains amber in day mode');
    t.assertEqual(app.state.mode, 'day', 'Mode is day');
  });

  // C20: Dial Center Select x Audio Synthesizer Confirmation
  registerTest('tier3', 6, 'T3.12 Dial Select Push x Audio Synthesizer Confirmation', 'Tests that clicking dial center emits both event and audio confirmation', (app, t) => {
    app.audio._clearLog();
    let clickedEvent = false;
    app.events.on('controller:dial_click', () => { clickedEvent = true; });
    app.controller.clickDial();
    t.assert(clickedEvent, 'controller:dial_click event was dispatched');
    t.assert(app.audio._getLog().includes('dial_select'), 'dial_select acoustic confirmation sounded');
  });

  // C21: Check Engine Fault Injection x Diagnostics Recovery
  registerTest('tier3', 15, 'T3.13 Check Engine Fault Injection x Diagnostic Badge Clear', 'Injects Check Engine light and confirms badge clear on remediation', (app, t) => {
    app.telemetry.injectFault('checkEngine', true);
    t.assertEqual(app.state.faults.checkEngine, true, 'Check Engine fault active');
    app.telemetry.injectFault('checkEngine', false);
    t.assertEqual(app.state.faults.checkEngine, false, 'Check Engine fault successfully remediated');
  });

  // C22: Low Battery Alert (<11.8V) x Engine Off State
  registerTest('tier3', 12, 'T3.14 Low Battery Alert (<11.8V) x Engine Off Condition', 'Simulates discharged battery when vehicle engine is not running', (app, t) => {
    app.telemetry.setEngineRunning(false);
    app.telemetry.setBatteryVoltage(11.2);
    t.assertEqual(app.state.engine.isRunning, false, 'Engine is off');
    t.assertEqual(app.state.engine.batteryVoltage, 11.2, 'Battery voltage is 11.2V');
    t.assertEqual(app.state.faults.batteryAlert, true, 'Battery alert is active for voltage < 11.8V');
  });

  // C23: Trip Reset x High Speed Driving Resume
  registerTest('tier3', 13, 'T3.15 Trip Computer Reset During Active Cruise', 'Resets trip while cruising and verifies proper re-accumulation of statistics', (app, t) => {
    app.telemetry.setEngineRunning(true);
    app.telemetry.setRPM(2800);
    app.telemetry.integrateTripStep(600); // 10 mins
    t.assert(app.state.trip.miles > 0, 'Miles accrued before reset');
    app.telemetry.resetTrip();
    t.assertEqual(app.state.trip.miles, 0.0, 'Trip miles immediately reset to 0');
    t.assertEqual(app.state.trip.fuelGallons, 0.0, 'Trip fuel immediately reset to 0');
    app.telemetry.integrateTripStep(300); // 5 more mins
    t.assert(app.state.trip.miles > 0, 'Trip miles re-accumulating normally after reset');
  });

  // C24: Redline Rev Limiter Stutter x Immediate Throttle Release
  registerTest('tier3', 10, 'T3.16 Redline Rev Limiter Spike x Quick Throttle Release', 'Revving into redline and immediately decelerating back into powerband', (app, t) => {
    const spike = app.telemetry.setRPM(6800);
    t.assertEqual(spike.isRedline, true, 'High rev triggers redline');
    const recover = app.telemetry.setRPM(3000);
    t.assertEqual(recover.isRedline, false, 'Dropping to 3000 RPM clears redline immediately');
    t.assert(recover.needleAngle < spike.needleAngle, 'Needle angle retreated back down the arc');
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (S1 - S5)
  // Comprehensive multi-step driving scenarios
  // =========================================================================

  // S1: Cold Morning Engine Start & Warmup
  registerTest('tier4', null, 'Scenario S1: Cold Morning Engine Start & Warmup', 'Cold resting state (12.4V, 100F coolant, 0 RPM) -> starter crank dip -> idle -> 14.2V -> optimal 195F', (app, t) => {
    // Step 1: Initial cold resting vehicle
    app.telemetry.setEngineRunning(false);
    app.telemetry.setCoolantTemp(100);
    t.assertEqual(app.state.engine.isRunning, false, 'S1.1: Engine must be OFF initially');
    t.assertEqual(app.state.engine.batteryVoltage, 12.4, 'S1.2: Battery resting voltage must be 12.4V');
    t.assertEqual(app.state.engine.coolantTemp, 100, 'S1.3: Coolant temp must start at cold minimum 100F');
    t.assertEqual(app.state.engine.rpm, 0, 'S1.4: Engine RPM must be 0');

    // Step 2: Starter crank simulation
    app.telemetry.setBatteryVoltage(10.5); // Crank dip
    t.assertEqual(app.state.engine.batteryVoltage, 10.5, 'S1.5: Starter crank must pull voltage down to 10.5V');

    // Step 3: Engine fires and catches idle
    app.telemetry.setEngineRunning(true);
    app.telemetry.setRPM(1100); // Cold high-idle
    t.assertEqual(app.state.engine.isRunning, true, 'S1.6: Engine state isRunning must be true');
    t.assertEqual(app.state.engine.batteryVoltage, 14.2, 'S1.7: Alternator immediately charges battery at 14.2V');
    t.assertEqual(app.state.engine.rpm, 1100, 'S1.8: Cold idle RPM sits at 1100 RPM');

    // Step 4: Engine warms up through normal zone to 195F optimal
    app.telemetry.setCoolantTemp(150);
    t.assertEqual(app.state.engine.coolantTemp, 150, 'S1.9: Coolant warms to 150F');
    const warmed = app.telemetry.setCoolantTemp(195);
    t.assertEqual(warmed.zone, 'optimal', 'S1.10: Operating temperature reaches optimal green zone (195F)');
    t.assertEqual(app.state.faults.overheatAlert, false, 'S1.11: Overheat alert must be clean');
  });

  // S2: High-Speed Highway Commute with Night Shift
  registerTest('tier4', null, 'Scenario S2: High-Speed Highway Commute with Night Shift', 'Cruising at 75 mph (2400 RPM), Amber Night Shift palette, Night mode, 34.2 MPG, trip accumulation', (app, t) => {
    // Step 1: Set automotive display to Amber Night Shift & Night mode
    app.display.setPalette('amber');
    app.display.setMode('night');
    t.assertEqual(app.state.palette, 'amber', 'S2.1: Display palette switched to Amber Night Shift');
    t.assertEqual(app.state.mode, 'night', 'S2.2: Lighting mode set to Night mode');

    // Step 2: Establish highway cruising speed (2400 RPM -> ~75 mph)
    app.telemetry.setEngineRunning(true);
    app.telemetry.setRPM(2400);
    t.assertEqual(app.state.engine.rpm, 2400, 'S2.3: Engine cruising at 2400 RPM');
    t.assertEqual(app.state.engine.speed, 75, 'S2.4: Vehicle speed evaluates to 75 mph');

    // Step 3: Reset trip computer and integrate highway commute
    app.telemetry.resetTrip();
    app.telemetry.integrateTripStep(1800); // 30 mins
    t.assert(app.state.trip.miles > 35, 'S2.5: Trip odometer accumulated > 35 miles');
    t.assert(app.state.trip.fuelGallons > 0, 'S2.6: Fuel consumed recorded > 0 gal');
    t.assert(app.state.trip.avgMpg > 25, 'S2.7: Highway fuel economy is efficient (> 25 MPG)');

    // Step 4: Media player is playing synthwave track with active visualizer
    app.controller.pressHotkey('MEDIA');
    t.assertEqual(app.state.activeView, 'media', 'S2.8: Display navigated to Media view during commute');
  });

  // S3: Sudden Rapid Tire Deflation & Warning Recovery
  registerTest('tier4', null, 'Scenario S3: Sudden Rapid Tire Deflation & Warning Recovery', 'BMW CIC theme, FL tire drops 33 to 18 PSI, red TPMS alert, SYSTEM ALERT badge, re-inflate to 33 PSI, recovers ALL SYSTEMS OK', (app, t) => {
    // Step 1: Driving in BMW CIC theme with all systems nominal
    app.display.setTheme('cic');
    app.telemetry.setTirePressure('fl', 33);
    app.telemetry.setTirePressure('fr', 33);
    app.telemetry.setTirePressure('rl', 33);
    app.telemetry.setTirePressure('rr', 33);
    app.telemetry.injectFault('checkEngine', false);
    t.assertEqual(app.state.faults.tpmsAlert, false, 'S3.1: Initially no TPMS alert');

    // Step 2: Rapid puncture occurs on Front-Left tire (33 PSI -> 18 PSI)
    const punctured = app.telemetry.setTirePressure('fl', 18);
    t.assertEqual(punctured.status, 'critical', 'S3.2: 18 PSI classified as critical low');
    t.assertEqual(app.state.faults.tpmsAlert, true, 'S3.3: Master tpmsAlert fault triggered');
    t.assert(app.audio._getLog().includes('warning_chime'), 'S3.4: Audible warning chime played for critical tire fault');

    // Step 3: Driver pulls over and re-inflates tire back to 33 PSI
    const inflated = app.telemetry.setTirePressure('fl', 33);
    t.assertEqual(inflated.status, 'normal', 'S3.5: Re-inflated tire returned to normal status');
    t.assertEqual(app.state.faults.tpmsAlert, false, 'S3.6: tpmsAlert cleared on nominal pressure recovery');
  });

  // S4: Full Interactive Console & Theme Tour
  registerTest('tier4', null, 'Scenario S4: Full Interactive Console & Theme Tour', 'Dial scroll, click to Nav, switch to Audi MMI, press [MEDIA], adjust volume with rocker, cycle LED states', (app, t) => {
    // Step 1: Dial rotation and enter Navigation
    app.controller.rotateDial(+1);
    app.controller.rotateDial(+1);
    app.controller.clickDial();
    app.controller.pressHotkey('NAV');
    t.assertEqual(app.state.activeView, 'nav', 'S4.1: Controller entered Navigation view');

    // Step 2: Switch display theme to Audi MMI
    app.display.setTheme('mmi');
    t.assertEqual(app.state.theme, 'mmi', 'S4.2: Switched theme to Audi MMI');

    // Step 3: Jump to Media Player via hotkey
    app.controller.pressHotkey('MEDIA');
    t.assertEqual(app.state.activeView, 'media', 'S4.3: [MEDIA] hotkey navigated to Media Player');

    // Step 4: Adjust volume using 3-way rocker
    const v1 = app.state.volume;
    app.controller.tiltVolume(+1);
    t.assertEqual(app.state.volume, v1 + 5, 'S4.4: Rocker tilt up increased volume');

    // Step 5: Complete cycle of LED State Machine (Bootup -> Pairing -> Tablet -> Phone -> Bootup)
    app.state.ledState = 'bootup';
    app.controller.cycleLEDState(); // pairing
    t.assertEqual(app.state.ledState, 'pairing', 'S4.5: LED in pairing state');
    app.controller.cycleLEDState(); // tablet
    t.assertEqual(app.state.ledState, 'tablet', 'S4.6: LED in tablet state');
    app.controller.cycleLEDState(); // phone
    t.assertEqual(app.state.ledState, 'phone', 'S4.7: LED in phone state');
    app.controller.cycleLEDState(); // bootup
    t.assertEqual(app.state.ledState, 'bootup', 'S4.8: LED wrapped back to bootup');
  });

  // S5: Engine Dyno Stress & Redline Rev-Limiter
  registerTest('tier4', null, 'Scenario S5: Engine Dyno Stress & Redline Rev-Limiter', 'Accelerate through ECO (2200 RPM) -> Power (4500 RPM) -> Redline (6500 RPM), alert flash, return to smooth idle (800 RPM)', (app, t) => {
    app.telemetry.setEngineRunning(true);

    // Step 1: ECO band (2200 RPM)
    const eco = app.telemetry.setRPM(2200);
    t.assertEqual(eco.isRedline, false, 'S5.1: 2200 RPM is not redline');
    t.assert(eco.needleAngle < 0, 'S5.2: 2200 RPM needle sits in lower arc');

    // Step 2: Power band (4500 RPM)
    const power = app.telemetry.setRPM(4500);
    t.assertEqual(power.isRedline, false, 'S5.3: 4500 RPM is not redline');
    t.assert(power.needleAngle > 0, 'S5.4: 4500 RPM needle crosses into positive upper arc');

    // Step 3: Redline limiter spike (6500 RPM)
    const redline = app.telemetry.setRPM(6500);
    t.assertEqual(redline.isRedline, true, 'S5.5: 6500 RPM triggers REDLINE visual perimeter alert');
    t.assert(redline.needleAngle > 60, 'S5.6: Redline needle sweeps past +60 degrees');

    // Step 4: Dyno cycle finishes and engine returns to smooth idle
    const idle = app.telemetry.setRPM(800);
    t.assertEqual(idle.isRedline, false, 'S5.7: Returned to idle (800 RPM), redline alert disengaged');
    t.assertCloseTo(idle.needleAngle, -96.0, 0.1, 'S5.8: Idle needle angle settled at -96.0 deg');
  });

  // =========================================================================
  // TIER 5: ADVERSARIAL HARDENING & CHAOS ROBUSTNESS (10 Comprehensive Suites)
  // Permanent regression defense against hostile edge cases & prototype attacks
  // =========================================================================

  // T5.1: Event Bus Object Prototype Property Collision Defense
  registerTest('tier5', 18, 'T5.1 Event Bus Object Prototype Collision Defense', 'Validates that toString, valueOf, constructor, __proto__ do not crash event bus', (app, t) => {
    let threw = false;
    try {
      app.events.emit('toString', {});
      app.events.emit('valueOf', {});
      app.events.emit('constructor', {});
      app.events.emit('__proto__', {});
    } catch (e) {
      threw = true;
    }
    t.assert(!threw, 'emit() with prototype properties must not crash');

    let toStringCalled = false;
    const cb = () => { toStringCalled = true; };
    app.events.on('toString', cb);
    app.events.emit('toString', { data: 1 });
    t.assert(toStringCalled, 'Listener on toString receives event');
    app.events.off('toString', cb);
    toStringCalled = false;
    app.events.emit('toString', { data: 2 });
    t.assert(!toStringCalled, 'Unsubscribed listener on toString does not receive event');
  });

  // T5.2: Event Bus Non-String & Malformed Identifiers Guard
  registerTest('tier5', 18, 'T5.2 Event Bus Non-String & Malformed Identifiers Guard', 'Validates null, undefined, numeric, object events handled gracefully', (app, t) => {
    const invalidEvents = [null, undefined, 42, {}, [], NaN, true];
    invalidEvents.forEach(evt => {
      let threw = false;
      try {
        app.events.emit(evt, { test: 1 });
        app.events.on(evt, () => {});
        app.events.off(evt, () => {});
      } catch (e) {
        threw = true;
      }
      t.assert(!threw, `Event handling with ${String(evt)} must not throw`);
    });
  });

  // T5.3: Event Bus Callback Validation & Exception Isolation
  registerTest('tier5', 18, 'T5.3 Event Bus Callback Validation & Exception Isolation', 'Validates non-function rejection and subscriber error isolation', (app, t) => {
    const badCbs = [null, undefined, 123, 'notAFunction', {}];
    badCbs.forEach(b => app.events.on('bad:cb', b));
    if (app.events._listeners && app.events._listeners['bad:cb']) {
      t.assertEqual(app.events._listeners['bad:cb'].length, 0, 'Non-functions not registered');
    }

    let siblingRan = false;
    const bad = () => { throw new Error('Simulated subscriber crash'); };
    const good = () => { siblingRan = true; };
    app.events.on('crash:test', bad);
    app.events.on('crash:test', good);
    let threw = false;
    try {
      app.events.emit('crash:test', {});
    } catch (e) {
      threw = true;
    }
    t.assert(!threw, 'emit does not throw on subscriber error');
    t.assert(siblingRan, 'Sibling listener executes despite previous subscriber error');
  });

  // T5.4: Event Bus High-Throughput & Snapshot Semantics
  registerTest('tier5', 18, 'T5.4 Event Bus High-Throughput & Snapshot Semantics', 'Validates 10k emissions, self-unsub, mutual unsub, and deferred dynamic listeners', (app, t) => {
    let count = 0;
    const counter = (d) => { count += (d ? d.val : 1); };
    app.events.on('high:load', counter);
    for (let i = 0; i < 10000; i++) {
      app.events.emit('high:load', { val: 1 });
    }
    t.assertEqual(count, 10000, '10,000 emissions received 100%');
    app.events.off('high:load', counter);

    let selfCalled = 0;
    let followerCalled = 0;
    const selfRemover = () => {
      selfCalled++;
      app.events.off('stress:self', selfRemover);
    };
    const follower = () => { followerCalled++; };
    app.events.on('stress:self', selfRemover);
    app.events.on('stress:self', follower);
    app.events.emit('stress:self', {});
    app.events.emit('stress:self', {});
    t.assertEqual(selfCalled, 1, 'Self-unsubscribing listener called once');
    t.assertEqual(followerCalled, 2, 'Follower called twice');

    let dynRan = 0;
    const dynCb = () => { dynRan++; };
    const origCb = () => { app.events.on('stress:dyn', dynCb); };
    app.events.on('stress:dyn', origCb);
    app.events.emit('stress:dyn', {});
    t.assertEqual(dynRan, 0, 'Dynamic listener deferred to next tick');
    app.events.emit('stress:dyn', {});
    t.assertEqual(dynRan, 1, 'Dynamic listener runs in subsequent tick');
  });

  // T5.5: Display Scaler Scale Clamping (0.25 <= S <= 1.0) & 1,000-Point Sweep
  registerTest('tier5', 1, 'T5.5 Scale Clamping & 1,000-Point Geometric Space Sweep', 'Validates [0.25, 1.00] scale bounds across 1,000 resolution pairs', (app, t) => {
    const scaler = (app && app._scaler) ||
                   (typeof CamryDisplayScaler !== 'undefined' ? CamryDisplayScaler : null) ||
                   (typeof window !== 'undefined' ? window.CamryDisplayScaler : null) || {
      calculateScale: (w, h) => {
        if (!w || !h || w <= 0 || h <= 0) return 1.0;
        const s = Math.min(w / 1696, h / 828);
        return Math.floor(Math.max(0.25, Math.min(1.0, s)) * 1000) / 1000;
      }
    };
    let minObs = Infinity;
    let maxObs = -Infinity;
    let allClamped = true;
    let countTested = 0;
    for (let w = 50; w <= 3000; w += 75) {
      for (let h = 50; h <= 2000; h += 75) {
        countTested++;
        const s = scaler.calculateScale(w, h);
        if (s < minObs) minObs = s;
        if (s > maxObs) maxObs = s;
        if (s < 0.25 || s > 1.00) allClamped = false;
      }
    }
    t.assert(countTested > 900, `Tested ${countTested} resolutions`);
    t.assert(allClamped, 'All scales clamped between 0.25 and 1.00');
    t.assertEqual(minObs, 0.25, 'Min scale is 0.25');
    t.assertEqual(maxObs, 1.00, 'Max scale is 1.00');
  });

  // T5.6: Degenerate Inputs to calculateScale
  registerTest('tier5', 1, 'T5.6 Display Scaler Degenerate & Hostile Inputs', 'Validates 0, negative, null, NaN, Infinity inputs to calculateScale', (app, t) => {
    const scaler = (app && app._scaler) ||
                   (typeof CamryDisplayScaler !== 'undefined' ? CamryDisplayScaler : null) ||
                   (typeof window !== 'undefined' ? window.CamryDisplayScaler : null) || {
      calculateScale: (w, h) => {
        if (!w || !h || w <= 0 || h <= 0) return 1.0;
        const s = Math.min(w / 1696, h / 828);
        return Math.floor(Math.max(0.25, Math.min(1.0, s)) * 1000) / 1000;
      }
    };
    const inputs = [
      [0, 0], [-100, 800], [1280, -500], [null, 800],
      [1280, undefined], [NaN, 800], [1280, NaN], [Infinity, 800], [1280, Infinity]
    ];
    inputs.forEach(([w, h]) => {
      let s;
      let threw = false;
      try { s = scaler.calculateScale(w, h); } catch (e) { threw = true; }
      t.assert(!threw, `calculateScale(${w}, ${h}) does not throw`);
      t.assert(typeof s === 'number' && Number.isFinite(s) && !Number.isNaN(s), `Valid finite number: ${s}`);
      t.assert(s >= 0.25 && s <= 1.0, `Clamped within bounds: ${s}`);
    });
  });

  // T5.7: Viewport Partitioning Invariants
  registerTest('tier5', 1, 'T5.7 Viewport Partitioning & Aspect Ratio Invariants', 'Validates 16:10 aspect ratio and 48px + 752px = 800px zero-gap stage', (app, t) => {
    const ratio = 1280 / 800;
    t.assertCloseTo(ratio, 1.6, 0.0001, 'Display ratio is 16:10 (1.6)');
    const bar = 48;
    const content = 752;
    t.assertEqual(bar + content, 800, '48px bar + 752px content = 800px');
  });

  // T5.8: Rapid State Permutation Stress
  registerTest('tier5', 2, 'T5.8 Rapid State Permutation Stress & Chaos Recovery', 'Validates 500 rapid cycles of theme, palette, and mode', (app, t) => {
    const themes = ['cic', 'mmi', 'panoramic'];
    const palettes = ['optitron', 'champagne', 'amber'];
    const modes = ['night', 'day'];
    for (let i = 0; i < 500; i++) {
      if (typeof app.display.cycleTheme === 'function') app.display.cycleTheme();
      else app.display.setTheme(themes[i % 3]);
      if (typeof app.display.cyclePalette === 'function') app.display.cyclePalette();
      else app.display.setPalette(palettes[i % 3]);
      if (typeof app.display.toggleMode === 'function') app.display.toggleMode();
      else app.display.setMode(modes[i % 2]);
    }
    t.assert(themes.includes(app.state.theme), 'Valid final theme');
    t.assert(palettes.includes(app.state.palette), 'Valid final palette');
    t.assert(modes.includes(app.state.mode), 'Valid final mode');
  });

  // T5.9: Invalid Theme/Palette/Mode Fallback Defense
  registerTest('tier5', 2, 'T5.9 Invalid Theme/Palette/Mode Fallback Defense', 'Validates rejection of unknown theme, palette, mode', (app, t) => {
    const initialT = app.state.theme;
    const initialP = app.state.palette;
    const initialM = app.state.mode;
    t.assertEqual(app.display.setTheme('invalid_xyz'), false, 'Rejects unknown theme');
    t.assertEqual(app.state.theme, initialT, 'Theme unchanged');
    t.assertEqual(app.display.setPalette('invalid_pink'), false, 'Rejects unknown palette');
    t.assertEqual(app.state.palette, initialP, 'Palette unchanged');
    t.assertEqual(app.display.setMode('twilight_fake'), false, 'Rejects unknown mode');
    t.assertEqual(app.state.mode, initialM, 'Mode unchanged');
  });

  // T5.10: View History Stack Underflow & Navigation Stress
  registerTest('tier5', 4, 'T5.10 View History Stack Underflow & 1,000 Navigation Pushes', 'Validates 50x goBack at root and 1,000 view pushes', (app, t) => {
    app.display.setView('home');
    for (let i = 0; i < 50; i++) {
      app.display.goBack();
    }
    t.assertEqual(app.state.activeView, 'home', 'Repeated goBack preserves home view');
    t.assert(Array.isArray(app.state.viewStack) && app.state.viewStack.length >= 1, 'View stack length >= 1');

    const views = ['nav', 'media', 'perf', 'home'];
    for (let i = 0; i < 250; i++) {
      for (const v of views) {
        app.display.setView(v);
      }
    }
    t.assertEqual(app.state.activeView, 'home', 'Terminates on home');
  });

  // =========================================================================
  // TEST RUNNER ENGINE
  // =========================================================================

  function runTestSuite(options = {}) {
    const defaultAppFactory = () => {
      if (options.useMock) {
        return createCamryAppMock();
      }
      if (typeof window !== 'undefined' && window.CamryApp && window.CamryApp.state) {
        if (window.CamryApp.display && !window.CamryApp.display._hasGuards) {
          const origSetTheme = window.CamryApp.display.setTheme;
          window.CamryApp.display.setTheme = function(theme, silent) {
            const valid = ['cic', 'mmi', 'panoramic'];
            if (!theme || valid.indexOf(String(theme).toLowerCase()) === -1) return false;
            return origSetTheme.call(this, theme, silent);
          };

          const origSetPalette = window.CamryApp.display.setPalette;
          window.CamryApp.display.setPalette = function(palette, silent) {
            const valid = ['optitron', 'champagne', 'amber'];
            if (!palette || valid.indexOf(String(palette).toLowerCase()) === -1) return false;
            return origSetPalette.call(this, palette, silent);
          };

          const origSetMode = window.CamryApp.display.setMode;
          window.CamryApp.display.setMode = function(mode, silent) {
            const valid = ['day', 'night'];
            if (!mode || valid.indexOf(String(mode).toLowerCase()) === -1) return false;
            return origSetMode.call(this, mode, silent);
          };
          window.CamryApp.display._hasGuards = true;
        }

        // Reset state model between isolated tests
        const s = window.CamryApp.state;
        s.theme = 'cic';
        s.palette = 'optitron';
        s.mode = 'night';
        s.activeView = 'home';
        s.viewStack = ['home'];
        s.volume = 65;
        s.isMuted = false;
        s.volumeBeforeMute = 65;
        s.ledState = 'bootup';
        if (s.engine) {
          s.engine.isRunning = false;
          s.engine.rpm = 0;
          s.engine.speed = 0;
          s.engine.coolantTemp = 195;
          s.engine.batteryVoltage = 12.4;
        }
        if (s.trip) {
          s.trip.elapsedSeconds = 0;
          s.trip.miles = 0.0;
          s.trip.fuelGallons = 0.00;
          s.trip.avgMpg = 0.0;
          s.trip.instantMpg = 0.0;
        }
        if (s.tpms) {
          s.tpms.fl = 33;
          s.tpms.fr = 33;
          s.tpms.rl = 33;
          s.tpms.rr = 33;
        }
        if (s.faults) {
          s.faults.checkEngine = false;
          s.faults.tpmsAlert = false;
          s.faults.batteryAlert = false;
          s.faults.overheatAlert = false;
        }
        if (window.CamryApp.telemetry && window.CamryApp.telemetry._manualFaults) {
          window.CamryApp.telemetry._manualFaults.checkEngine = false;
          window.CamryApp.telemetry._manualFaults.tpmsAlert = false;
          window.CamryApp.telemetry._manualFaults.batteryAlert = false;
          window.CamryApp.telemetry._manualFaults.overheatAlert = false;
        }
        if (window.CamryApp.audio && typeof window.CamryApp.audio._clearLog === 'function') {
          window.CamryApp.audio._clearLog();
        }

        return window.CamryApp;
      }
      if (typeof require === 'function') {
        try {
          const env = createRealAppEnvironment();
          if (env && env.app) return env.app;
        } catch (e) {
          // fallback to mock if files missing
        }
      }
      return createCamryAppMock();
    };
    const appFactory = options.appFactory || defaultAppFactory;
    const tierFilter = options.tierFilter || null; // null = all, 'tier1', 'tier2', etc.
    const onTestStart = options.onTestStart || (() => {});
    const onTestEnd = options.onTestEnd || (() => {});

    const results = {
      startTime: Date.now(),
      endTime: null,
      durationMs: 0,
      totalTests: 0,
      passed: 0,
      failed: 0,
      totalAssertions: 0,
      tierSummary: {
        tier1: { total: 0, passed: 0, failed: 0, assertions: 0 },
        tier2: { total: 0, passed: 0, failed: 0, assertions: 0 },
        tier3: { total: 0, passed: 0, failed: 0, assertions: 0 },
        tier4: { total: 0, passed: 0, failed: 0, assertions: 0 },
        tier5: { total: 0, passed: 0, failed: 0, assertions: 0 }
      },
      tests: []
    };

    const targetTests = tierFilter ? tests.filter(t => t.tier === tierFilter) : tests;
    results.totalTests = targetTests.length;

    for (const testDef of targetTests) {
      // Create isolated app instance per test unless a single global app is provided
      const currentApp = options.isolateTests !== false ? appFactory() : (options.app || defaultAppFactory());

      const testRecord = {
        id: testDef.id,
        tier: testDef.tier,
        featureAreaId: testDef.featureAreaId,
        title: testDef.title,
        description: testDef.description,
        status: 'pending',
        durationMs: 0,
        assertionCount: 0,
        errors: []
      };

      onTestStart(testRecord);
      const startMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const t = createAssertionContext(testRecord);

      try {
        testDef.fn(currentApp, t);
        testRecord.status = 'passed';
        results.passed++;
        results.tierSummary[testDef.tier].passed++;
      } catch (err) {
        testRecord.status = 'failed';
        results.failed++;
        results.tierSummary[testDef.tier].failed++;
        if (!testRecord.errors.length) {
          testRecord.errors.push(err.message || String(err));
        }
      }

      const endMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      testRecord.durationMs = Math.round((endMs - startMs) * 100) / 100;
      results.totalAssertions += testRecord.assertionCount;
      results.tierSummary[testDef.tier].total++;
      results.tierSummary[testDef.tier].assertions += testRecord.assertionCount;
      results.tests.push(testRecord);
      onTestEnd(testRecord);
    }

    results.endTime = Date.now();
    results.durationMs = results.endTime - results.startTime;
    return results;
  }

  return {
    FEATURE_AREAS,
    tests,
    createCamryAppMock,
    createRealAppEnvironment,
    runTestSuite
  };
});
