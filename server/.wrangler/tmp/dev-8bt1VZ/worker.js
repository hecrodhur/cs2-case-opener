var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env3) {
    return 1;
  }
  hasColors(count3, env3) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/config.ts
var env2 = typeof process !== "undefined" && process.env ? process.env : {};
var config2 = {
  corsOrigins: (env2.FRONTEND_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  rateLimit: { windowMs: 6e4, auth: 20, api: 240, admin: 50 },
  scale: Number(env2.RATE_LIMIT_SCALE ?? 1),
  welcomeBalanceCents: 25e3,
  sessionDays: Number(env2.SESSION_DAYS ?? 30),
  priceCostRatio: 1,
  stattrakChance: 0.1,
  souvenirChance: 0.05,
  steamMinIntervalMs: 1500,
  steamMarketUrl: "https://steamcommunity.com/market/search/render/",
  csgoApiBase: env2.CSGO_API_BASE ?? "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en",
  csgoApiBaseMirror: env2.CSGO_API_BASE_MIRROR ?? "https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en"
};
var adminPassword = env2.ADMIN_PASSWORD ?? "hola67";
function setAdminPassword(p) {
  adminPassword = p;
}
__name(setAdminPassword, "setAdminPassword");
function getAdminPassword() {
  return adminPassword;
}
__name(getAdminPassword, "getAdminPassword");

// src/db.ts
import { AsyncLocalStorage } from "node:async_hooks";
var als = new AsyncLocalStorage();
function runWithDb(db, fn) {
  return als.run(db, fn);
}
__name(runWithDb, "runWithDb");
function getDb() {
  const db = als.getStore();
  if (!db) throw new Error("no active D1 database (missing runWithDb wrapper?)");
  return db;
}
__name(getDb, "getDb");
function norm(v) {
  if (v === void 0) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v;
}
__name(norm, "norm");
function adaptSql(sql, raw) {
  const inLists = /* @__PURE__ */ new Map();
  const jsons = /* @__PURE__ */ new Map();
  let s = sql;
  s = s.replace(/\s*=\s*ANY\(\s*\$(\d+)(?:::\w+\[\])?\s*\)/g, (_m, n) => {
    inLists.set(+n, Array.isArray(raw[+n - 1]) ? raw[+n - 1] : [raw[+n - 1]]);
    return ` IN @@IN${n}@@`;
  });
  s = s.replace(/\$(\d+)(?:::\w+)?\[\]/g, (_m, n) => {
    jsons.set(+n, raw[+n - 1]);
    return `@@JSON${n}@@`;
  });
  s = s.replace(/::(jsonb|int|integer|bigint|text)\b/gi, "");
  s = s.replace(/\bILIKE\b/gi, "LIKE");
  s = s.replace(/\bnow\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  s = s.replace(/\bGREATEST\(/gi, "MAX(");
  s = s.replace(/\s+FOR UPDATE\b/gi, "");
  const params = [];
  const re = /@@IN(\d+)@@|@@JSON(\d+)@@|\$(\d+)/g;
  let out = "";
  let last = 0;
  let m;
  while (m = re.exec(s)) {
    out += s.slice(last, m.index);
    if (m[1] != null) {
      const list = inLists.get(+m[1]) ?? [];
      for (const v of list) params.push(norm(v));
      out += list.length ? `(${list.map(() => "?").join(",")})` : "(NULL)";
    } else if (m[2] != null) {
      const v = jsons.get(+m[2]);
      params.push(typeof v === "string" ? v : JSON.stringify(v === void 0 ? null : v));
      out += "?";
    } else {
      params.push(norm(raw[+m[3] - 1]));
      out += "?";
    }
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  return { text: out, params };
}
__name(adaptSql, "adaptSql");
async function query(text, params = []) {
  const a = adaptSql(text, params);
  const res = await getDb().prepare(a.text).bind(...a.params).all();
  return res.results;
}
__name(query, "query");
async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}
__name(one, "one");
async function run(text, params = []) {
  const a = adaptSql(text, params);
  const res = await getDb().prepare(a.text).bind(...a.params).run();
  return Number(res.meta?.changes ?? 0);
}
__name(run, "run");
async function insert(text, params = []) {
  const a = adaptSql(text, params);
  const res = await getDb().prepare(a.text).bind(...a.params).run();
  return Number(res.meta.last_row_id ?? 0);
}
__name(insert, "insert");
var PgClient = class {
  constructor(store) {
    this.store = store;
  }
  store;
  static {
    __name(this, "PgClient");
  }
  async query(text, params = []) {
    const a = adaptSql(text, params);
    const res = await this.store.prepare(a.text).bind(...a.params).all();
    return { rows: res.results };
  }
  /** INSERT and return the new rowid. */
  async insert(text, params = []) {
    const a = adaptSql(text, params);
    const res = await this.store.prepare(a.text).bind(...a.params).run();
    return Number(res.meta.last_row_id ?? 0);
  }
  /** Run a write statement and return the number of changed rows. */
  async update(text, params = []) {
    const a = adaptSql(text, params);
    const res = await this.store.prepare(a.text).bind(...a.params).run();
    return Number(res.meta.changes ?? 0);
  }
  async release() {
  }
};
async function tx(fn) {
  const db = getDb();
  if (typeof db.transaction === "function") {
    const txn = await db.transaction("BEGIN IMMEDIATE");
    try {
      const r = await fn(new PgClient(txn));
      await txn.commit();
      return r;
    } catch (e) {
      await txn.rollback().catch(() => {
      });
      throw e;
    }
  }
  return fn(new PgClient(db));
}
__name(tx, "tx");
function js(v) {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v ?? null;
}
__name(js, "js");

// src/services/global.ts
var DEFAULTS = {
  stattrakChance: 0.1,
  souvenirChance: 0.05,
  marketFeePct: 5,
  welcomeBalanceCents: config2.welcomeBalanceCents,
  quickSellPct: 90
};
async function getSettings() {
  const rows = await query("SELECT key, value FROM settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    stattrakChance: Number(map.stattrak_chance ?? DEFAULTS.stattrakChance),
    souvenirChance: Number(map.souvenir_chance ?? DEFAULTS.souvenirChance),
    marketFeePct: Number(map.market_fee_pct ?? DEFAULTS.marketFeePct),
    welcomeBalanceCents: Number(map.welcome_balance_cents ?? DEFAULTS.welcomeBalanceCents),
    quickSellPct: Number(map.quick_sell_pct ?? DEFAULTS.quickSellPct)
  };
}
__name(getSettings, "getSettings");
async function setSetting(key, value) {
  await run("INSERT INTO settings (key, value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, JSON.stringify(value)]);
}
__name(setSetting, "setSetting");
function validateSettings(patch) {
  const out = {};
  const rules = {
    stattrakChance: [0, 0.5],
    souvenirChance: [0, 0.5],
    marketFeePct: [0, 50],
    welcomeBalanceCents: [0, 1e8],
    quickSellPct: [0, 100]
  };
  for (const [k, v] of Object.entries(patch)) {
    const key = k;
    const [lo, hi] = rules[key] ?? [0, 1e9];
    if (typeof v !== "number" || Number.isNaN(v) || v < lo || v > hi) {
      throw Object.assign(new Error(`invalid setting ${k}`), { statusCode: 400 });
    }
    out[key] = v;
  }
  return out;
}
__name(validateSettings, "validateSettings");

// src/services/auth.ts
var PBKDF2_ITERATIONS = 15e4;
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
__name(b64, "b64");
function unb64(s) {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
__name(unb64, "unb64");
async function deriveBits(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password).buffer, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}
__name(deriveBits, "deriveBits");
async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await deriveBits(plain, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(h)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(plain, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  try {
    const expected = await deriveBits(plain, unb64(parts[2]));
    const actual = unb64(parts[3]);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
    return diff === 0;
  } catch {
    return false;
  }
}
__name(verifyPassword, "verifyPassword");
function randomHex(bytes) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
__name(randomHex, "randomHex");
async function createSession(userId) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + config2.sessionDays * 864e5).toISOString();
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)", [token, userId, expires]);
  return token;
}
__name(createSession, "createSession");
async function userFromToken(token) {
  const row = await one(
    `SELECT u.id, u.username, u.role, u.avatar, u.balance_cents, u.banned, u.settings,
            i.item_count, i.total_value_cents
     FROM users u
     JOIN sessions s ON s.user_id = u.id
     LEFT JOIN inventories i ON i.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [token]
  );
  if (!row) return null;
  const user = { ...row, id: Number(row.id), balance_cents: Number(row.balance_cents) };
  user.settings = js(row.settings) ?? {};
  return user;
}
__name(userFromToken, "userFromToken");
function requireAdmin(user) {
  if (user.role !== "admin") {
    const e = new Error("forbidden");
    e.statusCode = 403;
    throw e;
  }
  return user;
}
__name(requireAdmin, "requireAdmin");
async function seedAdmin() {
  const existing = await one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing) return;
  const settings = await getSettings();
  const hash = await hashPassword(getAdminPassword());
  await run(
    `INSERT INTO users (username, pass_hash, role, balance_cents)
     VALUES ('admin', $1, 'admin', $2)`,
    [hash, settings.welcomeBalanceCents]
  );
}
__name(seedAdmin, "seedAdmin");

// src/services/realtime.ts
var RealtimeHub = class {
  constructor(ns) {
    this.ns = ns;
  }
  ns;
  static {
    __name(this, "RealtimeHub");
  }
  get do() {
    return this.ns.getByName("rt");
  }
  broadcast(type, data) {
    return this.do.broadcast(type, data).catch(() => {
    });
  }
  notifyUser(userId, type, data) {
    return this.do.notifyUser(userId, type, data).catch(() => {
    });
  }
};

// src/util/marketHash.ts
function steamQueryFor(mhn) {
  return mhn.replace(/\|/g, " ").replace("StatTrak\u2122", "StatTrak");
}
__name(steamQueryFor, "steamQueryFor");

// src/services/pricing.ts
var CURRENCY = { 1: "USD", 2: "EUR", 3: "GBP" };
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
__name(sleep, "sleep");
function parseMarketHtml(html) {
  const out = [];
  const rowRe = /data-hash-name="([^"]+)"[\s\S]*?data-qty="(\d+)"[\s\S]*?data-price="(\d+)" data-currency="(\d+)"/g;
  let m;
  while (m = rowRe.exec(html)) {
    out.push({
      mhn: m[1],
      lowestCents: Number(m[3]),
      volume: Number(m[2]),
      currency: CURRENCY[m[4]] ?? "USD"
    });
  }
  return out;
}
__name(parseMarketHtml, "parseMarketHtml");
var PriceSyncService = class {
  static {
    __name(this, "PriceSyncService");
  }
  queue = [];
  queued = /* @__PURE__ */ new Set();
  running = false;
  lastRequestAt = 0;
  hub = null;
  setHub(hub) {
    this.hub = hub;
  }
  key(j) {
    return `${j.itemId}|${j.wear}|${j.stattrak ? 1 : 0}`;
  }
  /** Enqueue a price job. Returns true if it was scheduled. */
  request(job) {
    const k = this.key(job);
    if (this.queued.has(k)) return false;
    this.queued.add(k);
    this.queue.push(job);
    return true;
  }
  get pending() {
    return this.queue.length;
  }
  /** Process the queue until empty. Safe to call from multiple places. */
  async run(maxJobs) {
    if (this.running) return 0;
    this.running = true;
    let done = 0;
    try {
      while (this.queue.length && (maxJobs == null || done < maxJobs)) {
        const job = this.queue.shift();
        this.queued.delete(this.key(job));
        done++;
        await this.fetchAndStore(job);
      }
      return done;
    } finally {
      this.running = false;
    }
  }
  async throttle() {
    const wait = this.lastRequestAt + config2.steamMinIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
  }
  /** Fetch one market_hash_name from Steam. null when not listed. */
  async fetchSteam(mhn) {
    const url = `${config2.steamMarketUrl}?query=${encodeURIComponent(steamQueryFor(mhn))}&start=0&count=10&sort_column=price&sort_dir=asc&filter_version=0&filter_currency=0&filter_state=1&filter_type=bit_immutable&filter_tradable=1&filter_marketable_name=1`;
    const backoffs = [2e3, 6e3, 2e4];
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      if (attempt > 0) {
        await sleep(backoffs[attempt - 1]);
      }
      await this.throttle();
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            Accept: "application/json"
          }
        });
        this.lastRequestAt = Date.now();
        if (res.status === 429 || res.status >= 500) {
          if (attempt === backoffs.length) throw new Error(`Steam unavailable (${res.status})`);
          continue;
        }
        if (!res.ok) throw new Error(`Steam HTTP ${res.status}`);
        const json2 = await res.json();
        const rows = parseMarketHtml(json2.results_html ?? "");
        const exact = rows.find((r) => r.mhn === mhn);
        if (exact) return { lowestCents: exact.lowestCents, volume: exact.volume, currency: exact.currency };
        return null;
      } catch (e) {
        if (attempt === backoffs.length) throw new Error(`steam fetch failed for "${mhn}": ${e.message}`);
      }
    }
    return null;
  }
  async fetchAndStore(job) {
    let price = null;
    let source = "steam_market";
    try {
      price = await this.fetchSteam(job.mhn);
    } catch {
      return;
    }
    if (price) {
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, currency, source, updated_at, last_known_cents)
         VALUES ($1,$2,$3,$4,$4,$5,$6,'steam_market', now(), $4)
         ON CONFLICT (item_id, wear, stattrak) DO UPDATE SET
           lowest_price_cents = EXCLUDED.lowest_price_cents,
           median_price_cents = EXCLUDED.median_price_cents,
           volume = EXCLUDED.volume,
           currency = EXCLUDED.currency,
           source = EXCLUDED.source,
           updated_at = now(),
           last_known_cents = EXCLUDED.last_known_cents`,
        [job.itemId, job.wear, job.stattrak, price.lowestCents, price.volume, price.currency]
      );
      await run(
        `INSERT INTO price_history (item_id, wear, stattrak, lowest_price_cents, median_price_cents, volume, source)
         VALUES ($1,$2,$3,$4,$4,$5,'steam_market')`,
        [job.itemId, job.wear, job.stattrak, price.lowestCents, price.volume]
      );
      this.hub?.broadcast("price", { itemId: job.itemId, wear: job.wear, lowestCents: price.lowestCents });
    } else {
      await run(
        `INSERT INTO prices (item_id, wear, stattrak, lowest_price_cents, volume, currency, source, updated_at, last_known_cents)
         SELECT $1,$2,$3,NULL,0,'USD','steam_market',now(),COALESCE(p.last_known_cents, p.lowest_price_cents)
         FROM (SELECT * FROM prices WHERE item_id=$1 AND wear=$2 AND stattrak=$3) p
         ON CONFLICT DO NOTHING`,
        [job.itemId, job.wear, job.stattrak]
      );
    }
    await this.maybeUpdateCaseCost(job);
  }
  /** When the priced item is a case, keep cases.cost_cents in sync. */
  async maybeUpdateCaseCost(job) {
    const row = await one(
      "SELECT c.id, p.lowest_price_cents FROM prices p JOIN items i ON i.id = p.item_id JOIN cases c ON c.item_id = i.id WHERE p.item_id = $1 AND i.kind = $2",
      [job.itemId, "case"]
    );
    if (!row?.lowest_price_cents) return;
    const cost = Math.max(1, Math.round(row.lowest_price_cents * config2.priceCostRatio));
    const cur = await one("SELECT cost_cents FROM cases WHERE id = $1", [row.id]);
    if (cur?.cost_cents !== cost) {
      await run("UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1", [row.id, cost]);
    }
  }
};
async function itemPricesByWear(itemId, stattrak = false) {
  const rows = await query(
    "SELECT wear, lowest_price_cents FROM prices WHERE item_id = $1 AND stattrak = $2 AND lowest_price_cents IS NOT NULL",
    [itemId, stattrak]
  );
  const out = {};
  for (const r of rows) out[r.wear] = r.lowest_price_cents;
  return out;
}
__name(itemPricesByWear, "itemPricesByWear");

// src/services/priceJobs.ts
async function refreshPricesForCases(prices, caseLimit = 25, force = false) {
  const cases = await query(
    "SELECT c.* FROM cases c WHERE c.active = TRUE ORDER BY c.name LIMIT $1",
    [caseLimit]
  );
  for (const c of cases) {
    const item = await one("SELECT i.* FROM items i WHERE i.id = $1", [c.item_id]);
    if (!item) continue;
    if (force || await stale(item.id, "any", false)) {
      prices.request({ itemId: item.id, mhn: c.market_hash_name ?? c.name, wear: "any", stattrak: false });
    }
    const poolItems = await query(
      `SELECT i.* FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id
       JOIN items i ON i.id = pi.item_id WHERE p.case_id = $1 ORDER BY i.name`,
      [c.id]
    );
    for (const i of poolItems) {
      const wear = i.min_float != null ? "Field-Tested" : "any";
      if (force || await stale(i.id, wear, false)) {
        const mhn = buildMhn(i, wear);
        prices.request({ itemId: i.id, mhn, wear, stattrak: false });
      }
    }
  }
  void prices.run();
}
__name(refreshPricesForCases, "refreshPricesForCases");
async function stale(itemId, wear, stattrak) {
  const p = await one("SELECT updated_at, lowest_price_cents FROM prices WHERE item_id = $1 AND wear = $2 AND stattrak = $3", [itemId, wear, stattrak]);
  if (!p) return true;
  if (p.lowest_price_cents == null) return true;
  const ageMs = Date.now() - new Date(p.updated_at).getTime();
  return ageMs > 6 * 36e5;
}
__name(stale, "stale");
function buildMhn(item, wear) {
  const base = item.name;
  if (wear === "any") return base;
  return `${base} (${wear})`;
}
__name(buildMhn, "buildMhn");

// src/routes/index.ts
var routes = [];
function parse(path) {
  const segs = path.split("/").filter(Boolean);
  return { segs, keys: segs.map((s) => s.startsWith(":")) };
}
__name(parse, "parse");
var route = {
  get: /* @__PURE__ */ __name((p, h) => routes.push({ method: "GET", ...parse(p), handler: h }), "get"),
  post: /* @__PURE__ */ __name((p, h) => routes.push({ method: "POST", ...parse(p), handler: h }), "post"),
  patch: /* @__PURE__ */ __name((p, h) => routes.push({ method: "PATCH", ...parse(p), handler: h }), "patch"),
  del: /* @__PURE__ */ __name((p, h) => routes.push({ method: "DELETE", ...parse(p), handler: h }), "del")
};
function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
var notFound = /* @__PURE__ */ __name((msg = "not found") => new Response(JSON.stringify({ error: msg }), {
  status: 404,
  headers: { "Content-Type": "application/json" }
}), "notFound");
function bearer(req) {
  const h = req.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}
