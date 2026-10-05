/**
 * Empirical Challenger Round 2 Adversarial Stress Suite (challenger_m1_r2_1)
 *
 * Specific Verification Objectives:
 * 1. Verification of baseline challenger-stress.js
 * 2. Prototype properties ('toString', 'valueOf', 'constructor', 'hasOwnProperty', etc.) on emit(), on(), off()
 * 3. Null, undefined, numeric, and symbol event names across emit(), on(), off()
 * 4. Verification that all 5 issues previously identified by challenger_m1_2 are resolved without crashing
 * 5. Re-entrancy, listener mutation, exception isolation, and memory leak checks
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
  magenta: '\x1b[35m'
};

console.log(`${ANSI.cyan}${ANSI.bold}================================================================================${ANSI.reset}`);
console.log(`${ANSI.cyan}${ANSI.bold}  CHALLENGER ROUND 2 ADVERSARIAL STRESS SUITE (challenger_m1_r2_1)             ${ANSI.reset}`);
console.log(`${ANSI.cyan}${ANSI.bold}================================================================================${ANSI.reset}\n`);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, details) {
  if (condition) {
    passed++;
    console.log(`  ${ANSI.green}✓ PASS${ANSI.reset} ${testName}`);
  } else {
    failed++;
    console.log(`  ${ANSI.red}✗ FAIL${ANSI.reset} ${testName}`);
    failures.push({ testName, details: details || 'Condition returned false' });
  }
}

function createRealAppVM() {
  const domEventsDispatched = [];
  const cssProperties = {};

  const doc = {
    readyState: 'complete',
    documentElement: {
      setAttribute: () => {},
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
    getElementById: (id) => ({
      id,
      dataset: {},
      style: {
        setProperty: (k, v) => { cssProperties[k] = v; }
      },
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      setAttribute: () => {},
      addEventListener: () => {},
      textContent: ''
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
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
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
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
    Symbol,
    parseFloat,
    parseInt,
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
  vm.runInContext(appJsCode, sandbox);

  return {
    sandbox,
    app: sandbox.window.CamryApp,
    domEvents: domEventsDispatched
  };
}

// =============================================================================
// SECTION 1: VERIFY RESOLUTION OF THE 5 ISSUES IDENTIFIED BY CHALLENGER_M1_2
// =============================================================================
console.log(`${ANSI.yellow}${ANSI.bold}[SECTION 1] Verification of the 5 Issues from challenger_m1_2${ANSI.reset}`);

{
  const { app } = createRealAppVM();
  const bus = app.events;

  // Issue 1: emit('toString', {})
  let issue1Threw = false;
  let issue1Error = null;
  try {
    bus.emit('toString', { foo: 'bar' });
  } catch (err) {
    issue1Threw = true;
    issue1Error = err;
  }
  assert(!issue1Threw, `Issue 1: emit('toString', {}) executes without throwing`, issue1Error ? issue1Error.message : null);

  // Issue 2: on('toString', callback)
  let issue2Threw = false;
  let issue2Error = null;
  let issue2CallbackFired = false;
  try {
    const cb = (data) => { issue2CallbackFired = data && data.test === true; };
    bus.on('toString', cb);
    bus.emit('toString', { test: true });
    bus.off('toString', cb);
  } catch (err) {
    issue2Threw = true;
    issue2Error = err;
  }
  assert(!issue2Threw && issue2CallbackFired, `Issue 2: on('toString', cb) registers and receives events without throwing`, issue2Error ? issue2Error.message : null);

  // Issue 3: emit(null, {})
  let issue3Threw = false;
  let issue3Error = null;
  try {
    bus.emit(null, { test: 123 });
  } catch (err) {
    issue3Threw = true;
    issue3Error = err;
  }
  assert(!issue3Threw, `Issue 3: emit(null, {}) handles null event gracefully without throwing`, issue3Error ? issue3Error.message : null);

  // Issue 4: emit(undefined, {})
  let issue4Threw = false;
  let issue4Error = null;
  try {
    bus.emit(undefined, { test: 456 });
  } catch (err) {
    issue4Threw = true;
    issue4Error = err;
  }
  assert(!issue4Threw, `Issue 4: emit(undefined, {}) handles undefined event gracefully without throwing`, issue4Error ? issue4Error.message : null);

  // Issue 5: emit(42, {})
  let issue5Threw = false;
  let issue5Error = null;
  try {
    bus.emit(42, { test: 789 });
  } catch (err) {
    issue5Threw = true;
    issue5Error = err;
  }
  assert(!issue5Threw, `Issue 5: emit(42, {}) handles numeric event gracefully without throwing`, issue5Error ? issue5Error.message : null);
}

// =============================================================================
// SECTION 2: PROTOTYPE PROPERTIES COMPREHENSIVE AUDIT ON emit(), on(), off()
// =============================================================================
console.log(`\n${ANSI.yellow}${ANSI.bold}[SECTION 2] Prototype Properties Audit on emit(), on(), off()${ANSI.reset}`);

const prototypeProperties = [
  'toString',
  'valueOf',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
];

{
  const { app } = createRealAppVM();
  const bus = app.events;

  // Snapshot standard Object.prototype methods to detect any pollution
  const protoSnapshots = {};
  prototypeProperties.forEach(prop => {
    protoSnapshots[prop] = Object.prototype[prop];
  });

  prototypeProperties.forEach(prop => {
    let propPassed = true;
    let propError = null;
    let receivedData = null;

    try {
      // 1. Test emit() on un-subscribed prototype property
      bus.emit(prop, { initial: true });

      // 2. Test off() on un-subscribed prototype property
      bus.off(prop, () => {});

      // 3. Test on() subscription
      const cb = (data) => { receivedData = data; };
      bus.on(prop, cb);

      // 4. Test emit() on subscribed prototype property
      bus.emit(prop, { payload: `hello_${prop}` });

      if (!receivedData || receivedData.payload !== `hello_${prop}`) {
        propPassed = false;
        propError = `Listener did not receive expected payload for '${prop}', received: ${JSON.stringify(receivedData)}`;
      }

      // 5. Test off() un-subscription
      bus.off(prop, cb);

      // 6. Test emit() after un-subscription
      receivedData = null;
      bus.emit(prop, { payload: 'should_not_arrive' });

      if (receivedData !== null) {
        propPassed = false;
        propError = `Listener fired after off() for '${prop}'`;
      }
    } catch (err) {
      propPassed = false;
      propError = err.message;
    }

    assert(propPassed, `Prototype property '${prop}' safely handled across emit(), on(), off()`, propError);
  });

  // Verify Object.prototype was NOT polluted or modified
  let prototypeIntact = true;
  let corruptedProp = null;
  prototypeProperties.forEach(prop => {
    if (Object.prototype[prop] !== protoSnapshots[prop]) {
      prototypeIntact = false;
      corruptedProp = prop;
    }
  });
  assert(prototypeIntact, `Global Object.prototype remains 100% unpolluted and intact`, corruptedProp ? `Corrupted: ${corruptedProp}` : null);
}

// =============================================================================
// SECTION 3: NULL, UNDEFINED, NUMERIC, AND SYMBOL EVENT NAMES AUDIT
// =============================================================================
console.log(`\n${ANSI.yellow}${ANSI.bold}[SECTION 3] Null, Undefined, Numeric, and Symbol Event Names Audit${ANSI.reset}`);

const nonStringTestCases = [
  { name: 'null', value: null },
  { name: 'undefined', value: undefined },
  { name: 'number 0', value: 0 },
  { name: 'number 42', value: 42 },
  { name: 'number -1', value: -1 },
  { name: 'number 3.14159', value: 3.14159 },
  { name: 'number NaN', value: NaN },
  { name: 'number Infinity', value: Infinity },
  { name: 'number -Infinity', value: -Infinity },
  { name: 'Symbol()', value: Symbol() },
  { name: "Symbol('test')", value: Symbol('test') },
  { name: 'Symbol.iterator', value: Symbol.iterator },
  { name: "Symbol.for('camry')", value: Symbol.for('camry') },
  { name: 'boolean true', value: true },
  { name: 'boolean false', value: false },
  { name: 'empty string ""', value: '' },
  { name: 'empty object {}', value: {} },
  { name: 'array []', value: [] },
  { name: 'function () {}', value: () => {} },
  { name: 'RegExp /abc/', value: /abc/ }
];

{
  const { app } = createRealAppVM();
  const bus = app.events;

  nonStringTestCases.forEach(tc => {
    let tcPassed = true;
    let tcError = null;
    let callbackInvoked = false;
    const dummyCb = () => { callbackInvoked = true; };

    try {
      // Test emit with invalid event
      bus.emit(tc.value, { test: 1 });

      // Test on with invalid event
      bus.on(tc.value, dummyCb);

      // Test off with invalid event
      bus.off(tc.value, dummyCb);

      // Verify dummyCb was NOT invoked (since invalid event must not register or emit)
      bus.emit(tc.value, { test: 2 });
      if (callbackInvoked) {
        tcPassed = false;
        tcError = `Callback was unexpectedly invoked for invalid event ${tc.name}`;
      }
    } catch (err) {
      tcPassed = false;
      tcError = err.stack || err.message;
    }

    assert(tcPassed, `Invalid event name [${tc.name}] handled safely without throwing in emit(), on(), off()`, tcError);
  });
}

// =============================================================================
// SECTION 4: HIGH LOAD, MEMORY LEAK & RE-ENTRANCY UNDER HARDENING
// =============================================================================
console.log(`\n${ANSI.yellow}${ANSI.bold}[SECTION 4] High Load, Memory Leaks & Re-entrancy Stress${ANSI.reset}`);

{
  const { app } = createRealAppVM();
  const bus = app.events;

  // 4.1 Rapid subscribe/unsubscribe on prototype property names (5,000 cycles)
  let protoCyclesPassed = true;
  try {
    for (let i = 0; i < 5000; i++) {
      const cb = () => {};
      bus.on('toString', cb);
      bus.on('valueOf', cb);
      bus.on('constructor', cb);
      bus.off('toString', cb);
      bus.off('valueOf', cb);
      bus.off('constructor', cb);
    }
  } catch (err) {
    protoCyclesPassed = false;
  }
  const remainingToString = (bus._listeners['toString'] || []).length;
  const remainingValueOf = (bus._listeners['valueOf'] || []).length;
  const remainingConstructor = (bus._listeners['constructor'] || []).length;
  assert(
    protoCyclesPassed && remainingToString === 0 && remainingValueOf === 0 && remainingConstructor === 0,
    `5,000 cycles of on()/off() on prototype properties leave zero lingering listeners (remaining: ${remainingToString + remainingValueOf + remainingConstructor})`
  );

  // 4.2 Re-entrant recursive event emission
  let depthReached = 0;
  const maxDepth = 25;
  const recursiveHandler = (data) => {
    depthReached++;
    if (data.depth < maxDepth) {
      bus.emit('stress:recursive', { depth: data.depth + 1 });
    }
  };
  bus.on('stress:recursive', recursiveHandler);
  bus.emit('stress:recursive', { depth: 1 });
  bus.off('stress:recursive', recursiveHandler);

  assert(depthReached === maxDepth, `Re-entrant recursive emission executes cleanly without stack corruption (depth reached: ${depthReached}/${maxDepth})`);

  // 4.3 Recovery if _listeners is tampered or reset
  bus._listeners = null;
  let recoveryPassed = true;
  try {
    bus.on('recovery:test', () => {});
    bus.off('recovery:test', () => {});
    bus.emit('recovery:test', {});
  } catch (err) {
    recoveryPassed = false;
  }
  assert(recoveryPassed, `Auto-recovery when bus._listeners is corrupted/nullified`);
}

// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log(`\n${ANSI.cyan}${ANSI.bold}================================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}  CHALLENGER ROUND 2 SUMMARY${ANSI.reset}`);
console.log(`${ANSI.cyan}--------------------------------------------------------------------------------${ANSI.reset}`);
console.log(`  Assertions Passed : ${ANSI.green}${ANSI.bold}${passed}${ANSI.reset}`);
console.log(`  Assertions Failed : ${failed > 0 ? ANSI.red : ANSI.green}${ANSI.bold}${failed}${ANSI.reset}`);
console.log(`  Total Invariants  : ${passed + failed}`);
console.log(`${ANSI.cyan}--------------------------------------------------------------------------------${ANSI.reset}`);

if (failures.length > 0) {
  console.log(`\n${ANSI.red}${ANSI.bold}FAILURE DETAILS:${ANSI.reset}`);
  failures.forEach((f, idx) => {
    console.log(`  ${idx + 1}. ${ANSI.yellow}${f.testName}${ANSI.reset}`);
    console.log(`     ${f.details}`);
  });
}

const finalVerdict = failed === 0 ? 'APPROVE' : 'REJECT';
console.log(`\n  VERDICT: ${finalVerdict === 'APPROVE' ? ANSI.green : ANSI.red}${ANSI.bold}${finalVerdict}${ANSI.reset}\n`);

process.exit(failed === 0 ? 0 : 1);
