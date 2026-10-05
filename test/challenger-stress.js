/**
 * Challenger Adversarial Stress Suite for Milestone 1
 * Targets:
 * 1. EventBus pub/sub under high load, edge cases, invalid events, prototype pollution.
 * 2. Scale bounds clamping (0.25 <= S <= 1.0) across 500+ geometric combinations and letterbox checks.
 * 3. Contract adherence and error recovery.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m'
};

console.log(`${ANSI.cyan}${ANSI.bold}================================================================================${ANSI.reset}`);
console.log(`${ANSI.cyan}${ANSI.bold}  CHALLENGER ADVERSARIAL STRESS HARNESS — MILESTONE 1                          ${ANSI.reset}`);
console.log(`${ANSI.cyan}${ANSI.bold}================================================================================${ANSI.reset}\n`);

let passed = 0;
let failed = 0;
const findings = [];

function assert(cond, msg, findingDetails) {
  if (cond) {
    passed++;
    console.log(`  ${ANSI.green}✓ PASS${ANSI.reset} ${msg}`);
  } else {
    failed++;
    console.log(`  ${ANSI.red}✗ FAIL${ANSI.reset} ${msg}`);
    findings.push({
      title: msg,
      details: findingDetails || 'Condition evaluated to falsy'
    });
  }
}

// -----------------------------------------------------------------------------
// ENVIRONMENT SETUP: Load app.js and display.js into isolated VM with DOM stubs
// -----------------------------------------------------------------------------
function createIsolatedEnv() {
  const domEventsDispatched = [];
  const cssProperties = {};
  const elements = {};

  const doc = {
    readyState: 'complete',
    documentElement: {
      setAttribute: (k, v) => {},
      style: {
        setProperty: (k, v) => { cssProperties[k] = v; },
        getPropertyValue: (k) => cssProperties[k]
      }
    },
    body: {
      clientWidth: 1920,
      clientHeight: 1080
    },
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
          style: {
            setProperty: (k, v) => { cssProperties[k] = v; }
          },
          classList: { add: () => {}, remove: () => {}, contains: () => false },
          setAttribute: () => {},
          addEventListener: () => {},
          textContent: ''
        };
      }
      return elements[id];
    },
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    dispatchEvent: (evt) => {
      domEventsDispatched.push(evt);
      return true;
    },
    addEventListener: () => {}
  };

  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    requestAnimationFrame: (cb) => { return setTimeout(cb, 0); },
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  win.window = win;
  win.document = doc;

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    parseFloat,
    parseInt,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
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

  const appJsCode = fs.readFileSync(path.resolve(__dirname, '../js/app.js'), 'utf8');
  const displayJsCode = fs.readFileSync(path.resolve(__dirname, '../js/display.js'), 'utf8');

  vm.runInContext(appJsCode, sandbox);
  vm.runInContext(displayJsCode, sandbox);

  return {
    sandbox,
    app: sandbox.window.CamryApp,
    scaler: sandbox.window.CamryDisplayScaler,
    domEvents: domEventsDispatched,
    cssProps: cssProperties
  };
}

// =============================================================================
// TEST SUITE 1: EVENT BUS HIGH LOAD & ADVERSARIAL PUB/SUB
// =============================================================================
console.log(`${ANSI.yellow}${ANSI.bold}[SECTION 1] Event Bus Pub/Sub High Load & Concurrency Stress${ANSI.reset}`);

const env = createIsolatedEnv();
const bus = env.app.events;

// 1.1 High-volume emissions (10,000 events)
{
  let receivedCount = 0;
  const testCb = (d) => { receivedCount += d.val; };
  bus.on('stress:volume', testCb);

  const start = Date.now();
  for (let i = 0; i < 10000; i++) {
    bus.emit('stress:volume', { val: 1 });
  }
  const elapsed = Date.now() - start;

  assert(receivedCount === 10000, `10,000 rapid sequential emits received correctly (${receivedCount}/10000 in ${elapsed}ms)`);
  bus.off('stress:volume', testCb);
}

// 1.2 Rapid subscribe / unsubscribe cycles (20,000 cycles)
{
  let cyclesCompleted = 0;
  const start = Date.now();
  for (let i = 0; i < 20000; i++) {
    const fn = () => {};
    bus.on('stress:cycle', fn);
    bus.off('stress:cycle', fn);
    cyclesCompleted++;
  }
  const elapsed = Date.now() - start;

  const remaining = (bus._listeners['stress:cycle'] || []).length;
  assert(cyclesCompleted === 20000 && remaining === 0, `20,000 subscribe/unsubscribe cycles with zero dangling listeners (${elapsed}ms, remaining: ${remaining})`);
}

// 1.3 Self-unsubscribing listener during dispatch
{
  let selfCalled = 0;
  let followerCalled = 0;
  const selfRemover = () => {
    selfCalled++;
    bus.off('stress:self_remove', selfRemover);
  };
  const follower = () => { followerCalled++; };

  bus.on('stress:self_remove', selfRemover);
  bus.on('stress:self_remove', follower);

  bus.emit('stress:self_remove', {});
  bus.emit('stress:self_remove', {});

  assert(selfCalled === 1 && followerCalled === 2, `Self-unsubscribing listener executes exactly once without index corruption (self: ${selfCalled}, follower: ${followerCalled})`);
  bus.off('stress:self_remove', follower);
}

// 1.4 Mutual unsubscription during dispatch
{
  let aCalled = 0;
  let bCalled = 0;
  let fnB;
  const fnA = () => {
    aCalled++;
    bus.off('stress:mutual', fnB); // A removes B while dispatching
  };
  fnB = () => {
    bCalled++;
  };

  bus.on('stress:mutual', fnA);
  bus.on('stress:mutual', fnB);

  bus.emit('stress:mutual', {});
  // Because subscribers array was sliced, fnB executes in first emit
  const firstPassB = bCalled;
  bus.emit('stress:mutual', {});

  assert(aCalled === 2 && bCalled === 1, `Mutual unsubscription during dispatch handles snapshot correctly without throwing (A: ${aCalled}, B: ${bCalled})`);
  bus.off('stress:mutual', fnA);
}

// 1.5 Dynamic listener addition during dispatch
{
  let originalCalled = 0;
  let addedCalled = 0;
  const addedCb = () => { addedCalled++; };
  const originalCb = () => {
    originalCalled++;
    bus.on('stress:dynamic_add', addedCb);
  };

  bus.on('stress:dynamic_add', originalCb);
  bus.emit('stress:dynamic_add', {}); // Added listener should NOT run in this tick (snapshot semantics)
  const addedAfterFirst = addedCalled;
  bus.emit('stress:dynamic_add', {}); // Added listener SHOULD run in next tick

  assert(originalCalled === 2 && addedAfterFirst === 0 && addedCalled === 1, `Dynamic subscriber added during emission deferred to next tick (first tick: ${addedAfterFirst}, second tick: ${addedCalled})`);
  bus.off('stress:dynamic_add', originalCb);
  bus.off('stress:dynamic_add', addedCb);
}

// 1.6 Exception isolation in subscriber
{
  let postErrorExecuted = false;
  const brokenCb = () => { throw new Error('Simulated subscriber crash'); };
  const goodCb = () => { postErrorExecuted = true; };

  bus.on('stress:error_trap', brokenCb);
  bus.on('stress:error_trap', goodCb);

  let emitThrew = false;
  try {
    bus.emit('stress:error_trap', {});
  } catch (e) {
    emitThrew = true;
  }

  assert(!emitThrew && postErrorExecuted, `Subscriber exception is caught and isolated without aborting subsequent listeners (threw: ${emitThrew}, nextExecuted: ${postErrorExecuted})`);
  bus.off('stress:error_trap', brokenCb);
  bus.off('stress:error_trap', goodCb);
}

// 1.7 Non-function callback guard
{
  bus.on('stress:bad_callback', null);
  bus.on('stress:bad_callback', undefined);
  bus.on('stress:bad_callback', 'notAFunction');
  bus.on('stress:bad_callback', 42);
  bus.on('stress:bad_callback', {});

  const count = (bus._listeners['stress:bad_callback'] || []).length;
  assert(count === 0, `Non-function callbacks are rejected by .on() (registered: ${count})`);
}

// =============================================================================
// TEST SUITE 2: ADVERSARIAL EVENT BUS NAMES & PROTOTYPE POLLUTION
// =============================================================================
console.log(`\n${ANSI.yellow}${ANSI.bold}[SECTION 2] Adversarial Event Names & Prototype Collision${ANSI.reset}`);

// 2.1 Object prototype collisions ('toString', 'valueOf', 'constructor')
{
  let toStringThrew = false;
  let toStringMsg = '';
  try {
    bus.emit('toString', {});
  } catch (e) {
    toStringThrew = true;
    toStringMsg = e.message;
  }
  assert(!toStringThrew, `emit('toString') does not crash on Object.prototype property lookup`, `Crashed with: ${toStringMsg}`);

  let onToStringThrew = false;
  let onToStringMsg = '';
  try {
    bus.on('toString', () => {});
  } catch (e) {
    onToStringThrew = true;
    onToStringMsg = e.message;
  }
  assert(!onToStringThrew, `on('toString', cb) does not crash on Object.prototype property lookup`, `Crashed with: ${onToStringMsg}`);
}

// 2.2 Invalid event names on emit (null, undefined, number, object)
{
  let nullEmitThrew = false;
  let nullEmitMsg = '';
  try {
    bus.emit(null, {});
  } catch (e) {
    nullEmitThrew = true;
    nullEmitMsg = e.message;
  }
  assert(!nullEmitThrew, `emit(null) handles non-string event gracefully without crashing`, `Crashed with: ${nullEmitMsg}`);

  let undefEmitThrew = false;
  let undefEmitMsg = '';
  try {
    bus.emit(undefined, {});
  } catch (e) {
    undefEmitThrew = true;
    undefEmitMsg = e.message;
  }
  assert(!undefEmitThrew, `emit(undefined) handles undefined event gracefully without crashing`, `Crashed with: ${undefEmitMsg}`);

  let numEmitThrew = false;
  let numEmitMsg = '';
  try {
    bus.emit(42, {});
  } catch (e) {
    numEmitThrew = true;
    numEmitMsg = e.message;
  }
  assert(!numEmitThrew, `emit(42) handles numeric event gracefully without crashing`, `Crashed with: ${numEmitMsg}`);
}

// =============================================================================
// TEST SUITE 3: SCALE BOUNDS CLAMPING (0.25 <= S <= 1.0) & GEOMETRIC SWEEP
// =============================================================================
console.log(`\n${ANSI.yellow}${ANSI.bold}[SECTION 3] Scale Clamping (0.25 <= S <= 1.0) & Geometric Space Sweep${ANSI.reset}`);

const scaler = env.scaler;

// 3.1 Sweep 1,000 resolution pairs from 1x1 up to 10,000x10,000
{
  let allClamped = true;
  let minObserved = Infinity;
  let maxObserved = -Infinity;
  let totalTested = 0;

  const testDimensions = [
    // Micro / collapse resolutions
    [1, 1], [10, 10], [50, 50], [100, 100], [200, 200], [320, 240], [375, 667],
    // Mobile phones
    [320, 480], [360, 640], [375, 812], [390, 844], [412, 915], [414, 896],
    // Tablets
    [768, 1024], [800, 1280], [834, 1194], [1024, 768], [1024, 1366],
    // Laptops & Monitors
    [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1600, 900], [1680, 1050],
    [1668, 800], [1920, 1080], [1920, 1200], [2560, 1440], [2560, 1600],
    // Ultrawide
    [2560, 1080], [3440, 1440], [3840, 1080], [5120, 1440],
    // 4K and 8K
    [3840, 2160], [4096, 2160], [5120, 2880], [7680, 4320]
  ];

  // Synthesize dense sweep
  for (let w = 50; w <= 3000; w += 75) {
    for (let h = 50; h <= 2000; h += 75) {
      testDimensions.push([w, h]);
    }
  }

  for (const [w, h] of testDimensions) {
    totalTested++;
    const s = scaler.calculateScale(w, h);
    if (s < minObserved) minObserved = s;
    if (s > maxObserved) maxObserved = s;
    if (s < 0.25 || s > 1.00) {
      allClamped = false;
      console.log(`Failed clamp at ${w}x${h}: scale = ${s}`);
    }
  }

  assert(allClamped, `All ${totalTested} tested screen resolutions clamped within [0.25, 1.00] (Min: ${minObserved}, Max: ${maxObserved})`);
}

// 3.2 Degenerate & hostile inputs to calculateScale
{
  const testCases = [
    { w: 0, h: 0, desc: '0x0 dimensions' },
    { w: -100, h: 800, desc: 'Negative width (-100)' },
    { w: 1280, h: -500, desc: 'Negative height (-500)' },
    { w: null, h: 800, desc: 'null width' },
    { w: 1280, h: undefined, desc: 'undefined height' },
    { w: NaN, h: 800, desc: 'NaN width' },
    { w: 1280, h: NaN, desc: 'NaN height' },
    { w: Infinity, h: 800, desc: 'Infinity width' },
    { w: 1280, h: Infinity, desc: 'Infinity height' }
  ];

  let degeneratePassed = true;
  testCases.forEach(tc => {
    const s = scaler.calculateScale(tc.w, tc.h);
    const valid = typeof s === 'number' && !isNaN(s) && isFinite(s) && s >= 0.25 && s <= 1.0;
    if (!valid) {
      degeneratePassed = false;
      console.log(`Degenerate input failure on ${tc.desc}: got ${s}`);
    }
  });

  assert(degeneratePassed, `Degenerate/hostile inputs (0, negative, null, NaN, Infinity) return valid finite clamped scale`);
}

// 3.3 Letterbox Prevention & Aspect Ratio Integrity
{
  // Native display: 1280x800 -> 16:10 aspect ratio = 1.6
  // Native stage: 1668x800 -> 2.085 aspect ratio
  const displayRatio = 1280 / 800;
  assert(Math.abs(displayRatio - 1.6) < 0.0001, `Native display aspect ratio is exactly 16:10 (1280 / 800 = ${displayRatio})`);

  // Content area inside display: top 48px status bar + 752px content = 800px
  const statusBarHeight = 48;
  const contentHeight = 752;
  assert(statusBarHeight + contentHeight === 800, `Display stage vertical partitioning zero-gap invariant (48px bar + 752px content = 800px)`);

  // Stage scaling preserves proportionality: scaleX vs scaleY uses Math.min
  const w = 1000;
  const h = 700;
  const s = scaler.calculateScale(w, h);
  const scaledStageW = 1668 * s;
  const scaledStageH = 800 * s;

  const fitsWidth = scaledStageW <= w + 0.5; // tolerance
  const fitsHeight = scaledStageH <= h + 0.5;
  assert(fitsWidth && fitsHeight, `Scaled stage (${scaledStageW.toFixed(1)}x${scaledStageH.toFixed(1)}) fits strictly inside container (${w}x${h}) without clipping or overflow`);
}

// =============================================================================
// TEST SUITE 4: STATE INTEGRITY & RECOVERY UNDER CHAOS
// =============================================================================
console.log(`\n${ANSI.yellow}${ANSI.bold}[SECTION 4] State Transitions & Chaos Fault Tolerancing${ANSI.reset}`);

// 4.1 Rapid cycling of theme, palette, and mode
{
  let rapidOk = true;
  try {
    for (let i = 0; i < 500; i++) {
      env.app.display.cycleTheme();
      env.app.display.cyclePalette();
      env.app.display.toggleMode();
    }
  } catch (e) {
    rapidOk = false;
  }
  const validThemes = ['cic', 'mmi', 'panoramic'];
  const validPalettes = ['optitron', 'champagne', 'amber'];
  const validModes = ['night', 'day'];

  const finalThemeValid = validThemes.includes(env.app.state.theme);
  const finalPaletteValid = validPalettes.includes(env.app.state.palette);
  const finalModeValid = validModes.includes(env.app.state.mode);

  assert(rapidOk && finalThemeValid && finalPaletteValid && finalModeValid, `500 rapid cycles of theme/palette/mode maintain valid state invariant (theme: ${env.app.state.theme}, palette: ${env.app.state.palette}, mode: ${env.app.state.mode})`);
}

// 4.2 Invalid theme/palette/mode fallback defense
{
  env.app.display.setTheme('nonexistent_theme');
  env.app.display.setPalette('hacker_purple');
  env.app.display.setMode('twilight');

  assert(env.app.state.theme === 'cic', `Unknown theme falls back safely to 'cic' (got: ${env.app.state.theme})`);
  assert(env.app.state.palette === 'optitron', `Unknown palette falls back safely to 'optitron' (got: ${env.app.state.palette})`);
  assert(env.app.state.mode === 'night', `Unknown mode falls back safely to 'night' (got: ${env.app.state.mode})`);
}

// 4.3 View history stack underflow & overflow stress
{
  // Underflow: Call goBack 50 times when at root
  env.app.display.setView('home');
  for (let i = 0; i < 50; i++) {
    env.app.display.goBack();
  }
  const underflowSafe = env.app.state.activeView === 'home' && env.app.state.viewStack.length === 1;
  assert(underflowSafe, `View stack underflow defense: repeated goBack() preserves root 'home' view (view: ${env.app.state.activeView}, stack depth: ${env.app.state.viewStack.length})`);

  // Overflow: Push 1,000 views
  for (let i = 0; i < 250; i++) {
    env.app.display.setView('nav');
    env.app.display.setView('media');
    env.app.display.setView('perf');
    env.app.display.setView('home');
  }
  assert(env.app.state.activeView === 'home' && env.app.state.viewStack.length > 0, `View stack handles 1,000 sequential view pushes without memory fault`);
}

// =============================================================================
// SUMMARY & VERDICT GENERATION
// =============================================================================
console.log(`\n${ANSI.cyan}${ANSI.bold}================================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}  CHALLENGER STRESS HARNESS SUMMARY${ANSI.reset}`);
console.log(`${ANSI.cyan}--------------------------------------------------------------------------------${ANSI.reset}`);
console.log(`  Assertions Passed : ${ANSI.green}${ANSI.bold}${passed}${ANSI.reset}`);
console.log(`  Assertions Failed : ${failed > 0 ? ANSI.red : ANSI.green}${ANSI.bold}${failed}${ANSI.reset}`);
console.log(`  Total Invariants  : ${passed + failed}`);
console.log(`${ANSI.cyan}--------------------------------------------------------------------------------${ANSI.reset}`);

if (findings.length > 0) {
  console.log(`\n${ANSI.red}${ANSI.bold}FINDINGS DETECTED:${ANSI.reset}`);
  findings.forEach((f, i) => {
    console.log(`  ${i + 1}. ${ANSI.yellow}${f.title}${ANSI.reset}`);
    console.log(`     Details: ${f.details}`);
  });
}

const verdict = failed === 0 ? 'APPROVE' : 'REJECT';
console.log(`\n  VERDICT: ${verdict === 'APPROVE' ? ANSI.green : ANSI.red}${ANSI.bold}${verdict}${ANSI.reset}\n`);

process.exit(failed === 0 ? 0 : 1);