__name(bearer, "bearer");
async function authUser(req) {
  const token = bearer(req);
  if (!token) throw httpError(401, "authentication required");
  const user = await userFromToken(token);
  if (!user) throw httpError(401, "invalid or expired session");
  if (user.banned) throw httpError(403, "account suspended");
  return user;
}
__name(authUser, "authUser");
function httpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}
__name(httpError, "httpError");
async function dispatch(request, ctx) {
  const url = new URL(request.url);
  const segs = url.pathname.split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  for (const r of routes) {
    if (r.method !== method || r.segs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (r.keys[i]) params[r.segs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (r.segs[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let body = null;
    if (request.body !== void 0 || ["POST", "PATCH", "DELETE"].includes(method)) {
      try {
        body = await request.clone().json();
      } catch {
        body = null;
      }
    }
    const req = { url, method, params, query: url.searchParams, body, headers: request.headers, raw: request };
    return await r.handler(req, ctx);
  }
  return notFound("no such endpoint");
}
__name(dispatch, "dispatch");
var buckets = /* @__PURE__ */ new Map();
function rateLimited(request, path) {
  const base = path.includes("/auth/") ? config2.rateLimit.auth : path.includes("/admin") ? config2.rateLimit.admin : config2.rateLimit.api;
  const limit = base * (config2.scale ?? 1);
  const key = `${request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "x"}|${path}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < config2.rateLimit.windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5e3) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > config2.rateLimit.windowMs) buckets.delete(k);
  }
  return hits.length > limit;
}
__name(rateLimited, "rateLimited");

// src/services/notify.ts
async function pushNotification(hub, userId, kind, title2, body = null, meta = null) {
  await run("INSERT INTO notifications (user_id, kind, title, body, meta) VALUES ($1,$2,$3,$4,$5)", [
    userId,
    kind,
    title2,
    body,
    meta ? JSON.stringify(meta) : null
  ]);
  const n = await one(
    "SELECT id, kind, title, body, meta, read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userId]
  );
  if (n) hub.notifyUser(userId, "notify", { ...n, id: Number(n.id), read: Boolean(n.read), meta: js(n.meta) ?? null });
}
__name(pushNotification, "pushNotification");

// src/routes/auth.ts
var USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
route.get("/api/health", async () => json(200, { ok: true, ts: Date.now() }));
route.post("/api/auth/register", async (req, ctx) => {
  const { username, password } = req.body ?? {};
  if (!USERNAME_RE.test(username ?? "")) {
    throw httpError(400, "username must be 3-24 chars, letters/digits/underscore");
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 200) {
    throw httpError(400, "password must be 6+ chars");
  }
  const exists = await one("SELECT id FROM users WHERE username = $1", [username.toLowerCase()]);
  if (exists) throw httpError(409, "username taken");
  const settings = await getSettings();
  const passHash = await hashPassword(password);
  const uid = await insert("INSERT INTO users (username, pass_hash, balance_cents) VALUES ($1,$2,$3)", [
    username.toLowerCase(),
    passHash,
    settings.welcomeBalanceCents
  ]);
  await run("INSERT INTO inventories (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [uid]);
  const token = await createSession(uid);
  await pushNotification(ctx.hub, uid, "welcome", "Bienvenido", `Received $${(settings.welcomeBalanceCents / 100).toFixed(2)} virtual balance.`);
  return json(201, { token, user: { id: uid, username: username.toLowerCase(), balanceCents: settings.welcomeBalanceCents } });
});
route.post("/api/auth/login", async (req) => {
  const { username, password } = req.body ?? {};
  const u = await one("SELECT * FROM users WHERE username = $1", [String(username ?? "").toLowerCase()]);
  if (!u || !await verifyPassword(String(password ?? ""), u.pass_hash)) {
    throw httpError(401, "invalid credentials");
  }
  if (u.banned) throw httpError(403, "account banned");
  const token = await createSession(u.id);
  return json(200, { token, user: { id: Number(u.id), username: u.username, role: u.role, balanceCents: Number(u.balance_cents) } });
});
route.post("/api/auth/logout", async (req) => {
  const h = req.headers.get("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (token) await run("DELETE FROM sessions WHERE token = $1", [token]);
  return json(200, { ok: true });
});
route.get("/api/auth/me", async (req) => {
  const user = await authUser(req);
  const inv = await one("SELECT * FROM inventories WHERE user_id = $1", [user.id]);
  const stats = await one(
    `SELECT COUNT(*) AS openings,
            COALESCE(SUM(cost_cents),0) AS spent,
            COALESCE(SUM(price_cents),0) AS earned,
            COALESCE(MAX(price_cents),0) AS best
     FROM openings WHERE user_id = $1`,
    [user.id]
  );
  return json(200, {
    id: Number(user.id),
    username: user.username,
    role: user.role,
    avatar: user.avatar ?? null,
    balanceCents: Number(user.balance_cents),
    banned: user.banned,
    settings: user.settings,
    inventory: { count: inv?.item_count ?? 0, valueCents: Number(inv?.total_value_cents ?? 0) },
    stats: {
      openings: Number(stats?.openings ?? 0),
      spentCents: Number(stats?.spent ?? 0),
      earnedCents: Number(stats?.earned ?? 0),
      bestDropCents: Number(stats?.best ?? 0)
    }
  });
});

// ../shared/src/index.ts
var RARITY_TIERS = ["mil_spec", "restricted", "classified", "covert", "rare_special"];
var DEFAULT_PROBABILITIES = {
  mil_spec: 79.92,
  restricted: 15.98,
  classified: 3.2,
  covert: 0.64,
  rare_special: 0.26
};

// src/util/rng.ts
function randFloat() {
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return buf[0] / 4294967296;
}
__name(randFloat, "randFloat");
function rollRarity(probs, emptyTiers) {
  const usable = RARITY_TIERS.filter((t) => !emptyTiers.has(t));
  const total = usable.reduce((s, t) => s + (probs[t] ?? 0), 0);
  if (total <= 0) throw new Error("no usable tier probabilities");
  let r = randFloat() * total;
  for (const t of usable) {
    r -= probs[t] ?? 0;
    if (r <= 0) return t;
  }
  return usable[usable.length - 1];
}
__name(rollRarity, "rollRarity");
function rollFloat(min, max) {
  return min + (max - min) * randFloat();
}
__name(rollFloat, "rollFloat");
function rollBool(p) {
  return randFloat() < p;
}
__name(rollBool, "rollBool");
function rollInt(n) {
  return Math.floor(randFloat() * n);
}
__name(rollInt, "rollInt");
function makeSeed() {
  return randomHex2(16);
}
__name(makeSeed, "makeSeed");
function randomHex2(bytes) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
__name(randomHex2, "randomHex");
var WEAR_RANGES = [
  { name: "Factory New", min: 0, max: 0.07 },
  { name: "Minimal Wear", min: 0.07, max: 0.15 },
  { name: "Field-Tested", min: 0.15, max: 0.38 },
  { name: "Well-Worn", min: 0.38, max: 0.45 },
  { name: "Battle-Scarred", min: 0.45, max: 1 }
];
function wearFromFloat(f) {
  const w = WEAR_RANGES.find((r) => f >= r.min && f < r.max);
  return w ? w.name : "Battle-Scarred";
}
__name(wearFromFloat, "wearFromFloat");

// src/util/value.ts
var WEAR_VALUE_RATIO = {
  "Factory New": 1.9,
  "Minimal Wear": 1.35,
  "Field-Tested": 1,
  "Well-Worn": 0.75,
  "Battle-Scarred": 0.5
};
var SOUVENIR_RATIO = 1.5;
function stattrakMultiplier(baseCents, category) {
  if ((category ?? "").toLowerCase() === "knives") return 0.925;
  if (baseCents < 1e3) return 1.75;
  if (baseCents <= 2e3) return 1.35;
  return 1.08;
}
__name(stattrakMultiplier, "stattrakMultiplier");
var TIER_BASE_VALUE_CENTS = {
  mil_spec: 300,
  restricted: 900,
  classified: 2500,
  covert: 9e3,
  rare_special: 85e3
};
async function resolveSteamPrice(itemId) {
  const rows = await query("SELECT wear, stattrak, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL", [itemId]);
  if (!rows.length) return null;
  const priced = rows.filter((r) => r.lowest_price_cents > 0);
  if (!priced.length) return null;
  return priced;
}
__name(resolveSteamPrice, "resolveSteamPrice");
function pickBestPrice(rows, input) {
  if (!rows.length) return null;
  const wear = input.wear;
  const exact = rows.find((r) => r.stattrak === input.stattrak && r.wear === wear);
  if (exact) return exact;
  const st = rows.find((r) => r.stattrak === input.stattrak);
  if (st) return st;
  const wearRow = rows.find((r) => r.wear === wear);
  if (wearRow) return wearRow;
  return rows.reduce((a, b) => a.lowest_price_cents <= b.lowest_price_cents ? a : b);
}
__name(pickBestPrice, "pickBestPrice");
function variantAdjustment(pattern, phase, seed) {
  let h = 5381;
  const s = `${pattern ?? ""}:${phase ?? ""}:${seed ?? ""}`;
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i) >>> 0;
  if (!h) return 0;
  const u = (h % 1e3 / 1e3 - 0.5) * 0.08;
  return u;
}
__name(variantAdjustment, "variantAdjustment");
function estimatedValueCents(input, priceRows) {
  const rows = input.stattrak ? priceRows.filter((r) => !r.stattrak) : priceRows;
  const row = pickBestPrice(rows, input);
  let value;
  let refWear;
  if (row) {
    value = Number(row.lowest_price_cents);
    refWear = row.wear === "any" ? null : row.wear;
  } else {
    value = TIER_BASE_VALUE_CENTS[input.tier] ?? TIER_BASE_VALUE_CENTS.mil_spec;
    refWear = null;
  }
  const target = input.wear ?? "Field-Tested";
  const rTarget = WEAR_VALUE_RATIO[target] ?? 1;
  const rRef = refWear ? WEAR_VALUE_RATIO[refWear] ?? 1 : 1;
  value = value * rTarget / rRef;
  if (input.stattrak) value *= stattrakMultiplier(value, input.category ?? null);
  if (input.souvenir) value *= SOUVENIR_RATIO;
  value *= 1 + variantAdjustment(input.pattern, input.phase, input.seed);
  return Math.max(1, Math.round(value));
}
__name(estimatedValueCents, "estimatedValueCents");

// src/services/opening.ts
async function loadCaseWithPools(caseId) {
  const c = await one(
    `SELECT c.id, c.name, c.image, c.cost_cents, c.probabilities, c.active
     FROM cases c WHERE c.id = $1`,
    [caseId]
  );
  if (!c) return null;
  const pools = { mil_spec: [], restricted: [], classified: [], covert: [], rare_special: [] };
  const rows = await query(
    `SELECT p.tier, pi.item_id AS id
     FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id
     WHERE p.case_id = $1`,
    [caseId]
  );
  for (const r of rows) {
    if (r.tier in pools) pools[r.tier].push(r.id);
  }
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    costCents: c.cost_cents,
    probabilities: js(c.probabilities) ?? {},
    active: c.active,
    pools
  };
}
__name(loadCaseWithPools, "loadCaseWithPools");
async function rollDrop(c) {
  const settings = await getSettings();
  const emptyTiers = new Set(RARITY_TIERS.filter((t) => !c.pools[t]?.length));
  const tier = rollRarity(c.probabilities, emptyTiers);
  const itemIds = c.pools[tier];
  const itemId = itemIds[rollInt(itemIds.length)];
  const item = await one("SELECT * FROM items WHERE id = $1", [itemId]);
  if (!item) throw httpError2(500, "pool item missing from catalog");
  const hasFloat = item.min_float != null && item.max_float != null && item.max_float > item.min_float;
  const floatValue = hasFloat ? rollFloat(Number(item.min_float), Number(item.max_float)) : null;
  const wear = floatValue != null ? wearFromFloat(floatValue) : null;
  const stattrak = Boolean(item.stattrak) && rollBool(settings.stattrakChance);
  const souvenir = Boolean(item.souvenir) && rollBool(settings.souvenirChance);
  const phaseCount = js(item.extra)?.phaseCount ?? 0;
  const phase = phaseCount > 0 ? rollInt(phaseCount) + 1 : null;
  const seed = makeSeed();
  const priceRows = await resolveSteamPrice(item.id);
  const priceCents = estimatedValueCents(
    { tier, floatValue, wear, stattrak, souvenir, pattern: item.pattern, phase, seed, category: item.category },
    priceRows ?? []
  );
  return { tier, item, floatValue, wear, stattrak, souvenir, phase, seed, priceCents };
}
__name(rollDrop, "rollDrop");
async function persistDrop(client, userId, c, d, chargeCents, balanceAfter) {
  if (chargeCents > 0) {
    const u = await client.query("SELECT balance_cents FROM users WHERE id = $1", [userId]);
    if (!u.rows.length) throw httpError2(401, "user gone");
    const after = balanceAfter ?? Number(u.rows[0].balance_cents);
    await client.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [userId, "case_open", -chargeCents, after, `case:${c.id}`]
    );
  }
  const instanceId = await client.insert(
    `INSERT INTO item_instances
       (item_id, user_id, rarity_tier, float_value, wear, stattrak, souvenir, pattern, phase, seed, price_cents, case_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [d.item.id, userId, d.tier, d.floatValue, d.wear, d.stattrak, d.souvenir, d.item.pattern, d.phase, d.seed, d.priceCents, c.id]
  );
  const openingId = await client.insert(
    `INSERT INTO openings (user_id, case_id, instance_id, rarity_tier, float_value, wear, item_name, price_cents, cost_cents, seed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [userId, c.id, instanceId, d.tier, d.floatValue, d.wear, d.item.name, d.priceCents, chargeCents, d.seed]
  );
  await client.query(
    `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
     VALUES ($1, 1, COALESCE($2,0), now())
     ON CONFLICT (user_id) DO UPDATE SET item_count = inventories.item_count + 1,
       total_value_cents = inventories.total_value_cents + COALESCE($2,0), updated_at = now()`,
    [userId, d.priceCents]
  );
  return { instanceId, openingId };
}
__name(persistDrop, "persistDrop");
async function openCase(hub, user, caseId) {
  const c = await loadCaseWithPools(caseId);
  if (!c) throw httpError2(404, "case not found");
  if (!c.active) throw httpError2(400, "case is not available");
  if (c.costCents == null) throw httpError2(400, "case has no price yet");
  const cost = c.costCents;
  const emptyTiers = new Set(RARITY_TIERS.filter((t) => !c.pools[t]?.length));
  if (emptyTiers.size === RARITY_TIERS.length) throw httpError2(400, "case has no pool items");
  const d = await rollDrop(c);
  const { tier, item, floatValue, wear, stattrak, souvenir, phase, seed, priceCents } = d;
  const result = await tx(async (client) => {
    const u = await client.query("SELECT id, balance_cents, banned FROM users WHERE id = $1", [user.id]);
    if (!u.rows.length) throw httpError2(401, "user gone");
    if (u.rows[0].banned) throw httpError2(403, "banned");
    const n = await client.update("UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2", [user.id, cost]);
    if (!n) throw httpError2(400, "insufficient balance");
    const u2 = await client.query("SELECT balance_cents FROM users WHERE id = $1", [user.id]);
    return persistDrop(client, user.id, c, d, 0, Number(u2.rows[0].balance_cents));
  });
  await run("INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)", [
    user.id,
    "case_opened",
    `case:${c.id}`,
    { openingId: result.openingId, item: item.name, tier, floatValue, wear, stattrak, souvenir, seed, priceCents }
  ]);
  const drop = {
    caseId: c.id,
    caseName: c.name,
    caseImage: c.image,
    instanceId: result.instanceId,
    itemName: item.name,
    weapon: item.weapon,
    image: item.image,
    rarityTier: tier,
    floatValue,
    wear,
    stattrak,
    souvenir,
    priceCents,
    costCents: cost,
    username: user.username ?? null
  };
  hub.broadcast("drop", drop);
  if (tier === "rare_special") {
    hub.broadcast("activity", { type: "rare_special", ...drop });
    if (user.username) {
      await pushNotification(hub, user.id, "rare_drop", "Rare Special drop!", `You won ${item.name} from ${c.name}.`);
    }
  }
  return {
    openingId: result.openingId,
    caseId: c.id,
    caseName: c.name,
    itemId: item.id,
    itemName: item.name,
    weapon: item.weapon,
    image: item.image,
    rarityTier: tier,
    floatValue,
    wear,
    stattrak,
    souvenir,
    pattern: item.pattern,
    phase,
    priceCents,
    costCents: c.costCents,
    instanceId: result.instanceId,
    seed
  };
}
__name(openCase, "openCase");
function httpError2(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}
__name(httpError2, "httpError");
async function refreshInventorySummary(userId) {
  await run(
    `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
     SELECT $1, COUNT(*), COALESCE(SUM(price_cents),0), now() FROM item_instances WHERE user_id = $1
     ON CONFLICT (user_id) DO UPDATE SET
       item_count = (SELECT COUNT(*) FROM item_instances WHERE user_id = $1),
       total_value_cents = (SELECT COALESCE(SUM(price_cents),0) FROM item_instances WHERE user_id = $1),
       updated_at = now()`,
    [userId]
  );
}
__name(refreshInventorySummary, "refreshInventorySummary");

// src/routes/catalog.ts
var PRICE_SUB = `COALESCE(
  (SELECT p.lowest_price_cents FROM prices p WHERE p.item_id = i.id AND p.stattrak = FALSE AND p.wear = 'Field-Tested'),
  (SELECT MIN(p.lowest_price_cents) FROM prices p WHERE p.item_id = i.id AND p.stattrak = FALSE)
)`;
route.get("/api/cases", async (req) => {
  const sort = req.query.get("sort") === "price" ? "price" : req.query.get("sort") === "name" ? "name" : "popular";
  const minPrice = req.query.get("minPrice") ? Number(req.query.get("minPrice")) : null;
  const maxPrice = req.query.get("maxPrice") ? Number(req.query.get("maxPrice")) : null;
  const collection = req.query.get("collection") ? String(req.query.get("collection")) : null;
  const limit = Math.min(Number(req.query.get("limit") ?? 48), 200);
  const offset = Number(req.query.get("offset") ?? 0);
  const order = sort === "price" ? "c.cost_cents ASC NULLS LAST" : sort === "name" ? "c.name ASC" : "openings DESC, c.name ASC";
  const params = [];
  let where = "c.active = TRUE";
  if (minPrice != null && !Number.isNaN(minPrice)) {
    params.push(minPrice);
    where += ` AND c.cost_cents >= $${params.length}`;
  }
  if (maxPrice != null && !Number.isNaN(maxPrice)) {
    params.push(maxPrice);
    where += ` AND c.cost_cents <= $${params.length}`;
  }
  if (collection) {
    params.push(`%${collection}%`);
    where += ` AND EXISTS (SELECT 1 FROM items i WHERE i.id = c.item_id AND i.collections LIKE $${params.length})`;
  }
  params.push(limit, offset);
  const rows = await query(
    `SELECT c.id, c.name, c.image, c.cost_cents, c.probabilities, c.first_sale_date,
            (SELECT COUNT(*) FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = c.id) AS item_count,
            (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) AS openings,
            (SELECT p.lowest_price_cents FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS steam_price,
            (SELECT p.volume FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS steam_volume,
            (SELECT p.updated_at FROM prices p JOIN items i ON i.id = p.item_id WHERE i.id = c.item_id LIMIT 1) AS price_updated_at
     FROM cases c
     WHERE ${where}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = await one(`SELECT COUNT(*) AS n FROM cases c WHERE ${where}`, params.slice(0, params.length - 2));
  return json(200, {
    items: rows.map((r) => ({ ...r, probabilities: js(r.probabilities) ?? {} })),
    total: Number(total?.n ?? 0)
  });
});
route.get("/api/cases/:id", async (req) => {
  const c = await one("SELECT * FROM cases WHERE id = $1", [Number(req.params.id)]);
  if (!c) throw httpError(404, "case not found");
  const contents = [];
  for (const tier of RARITY_TIERS) {
    const items = await query(
      `SELECT i.id, i.name, i.weapon, i.category, i.image, i.pattern, i.min_float, i.max_float, i.stattrak, i.souvenir,
              ${PRICE_SUB} AS price_cents
       FROM case_pools p
       JOIN case_pool_items pi ON pi.case_pool_id = p.id
       JOIN items i ON i.id = pi.item_id
       WHERE p.case_id = $1 AND p.tier = $2
       ORDER BY i.name`,
      [c.id, tier]
    );
    contents.push({ tier, items });
  }
  const price = await one("SELECT * FROM prices WHERE item_id = $1", [c.item_id]);
  return json(200, {
    ...c,
    probabilities: js(c.probabilities) ?? {},
    contents,
    price: price?.lowest_price_cents ?? null,
    volume: price?.volume ?? null,
    priceUpdatedAt: price?.updated_at ?? null
  });
});
route.post("/api/cases/:id/open", async (req, ctx) => {
  const user = await authUser(req);
  const result = await openCase(ctx.hub, user, Number(req.params.id));
  return json(200, result);
});
route.get("/api/items/popular", async () => {
  const rows = await query(
    `SELECT i.id, i.name, i.weapon, i.category, i.image, i.rarity_tier,
            ${PRICE_SUB} AS price_cents,
            (SELECT MAX(p.volume) FROM prices p WHERE p.item_id = i.id) AS volume
     FROM items i
     WHERE i.kind IN ('skin', 'knife', 'glove')
     ORDER BY volume DESC NULLS LAST, i.name
     LIMIT 24`
  );
  return json(200, { items: rows });
});
route.get("/api/items/:id", async (req) => {
  const i = await one("SELECT * FROM items WHERE id = $1", [Number(req.params.id)]);
  if (!i) throw httpError(404, "item not found");
  const prices = await itemPricesByWear(i.id);
  return json(200, { ...i, prices });
});
route.get("/api/home", async () => {
  const featured = await one(
    `SELECT c.id, c.name, c.image, c.cost_cents
     FROM cases c
     WHERE c.active = TRUE AND c.cost_cents IS NOT NULL
     ORDER BY (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) DESC, c.name
     LIMIT 1`
  );
  const cases = await query(
    `SELECT c.id, c.name, c.image, c.cost_cents,
            (SELECT COUNT(*) FROM openings o WHERE o.case_id = c.id) AS openings
     FROM cases c WHERE c.active = TRUE AND c.cost_cents IS NOT NULL
     ORDER BY openings DESC, c.name LIMIT 10`
  );
  const popularSkins = await query(
    `SELECT i.id, i.name, i.weapon, i.category, i.image, i.rarity_tier,
            ${PRICE_SUB} AS price_cents
     FROM items i
     WHERE i.kind IN ('skin', 'knife', 'glove')
     ORDER BY (SELECT MAX(p.volume) FROM prices p WHERE p.item_id = i.id) DESC NULLS LAST, i.name
     LIMIT 12`
  );
  const recentDrops = await query(
    `SELECT o.id, o.item_name, o.rarity_tier, o.price_cents, o.created_at,
            u.username, i.image, i.weapon
     FROM openings o
     JOIN users u ON u.id = o.user_id
     JOIN items i ON i.name = o.item_name
     ORDER BY o.created_at DESC
     LIMIT 12`
  );
  const activity = await query(
    `SELECT o.id, o.item_name, o.rarity_tier, o.price_cents, o.created_at, u.username
     FROM openings o JOIN users u ON u.id = o.user_id
     WHERE o.rarity_tier = 'rare_special'
     ORDER BY o.created_at DESC LIMIT 8`
  );
  return json(200, { featured, cases, popularSkins, recentDrops, activity });
});

// src/services/inventory.ts
var SORTS = {
  newest: "ii.created_at DESC",
  price_desc: "COALESCE(p.lowest_price_cents, ii.price_cents) DESC NULLS LAST",
  price_asc: "COALESCE(p.lowest_price_cents, ii.price_cents) ASC NULLS LAST",
  float_asc: "ii.float_value ASC NULLS LAST",
  float_desc: "ii.float_value DESC NULLS LAST",
  name: "i.name ASC"
};
async function listInventory(userId, f) {
  const limit = Math.min(Math.max(f.limit ?? 48, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const where = ["ii.user_id = $1"];
  const params = [userId];
  if (f.search) {
    params.push(`%${f.search}%`);
    where.push(`(i.name ILIKE $${params.length} OR i.weapon ILIKE $${params.length})`);
  }
  if (f.rarity) {
    params.push(f.rarity);
    where.push(`ii.rarity_tier = $${params.length}`);
  }
  const sort = SORTS[f.sort ?? "newest"] ?? SORTS.newest;
  params.push(limit, offset);
  const limitP = `$${params.length - 1}`;
  const offsetP = `$${params.length}`;
  const base = `
    FROM item_instances ii
    JOIN items i ON i.id = ii.item_id
    LEFT JOIN prices p ON p.item_id = ii.item_id AND p.stattrak = ii.stattrak
      AND p.wear = COALESCE(ii.wear, 'any')
    LEFT JOIN cases c ON c.id = ii.case_id
    WHERE ${where.join(" AND ")}`;
  const rows = await query(
    `SELECT ii.id, ii.item_id, i.name, i.weapon, i.category, i.image, i.pattern, i.min_float, i.max_float,
            ii.rarity_tier, ii.float_value, ii.wear, ii.stattrak, ii.souvenir, ii.phase, ii.seed,
            ii.price_cents, p.lowest_price_cents, c.name AS case_name, ii.created_at, ii.listed
     ${base}
     ORDER BY ${sort}
     LIMIT ${limitP} OFFSET ${offsetP}::int`,
    params
  );
  const countRow = await one(`SELECT COUNT(*)::int AS n ${base}`, params.slice(0, params.length - 2));
  return { items: rows, total: countRow?.n ?? 0 };
}
__name(listInventory, "listInventory");
async function getInstance(userId, instanceId) {
  return one(
    `SELECT ii.id, ii.item_id, i.name, i.weapon, i.category, i.image, i.pattern, i.min_float, i.max_float,
            ii.rarity_tier, ii.float_value, ii.wear, ii.stattrak, ii.souvenir, ii.phase, ii.seed,
            ii.price_cents, ii.listed, ii.created_at, ml.id AS listing_id, ml.price_cents AS listing_price
     FROM item_instances ii
     JOIN items i ON i.id = ii.item_id
     LEFT JOIN market_listings ml ON ml.instance_id = ii.id AND ml.status = 'active'
     WHERE ii.id = $1 AND ii.user_id = $2`,
    [instanceId, userId]
  );
}
__name(getInstance, "getInstance");
async function listHistory(userId, limit = 50, offset = 0) {
  const rows = await query(
    `SELECT o.id, o.rarity_tier, o.float_value, o.wear, o.item_name, o.price_cents, o.cost_cents, o.created_at,
            c.name AS case_name, c.image AS case_image, i.image, i.weapon
     FROM openings o
     JOIN cases c ON c.id = o.case_id
     JOIN items i ON i.name = o.item_name
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3::int`,
    [userId, Math.min(limit, 200), offset]
  );
  const total = await one("SELECT COUNT(*)::int AS n FROM openings WHERE user_id = $1", [userId]);
  return { items: rows, total: total?.n ?? 0 };
}
__name(listHistory, "listHistory");

// src/services/market.ts
async function createListing(userId, instanceId, priceCents) {
  if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 1e8) {
    throw httpError2(400, "invalid price");
  }
  const l = await tx(async (c) => {
    const inst = await c.query("SELECT * FROM item_instances WHERE id = $1 FOR UPDATE", [instanceId]);
    if (!inst.rows.length || Number(inst.rows[0].user_id) !== userId) throw httpError2(404, "instance not found");
    const existing = await c.query(
      "SELECT id FROM market_listings WHERE instance_id = $1 AND status = 'active'",
      [instanceId]
    );
    if (existing.rows.length) throw httpError2(400, "item already listed");
    const id = await c.insert(
      "INSERT INTO market_listings (instance_id, seller_id, price_cents, status) VALUES ($1,$2,$3,'active')",
      [instanceId, userId, priceCents]
    );
    await c.query("UPDATE item_instances SET listed = TRUE WHERE id = $1", [instanceId]);
    const row = await c.query("SELECT * FROM market_listings WHERE id = $1", [id]);
    return row.rows[0];
  });
  return l;
}
__name(createListing, "createListing");
async function cancelListing(userId, listingId) {
  const l = await one("SELECT * FROM market_listings WHERE id = $1 AND status = 'active'", [listingId]);
  if (!l) throw httpError2(404, "listing not found");
  if (l.seller_id !== userId) throw httpError2(403, "not your listing");
  await tx(async (c) => {
    await c.query("UPDATE market_listings SET status = 'cancelled' WHERE id = $1", [listingId]);
    await c.query("UPDATE item_instances SET listed = FALSE WHERE id = $1", [l.instance_id]);
  });
}
__name(cancelListing, "cancelListing");
async function buyListing(hub, buyerId, listingId) {
  const settings = await getSettings();
  const result = await tx(async (c) => {
    const l = await c.query("SELECT * FROM market_listings WHERE id = $1 AND status = 'active' FOR UPDATE", [listingId]);
    if (!l.rows.length) throw httpError2(404, "listing not found or sold");
    const listing = l.rows[0];
    if (listing.seller_id === buyerId) throw httpError2(400, "cannot buy your own listing");
    const buyer = await c.query("SELECT id, username, balance_cents FROM users WHERE id = $1", [buyerId]);
    if (!buyer.rows.length) throw httpError2(401, "user gone");
    const price = Number(listing.price_cents);
    const inst = await c.query("SELECT * FROM item_instances WHERE id = $1", [listing.instance_id]);
    if (!inst.rows.length) throw httpError2(404, "item gone");
    const fee = Math.round(price * settings.marketFeePct / 100);
    const sellerNet = price - fee;
    const seller = await c.query("SELECT id, username FROM users WHERE id = $1", [listing.seller_id]);
    if (!seller.rows.length) throw httpError2(400, "seller gone");
    const charged = await c.update("UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2", [buyerId, price]);
    if (!charged) throw httpError2(400, "insufficient balance");
    const flipped = await c.update("UPDATE market_listings SET status = 'sold', sold_to = $2, sold_at = now() WHERE id = $1 AND status = 'active'", [listingId, buyerId]);
    if (!flipped) throw httpError2(400, "listing not found or sold");
    const newBuyerBalance = Number(buyer.rows[0].balance_cents) - price;
    await c.query("UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1", [
      listing.seller_id,
      sellerNet
    ]);
    await c.query("UPDATE item_instances SET user_id = $2, listed = FALSE WHERE id = $1", [listing.instance_id, buyerId]);
    await c.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [buyerId, "market_buy", -price, newBuyerBalance, `listing:${listingId}`]
    );
    await c.query("INSERT INTO transactions (user_id, kind, amount_cents, ref) VALUES ($1,$2,$3,$4)", [
      listing.seller_id,
      "market_sell",
      sellerNet,
      `listing:${listingId}`
    ]);
    await c.query("INSERT INTO transactions (user_id, kind, amount_cents, ref) VALUES ($1,$2,$3,$4)", [
      listing.seller_id,
      "market_fee",
      -fee,
      `listing:${listingId}`
    ]);
    const item = await c.query("SELECT name FROM items i WHERE i.id = $1", [inst.rows[0].item_id]);
    return {
      price,
      fee,
      sellerNet,
      sellerId: listing.seller_id,
      item: item.rows[0]?.name ?? "item",
      listingId
    };
  });
  await pushNotification(hub, result.sellerId, "market", "Item sold", `${result.item} sold for $${(result.price / 100).toFixed(2)} (fee $${(result.fee / 100).toFixed(2)})`).catch(() => {
  });
  await pushNotification(hub, buyerId, "market", "Purchase complete", `${result.item} added to your inventory`).catch(() => {
  });
  hub.broadcast("market", { event: "sold", item: result.item, priceCents: result.price, listingId: result.listingId });
  return result;
}
__name(buyListing, "buyListing");
async function listMarket(limit = 48, offset = 0, search) {
  const lim = Math.min(Math.max(limit, 1), 200);
  const off2 = Math.max(offset, 0);
  const where = ["ml.status = 'active'"];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`i.name ILIKE $${params.length}`);
  }
  params.push(lim, off2);
  const rows = await query(
    `SELECT ml.id, ml.price_cents, ml.created_at, ml.instance_id, ml.seller_id,
            u.username AS seller_name,
            i.name, i.weapon, i.category, i.image, i.pattern,
            ii.rarity_tier, ii.float_value, ii.wear, ii.stattrak, ii.souvenir
     FROM market_listings ml
     JOIN item_instances ii ON ii.id = ml.instance_id
     JOIN items i ON i.id = ii.item_id
     JOIN users u ON u.id = ml.seller_id
     WHERE ${where.join(" AND ")}
     ORDER BY ml.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}::int`,
    params
  );
  const total = await one(
    `SELECT COUNT(*)::int AS n FROM market_listings ml
     JOIN item_instances ii ON ii.id = ml.instance_id
     JOIN items i ON i.id = ii.item_id
     WHERE ${where.join(" AND ")}`,
    params.slice(0, search ? 1 : 0)
  );
  return { items: rows, total: total?.n ?? 0 };
}
__name(listMarket, "listMarket");

// src/services/sell.ts
async function quickSellMany(hub, userId, instanceIds) {
  const ids = [...new Set(instanceIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw httpError2(400, "select at least one item");
  if (ids.length > 500) throw httpError2(400, "too many items");
  const settings = await getSettings();
  const out = await tx(async (c) => {
    const rows = (await c.query(
      `SELECT ii.*, i.name AS item_name, i.category
       FROM item_instances ii JOIN items i ON i.id = ii.item_id
       WHERE ii.id = ANY($1::bigint[])`,
      [ids]
    )).rows;
    if (rows.length !== ids.length) throw httpError2(400, "one or more items no longer exist");
    for (const r of rows) {
      if (Number(r.user_id) !== userId) throw httpError2(403, "one of the items is not yours");
      if (r.listed) throw httpError2(400, `${r.item_name} is listed on the market, cancel the listing first`);
    }
    await c.query("UPDATE openings SET instance_id = NULL WHERE instance_id = ANY($1::bigint[])", [ids]);
    const n = await c.update("DELETE FROM item_instances WHERE id = ANY($1::bigint[]) AND user_id = $2 AND listed = FALSE", [ids, userId]);
    if (n !== ids.length) throw httpError2(400, "one or more items are no longer sellable");
    let saleCents = 0;
    const names = [];
    for (const row of rows) {
      const priceRows = (await c.query(
        "SELECT wear, stattrak, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL",
        [row.item_id]
      )).rows;
      const valueCents = estimatedValueCents(
        {
          tier: row.rarity_tier,
          floatValue: row.float_value != null ? Number(row.float_value) : null,
          wear: row.wear,
          stattrak: Boolean(row.stattrak),
          souvenir: Boolean(row.souvenir),
          pattern: row.pattern,
          phase: row.phase,
          seed: row.seed,
          category: row.category
        },
        priceRows
      );
      saleCents += Math.max(1, Math.round(valueCents * settings.quickSellPct / 100));
      names.push(row.item_name);
    }
    const bal = (await c.query("SELECT balance_cents FROM users WHERE id = $1", [userId])).rows[0].balance_cents;
    await c.query("UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1", [userId, saleCents]);
    const before = Number(bal);
    await c.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [userId, "quick_sell", saleCents, before + saleCents, `instances:${ids.length}`]
    );
    await c.query("UPDATE openings SET instance_id = NULL WHERE instance_id = ANY($1::bigint[])", [ids]);
    await c.query("DELETE FROM market_listings WHERE instance_id = ANY($1::bigint[])", [ids]);
    return { saleCents, count: rows.length, names };
  });
  await pushNotification(
    hub,
    userId,
    "market",
    "Quick sell",
    `Sold ${out.count} item${out.count === 1 ? "" : "s"} for $${(out.saleCents / 100).toFixed(2)}`
  ).catch(() => {
  });
  await refreshInventorySummary(userId).catch(() => {
  });
  return out;
}
__name(quickSellMany, "quickSellMany");
async function quickSellItem(hub, userId, instanceId) {
  const settings = await getSettings();
  const out = await tx(async (c) => {
    const inst = await c.query(
      `SELECT ii.*, i.name AS item_name, i.category
       FROM item_instances ii JOIN items i ON i.id = ii.item_id
       WHERE ii.id = $1`,
      [instanceId]
    );
    if (!inst.rows.length) throw httpError2(404, "item not found");
    const row = inst.rows[0];
    if (Number(row.user_id) !== userId) throw httpError2(403, "not your item");
    if (row.listed) throw httpError2(400, "item is listed on the market, cancel the listing first");
    await c.query("UPDATE openings SET instance_id = NULL WHERE instance_id = $1", [instanceId]);
    const n = await c.update("DELETE FROM item_instances WHERE id = $1 AND user_id = $2 AND listed = FALSE", [instanceId, userId]);
    if (!n) throw httpError2(400, "item no longer sellable");
    const priceRows = (await c.query(
      "SELECT wear, stattrak, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL",
      [row.item_id]
    )).rows;
    const valueCents = estimatedValueCents(
      {
        tier: row.rarity_tier,
        floatValue: row.float_value != null ? Number(row.float_value) : null,
        wear: row.wear,
        stattrak: Boolean(row.stattrak),
        souvenir: Boolean(row.souvenir),
        pattern: row.pattern,
        phase: row.phase,
        seed: row.seed,
        category: row.category
      },
      priceRows
    );
    const saleCents = Math.max(1, Math.round(valueCents * settings.quickSellPct / 100));
    await c.query(
      "UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1",
      [userId, saleCents]
    );
    await c.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [userId, "quick_sell", saleCents, (await c.query("SELECT balance_cents FROM users WHERE id = $1", [userId])).rows[0].balance_cents, `instance:${instanceId}`]
    );
    await c.query("DELETE FROM market_listings WHERE instance_id = $1", [instanceId]);
    return { saleCents, valueCents, itemName: row.item_name };
  });
  await pushNotification(
    hub,
    userId,
    "market",
    "Quick sell",
    `Sold ${out.itemName} for $${(out.saleCents / 100).toFixed(2)}`
  ).catch(() => {
  });
  await refreshInventorySummary(userId).catch(() => {
  });
  return out;
}
__name(quickSellItem, "quickSellItem");

// src/routes/user.ts
route.get("/api/global/settings", async (req) => {
  await authUser(req);
  return json(200, await getSettings());
});
route.get("/api/inventory", async (req) => {
  const user = await authUser(req);
  const search = req.query.get("search") ?? void 0;
  const rarity = req.query.get("rarity") ?? void 0;
  const sort = req.query.get("sort") ?? void 0;
  const num = /* @__PURE__ */ __name((v, def) => v == null || v === "" || isNaN(Number(v)) ? def : Number(v), "num");
  return json(200, await listInventory(user.id, { search, rarity, sort, limit: num(req.query.get("limit"), 48), offset: num(req.query.get("offset"), 0) }));
});
route.get("/api/inventory/:instanceId", async (req) => {
  const user = await authUser(req);
  const inst = await getInstance(user.id, Number(req.params.instanceId));
  if (!inst) throw httpError2(404, "not found");
  const item = await one("SELECT * FROM items WHERE id = $1", [inst.item_id]);
  const prices = await one(
    "SELECT * FROM prices WHERE item_id = $1 AND stattrak = $2 ORDER BY updated_at DESC",
    [inst.item_id, inst.stattrak]
  );
  return json(200, { ...inst, item, prices });
});
route.post("/api/inventory/:instanceId/sell", async (req, ctx) => {
  const user = await authUser(req);
  const r = await quickSellItem(ctx.hub, user.id, Number(req.params.instanceId));
  return json(200, r);
});
route.post("/api/inventory/sell-many", async (req, ctx) => {
  const user = await authUser(req);
  const { instanceIds } = req.body ?? {};
  return json(200, await quickSellMany(ctx.hub, user.id, instanceIds ?? []));
});
route.get("/api/market", async (req) => {
  await authUser(req);
  return json(
    200,
    await listMarket(Number(req.query.get("limit")) || 48, Number(req.query.get("offset")) || 0, req.query.get("search") ?? void 0)
  );
});
route.post("/api/market/list", async (req) => {
  const user = await authUser(req);
  const { instanceId, priceCents } = req.body ?? {};
  return json(200, await createListing(user.id, Number(instanceId), Number(priceCents)));
});
route.post("/api/market/:listingId/cancel", async (req) => {
  const user = await authUser(req);
  await cancelListing(user.id, Number(req.params.listingId));
  return json(200, { ok: true });
});
route.post("/api/market/:listingId/buy", async (req, ctx) => {
  const user = await authUser(req);
  return json(200, await buyListing(ctx.hub, user.id, Number(req.params.listingId)));
});
route.get("/api/history", async (req) => {
  const user = await authUser(req);
  return json(200, await listHistory(user.id, Number(req.query.get("limit")) || 50, Number(req.query.get("offset")) || 0));
});
route.get("/api/leaderboard", async (req) => {
  const sort = String(req.query.get("sort") ?? "openings");
  const order = sort === "spent" ? "spent DESC, value DESC" : sort === "value" ? "value DESC, openings DESC" : sort === "best" ? "best DESC, value DESC" : "openings DESC, value DESC";
  const rows = await query(
    `SELECT u.id, u.username, u.avatar,
            COUNT(o.id) AS openings,
            COALESCE(SUM(o.cost_cents),0) AS spent,
            COALESCE(SUM(o.price_cents),0) AS value,
            COALESCE(MAX(o.price_cents),0) AS best,
            (SELECT i.name FROM openings o2 JOIN items i ON i.name = o2.item_name
               WHERE o2.user_id = u.id AND o2.price_cents = (SELECT MAX(o3.price_cents) FROM openings o3 WHERE o3.user_id = u.id)
               LIMIT 1) AS best_name
     FROM users u LEFT JOIN openings o ON o.user_id = u.id
     WHERE u.banned = FALSE
     GROUP BY u.id, u.username, u.avatar
     ORDER BY ${order}
     LIMIT 50`
  );
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), openings: Number(r.openings), spent: Number(r.spent), value: Number(r.value), best: Number(r.best) })) });
});
route.get("/api/profile", async (req) => {
  const user = await authUser(req);
  const stats = await one(
    `SELECT COUNT(*) AS openings,
            COALESCE(SUM(o.cost_cents),0) AS spent,
            COALESCE(SUM(o.price_cents),0) AS earned,
            (SELECT COUNT(*) FROM openings o2 WHERE o2.user_id = $1 AND o2.rarity_tier = 'rare_special') AS rare_drops,
            COALESCE(MAX(o.price_cents),0) AS best,
            (SELECT i.name FROM openings o2 JOIN items i ON i.name = o2.item_name
               WHERE o2.user_id = $1
               ORDER BY o2.price_cents DESC NULLS LAST LIMIT 1) AS best_name,
            MIN(o.created_at) AS first_opening
     FROM openings o WHERE o.user_id = $1`,
    [user.id]
  );
  const byTier = await query(
    "SELECT rarity_tier, COUNT(*) AS n FROM openings WHERE user_id = $1 GROUP BY rarity_tier",
    [user.id]
  );
  return json(200, {
    id: user.id,
    username: user.username,
    stats: {
      openings: Number(stats?.openings ?? 0),
      spent: Number(stats?.spent ?? 0),
      earned: Number(stats?.earned ?? 0),
      rare_drops: Number(stats?.rare_drops ?? 0),
      best: Number(stats?.best ?? 0),
      best_name: stats?.best_name ?? null,
      first_opening: stats?.first_opening ?? null,
      byTier
    }
  });
});
route.patch("/api/profile/settings", async (req) => {
  const user = await authUser(req);
  const body = req.body ?? {};
  const allowed = /* @__PURE__ */ new Set(["theme", "volume", "reducedMotion", "confirmOpen", "autoSkip", "showPrice", "showFloat", "showProbabilities", "sound", "language", "notifications", "quickSellConfirm", "skipQuickSellConfirm", "reelSpeed"]);
  const patch = {};
  for (const k of Object.keys(body)) {
    if (allowed.has(k)) patch[k] = body[k];
  }
  const merged = { ...user.settings ?? {}, ...patch };
  await run("UPDATE users SET settings = $2, updated_at = now() WHERE id = $1", [user.id, merged]);
  return json(200, { settings: merged });
});
route.get("/api/notifications", async (req) => {
  const user = await authUser(req);
  const rows = await query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30",
    [user.id]
  );
  const unread = await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read = FALSE", [user.id]);
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), read: Boolean(r.read), meta: js(r.meta) ?? null })), unread: Number(unread?.n ?? 0) });
});
route.post("/api/notifications/read", async (req) => {
  const user = await authUser(req);
  await run("UPDATE notifications SET read = TRUE WHERE user_id = $1", [user.id]);
  return json(200, { ok: true });
});
route.post("/api/notifications/:id/read", async (req) => {
  const user = await authUser(req);
  await run("UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2", [Number(req.params.id), user.id]);
  return json(200, { ok: true });
});

// src/data/api.ts
var RARITY_MAP = {
  "Consumer Grade": "mil_spec",
  "Industrial Grade": "mil_spec",
  "Mil-Spec Grade": "mil_spec",
  Restricted: "restricted",
  Classified: "classified",
  Covert: "covert",
  Extraordinary: "covert"
};
var WEAR_NAMES = {
  "Factory New": "Factory New",
  "Minimal Wear": "Minimal Wear",
  "Field-Tested": "Field-Tested",
  "Well-Worn": "Well-Worn",
  "Battle-Scarred": "Battle-Scarred"
};
function mapRarity(apiName) {
  if (!apiName) return "mil_spec";
  return RARITY_MAP[apiName] ?? "mil_spec";
}
__name(mapRarity, "mapRarity");
async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "cs2-case-opener/1.0" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
__name(fetchJson, "fetchJson");
async function loadCsgoApiData(base) {
  const skinsRaw = await fetchJson(`${base}/skins.json`);
  const cratesRaw = await fetchJson(`${base}/crates.json`);
  const skins = skinsRaw.map((s) => ({
    id: s.id,
    name: s.name,
    weapon: s.weapon?.name ?? null,
    category: s.category?.name ?? "Unknown",
    pattern: s.pattern?.name ?? null,
    paintIndex: s.paint_index ?? null,
    rarity: mapRarity(s.rarity?.name),
    minFloat: typeof s.min_float === "number" ? s.min_float : 0,
    maxFloat: typeof s.max_float === "number" ? s.max_float : 1,
    stattrak: Boolean(s.stattrak),
    souvenir: Boolean(s.souvenir),
    wears: (s.wears ?? []).map((w) => WEAR_NAMES[w.name]).filter(Boolean),
    image: s.image ?? null,
    crates: (s.crates ?? []).map((c) => ({ id: c.id, name: c.name })),
    collections: (s.collections ?? []).map((c) => c.name).filter(Boolean)
  }));
  const crates = cratesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    marketHashName: c.market_hash_name ?? c.name,
    image: c.image ?? null,
    type: c.type ?? null,
    firstSaleDate: c.first_sale_date ?? null,
    defIndex: typeof c.def_index === "number" ? c.def_index : null,
    contains: (c.contains ?? []).map((x) => ({ id: x.id, name: x.name, rarity: x.rarity?.name ?? "" })),
    containsRare: (c.contains_rare ?? []).map((x) => ({ id: x.id, name: x.name, rarity: x.rarity?.name ?? "" }))
  }));
  return { skins, crates };
}
__name(loadCsgoApiData, "loadCsgoApiData");

// src/case-definitions/kilowatt.json
var kilowatt_default = {
  case: "Kilowatt Case",
  probabilities: { mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 },
  pools: {
    rare_special: [
      "\u2605 Butterfly Knife | Fade",
      "\u2605 Karambit | Slaughter",
      "\u2605 Sport Gloves | Pandora's Box",
      "\u2605 Specialist Gloves | Emerald Web",
      "\u2605 Sport Gloves | Superconductor"
    ]
  },
  note: "Rare Special pool defined manually; API only lists Kukri variants in contains_rare. Requires manual validation against in-game case contents."
};

// src/case-definitions/clutch.json
var clutch_default = {
  case: "Clutch Case",
  probabilities: { mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 },
  pools: {
    rare_special: ["\u2605 Karambit | Fade", "\u2605 Karambit | Bright Water"]
  },
  note: "Rare Special pool defined manually. Requires manual validation."
};

// src/case-definitions/dreams-nightmares.json
var dreams_nightmares_default = {
  case: "Dreams & Nightmares Case",
  probabilities: { mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 },
  pools: {
    rare_special: [
      "\u2605 Karambit | Black Laminate",
      "\u2605 Bayonet | Black Laminate",
      "\u2605 M9 Bayonet | Black Laminate",
      "M4A4 | Howl"
    ]
  },
  note: "Rare Special pool defined manually. Requires manual validation."
};

// src/case-definitions/glove-case.json
var glove_case_default = {
  case: "Glove Case",
  probabilities: { mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 },
  pools: {
    rare_special: [
      "\u2605 Sport Gloves | Pandora's Box",
      "\u2605 Specialist Gloves | Crimson Weave"
    ]
  },
  note: "Glove Case: gloves come from API contains_rare (Covert tier by default). Two documented Rare Specials added manually. Requires manual validation."
};

// src/case-definitions/prism.json
var prism_default = {
  case: "Prism Case",
  probabilities: { mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 },
  pools: {
    rare_special: ["\u2605 Karambit | Vanilla", "\u2605 M9 Bayonet | Vanilla"]
  },
  note: "Rare Special pool defined manually. Requires manual validation."
};

// src/case-definitions/recoil.json
var recoil_default = {
  case: "Recoil Case",
  probabilities: { mil_spec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare_special: 0.26 },
  pools: {
    rare_special: [
      "\u2605 Karambit | Gamma Doppler",
      "\u2605 M9 Bayonet | Gamma Doppler",
      "\u2605 Bayonet | Gamma Doppler"
    ]
  },
  note: "Rare Special pool defined manually. Requires manual validation."
};

// src/data/caseDefinitions.ts
var FILES = {
  "kilowatt.json": kilowatt_default,
  "clutch.json": clutch_default,
  "dreams-nightmares.json": dreams_nightmares_default,
  "glove-case.json": glove_case_default,
  "prism.json": prism_default,
  "recoil.json": recoil_default
};
function loadCaseDefinitions(_dir) {
  const defs = /* @__PURE__ */ new Map();
  const warnings = [];
  for (const [f, raw] of Object.entries(FILES)) {
    const def = {
      case: raw.case,
      probabilities: raw.probabilities,
      pools: raw.pools,
      costCents: raw.costCents,
      note: raw.note
    };
    if (!def.case || !def.pools) {
      warnings.push(`${f}: missing "case" or "pools"`);
      continue;
    }
    for (const tier of Object.keys(def.pools)) {
      if (!Array.isArray(def.pools[tier])) {
        warnings.push(`${f}: pools.${tier} must be an array of item names`);
      }
    }
    defs.set(def.case, def);
  }
  return Promise.resolve({ defs, warnings });
}
__name(loadCaseDefinitions, "loadCaseDefinitions");

// src/data/sync.ts
var CASE_DEFINITIONS_DIR = "src/case-definitions";
function skinKind(category) {
  if (category === "Knives") return "knife";
  if (category === "Gloves") return "glove";
  return "skin";
}
__name(skinKind, "skinKind");
async function upsertSkin(s) {
  return insert(
    `INSERT INTO items (kind, market_hash_name, name, weapon, category, pattern, paint_index,
       rarity_tier, min_float, max_float, stattrak, souvenir, phase, image, collections, api_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,$13,$14,$15)
     ON CONFLICT (market_hash_name, kind)
     DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, weapon = EXCLUDED.weapon,
       category = EXCLUDED.category, pattern = EXCLUDED.pattern, paint_index = EXCLUDED.paint_index,
       rarity_tier = EXCLUDED.rarity_tier, min_float = EXCLUDED.min_float, max_float = EXCLUDED.max_float,
       stattrak = EXCLUDED.stattrak, souvenir = EXCLUDED.souvenir, image = EXCLUDED.image,
       collections = EXCLUDED.collections, api_id = EXCLUDED.api_id`,
    [
      skinKind(s.category),
      s.name,
      s.name,
      s.weapon,
      s.category,
      s.pattern,
      s.paintIndex,
      s.rarity,
      s.minFloat,
      s.maxFloat,
      s.stattrak,
      s.souvenir,
      s.image,
      s.collections,
      s.id
    ]
  );
}
__name(upsertSkin, "upsertSkin");
async function syncCatalog(data, defDir = CASE_DEFINITIONS_DIR) {
  const warnings = [];
  const defs = await loadCaseDefinitions(defDir);
  warnings.push(...defs.warnings);
  const skinByName = /* @__PURE__ */ new Map();
  for (const s of data.skins) {
    const id = await upsertSkin(s);
    skinByName.set(s.name, id);
  }
  let cases = 0;
  let pools = 0;
  let poolItems = 0;
  for (const c of data.crates) {
    if (c.type !== "Case") continue;
    if (!c.contains.length) continue;
    const def = defs.defs.get(c.name);
    const caseRow = { id: await insert(
      `INSERT INTO items (kind, market_hash_name, name, image, def_index, api_id)
       VALUES ('case', $1, $2, $3, $4, $5)
       ON CONFLICT (market_hash_name, kind)
       DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, def_index = EXCLUDED.def_index, api_id = EXCLUDED.api_id`,
      [c.marketHashName, c.name, c.image, c.defIndex, c.id]
    ) };
    const tierItems = /* @__PURE__ */ new Map();
    RARITY_TIERS.forEach((t) => tierItems.set(t, /* @__PURE__ */ new Set()));
    const crateItemIds = /* @__PURE__ */ new Set();
    const resolve = /* @__PURE__ */ __name((name) => {
      const id = skinByName.get(name);
      if (!id) {
        warnings.push(`case "${c.name}": item "${name}" not found in catalog (skipped)`);
        return null;
      }
      return id;
    }, "resolve");
    for (const entry of c.contains) {
      const id = resolve(entry.name);
      if (id == null) continue;
      const tier = mapApiTier(entry.rarity);
      tierItems.get(tier).add(id);
      crateItemIds.add(id);
    }
    for (const entry of c.containsRare) {
      const id = resolve(entry.name);
      if (id == null) continue;
      tierItems.get("rare_special").add(id);
      crateItemIds.add(id);
    }
    if (def?.pools) {
      for (const tierStr of Object.keys(def.pools)) {
        const names = def.pools[tierStr] ?? [];
        for (const name of names) {
          const id = skinByName.get(name);
          if (id == null) {
            warnings.push(`case "${c.name}": definition item "${name}" not in catalog (skipped)`);
            continue;
          }
          for (const t of RARITY_TIERS) tierItems.get(t).delete(id);
          tierItems.get(tierStr).add(id);
          crateItemIds.add(id);
        }
      }
    }
    const probabilities = def?.probabilities ?? DEFAULT_PROBABILITIES;
    const caseId = await insert(
      `INSERT INTO cases (item_id, name, market_hash_name, image, first_sale_date, def_index, probabilities, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, TRUE)
       ON CONFLICT (item_id) DO UPDATE SET
         name = EXCLUDED.name, image = EXCLUDED.image, probabilities = EXCLUDED.probabilities,
         def_index = EXCLUDED.def_index, active = TRUE, updated_at = now()`,
      [caseRow.id, c.name, c.marketHashName, c.image, c.firstSaleDate, c.defIndex ?? null, JSON.stringify(probabilities)]
    );
    cases++;
    await run("DELETE FROM case_pools WHERE case_id = $1", [caseId]);
    for (const tier of RARITY_TIERS) {
      const ids = [...tierItems.get(tier)];
      if (!ids.length) continue;
      const pool = { id: await insert("INSERT INTO case_pools (case_id, tier) VALUES ($1,$2)", [caseId, tier]) };
      pools++;
      for (const itemId of ids) {
        await run("INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [pool.id, itemId]);
        poolItems++;
      }
    }
    if (def?.costCents != null) {
      await run("UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1", [caseId, def.costCents]);
    }
  }
  const known = new Set(data.crates.filter((c) => c.type === "Case" && c.contains.length).map((c) => c.name));
  const allCases = await query("SELECT id, name FROM cases");
  for (const c of allCases) {
    if (!known.has(c.name) && !defs.defs.get(c.name)) {
      await run("UPDATE cases SET active = FALSE WHERE id = $1", [c.id]);
    }
  }
  await ensureCaseCosts();
  const auditDetail = { skins: data.skins.length, cases, pools, poolItems, warnings: warnings.slice(0, 50) };
  await run(
    "INSERT INTO audit_logs (action, target, detail) VALUES ($1,$2,$3::jsonb)",
    ["catalog_sync", "catalog", auditDetail]
  );
  return { skins: data.skins.length, cases, pools, poolItems, warnings };
}
__name(syncCatalog, "syncCatalog");
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i) >>> 0;
  return h;
}
__name(djb2, "djb2");
function fallbackCaseCostCents(name, firstSaleDate) {
  const year = firstSaleDate ? new Date(firstSaleDate).getFullYear() : 2015;
  const base = year < 2016 ? 149 : year < 2019 ? 299 : year < 2022 ? 599 : year < 2024 ? 999 : 1499;
  const jitter = djb2(name) % 21 - 10;
  return Math.max(50, Math.round(base * (100 + jitter) / 100));
}
__name(fallbackCaseCostCents, "fallbackCaseCostCents");
async function ensureCaseCosts() {
  const rows = await query(
    `SELECT c.id, c.name, c.first_sale_date, i.id AS item_id,
            p.lowest_price_cents AS steam_cents
     FROM cases c
     JOIN items i ON i.id = c.item_id
     LEFT JOIN prices p ON p.item_id = i.id AND p.wear = 'any' AND p.lowest_price_cents IS NOT NULL
     WHERE c.cost_cents IS NULL AND c.active = TRUE`
  );
  let n = 0;
  for (const r of rows) {
    const cost = r.steam_cents != null ? Math.max(1, Math.round(Number(r.steam_cents) * 1)) : fallbackCaseCostCents(r.name, r.first_sale_date);
    await run("UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1", [r.id, cost]);
    n++;
  }
  return n;
}
__name(ensureCaseCosts, "ensureCaseCosts");
function mapApiTier(apiName) {
  switch (apiName) {
    case "Restricted":
      return "restricted";
    case "Classified":
      return "classified";
    case "Covert":
    case "Extraordinary":
      return "covert";
    default:
      return "mil_spec";
  }
}
__name(mapApiTier, "mapApiTier");

// src/services/commands.ts
var HELP = `Commands:
  /help                          show this help
  /balance <user>                show user balance
  /setmoney <user> <amount>      set balance (dollars, e.g. 100 or 10.5)
  /give money <user> <amount>    add money (dollars)
  /give <user> <item name>       give an item (exact catalog name)
  /givecase <user> <case name>   give a case to the inventory
  /remove <user> <id|all>        remove inventory item by id, or all items
  /inventory <user>              list user inventory
  /price <item name>             show estimated value of an item
  /casecost <case name> <amount>  set case cost (dollars)
  /ban <user> | /unban <user>    ban / unban
  /stats                         server statistics
  /audit [n]                     last n audit entries (default 20)
  /password <new password>       change the admin password
  /delete <user>                 delete a user entirely (removes them from the leaderboard)
  /wipe <user>                   clear a user's openings + items (resets their leaderboard entry)
  /users [n]                     top n users by balance (default 10)
  /top [n]                       top n users by total opening value (default 10)
  /search <text>                 search catalog items by partial name
  /open <user> <case name>       open a case for a user (free drop)
  /caseinfo <case name>          case cost, probabilities and pool sizes
  /tx <user> [n]                 last n transactions of a user (default 10)`;
function moneyCents(s) {
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
__name(moneyCents, "moneyCents");
function fmt(cents) {
  return "$" + (cents / 100).toFixed(2);
}
__name(fmt, "fmt");
async function findUser(name) {
  return one("SELECT * FROM users WHERE username = $1", [String(name ?? "").toLowerCase().trim()]);
}
__name(findUser, "findUser");
async function findItem(name) {
  return one("SELECT * FROM items WHERE name = $1 AND kind != 'case'", [String(name ?? "").trim()]);
}
__name(findItem, "findItem");
async function createInstanceFor(user, item) {
  return tx(async (c) => {
    const hasFloat = item.min_float != null && item.max_float != null && item.max_float > item.min_float;
    const floatValue = hasFloat ? rollFloat(Number(item.min_float), Number(item.max_float)) : null;
    const wear = floatValue != null ? wearFromFloat(floatValue) : null;
    const seed = makeSeed();
    const priceRows = (await c.query(
      "SELECT wear, stattrak, lowest_price_cents FROM prices WHERE item_id = $1 AND lowest_price_cents IS NOT NULL",
      [item.id]
    )).rows;
    const valueCents = estimatedValueCents(
      {
        tier: item.rarity_tier,
        floatValue,
        wear,
        stattrak: false,
        souvenir: false,
        pattern: item.pattern,
        phase: null,
        seed
      },
      priceRows
    );
    const id = await c.insert(
      `INSERT INTO item_instances
         (item_id, user_id, rarity_tier, float_value, wear, stattrak, souvenir, pattern, phase, seed, price_cents)
       VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,$6,NULL,$7,$8)`,
      [item.id, user.id, item.rarity_tier, floatValue, wear, item.pattern, seed, valueCents]
    );
    await c.query(
      `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
       VALUES ($1, 1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET item_count = inventories.item_count + 1,
         total_value_cents = inventories.total_value_cents + $2, updated_at = now()`,
      [user.id, valueCents]
    );
    const row = await c.query("SELECT * FROM item_instances WHERE id = $1", [id]);
    return row.rows[0];
  });
}
__name(createInstanceFor, "createInstanceFor");
async function audit(adminId, action, target, detail) {
  await run("INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)", [
    adminId,
    action,
    target,
    detail
  ]);
}
__name(audit, "audit");
async function runAdminCommand(admin, raw) {
  const input = String(raw ?? "").trim();
  if (!input) return { ok: false, output: "empty command" };
  const tokens = input.split(/\s+/);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  try {
    switch (cmd) {
      case "/help":
        return { ok: true, output: HELP };
      case "/balance": {
        if (!args[0]) return { ok: false, output: "usage: /balance <user>" };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        await audit(admin.id, "cmd_balance", u.username, {});
        return { ok: true, output: `${u.username}: ${fmt(Number(u.balance_cents))}` };
      }
      case "/setmoney": {
        if (!args[0] || args[1] == null) return { ok: false, output: "usage: /setmoney <user> <amount>" };
        const cents = moneyCents(args[1]);
        if (cents == null || cents < 0) return { ok: false, output: "invalid amount" };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        await run("UPDATE users SET balance_cents = $2, updated_at = now() WHERE id = $1", [u.id, cents]);
        await run(
          "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
          [u.id, "admin_set", cents - Number(u.balance_cents), cents, "console:/setmoney"]
        );
        await audit(admin.id, "cmd_setmoney", u.username, { cents });
        return { ok: true, output: `${u.username} balance set to ${fmt(cents)}` };
      }
      case "/give": {
        if (args[0]?.toLowerCase() === "money") {
          if (!args[1] || args[2] == null) return { ok: false, output: "usage: /give money <user> <amount>" };
          const cents = moneyCents(args[2]);
          if (cents == null || cents <= 0) return { ok: false, output: "invalid amount" };
          const u2 = await findUser(args[1]);
          if (!u2) return { ok: false, output: `user "${args[1]}" not found` };
          await run("UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1", [u2.id, cents]);
          await run(
            "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
            [u2.id, "admin_give", cents, Number(u2.balance_cents) + cents, "console:/give money"]
          );
          await audit(admin.id, "cmd_give_money", u2.username, { cents });
          return { ok: true, output: `gave ${fmt(cents)} to ${u2.username}` };
        }
        const name = args[0];
        const itemName = args.slice(1).join(" ");
        if (!name || !itemName) return { ok: false, output: "usage: /give <user> <item name>" };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        const item = await findItem(itemName);
        if (!item) return { ok: false, output: `item "${itemName}" not in catalog` };
        const inst = await createInstanceFor(u, item);
        await refreshInventorySummary(u.id).catch(() => {
        });
        await audit(admin.id, "cmd_give_item", u.username, { item: item.name, instanceId: inst.id });
        return { ok: true, output: `gave ${item.name} to ${u.username} (instance ${inst.id})` };
      }
      case "/givecase": {
        const name = args[0];
        const caseName = args.slice(1).join(" ");
        if (!name || !caseName) return { ok: false, output: "usage: /givecase <user> <case name>" };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        const item = await one(`SELECT * FROM items WHERE kind = 'case' AND name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!item) return { ok: false, output: `case "${caseName}" not found` };
        const inst = await createInstanceFor(u, item);
        await refreshInventorySummary(u.id).catch(() => {
        });
        await audit(admin.id, "cmd_give_case", u.username, { item: item.name, instanceId: inst.id });
        return { ok: true, output: `gave ${item.name} to ${u.username} (instance ${inst.id})` };
      }
      case "/remove": {
        const name = args[0];
        const what = args[1];
        if (!name || !what) return { ok: false, output: "usage: /remove <user> <instance id | all>" };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        if (what === "all") {
          const rows = await query("SELECT id FROM item_instances WHERE user_id = $1", [u.id]);
          for (const r of rows) {
            await run("UPDATE openings SET instance_id = NULL WHERE instance_id = $1", [r.id]);
            await run("DELETE FROM market_listings WHERE instance_id = $1", [r.id]);
            await run("DELETE FROM item_instances WHERE id = $1", [r.id]);
          }
          await refreshInventorySummary(u.id).catch(() => {
          });
          await audit(admin.id, "cmd_remove_all", u.username, { count: rows.length });
          return { ok: true, output: `removed ${rows.length} items from ${u.username}` };
        }
        const id = Number(what);
        if (!Number.isInteger(id)) return { ok: false, output: "invalid instance id" };
        const inst = await one("SELECT * FROM item_instances WHERE id = $1 AND user_id = $2", [id, u.id]);
        if (!inst) return { ok: false, output: `instance ${id} not in ${u.username} inventory` };
        if (inst.listed) return { ok: false, output: "item is listed on the market, cancel the listing first" };
        await run("UPDATE openings SET instance_id = NULL WHERE instance_id = $1", [id]);
        await run("DELETE FROM market_listings WHERE instance_id = $1", [id]);
        await run("DELETE FROM item_instances WHERE id = $1", [id]);
        await refreshInventorySummary(u.id).catch(() => {
        });
        await audit(admin.id, "cmd_remove", u.username, { instanceId: id });
        return { ok: true, output: `removed instance ${id} from ${u.username}` };
      }
      case "/inventory": {
        if (!args[0]) return { ok: false, output: "usage: /inventory <user>" };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        const rows = await query(
          `SELECT ii.id, i.name, ii.wear, ii.float_value, ii.price_cents
           FROM item_instances ii JOIN items i ON i.id = ii.item_id
           WHERE ii.user_id = $1 ORDER BY ii.created_at DESC LIMIT 30`,
          [u.id]
        );
        if (!rows.length) return { ok: true, output: `${u.username} has no items` };
        const lines = rows.map(
          (r) => `#${r.id} ${r.name}${r.wear ? ` (${r.wear})` : ""} - ${fmt(r.price_cents ?? 0)}`
        );
        await audit(admin.id, "cmd_inventory", u.username, {});
        return { ok: true, output: lines.join("\n") };
      }
      case "/price": {
        const itemName = args.join(" ");
        if (!itemName) return { ok: false, output: "usage: /price <item name>" };
        const item = await findItem(itemName);
        if (!item) return { ok: false, output: `item "${itemName}" not in catalog` };
        const rows = await resolveSteamPrice(item.id);
        const value = estimatedValueCents(
          { tier: item.rarity_tier, floatValue: null, wear: null, stattrak: false, souvenir: false, pattern: item.pattern, phase: null, seed: null },
          rows ?? []
        );
        const steam = rows?.length ? `Steam lowest ask: ${fmt(Math.min(...rows.map((r) => Number(r.lowest_price_cents))))}` : "no Steam price yet";
        await audit(admin.id, "cmd_price", item.name, {});
        return { ok: true, output: `${item.name}: estimated ${fmt(value)}
${steam}` };
      }
      case "/casecost": {
        const amount = args[args.length - 1];
        const caseName = args.slice(0, -1).join(" ");
        const cents = moneyCents(amount);
        if (!caseName || cents == null || cents < 1) return { ok: false, output: "usage: /casecost <case name> <amount>" };
        const c = await one(`SELECT * FROM cases WHERE name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!c) return { ok: false, output: `case "${caseName}" not found` };
        await run("UPDATE cases SET cost_cents = $2, updated_at = now() WHERE id = $1", [c.id, cents]);
        await audit(admin.id, "cmd_casecost", c.name, { cents });
        return { ok: true, output: `${c.name} cost set to ${fmt(cents)}` };
      }
      case "/ban":
      case "/unban": {
        if (!args[0]) return { ok: false, output: `usage: ${cmd} <user>` };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        if (u.role === "admin") return { ok: false, output: "cannot ban an admin" };
        const banned = cmd === "/ban";
        await run("UPDATE users SET banned = $2, updated_at = now() WHERE id = $1", [u.id, banned]);
        await run("DELETE FROM sessions WHERE user_id = $1", [u.id]);
        await audit(admin.id, banned ? "cmd_ban" : "cmd_unban", u.username, {});
        return { ok: true, output: `${u.username} ${banned ? "banned" : "unbanned"}` };
      }
      case "/stats": {
        const s = await one(
          `SELECT (SELECT COUNT(*) FROM users)::int AS users,
                  (SELECT COUNT(*) FROM items WHERE kind != 'case')::int AS items,
                  (SELECT COUNT(*) FROM cases)::int AS cases,
                  (SELECT COUNT(*) FROM item_instances)::int AS instances,
                  (SELECT COUNT(*) FROM openings)::int AS openings,
                  (SELECT COALESCE(SUM(cost_cents),0)::bigint FROM openings) AS spent`
        );
        await audit(admin.id, "cmd_stats", "server", {});
        return {
          ok: true,
          output: `users: ${s.users}
items: ${s.items}
cases: ${s.cases}
instances: ${s.instances}
openings: ${s.openings}
total spent: ${fmt(Number(s.spent))}`
        };
      }
      case "/audit": {
        const n = Math.min(Math.max(Number(args[0]) || 20, 1), 100);
        const rows = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1", [n]);
        await audit(admin.id, "cmd_audit", "server", {});
        if (!rows.length) return { ok: true, output: "no audit entries" };
        return {
          ok: true,
          output: rows.map((r) => `${new Date(r.created_at).toLocaleString()} ${r.action} ${r.target}`.trim()).join("\n")
        };
      }
      case "/password": {
        const np = args.join(" ");
        if (!np || np.length < 6) return { ok: false, output: "usage: /password <new password> (min 6 chars)" };
        const hash = await hashPassword(np);
        await run("UPDATE users SET pass_hash = $2, updated_at = now() WHERE id = $1", [admin.id, hash]);
        await audit(admin.id, "cmd_password", "admin", {});
        return { ok: true, output: "admin password changed" };
      }
      case "/delete": {
        if (!args[0]) return { ok: false, output: "usage: /delete <user>" };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        if (u.role === "admin") return { ok: false, output: "cannot delete an admin" };
        if (Number(u.id) === admin.id) return { ok: false, output: "cannot delete yourself" };
        await run("UPDATE market_listings SET sold_to = NULL WHERE sold_to = $1", [u.id]);
        await run("UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1", [u.id]);
        await run("DELETE FROM users WHERE id = $1", [u.id]);
        await audit(admin.id, "cmd_delete", u.username, { userId: Number(u.id) });
        return { ok: true, output: `user ${u.username} deleted (account, items, history, leaderboard entry)` };
      }
      case "/wipe": {
        if (!args[0]) return { ok: false, output: "usage: /wipe <user>" };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        if (u.role === "admin") return { ok: false, output: "cannot wipe an admin" };
        await run("UPDATE market_listings SET sold_to = NULL WHERE sold_to = $1", [u.id]);
        await run("DELETE FROM openings WHERE user_id = $1", [u.id]);
        const inst = await query("SELECT id FROM item_instances WHERE user_id = $1", [u.id]);
        if (inst.length) {
          const ids = inst.map((r) => r.id);
          await run("DELETE FROM market_listings WHERE instance_id = ANY($1::bigint[])", [ids]);
          await run("DELETE FROM item_instances WHERE id = ANY($1::bigint[])", [ids]);
        }
        await refreshInventorySummary(u.id).catch(() => {
        });
        await audit(admin.id, "cmd_wipe", u.username, { items: inst.length });
        return { ok: true, output: `wiped ${u.username}: openings + ${inst.length} items removed, balance kept` };
      }
      case "/users": {
        const n = Math.min(Math.max(Number(args[0]) || 10, 1), 50);
        const rows = await query(
          "SELECT id, username, balance_cents, banned, role FROM users ORDER BY balance_cents DESC LIMIT $1",
          [n]
        );
        await audit(admin.id, "cmd_users", "server", {});
        return { ok: true, output: rows.map((r) => `#${r.id} ${r.username} - ${fmt(Number(r.balance_cents))}${r.banned ? " (banned)" : ""}${r.role === "admin" ? " (admin)" : ""}`).join("\n") };
      }
      case "/top": {
        const n = Math.min(Math.max(Number(args[0]) || 10, 1), 50);
        const rows = await query(
          `SELECT u.username, COUNT(o.id)::int AS openings, COALESCE(SUM(o.price_cents),0)::bigint AS value
           FROM users u JOIN openings o ON o.user_id = u.id
           GROUP BY u.id, u.username ORDER BY value DESC LIMIT $1`,
          [n]
        );
        await audit(admin.id, "cmd_top", "server", {});
        if (!rows.length) return { ok: true, output: "no openings yet" };
        return { ok: true, output: rows.map((r, i) => `${i + 1}. ${r.username} - ${r.openings} openings, ${fmt(Number(r.value))} total`).join("\n") };
      }
      case "/search": {
        const text = args.join(" ");
        if (!text) return { ok: false, output: "usage: /search <item name fragment>" };
        const rows = await query(
          `SELECT id, name, rarity_tier, kind FROM items WHERE name ILIKE $1 AND kind != 'case' ORDER BY name LIMIT 10`,
          [`%${text}%`]
        );
        if (!rows.length) return { ok: true, output: `no items match "${text}"` };
        return { ok: true, output: rows.map((r) => `#${r.id} [${r.rarity_tier}] ${r.name}`).join("\n") };
      }
      case "/open": {
        const name = args[0];
        const caseName = args.slice(1).join(" ");
        if (!name || !caseName) return { ok: false, output: "usage: /open <user> <case name>" };
        const u = await findUser(name);
        if (!u) return { ok: false, output: `user "${name}" not found` };
        const cRow = await one(`SELECT id FROM cases WHERE name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!cRow) return { ok: false, output: `case "${caseName}" not found` };
        const c = await loadCaseWithPools(Number(cRow.id));
        if (!c) return { ok: false, output: "case not found" };
        const d = await rollDrop(c);
        const res = await tx(async (client) => {
          const p = await persistDrop(client, Number(u.id), c, d, 0);
          return p;
        });
        await refreshInventorySummary(u.id).catch(() => {
        });
        await audit(admin.id, "cmd_open", u.username, { case: c.name, item: d.item.name, instanceId: res.instanceId });
        return { ok: true, output: `opened ${c.name} for ${u.username}: ${d.item.name} (${fmt(d.priceCents)}, instance ${res.instanceId})` };
      }
      case "/caseinfo": {
        const caseName = args.join(" ");
        if (!caseName) return { ok: false, output: "usage: /caseinfo <case name>" };
        const c = await one(`SELECT * FROM cases WHERE name ILIKE $1 LIMIT 1`, [`%${caseName}%`]);
        if (!c) return { ok: false, output: `case "${caseName}" not found` };
        const pools = js(c.probabilities) ?? {};
        const counts = await query(
          "SELECT p.tier, COUNT(DISTINCT pi.item_id)::int AS n FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = $1 GROUP BY p.tier",
          [c.id]
        );
        const lines = Object.entries(pools).map(([tier, p]) => {
          const n = counts.find((r) => r.tier === tier)?.n ?? 0;
          return `  ${tier}: ${(Number(p) * 100).toFixed(2)}% (${n} items)`;
        });
        await audit(admin.id, "cmd_caseinfo", c.name, {});
        return { ok: true, output: `${c.name}
cost: ${fmt(Number(c.cost_cents))}
${lines.join("\n")}` };
      }
      case "/tx": {
        if (!args[0]) return { ok: false, output: "usage: /tx <user> [n]" };
        const u = await findUser(args[0]);
        if (!u) return { ok: false, output: `user "${args[0]}" not found` };
        const n = Math.min(Math.max(Number(args[1]) || 10, 1), 50);
        const rows = await query(
          "SELECT created_at, kind, amount_cents, ref FROM transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
          [u.id, n]
        );
        await audit(admin.id, "cmd_tx", u.username, {});
        if (!rows.length) return { ok: true, output: `${u.username} has no transactions` };
        return { ok: true, output: rows.map((r) => `${new Date(r.created_at).toLocaleString()} ${r.kind} ${Number(r.amount_cents) >= 0 ? "+" : ""}${fmt(Number(r.amount_cents))} (${r.ref})`).join("\n") };
      }
      default:
        return { ok: false, output: `unknown command "${cmd}". Try /help` };
    }
  } catch (e) {
    return { ok: false, output: `error: ${e.message}` };
  }
}
__name(runAdminCommand, "runAdminCommand");

// src/routes/admin.ts
var audit2 = /* @__PURE__ */ __name((actor, action, target, detail) => run("INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4)", [actor, action, target, detail]), "audit");
route.post("/api/admin/unlock", async (req) => {
  const password = String((req.body ?? {}).password ?? "");
  if (!password) throw httpError(400, "password required");
  const admin = await one("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (!admin) throw httpError(404, "no admin account");
  const ok = await verifyPassword(password, String(admin.pass_hash));
  if (!ok) throw httpError(401, "invalid admin password");
  const token = await createSession(Number(admin.id));
  await audit2(null, "admin_unlock", admin.username, {}).catch(() => {
  });
  return json(200, { token, user: { id: Number(admin.id), username: admin.username, role: admin.role } });
});
route.get("/api/admin/stats", async (req) => {
  requireAdmin(await authUser(req));
  const s = await one(
    `SELECT (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM items WHERE kind != 'case') AS items,
            (SELECT COUNT(*) FROM cases) AS cases,
            (SELECT COUNT(*) FROM item_instances) AS instances,
            (SELECT COUNT(*) FROM openings) AS openings,
            (SELECT COUNT(*) FROM market_listings WHERE status = 'active') AS active_listings,
            (SELECT COALESCE(SUM(price_cents),0) FROM openings) AS total_dropped_value,
            (SELECT COALESCE(SUM(cost_cents),0) FROM openings) AS total_spent`
  );
  const perTier = await query(
    "SELECT rarity_tier, COUNT(*) AS n FROM openings GROUP BY rarity_tier ORDER BY rarity_tier"
  );
  const recent = await query("SELECT * FROM openings ORDER BY created_at DESC LIMIT 15");
  return json(200, {
    stats: {
      users: Number(s?.users ?? 0),
      items: Number(s?.items ?? 0),
      cases: Number(s?.cases ?? 0),
      instances: Number(s?.instances ?? 0),
      openings: Number(s?.openings ?? 0),
      active_listings: Number(s?.active_listings ?? 0),
      total_dropped_value: Number(s?.total_dropped_value ?? 0),
      total_spent: Number(s?.total_spent ?? 0)
    },
    perTier,
    recent
  });
});
route.get("/api/admin/users", async (req) => {
  requireAdmin(await authUser(req));
  const search = req.query.get("search") ? `%${req.query.get("search")}%` : null;
  const rows = search ? await query("SELECT id, username, role, balance_cents, banned, created_at FROM users WHERE username LIKE $1 ORDER BY id LIMIT 100", [search]) : await query("SELECT id, username, role, balance_cents, banned, created_at FROM users ORDER BY id LIMIT 100");
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), balance_cents: Number(r.balance_cents), banned: Boolean(r.banned) })) });
});
route.post("/api/admin/users/:id/ban", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const { banned } = req.body ?? {};
  const target = await one("SELECT id, username FROM users WHERE id = $1", [id]);
  if (!target) throw httpError(404, "user not found");
  if (target.role === "admin") throw httpError(400, "cannot ban admin");
  await run("UPDATE users SET banned = $2, updated_at = now() WHERE id = $1", [id, Boolean(banned)]);
  await run("DELETE FROM sessions WHERE user_id = $1", [id]);
  await audit2(admin.id, banned ? "user_banned" : "user_unbanned", target.username, {});
  return json(200, { ok: true });
});
route.post("/api/admin/users/:id/balance", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const { deltaCents, reason } = req.body ?? {};
  if (!Number.isInteger(deltaCents) || Math.abs(deltaCents) > 1e8) {
    throw httpError(400, "invalid deltaCents");
  }
  const target = await one("SELECT id, username, balance_cents FROM users WHERE id = $1", [id]);
  if (!target) throw httpError(404, "user not found");
  if (Number(target.balance_cents) + deltaCents < 0) throw httpError(400, "resulting balance negative");
  await run("UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1", [id, deltaCents]);
  await run(
    "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
    [id, "admin_adjust", deltaCents, Number(target.balance_cents) + deltaCents, reason ?? "admin"]
  );
  await audit2(admin.id, "balance_adjust", target.username, { deltaCents, reason });
  return json(200, { ok: true, newBalance: Number(target.balance_cents) + deltaCents });
});
route.get("/api/admin/users/:id/inventory", async (req) => {
  requireAdmin(await authUser(req));
  const rows = await query(
    `SELECT ii.id, i.name, ii.rarity_tier, ii.float_value, ii.wear, ii.price_cents, ii.created_at
     FROM item_instances ii JOIN items i ON i.id = ii.item_id
     WHERE ii.user_id = $1 ORDER BY ii.created_at DESC LIMIT 200`,
    [Number(req.params.id)]
  );
  return json(200, { items: rows });
});
route.patch("/api/admin/cases/:id", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const { costCents, probabilities, active } = req.body ?? {};
  const c = await one("SELECT id, name FROM cases WHERE id = $1", [id]);
  if (!c) throw httpError(404, "case not found");
  if (costCents != null && (!Number.isInteger(costCents) || costCents < 0)) {
    throw httpError(400, "invalid costCents");
  }
  if (probabilities != null) {
    for (const k of Object.keys(probabilities)) {
      if (!RARITY_TIERS.includes(k) || typeof probabilities[k] !== "number") {
        throw httpError(400, `invalid probability for ${k}`);
      }
    }
  }
  const updates = [];
  const params = [];
  if (costCents != null) {
    params.push(costCents);
    updates.push(`cost_cents = $${params.length}`);
  }
  if (probabilities != null) {
    params.push(JSON.stringify(probabilities));
    updates.push(`probabilities = $${params.length}`);
  }
  if (active != null) {
    params.push(Boolean(active));
    updates.push(`active = $${params.length}`);
  }
  if (!updates.length) return json(200, { ok: true });
  params.push(id);
  await run(`UPDATE cases SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
  await audit2(admin.id, "case_updated", c.name, { costCents, probabilities, active });
  return json(200, { ok: true });
});
route.post("/api/admin/cases/:id/pools/:tier/items", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const tier = req.params.tier;
  const { itemName } = req.body ?? {};
  if (!RARITY_TIERS.includes(tier)) throw httpError(400, "bad tier");
  if (!itemName || typeof itemName !== "string") throw httpError(400, "itemName required");
  const item = await one("SELECT id, name FROM items WHERE name = $1 AND kind != 'case'", [itemName]);
  if (!item) throw httpError(404, "item not in catalog");
  const pool = await one("SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2", [id, tier]);
  if (!pool) throw httpError(404, "pool not found");
  await run("INSERT INTO case_pool_items (case_pool_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [pool.id, item.id]);
  for (const t of RARITY_TIERS) {
    if (t !== tier) {
      const other = await one("SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2", [id, t]);
      if (other) await run("DELETE FROM case_pool_items WHERE case_pool_id = $1 AND item_id = $2", [other.id, item.id]);
    }
  }
  await audit2(admin.id, "pool_item_added", `case:${id}:${tier}`, { item: item.name });
  return json(200, { ok: true, itemId: item.id });
});
route.del("/api/admin/cases/:id/pools/:tier/items/:itemId", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const id = Number(req.params.id);
  const tier = req.params.tier;
  const itemId = Number(req.params.itemId);
  const pool = await one("SELECT id FROM case_pools WHERE case_id = $1 AND tier = $2", [id, tier]);
  if (pool) await run("DELETE FROM case_pool_items WHERE case_pool_id = $1 AND item_id = $2", [pool.id, itemId]);
  await audit2(admin.id, "pool_item_removed", `case:${id}:${tier}`, { itemId });
  return json(200, { ok: true });
});
route.post("/api/admin/sync/catalog", async (req) => {
  const admin = requireAdmin(await authUser(req));
  try {
    const data = await loadCsgoApiData(config2.csgoApiBase);
    const result = await syncCatalog(data);
    await audit2(admin.id, "catalog_sync_triggered", "catalog", result);
    return json(200, result);
  } catch (e) {
    await audit2(admin.id, "catalog_sync_failed", "catalog", { error: e.message });
    throw httpError(502, e.message);
  }
});
route.post("/api/admin/sync/prices", async (req, ctx) => {
  const admin = requireAdmin(await authUser(req));
  const { caseIds } = req.body ?? {};
  const prices = ctx.prices;
  let list;
  if (Array.isArray(caseIds) && caseIds.length) {
    list = await query("SELECT * FROM cases WHERE id = ANY($1)", [caseIds]);
  } else {
    list = await query("SELECT * FROM cases WHERE active = TRUE ORDER BY name LIMIT 25");
  }
  let enqueued = 0;
  for (const c of list) {
    const item = await one("SELECT * FROM items WHERE id = $1", [c.item_id]);
    if (item) enqueued += prices.request({ itemId: item.id, mhn: c.market_hash_name ?? c.name, wear: "any", stattrak: false }) ? 1 : 0;
  }
  await audit2(admin.id, "price_sync_triggered", "prices", { caseCount: list.length, enqueued });
  void prices.run();
  return json(200, { ok: true, queued: enqueued, pending: prices.pending });
});
route.get("/api/admin/prices", async (req, ctx) => {
  requireAdmin(await authUser(req));
  const search = req.query.get("search") ? `%${req.query.get("search")}%` : null;
  const rows = search ? await query(
    `SELECT p.item_id, i.name, p.wear, p.stattrak, p.lowest_price_cents, p.volume, p.source, p.updated_at
         FROM prices p JOIN items i ON i.id = p.item_id WHERE i.name LIKE $1 ORDER BY p.updated_at DESC LIMIT 100`,
    [search]
  ) : await query(
    `SELECT p.item_id, i.name, p.wear, p.stattrak, p.lowest_price_cents, p.volume, p.source, p.updated_at
         FROM prices p JOIN items i ON i.id = p.item_id ORDER BY p.updated_at DESC LIMIT 100`
  );
  return json(200, { items: rows, pending: ctx.prices.pending });
});
route.get("/api/admin/audit", async (req) => {
  requireAdmin(await authUser(req));
  const rows = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200");
  return json(200, { items: rows.map((r) => ({ ...r, id: Number(r.id), detail: js(r.detail) ?? null })) });
});
route.post("/api/admin/command", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const cmd = String((req.body ?? {}).cmd ?? "");
  return json(200, await runAdminCommand(admin, cmd));
});
route.get("/api/admin/settings", async (req) => {
  requireAdmin(await authUser(req));
  return json(200, await getSettings());
});
route.patch("/api/admin/settings", async (req) => {
  const admin = requireAdmin(await authUser(req));
  const patch = validateSettings(req.body ?? {});
  const map = {
    stattrakChance: "stattrak_chance",
    souvenirChance: "souvenir_chance",
    marketFeePct: "market_fee_pct",
    welcomeBalanceCents: "welcome_balance_cents",
    quickSellPct: "quick_sell_pct"
  };
  for (const [k, v] of Object.entries(patch)) await setSetting(map[k], v);
  await audit2(admin.id, "settings_updated", "global", patch);
  return json(200, await getSettings());
});

// src/services/battles.ts
var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var MAX_TIEBREAKS = 3;
function makeBattleCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return s;
}
__name(makeBattleCode, "makeBattleCode");
function battleView(b) {
  const isBot = b.opponent_type === "bot";
  return {
    id: Number(b.id),
    code: b.code,
    creator: { id: Number(b.creator_id), username: b.creator_username, avatar: b.creator_avatar },
    opponent: isBot ? { id: 0, username: "Case Bot", avatar: null } : b.opponent_id ? { id: Number(b.opponent_id), username: b.opponent_username, avatar: b.opponent_avatar } : null,
    opponentType: isBot ? "bot" : "human",
    cases: b.case_list ?? [],
    caseIds: (Array.isArray(b.case_ids) ? b.case_ids : js(b.case_ids)) ?? [],
    costCents: Number(b.cost_cents),
    visibility: b.visibility,
    status: b.status,
    rounds: (Array.isArray(b.rounds) ? b.rounds : js(b.rounds)) ?? [],
    totalA: Number(b.total_a_cents),
    totalB: Number(b.total_b_cents),
    tiebreaks: b.tiebreaks,
    winnerId: b.winner_id != null ? Number(b.winner_id) : null,
    rewardCents: Number(b.reward_cents),
    createdAt: b.created_at,
    startedAt: b.started_at,
    finishedAt: b.finished_at
  };
}
__name(battleView, "battleView");
var BASE_SELECT = `
  SELECT b.*, u1.username AS creator_username, u1.avatar AS creator_avatar,
         u2.username AS opponent_username, u2.avatar AS opponent_avatar
  FROM battles b
  JOIN users u1 ON u1.id = b.creator_id
  LEFT JOIN users u2 ON u2.id = b.opponent_id`;
async function caseListFor(q, caseIds) {
  const out = [];
  for (const cid of caseIds) {
    const r = await q.query("SELECT id, name, image, cost_cents FROM cases WHERE id = $1", [cid]);
    if (r.rows[0]) out.push(r.rows[0]);
  }
  return out;
}
__name(caseListFor, "caseListFor");
async function decorate(q, b) {
  const caseIds = Array.isArray(b.case_ids) ? b.case_ids : js(b.case_ids) ?? [];
  const case_list = await caseListFor(q, caseIds);
  return { ...b, case_ids: caseIds, case_list };
}
__name(decorate, "decorate");
var globalQ = { query: /* @__PURE__ */ __name((sql, params) => query(sql, params).then((rows) => ({ rows })), "query") };
async function loadBattleFull(client, idOrCode, byCode) {
  const where = byCode ? "b.code = $1" : "b.id = $1";
  const r = await client.query(`${BASE_SELECT} WHERE ${where}`, [idOrCode]);
  return r.rows[0] ? await decorate(client, r.rows[0]) : null;
}
__name(loadBattleFull, "loadBattleFull");
async function loadCaseForTx(client, caseId) {
  const c = (await client.query("SELECT id, name, image, cost_cents, probabilities, active FROM cases WHERE id = $1", [caseId])).rows[0];
  if (!c) return null;
  const rows = (await client.query(
    "SELECT p.tier, pi.item_id AS id FROM case_pools p JOIN case_pool_items pi ON pi.case_pool_id = p.id WHERE p.case_id = $1",
    [caseId]
  )).rows;
  const pools = { mil_spec: [], restricted: [], classified: [], covert: [], rare_special: [] };
  for (const r of rows) if (r.tier in pools) pools[r.tier].push(r.id);
  return { ...c, probabilities: js(c.probabilities) ?? {}, costCents: c.cost_cents == null ? null : Number(c.cost_cents), pools };
}
__name(loadCaseForTx, "loadCaseForTx");
function fmt2(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
__name(fmt2, "fmt");
async function generateBattle(client, caseDefs, aId, bId, botSideB) {
  const rounds = [];
  const instA = [];
  const instB = [];
  let totalA = 0;
  let totalB = 0;
  const openRound = /* @__PURE__ */ __name(async (c, tiebreak) => {
    const da = await rollDrop(c);
    const db = await rollDrop(c);
    const ra = await persistDrop(client, aId, c, da, 0);
    let instBId;
    if (botSideB) {
      instBId = await client.insert(
        `INSERT INTO item_instances
           (item_id, user_id, rarity_tier, float_value, wear, stattrak, souvenir, pattern, phase, seed, price_cents, case_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [db.item.id, bId, db.tier, db.floatValue, db.wear, db.stattrak, db.souvenir, db.item.pattern, db.phase, db.seed, db.priceCents, c.id]
      );
    } else {
      instBId = (await persistDrop(client, bId, c, db, 0)).instanceId;
    }
    instA.push(ra.instanceId);
    instB.push(instBId);
    totalA += da.priceCents;
    totalB += db.priceCents;
    rounds.push({
      i: rounds.length,
      caseId: c.id,
      caseName: c.name,
      caseImage: c.image,
      tiebreak,
      a: {
        instanceId: ra.instanceId,
        itemName: da.item.name,
        weapon: da.item.weapon,
        image: da.item.image,
        rarityTier: da.tier,
        floatValue: da.floatValue,
        wear: da.wear,
        stattrak: da.stattrak,
        souvenir: da.souvenir,
        priceCents: da.priceCents
      },
      b: {
        instanceId: instBId,
        itemName: db.item.name,
        weapon: db.item.weapon,
        image: db.item.image,
        rarityTier: db.tier,
        floatValue: db.floatValue,
        wear: db.wear,
        stattrak: db.stattrak,
        souvenir: db.souvenir,
        priceCents: db.priceCents
      }
    });
  }, "openRound");
  for (const c of caseDefs) await openRound(c, false);
  let tiebreaks = 0;
  while (totalA === totalB && tiebreaks < MAX_TIEBREAKS) {
    await openRound(caseDefs[0], true);
    tiebreaks++;
  }
  return { rounds, instA, instB, totalA, totalB, tiebreaks };
}
__name(generateBattle, "generateBattle");
async function createBattle(hub, user, caseIds, visibility, opponent = "human") {
  const ids = caseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) throw httpError2(400, "select at least one case");
  if (ids.length > 50) throw httpError2(400, "too many cases (max 50)");
  const isBot = opponent === "bot";
  const uid = Number(user.id);
  let total = 0;
  for (const id of ids) {
    const c = await one("SELECT cost_cents, active FROM cases WHERE id = $1", [id]);
    if (!c || !c.active) throw httpError2(400, `case ${id} is not available`);
    if (c.cost_cents == null) throw httpError2(400, `case ${id} has no price yet`);
    total += Number(c.cost_cents);
  }
  let botResult = null;
  const view = await tx(async (client) => {
    const u = await client.query("SELECT balance_cents, banned FROM users WHERE id = $1", [uid]);
    if (!u.rows.length) throw httpError2(401, "user gone");
    if (u.rows[0].banned) throw httpError2(403, "banned");
    const balBefore = Number(u.rows[0].balance_cents);
    const n = await client.update("UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2", [uid, total]);
    if (!n) throw httpError2(400, "insufficient balance");
    await client.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [uid, "battle_create", -total, balBefore - total, "battle:pending"]
    );
    let code = makeBattleCode();
    let b = null;
    for (let i = 0; i < 5 && !b; i++) {
      try {
        const id = await client.insert(
          `INSERT INTO battles (code, creator_id, case_ids, cost_cents, visibility, opponent_type)
           VALUES ($1,$2,$3::bigint[],$4,$5,$6)`,
          [code, uid, ids, total, visibility, isBot ? "bot" : "human"]
        );
        b = await loadBattleFull(client, id, false);
      } catch (e) {
        if (i === 4) throw e;
        code = makeBattleCode();
      }
    }
    if (!b) throw httpError2(500, "could not create battle");
    if (isBot) {
      const caseDefs = [];
      for (const cid of ids) {
        const c = await loadCaseForTx(client, cid);
        if (!c) throw httpError2(500, "battle case missing from catalog");
        caseDefs.push(c);
      }
      const gen = await generateBattle(client, caseDefs, uid, uid, true);
      let winnerId = null;
      let rewardCents = 0;
      if (gen.totalA > gen.totalB) {
        winnerId = uid;
        rewardCents = gen.totalB;
      } else if (gen.totalB > gen.totalA) {
        const all = [...gen.instA, ...gen.instB];
        if (all.length) await client.query("DELETE FROM item_instances WHERE id = ANY($1::bigint[])", [all]);
      }
      await client.query(
        `UPDATE battles SET status = 'finished', rounds = $2::jsonb, total_a_cents = $3, total_b_cents = $4,
           tiebreaks = $5, winner_id = $6, reward_cents = $7, started_at = now(), finished_at = now()
         WHERE id = $1`,
        [b.id, JSON.stringify(gen.rounds), gen.totalA, gen.totalB, gen.tiebreaks, winnerId, rewardCents]
      );
      b = await loadBattleFull(client, b.id, false);
      botResult = { totalA: gen.totalA, totalB: gen.totalB };
    }
    return battleView(b);
  });
  if (isBot && botResult) {
    await refreshInventorySummary(uid).catch(() => {
    });
    const won = view.winnerId !== null;
    const text = won ? `You beat the bot ${fmt2(view.totalA)} to ${fmt2(view.totalB)} and kept all the items.` : view.totalA === view.totalB ? `Draw against the bot (${fmt2(view.totalA)} - ${fmt2(view.totalB)}): you kept your items.` : `The bot won ${fmt2(view.totalB)} to ${fmt2(view.totalA)}. All items were burned.`;
    await pushNotification(hub, uid, "battle", "Bot battle finished", text, { battleId: view.id }).catch(() => {
    });
  }
  await run("INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)", [
    uid,
    "battle_create",
    `battle:${view.id}`,
    { code: view.code, cases: ids, cost: total, opponent }
  ]).catch(() => {
  });
  await hub.broadcast("battles", isBot ? { action: "finished", battle: view } : { action: "created", battle: view });
  return view;
}
__name(createBattle, "createBattle");
async function joinBattle(hub, user, code) {
  const joinerId = Number(user.id);
  const out = await tx(async (client) => {
    const b = await loadBattleFull(client, code.trim().toUpperCase(), true);
    if (!b) throw httpError2(404, "battle not found");
    if (b.status !== "waiting") throw httpError2(400, "battle is not open");
    if (Number(b.creator_id) === joinerId) throw httpError2(400, "you created this battle");
    if (b.opponent_id != null) throw httpError2(400, "battle is full");
    const cost = Number(b.cost_cents);
    const u = await client.query("SELECT balance_cents, banned FROM users WHERE id = $1", [joinerId]);
    if (!u.rows.length) throw httpError2(401, "user gone");
    if (u.rows[0].banned) throw httpError2(403, "banned");
    const balBefore = Number(u.rows[0].balance_cents);
    const slot = await client.update("UPDATE battles SET opponent_id = $2 WHERE id = $1 AND opponent_id IS NULL", [b.id, joinerId]);
    if (!slot) throw httpError2(400, "battle is full");
    const n = await client.update("UPDATE users SET balance_cents = balance_cents - $2, updated_at = now() WHERE id = $1 AND balance_cents >= $2", [joinerId, cost]);
    if (!n) {
      await client.update("UPDATE battles SET opponent_id = NULL WHERE id = $1", [b.id]);
      throw httpError2(400, "insufficient balance");
    }
    await client.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [joinerId, "battle_join", -cost, balBefore - cost, `battle:${b.id}`]
    );
    const caseDefs = [];
    for (const cid of b.case_ids) {
      const c = await loadCaseForTx(client, cid);
      if (!c) throw httpError2(500, "battle case missing from catalog");
      caseDefs.push(c);
    }
    const aId = Number(b.creator_id);
    const bId = joinerId;
    const gen = await generateBattle(client, caseDefs, aId, bId, false);
    let winnerId = null;
    let rewardCents = 0;
    if (gen.totalA > gen.totalB) {
      winnerId = aId;
      rewardCents = gen.totalB;
      if (gen.instB.length) await client.query("UPDATE item_instances SET user_id = $1 WHERE id = ANY($2::bigint[])", [aId, gen.instB]);
    } else if (gen.totalB > gen.totalA) {
      winnerId = bId;
      rewardCents = gen.totalA;
      if (gen.instA.length) await client.query("UPDATE item_instances SET user_id = $1 WHERE id = ANY($2::bigint[])", [bId, gen.instA]);
    }
    await client.query(
      `UPDATE battles SET opponent_id = $2, status = 'finished', rounds = $3::jsonb,
         total_a_cents = $4, total_b_cents = $5, tiebreaks = $6, winner_id = $7, reward_cents = $8,
         started_at = now(), finished_at = now()
       WHERE id = $1`,
      [b.id, bId, JSON.stringify(gen.rounds), gen.totalA, gen.totalB, gen.tiebreaks, winnerId, rewardCents]
    );
    return { battleId: Number(b.id), aId, bId, winnerId, rewardCents, totalA: gen.totalA, totalB: gen.totalB, tiebreaks: gen.tiebreaks };
  });
  const full = (await query(`${BASE_SELECT} WHERE b.id = $1`, [out.battleId]))[0];
  const view = battleView(full ? await decorate(globalQ, full) : null);
  const text = /* @__PURE__ */ __name((side) => {
    const won = out.winnerId != null && Number(out.winnerId) === (side === "a" ? out.aId : out.bId);
    const mine = side === "a" ? out.totalA : out.totalB;
    const theirs = side === "a" ? out.totalB : out.totalA;
    if (out.winnerId == null) return `Draw (${fmt2(mine)} - ${fmt2(theirs)}): each player keeps their items.`;
    if (won) return `You won ${fmt2(mine)} vs ${fmt2(theirs)} and took all the items!`;
    return `You lost ${fmt2(mine)} vs ${fmt2(theirs)}. The opponent took all the items.`;
  }, "text");
  await Promise.all([
    pushNotification(hub, out.aId, "battle", "Case battle finished", text("a"), { battleId: out.battleId }),
    pushNotification(hub, out.bId, "battle", "Case battle finished", text("b"), { battleId: out.battleId })
  ]).catch(() => {
  });
  await Promise.all([refreshInventorySummary(out.aId), refreshInventorySummary(out.bId)]).catch(() => {
  });
  await run("INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)", [
    joinerId,
    "battle_finish",
    `battle:${out.battleId}`,
    { winner: out.winnerId, reward: out.rewardCents, totalA: out.totalA, totalB: out.totalB, tiebreaks: out.tiebreaks }
  ]).catch(() => {
  });
  await hub.broadcast("battles", { action: "finished", battle: view });
  return view;
}
__name(joinBattle, "joinBattle");
async function cancelBattle(hub, user, battleId) {
  const out = await tx(async (client) => {
    const r = await client.query("SELECT * FROM battles WHERE id = $1 FOR UPDATE", [battleId]);
    if (!r.rows.length) throw httpError2(404, "battle not found");
    const row = r.rows[0];
    if (Number(row.creator_id) !== Number(user.id)) throw httpError2(403, "only the creator can cancel");
    if (row.status !== "waiting") throw httpError2(400, "battle is not open");
    const cost = Number(row.cost_cents);
    const u = await client.query("SELECT balance_cents FROM users WHERE id = $1", [user.id]);
    const flipped = await client.update("UPDATE battles SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'waiting'", [battleId]);
    if (!flipped) throw httpError2(400, "battle is not open");
    await client.query("UPDATE users SET balance_cents = balance_cents + $2, updated_at = now() WHERE id = $1", [user.id, cost]);
    await client.query(
      "INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, ref) VALUES ($1,$2,$3,$4,$5)",
      [user.id, "battle_cancel_refund", cost, Number(u.rows[0].balance_cents) + cost, `battle:${battleId}`]
    );
    return { id: battleId, code: row.code, cost };
  });
  await run("INSERT INTO audit_logs (actor_user_id, action, target, detail) VALUES ($1,$2,$3,$4::jsonb)", [
    user.id,
    "battle_cancel",
    `battle:${out.id}`,
    { code: out.code, refund: out.cost }
  ]).catch(() => {
  });
  await hub.broadcast("battles", { action: "cancelled", battleId: out.id, code: out.code });
  return { ok: true };
}
__name(cancelBattle, "cancelBattle");
async function lobbyBattles(userId) {
  const rows = await query(
    `${BASE_SELECT} WHERE b.status = 'waiting' AND b.opponent_type = 'human' AND (b.visibility = 'public' OR b.creator_id = $1) ORDER BY b.created_at DESC LIMIT 100`,
    [userId]
  );
  const out = [];
  for (const r of rows) out.push(battleView(await decorate(globalQ, r)));
  return out;
}
__name(lobbyBattles, "lobbyBattles");
async function myBattles(userId) {
  const rows = await query(
    `${BASE_SELECT} WHERE b.creator_id = $1 OR b.opponent_id = $1 ORDER BY b.created_at DESC LIMIT 100`,
    [userId]
  );
  const out = [];
  for (const r of rows) out.push(battleView(await decorate(globalQ, r)));
  return out;
}
__name(myBattles, "myBattles");
async function getBattle(user, battleId) {
  const rows = await query(
    `${BASE_SELECT} WHERE b.id = $1 AND (b.creator_id = $2 OR b.opponent_id = $2)`,
    [battleId, user.id]
  );
  return rows.length ? battleView(await decorate(globalQ, rows[0])) : null;
}
__name(getBattle, "getBattle");

// src/routes/battles.ts
route.get("/api/battles/lobby", async (req) => {
  const user = await authUser(req);
  return json(200, await lobbyBattles(user.id));
});
route.get("/api/battles/mine", async (req) => {
  const user = await authUser(req);
  return json(200, await myBattles(user.id));
});
route.post("/api/battles", async (req, ctx) => {
  const user = await authUser(req);
  const { caseIds, visibility, opponent } = req.body ?? {};
  return json(
    200,
    await createBattle(
      ctx.hub,
      user,
      caseIds ?? [],
      visibility === "public" ? "public" : "private",
      opponent === "bot" ? "bot" : "human"
    )
  );
});
route.post("/api/battles/join", async (req, ctx) => {
  const user = await authUser(req);
  const { code } = req.body ?? {};
  return json(200, await joinBattle(ctx.hub, user, String(code ?? "")));
});
route.post("/api/battles/:id/cancel", async (req, ctx) => {
  const user = await authUser(req);
  return json(200, await cancelBattle(ctx.hub, user, Number(req.params.id)));
});
route.get("/api/battles/:id", async (req) => {
  const user = await authUser(req);
  const b = await getBattle(user, Number(req.params.id));
  if (!b) throw httpError(404, "not found");
  return json(200, b);
});

// src/services/social.ts
async function bumpInventory(client, userId, deltaCount, deltaCents) {
  if (deltaCount === 0 && deltaCents === 0) return;
  if (deltaCount > 0) {
    await client.query(
      `INSERT INTO inventories (user_id, item_count, total_value_cents, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET item_count = inventories.item_count + $2,
         total_value_cents = inventories.total_value_cents + $3, updated_at = now()`,
      [userId, deltaCount, deltaCents]
    );
  } else {
    await client.query(
      "UPDATE inventories SET item_count = GREATEST(item_count + $2, 0), total_value_cents = GREATEST(total_value_cents + $3, 0), updated_at = now() WHERE user_id = $1",
      [userId, deltaCount, deltaCents]
    );
  }
}
__name(bumpInventory, "bumpInventory");
async function requestFriend(hub, from, toUsername) {
  const to = await one("SELECT id, username FROM users WHERE lower(username) = lower($1)", [toUsername]);
  if (!to) throw httpError2(404, "user not found");
  if (to.id === from.id) throw httpError2(400, "you cannot add yourself");
  const a = Math.min(from.id, to.id);
  const b = Math.max(from.id, to.id);
  const fr = await one("SELECT 1 FROM friends WHERE a = $1 AND b = $2", [a, b]);
  if (fr) throw httpError2(400, "you are already friends");
  const pending = await one(
    `SELECT id FROM friend_requests WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
    [from.id, to.id]
  );
  if (pending) throw httpError2(400, "a friend request is already pending");
  await run(
    `INSERT INTO friend_requests (from_id, to_id, status) VALUES ($1,$2,'pending')
     ON CONFLICT (from_id, to_id) DO UPDATE SET status = 'pending', created_at = now()`,
    [from.id, to.id]
  );
  await pushNotification(hub, to.id, "friend_request", "Friend request", `${from.username} wants to add you as a friend.`);
  return { ok: true };
}
__name(requestFriend, "requestFriend");
async function respondFriend(hub, user, requestId, accept) {
  const fromRow = await tx(async (client) => {
    const r = await client.query("SELECT * FROM friend_requests WHERE id = $1", [requestId]);
    if (!r.rows.length) throw httpError2(404, "request not found");
    const row = r.rows[0];
    if (Number(row.to_id) !== user.id) throw httpError2(403, "not your request");
    const n = await client.update(`UPDATE friend_requests SET status = '${accept ? "accepted" : "declined"}', resolved_at = now() WHERE id = $1 AND status = 'pending'`, [requestId]);
    if (!n) throw httpError2(400, "request already resolved");
    const otherId = Number(row.from_id);
    const a = Math.min(user.id, otherId);
    const b = Math.max(user.id, otherId);
    if (accept) {
      await client.query("INSERT INTO friends (a, b) VALUES ($1,$2) ON CONFLICT DO NOTHING", [a, b]);
    }
    const from = (await client.query("SELECT id, username FROM users WHERE id = $1", [otherId])).rows[0];
    return from;
  });
  if (accept) {
    await pushNotification(hub, fromRow.id, "friend", "New friend", `You and ${user.username} are now friends.`);
  }
  return { ok: true, username: fromRow.username };
}
__name(respondFriend, "respondFriend");
async function listFriends(userId) {
  const rows = await query(
    `SELECT u.id, u.username, u.avatar, f.created_at
     FROM friends f JOIN users u ON (u.id = f.a OR u.id = f.b) AND u.id != $1
     WHERE (f.a = $1 OR f.b = $1) ORDER BY u.username`,
    [userId]
  );
  return rows;
}
__name(listFriends, "listFriends");
async function pendingFriendRequests(userId) {
  const rows = await query(
    `SELECT fr.id, fr.created_at, u.id AS from_id, u.username, u.avatar
     FROM friend_requests fr JOIN users u ON u.id = fr.from_id
     WHERE fr.to_id = $1 AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    [userId]
  );
  return rows;
}
__name(pendingFriendRequests, "pendingFriendRequests");
async function sendGift(hub, from, toUsername, instanceId) {
  const to = await one("SELECT id, username FROM users WHERE lower(username) = lower($1)", [toUsername]);
  if (!to) throw httpError2(404, "user not found");
  if (to.id === from.id) throw httpError2(400, "you cannot gift to yourself");
  const isFriend = await one("SELECT 1 AS ok FROM friends f WHERE ((f.a = $1 AND f.b = $2) OR (f.a = $2 AND f.b = $1))", [from.id, to.id]);
  if (!isFriend) throw httpError2(403, "you can only gift items to friends");
  const out = await tx(async (client) => {
    const inst = await client.query(
      "SELECT ii.*, i.name AS item_name FROM item_instances ii JOIN items i ON i.id = ii.item_id WHERE ii.id = $1",
      [instanceId]
    );
    if (!inst.rows.length) throw httpError2(404, "item not found");
    const item = inst.rows[0];
    if (Number(item.user_id) !== from.id) throw httpError2(403, "not your item");
    if (item.listed) throw httpError2(400, "item is listed on the market");
    const n = await client.update("UPDATE item_instances SET user_id = $2 WHERE id = $1 AND user_id = $3 AND listed = FALSE", [instanceId, to.id, from.id]);
    if (!n) throw httpError2(400, "item is no longer giftable");
    await bumpInventory(client, from.id, -1, -Number(item.price_cents));
    await bumpInventory(client, to.id, 1, +Number(item.price_cents));
    return { name: item.item_name, valueCents: Number(item.price_cents) };
  });
  await pushNotification(hub, to.id, "gift", "You received a gift", `${from.username} sent you ${out.name} (${fmt3(out.valueCents)}).`);
  return { ok: true };
}
__name(sendGift, "sendGift");
async function createTradeOffer(hub, from, toUsername, myInstanceId, theirInstanceId) {
  const to = await one("SELECT id, username FROM users WHERE lower(username) = lower($1)", [toUsername]);
  if (!to) throw httpError2(404, "user not found");
  if (to.id === from.id) throw httpError2(400, "you cannot trade with yourself");
  const isFriend = await one("SELECT 1 AS ok FROM friends f WHERE ((f.a = $1 AND f.b = $2) OR (f.a = $2 AND f.b = $1))", [from.id, to.id]);
  if (!isFriend) throw httpError2(403, "you can only trade with friends");
  if (myInstanceId === theirInstanceId) throw httpError2(400, "you are offering the same item twice");
  const mine = await one("SELECT * FROM item_instances WHERE id = $1", [myInstanceId]);
  if (!mine) throw httpError2(404, "your item not found");
  if (Number(mine.user_id) !== from.id) throw httpError2(403, "not your item");
  if (mine.listed) throw httpError2(400, "your item is listed on the market");
  if (theirInstanceId != null) {
    const t = await one("SELECT * FROM item_instances WHERE id = $1", [theirInstanceId]);
    if (!t) throw httpError2(404, "their item not found");
    if (Number(t.user_id) !== to.id) throw httpError2(403, "their item not found");
    if (t.listed) throw httpError2(400, "their item is listed on the market");
  }
  await run(
    `INSERT INTO trade_offers (from_id, to_id, from_instance, to_instance, status)
     VALUES ($1,$2,$3,$4,'pending')`,
    [from.id, to.id, myInstanceId, theirInstanceId]
  );
  await pushNotification(hub, to.id, "trade", "Trade offer", `${from.username} offered a trade.`);
  return { ok: true };
}
__name(createTradeOffer, "createTradeOffer");
async function respondTrade(hub, user, offerId, accept) {
  const out = await tx(async (client) => {
    const r = await client.query("SELECT * FROM trade_offers WHERE id = $1", [offerId]);
    if (!r.rows.length) throw httpError2(404, "offer not found");
    const row = r.rows[0];
    if (Number(row.to_id) !== user.id) throw httpError2(403, "not your offer");
    const n = await client.update(`UPDATE trade_offers SET status = '${accept ? "accepted" : "declined"}', resolved_at = now() WHERE id = $1 AND status = 'pending'`, [offerId]);
    if (!n) throw httpError2(400, "offer already resolved");
    const fromId = Number(row.from_id);
    const instA = await client.query(
      "SELECT ii.*, i.name AS item_name FROM item_instances ii JOIN items i ON i.id = ii.item_id WHERE ii.id = $1",
      [Number(row.from_instance)]
    );
    const instB = row.to_instance != null ? await client.query("SELECT * FROM item_instances WHERE id = $1", [Number(row.to_instance)]) : null;
    if (!instA.rows.length) throw httpError2(400, "item from the offer is gone");
    if (Number(instA.rows[0].user_id) !== fromId) throw httpError2(400, "offer item is gone");
    if (instA.rows[0].listed) throw httpError2(400, "offer item is on the market");
    if (instB) {
      if (!instB.rows.length) throw httpError2(400, "your item from the offer is gone");
      if (Number(instB.rows[0].user_id) !== user.id) throw httpError2(400, "offer item is gone");
      if (instB.rows[0].listed) throw httpError2(400, "your item is on the market");
    }
    if (accept) {
      const a = instA.rows[0];
      const b = instB ? instB.rows[0] : null;
      await client.query("UPDATE item_instances SET user_id = $2 WHERE id = $1", [a.id, user.id]);
      if (b) await client.query("UPDATE item_instances SET user_id = $2 WHERE id = $1", [b.id, fromId]);
      await bumpInventory(client, user.id, 0, Number(a.price_cents) - (b ? Number(b.price_cents) : 0));
      await bumpInventory(client, fromId, 0, (b ? Number(b.price_cents) : 0) - Number(a.price_cents));
    }
    return { fromId, name: instA.rows[0].item_name, valueA: Number(instA.rows[0].price_cents) };
  });
  await pushNotification(hub, out.fromId, "trade", accept ? "Trade accepted" : "Trade declined", `${user.username} ${accept ? "accepted" : "declined"} your trade offer of ${out.name}.`).catch(() => {
  });
  return { ok: true };
}
__name(respondTrade, "respondTrade");
async function listFriendItems(from, toUsername) {
  const to = await one("SELECT id, username FROM users WHERE lower(username) = lower($1)", [toUsername]);
  if (!to) throw httpError2(404, "user not found");
  if (to.id === from.id) throw httpError2(400, "you cannot trade with yourself");
  const isFriend = await one("SELECT 1 AS ok FROM friends f WHERE ((f.a = $1 AND f.b = $2) OR (f.a = $2 AND f.b = $1))", [from.id, to.id]);
  if (!isFriend) throw httpError2(403, "not a friend yet");
  const rows = await query(
    `SELECT ii.id, i.name AS item_name, ii.wear, ii.float_value, ii.price_cents, i.image, ii.rarity_tier, ii.stattrak
     FROM item_instances ii JOIN items i ON i.id = ii.item_id
     WHERE ii.user_id = $1 AND ii.listed = FALSE
     ORDER BY ii.price_cents DESC NULLS LAST LIMIT 100`,
    [to.id]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.item_name,
    image: r.image,
    rarityTier: r.rarity_tier,
    stattrak: r.stattrak,
    wear: r.wear,
    floatValue: r.float_value != null ? Number(r.float_value) : null,
    priceCents: Number(r.price_cents ?? 0)
  }));
}
__name(listFriendItems, "listFriendItems");
async function listTradeOffers(userId) {
  const rows = await query(
    `SELECT t.id, t.status, t.created_at, t.from_instance, t.to_instance,
            CASE WHEN t.to_id = $1 THEN 'in' ELSE 'out' END AS direction,
            u.username AS from_username, u.avatar AS from_avatar,
            uf.username AS to_username, uf.avatar AS to_avatar,
            ima.name AS a_item_name, ima.image AS a_item_image, ia.price_cents AS a_item_value,
            imb.name AS b_item_name, imb.image AS b_item_image, ib.price_cents AS b_item_value
     FROM trade_offers t
     JOIN users u ON u.id = t.from_id
     LEFT JOIN users uf ON uf.id = t.to_id
     LEFT JOIN item_instances ia ON ia.id = t.from_instance
     LEFT JOIN items ima ON ima.id = ia.item_id
     LEFT JOIN item_instances ib ON ib.id = t.to_instance
     LEFT JOIN items imb ON imb.id = ib.item_id
     WHERE t.to_id = $1 OR t.from_id = $1
     ORDER BY t.created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}
__name(listTradeOffers, "listTradeOffers");
async function cancelTrade(hub, user, offerId) {
  const r = await one("SELECT * FROM trade_offers WHERE id = $1", [offerId]);
  if (!r) throw httpError2(404, "offer not found");
  if (Number(r.from_id) !== user.id) throw httpError2(403, "not your offer");
  const n = await run(`UPDATE trade_offers SET status = 'cancelled', resolved_at = now() WHERE id = $1 AND status = 'pending'`, [offerId]);
  if (!n) throw httpError2(400, "offer already resolved");
  const out = { toId: Number(r.to_id) };
  await pushNotification(hub, out.toId, "trade", "Trade offer cancelled", `${user.username} cancelled their trade offer.`, { offerId }).catch(() => {
  });
  return { ok: true };
}
__name(cancelTrade, "cancelTrade");
function fmt3(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
__name(fmt3, "fmt");

// src/routes/social.ts
var MIN_AVATAR_LEN = 10;
var MAX_AVATAR_LEN = 2e5;
route.patch("/api/profile", async (req) => {
  const user = await authUser(req);
  const { username, avatar } = req.body ?? {};
  if (username != null) {
    const name = String(username).trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) throw httpError2(400, "username must be 3-20 chars (letters, numbers, _)");
    const clash = await one("SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2", [name, user.id]);
    if (clash) throw httpError2(409, "username is taken");
    await run("UPDATE users SET username = $2, updated_at = now() WHERE id = $1", [user.id, name]);
  }
  if (avatar !== void 0) {
    if (avatar === null) {
      await run("UPDATE users SET avatar = NULL WHERE id = $1", [user.id]);
    } else {
      const a = String(avatar);
      if (a.length < MIN_AVATAR_LEN || a.length > MAX_AVATAR_LEN || !a.startsWith("data:image/")) {
        throw httpError2(400, "avatar must be a small image (data URL)");
      }
      await run("UPDATE users SET avatar = $2 WHERE id = $1", [user.id, a]);
    }
  }
  const u = await one("SELECT id, username, avatar, role FROM users WHERE id = $1", [user.id]);
  return json(200, { ok: true, user: { ...u, id: Number(u.id) } });
});
route.post("/api/profile/password", async (req) => {
  const user = await authUser(req);
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) throw httpError2(400, "passwords required");
  if (String(newPassword).length < 6) throw httpError2(400, "new password must be at least 6 chars");
  const u = await one("SELECT pass_hash FROM users WHERE id = $1", [user.id]);
  if (!u || !await verifyPassword(String(currentPassword), u.pass_hash)) throw httpError2(401, "current password is wrong");
  const h = await hashPassword(String(newPassword));
  await run("UPDATE users SET pass_hash = $2, updated_at = now() WHERE id = $1", [user.id, h]);
  return json(200, { ok: true });
});
route.get("/api/friends", async (req) => {
  const user = await authUser(req);
  return json(200, await listFriends(user.id));
});
route.get("/api/friends/requests", async (req) => {
  const user = await authUser(req);
  return json(200, await pendingFriendRequests(user.id));
});
route.post("/api/friends/request", async (req, ctx) => {
  const user = await authUser(req);
  const { username } = req.body ?? {};
  return json(200, await requestFriend(ctx.hub, user, String(username ?? "")));
});
route.post("/api/friends/:requestId/respond", async (req, ctx) => {
  const user = await authUser(req);
  const { accept } = req.body ?? {};
  return json(200, await respondFriend(ctx.hub, user, Number(req.params.requestId), Boolean(accept)));
});
route.get("/api/friends/items", async (req) => {
  const user = await authUser(req);
  return json(200, await listFriendItems(user, String(req.query.get("username") ?? "")));
});
route.post("/api/friends/gift", async (req, ctx) => {
  const user = await authUser(req);
  const { username, instanceId } = req.body ?? {};
  return json(200, await sendGift(ctx.hub, user, String(username ?? ""), Number(instanceId)));
});
route.get("/api/trades", async (req) => {
  const user = await authUser(req);
  return json(200, await listTradeOffers(user.id));
});
route.post("/api/trades", async (req, ctx) => {
  const user = await authUser(req);
  const { username, myInstanceId, theirInstanceId } = req.body ?? {};
  return json(
    200,
    await createTradeOffer(
      ctx.hub,
      user,
      String(username ?? ""),
      Number(myInstanceId),
      theirInstanceId == null ? null : Number(theirInstanceId)
    )
  );
});
route.post("/api/trades/:offerId/cancel", async (req, ctx) => {
  const user = await authUser(req);
  return json(200, await cancelTrade(ctx.hub, user, Number(req.params.offerId)));
});
route.post("/api/trades/:offerId/respond", async (req, ctx) => {
  const user = await authUser(req);
  const { accept } = req.body ?? {};
  return json(200, await respondTrade(ctx.hub, user, Number(req.params.offerId), Boolean(accept)));
});

// src/routes/realtime.ts
route.get("/api/realtime", async (req, ctx) => {
  return await ctx.env.RT.getByName("rt").fetch(req.raw);
});

// src/realtime.ts
var Realtime = class {
  constructor(state, env3) {
    this.state = state;
    this.env = env3;
  }
  state;
  env;
  static {
    __name(this, "Realtime");
  }
  all = /* @__PURE__ */ new Set();
  byUser = /* @__PURE__ */ new Map();
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("websocket upgrade required", { status: 400 });
    }
    let userId = null;
    const token = url.searchParams.get("token");
    if (token) {
      const user = await runWithDb(this.env.DB, () => userFromToken(token));
      userId = user ? Number(user.id) : null;
    }
    const [client, server] = new WebSocketPair();
    this.all.add(server);
    if (userId != null) {
      let set = this.byUser.get(userId);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        this.byUser.set(userId, set);
      }
      set.add(server);
    }
    server.addEventListener("close", () => {
      this.all.delete(server);
      if (userId != null) {
        const set = this.byUser.get(userId);
        set?.delete(server);
        if (set && !set.size) this.byUser.delete(userId);
      }
    });
    server.addEventListener("error", () => {
      this.all.delete(server);
    });
    return new Response(null, { status: 101, webSocket: server });
  }
  async webSocketMessage(_ws, _msg) {
  }
  async webSocketClose(ws) {
    this.all.delete(ws);
  }
  send(ws, payload) {
    try {
      ws.send(payload);
    } catch {
      this.all.delete(ws);
    }
  }
  async broadcast(type, data) {
    const payload = JSON.stringify({ event: type, data });
    for (const ws of this.all) this.send(ws, payload);
  }
  async notifyUser(userId, type, data) {
    const set = this.byUser.get(Number(userId));
    if (!set) return;
    const payload = JSON.stringify({ event: type, data });
    for (const ws of set) this.send(ws, payload);
  }
};

// src/worker.ts
var adminSeeded = false;
function makeCtx(env3) {
  const hub = new RealtimeHub(env3.RT);
  const prices = new PriceSyncService();
  prices.setHub(hub);
  return { env: env3, hub, prices };
}
__name(makeCtx, "makeCtx");
var worker_default = {
  async fetch(request, env3, _ctx) {
    if (env3.ADMIN_PASSWORD) setAdminPassword(env3.ADMIN_PASSWORD);
    const url = new URL(request.url);
    const path = url.pathname;
    return runWithDb(env3.DB, async () => {
      if (!adminSeeded) {
        if (env3.SEED_CATALOG === "false") {
          adminSeeded = true;
        } else {
          await seedAdmin().catch(() => {
          });
          adminSeeded = true;
        }
      }
      if (path.startsWith("/api/")) {
        const ctx = makeCtx(env3);
        if (rateLimited(request, path)) {
          return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
            status: 429,
            headers: { "Content-Type": "application/json" }
          });
        }
        try {
          return await dispatch(request, ctx);
        } catch (e) {
          const status = Number(e.statusCode) >= 400 ? Number(e.statusCode) : 500;
          return new Response(JSON.stringify({ error: e.message ?? "internal error" }), {
            status,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      if (env3.ASSETS) {
        const res = await env3.ASSETS.fetch(request);
        if (res.status === 404 && (request.headers.get("accept") ?? "").includes("text/html")) {
          const base = new URL(".", request.url);
          const idx = await env3.ASSETS.fetch(new Request(new URL("index.html", base), request));
          if (idx.status === 200) {
            return new Response(idx.body, {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
            });
          }
        }
        return res;
      }
      return new Response("assets binding missing (run `npm run build` in web/)", { status: 500 });
    });
  },
  async cron(_event, env3) {
    if (env3.ADMIN_PASSWORD) setAdminPassword(env3.ADMIN_PASSWORD);
    const ctx = makeCtx(env3);
    await runWithDb(env3.DB, async () => {
      await refreshPricesForCases(ctx.prices, 60);
      await ctx.prices.run();
    });
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env3, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env3);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env3, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env3);
  } catch (e) {
    const error3 = reduceError(e);
    const body = JSON.stringify(error3);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Dirk4e/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env3, ctx, dispatch2, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch: dispatch2,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch2, tail);
    }
  };
  return head(request, env3, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env3, ctx, dispatch2, finalMiddleware) {
  return __facade_invokeChain__(request, env3, ctx, dispatch2, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Dirk4e/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env3, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env3, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env3, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env3, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env3, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env3, ctx) => {
      this.env = env3;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Realtime,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
