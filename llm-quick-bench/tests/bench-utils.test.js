const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fakeElement(tag = "div") {
  const element = {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    className: "",
    value: "",
    checked: false,
    textContent: "",
    hidden: false,
    classList: {
      _set: new Set(),
      add(...names) { names.forEach((name) => this._set.add(name)); },
      remove(...names) { names.forEach((name) => this._set.delete(name)); },
      toggle(name, force) {
        const on = force === undefined ? !this._set.has(name) : force;
        if (on) this._set.add(name); else this._set.delete(name);
        return on;
      },
      contains(name) { return this._set.has(name); },
    },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    querySelector() { return fakeElement(); },
    querySelectorAll() { return []; },
  };
  return element;
}

function loadBenchUtils() {
  const renderErrors = [];
  const context = vm.createContext({
    AbortController,
    Blob,
    DOMException,
    Headers,
    ReadableStream,
    Response,
    TextDecoder,
    URL,
    clearTimeout,
    console: {
      error: (...args) => renderErrors.push(args),
      log: () => {},
      warn: () => {},
    },
    performance,
    setTimeout,
    document: {
      createElement: (tag) => fakeElement(tag),
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "bench-utils.js"), "utf8");
  vm.runInContext(`${source}\nthis.__benchUtils = {
    buildDecodeMatrixRows,
    buildDecodeMeasurement,
    buildDecodeRunRows,
    buildRunThroughputSeries,
    calculateAggregateCostPerCorrect,
    calculateCostPerCorrect,
    calculateDecodeTokensPerSecond,
    createBenchmarkTable,
    createTableSorter,
    decodeGroupStatus,
    decodeOutputTokensForRun,
    deriveBenchmarkRunStatus,
    extractSseChunkData,
    formatBenchmarkErrorTooltip,
    formatTokenUsageBreakdown,
    getVisibleColumnDefinitions,
    parseDecodeOutputTokenOptions,
    parseSseLine,
    runBenchmarkSequence,
    runStreamingChatCompletion,
    runWithConcurrency,
    splitCompletionTokens,
    summarizeDecodeRuns,
    summarizeRunThinkingAccuracy,
    summarizeRuns,
    summarizeThinkingAccuracy,
  };`, context);
  return { context, renderErrors, utils: context.__benchUtils };
}

test("shared table sorter applies defaults, toggles, and missing-value ordering", () => {
  const { utils } = loadBenchUtils();
  const changes = [];
  const sorter = utils.createTableSorter({
    initialKey: "score",
    initialDirection: "descending",
    onSort: (state) => changes.push({ ...state }),
  });
  const rows = [
    { name: "beta", score: 20 },
    { name: "missing", score: null },
    { name: "alpha", score: 10 },
  ];

  assert.deepEqual(
    Array.from(sorter.sortRows(rows, (row, key) => row[key]), (row) => row.name),
    ["beta", "alpha", "missing"],
  );
  sorter.sortBy("score");
  assert.deepEqual(JSON.parse(JSON.stringify(sorter.state)), {
    key: "score",
    direction: "ascending",
  });
  sorter.sortBy("name");
  assert.deepEqual(JSON.parse(JSON.stringify(sorter.state)), {
    key: "name",
    direction: "ascending",
  });
  assert.equal(changes.length, 2);
});

test("createBenchmarkTable unifies sort, visibility, and picker for static headers", () => {
  const { context, utils } = loadBenchUtils();
  const headers = ["alpha", "beta", "gamma"].map((key) => {
    const header = context.document.createElement("th");
    header.dataset.col = key;
    return header;
  });
  const container = context.document.createElement("div");
  const table = utils.createBenchmarkTable({
    headers,
    columnAttr: "col",
    preferenceKey: "test-columns",
    defaultColumns: ["alpha", "gamma"],
    initialSortKey: "beta",
    initialSortDirection: "descending",
    pickerContainer: container,
  });

  assert.deepEqual(Array.from(table.allKeys), ["alpha", "beta", "gamma"]);
  assert.equal(table.isVisible("alpha"), true);
  assert.equal(table.isVisible("beta"), false);
  // The initial sort column (beta) is hidden, so it falls back to the first visible one.
  assert.deepEqual(JSON.parse(JSON.stringify(table.state)), { key: "alpha", direction: "ascending" });
  assert.equal(container.children.length, 3);

  const rows = [{ v: 3 }, { v: 1 }, { v: 2 }];
  table.reset({ key: "v", direction: "ascending" });
  assert.deepEqual(
    Array.from(table.sortRows(rows, (row, key) => row[key]), (row) => row.v),
    [1, 2, 3],
  );
});

test("createBenchmarkTable supports dynamically rendered columns", () => {
  const { context, utils } = loadBenchUtils();
  const columns = [
    { key: "model", label: "Model" },
    { key: "score", label: "Score" },
  ];
  const table = utils.createBenchmarkTable({
    columns,
    columnAttr: "col",
    preferenceKey: "test-dynamic-columns",
    defaultColumns: ["model"],
    initialSortKey: "score",
    pickerContainer: context.document.createElement("div"),
  });

  assert.deepEqual(Array.from(table.allKeys), ["model", "score"]);
  assert.equal(table.isVisible("score"), false);
  // score is hidden by default, so sort falls back to the visible model column.
  assert.equal(table.state.key, "model");
  assert.deepEqual(JSON.parse(JSON.stringify(table.getVisibleDefinitions())), [
    { key: "model", label: "Model" },
  ]);
});

test("visible column definitions preserve display order and exclusions", () => {
  const { utils } = loadBenchUtils();
  const columns = [
    { key: "selected", label: "Run" },
    { key: "model", label: "Model" },
    { key: "cost", label: "Cost" },
  ];
  const visible = new Set(["cost", "selected", "model"]);
  const selected = utils.getVisibleColumnDefinitions(columns, visible, ["selected"]);
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), [
    { key: "model", label: "Model" },
    { key: "cost", label: "Cost" },
  ]);
});

test("throughput graph series keeps one tokens-per-second value per run", () => {
  const { utils } = loadBenchUtils();
  const runs = [
    { index: 2, tokensPerSecond: 40, ttftMs: 20, endToEndLatencyMs: 200 },
    { index: 1, tokensPerSecond: 50, ttftMs: 10, endToEndLatencyMs: 100 },
    { index: 3, tokensPerSecond: 45, ttftMs: 15, endToEndLatencyMs: 150 },
  ];
  const series = utils.buildRunThroughputSeries(runs);
  assert.deepEqual(JSON.parse(JSON.stringify(series)), [
    { runNumber: 1, tokensPerSecond: 50 },
    { runNumber: 2, tokensPerSecond: 40 },
    { runNumber: 3, tokensPerSecond: 45 },
  ]);
  const summary = utils.summarizeRuns(runs);
  assert.equal(summary.ttftP95, 20);
  assert.equal(summary.tpsMin, 40);
  assert.equal(summary.tpsMedian, 45);
  assert.equal(summary.tpsMax, 50);
  assert.equal("tpsP95" in summary, false);
  assert.equal(summary.e2eMedian, 150);
  assert.equal(summary.e2eP95, 200);
});

test("decode helpers split visible and reasoning tokens and compute speed", () => {
  const { utils } = loadBenchUtils();

  assert.deepEqual(JSON.parse(JSON.stringify(utils.splitCompletionTokens(100, 40, 100))), {
    reasoningTokens: 40,
    visibleOutputTokens: 60,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(utils.splitCompletionTokens(100, 0, 100))), {
    reasoningTokens: 0,
    visibleOutputTokens: 100,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(utils.splitCompletionTokens(100, 0, 0))), {
    reasoningTokens: 0,
    visibleOutputTokens: 100,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(utils.splitCompletionTokens(0, 10, 20))), {
    reasoningTokens: 0,
    visibleOutputTokens: 0,
  });

  assert.equal(utils.calculateDecodeTokensPerSecond(101, 1000), 100);
  assert.equal(utils.calculateDecodeTokensPerSecond(11, 500), 20);
  assert.equal(utils.calculateDecodeTokensPerSecond(1, 1000), null);
  assert.equal(utils.calculateDecodeTokensPerSecond(50, 0), null);
  assert.equal(utils.calculateDecodeTokensPerSecond(50, null), null);

  const summary = utils.summarizeDecodeRuns([
    {
      decodeTokensPerSecond: 100,
      ttftMs: 10,
      decodeTimeMs: 500,
      totalLatencyMs: 600,
      visibleOutputTokens: 51,
      reasoningTokens: 0,
    },
    {
      decodeTokensPerSecond: 80,
      ttftMs: 20,
      decodeTimeMs: 600,
      totalLatencyMs: 700,
      visibleOutputTokens: 49,
      reasoningTokens: 50,
    },
  ]);
  assert.equal(summary.decodeTpsP50, 80);
  assert.equal(summary.decodeTpsMin, 80);
  assert.equal(summary.decodeTpsMax, 100);
  assert.equal(summary.ttftP50, 10);
  assert.equal(summary.ttftP90, 20);
  assert.equal(summary.decodeTimeP50, 500);
  assert.equal(summary.totalLatencyP50, 600);
  assert.equal(summary.totalLatencyP90, 700);
  assert.equal(summary.visibleTokensP50, 49);
  assert.equal(summary.reasoningTokensP50, 0);
  assert.equal(summary.reasoningRequired, false);
  assert.equal(summary.completed, 2);
});

test("decode run index maps to its output-length group (warm-up uses the first)", () => {
  const { utils } = loadBenchUtils();
  const lengths = [100, 500, 1000];
  assert.equal(utils.decodeOutputTokensForRun(-1, lengths, 5), 100);
  assert.equal(utils.decodeOutputTokensForRun(0, lengths, 5), 100);
  assert.equal(utils.decodeOutputTokensForRun(4, lengths, 5), 100);
  assert.equal(utils.decodeOutputTokensForRun(5, lengths, 5), 500);
  assert.equal(utils.decodeOutputTokensForRun(9, lengths, 5), 500);
  assert.equal(utils.decodeOutputTokensForRun(10, lengths, 5), 1000);
  assert.equal(utils.decodeOutputTokensForRun(14, lengths, 5), 1000);
});

test("decode output-lengths parser handles comma-separated values", () => {
  const { utils } = loadBenchUtils();
  const parse = (raw, options) => JSON.parse(JSON.stringify(utils.parseDecodeOutputTokenOptions(raw, options)));
  assert.deepEqual(parse("100,500,1000"), [100, 500, 1000]);
  assert.deepEqual(parse(" 100 , 500 , 1000 "), [100, 500, 1000]);
  assert.deepEqual(parse("1000,100"), [100, 1000]);
  assert.deepEqual(parse("500, 500,500"), [500]);
  assert.deepEqual(parse("100,,500,abc"), [100, 500]);
  assert.deepEqual(parse("99.6"), [100]);
  assert.deepEqual(parse("0,-5"), [1]);
  assert.deepEqual(parse("2000000"), [100000]);
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse(" , abc ,"), []);
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse(undefined), []);
  assert.deepEqual(parse("50", { maxLength: 40 }), [40]);
});

test("decode field text determines the exact max_tokens sequence of a run", () => {
  const { utils } = loadBenchUtils();
  // Mirrors the submit handler: parse the field's comma-separated text, then
  // map every request (warm-up + measured runs) to the length it must send.
  const lengths = utils.parseDecodeOutputTokenOptions(" 50, 10 , 20 ");
  const runsPerConfig = 2;
  const maxTokensPerRequest = [-1, 0, 1, 2, 3, 4, 5].map((runIndex) =>
    utils.decodeOutputTokensForRun(runIndex, lengths, runsPerConfig));
  assert.deepEqual(maxTokensPerRequest, [10, 10, 10, 20, 20, 50, 50]);

  // The run count scales with the number of lengths in the field, and every
  // completed run is bucketed into its own row.
  const results = [{
    modelId: "vendor/model",
    runs: maxTokensPerRequest.slice(1).map((outputTokens) => ({
      outputTokens,
      decodeTokensPerSecond: 50,
      ttftMs: 10,
      decodeTimeMs: 500,
      totalLatencyMs: 600,
      visibleOutputTokens: outputTokens,
      reasoningTokens: 0,
      reasoningRequired: false,
    })),
    errors: [],
  }];
  const rows = utils.buildDecodeRunRows(results, lengths, runsPerConfig);
  assert.deepEqual(Array.from(rows, (row) => row.length), [10, 20, 50]);
  assert.deepEqual(Array.from(rows, (row) => row.runs.length), [2, 2, 2]);
});

test("decode run rows bucket runs and failed-run numbers by output length", () => {
  const { utils } = loadBenchUtils();
  const decodeRunFixture = (outputTokens, tokensPerSecond) => ({
    outputTokens,
    decodeTokensPerSecond: tokensPerSecond,
    ttftMs: 10,
    decodeTimeMs: 500,
    totalLatencyMs: 600,
    visibleOutputTokens: 51,
    reasoningTokens: 0,
    reasoningRequired: false,
  });
  const results = [{
    modelId: "vendor/model",
    runs: [
      decodeRunFixture(100, 90),
      decodeRunFixture(500, 70),
      decodeRunFixture(100, 110),
      decodeRunFixture(1000, 50),
    ],
    errors: [{ run: 1, message: "boom" }, { run: 6, message: "boom" }],
  }];

  const rows = utils.buildDecodeRunRows(results, [100, 500, 1000], 2);
  assert.deepEqual(Array.from(rows, (row) => row.length), [100, 500, 1000]);
  assert.deepEqual(Array.from(rows, (row) => row.runs.length), [2, 1, 1]);
  // run 1 -> group 0; run 6 -> floor(5 / 2) = group 2.
  assert.deepEqual(Array.from(rows, (row) => row.failed), [1, 0, 1]);
  assert.equal(rows[0].perGroup, 2);
  assert.equal(rows[0].modelId, "vendor/model");
  assert.equal(rows[0].summary.decodeTpsP50, 90);
});

test("decode group status reports queued, running, partial, and failed states", () => {
  const { utils } = loadBenchUtils();
  const status = (view) => JSON.parse(JSON.stringify(utils.decodeGroupStatus(view)));
  const base = { runs: [], failed: 0, perGroup: 2, lengthIndex: 0, result: { status: "queued" } };

  assert.deepEqual(status({ ...base, result: null }), { text: "-", className: "" });
  assert.deepEqual(status(base), { text: "Queued", className: "" });
  assert.deepEqual(
    status({ ...base, result: { status: "warming" } }),
    { text: "Warming up 0/2", className: "running" },
  );
  assert.deepEqual(
    status({ ...base, result: { status: "run 1/6" } }),
    { text: "Running 0/2", className: "running" },
  );
  assert.deepEqual(
    status({ ...base, lengthIndex: 1, result: { status: "run 1/6" } }),
    { text: "Waiting", className: "" },
  );
  assert.deepEqual(
    status({ ...base, lengthIndex: 1, runs: [{}], result: { status: "run 3/6" } }),
    { text: "Running 1/2", className: "running" },
  );
  assert.deepEqual(
    status({ ...base, lengthIndex: 0, runs: [{}], result: { status: "run 3/6" } }),
    { text: "Completed 1/2", className: "complete" },
  );
  assert.deepEqual(
    status({ ...base, lengthIndex: 0, runs: [{}], failed: 1, result: { status: "run 3/6" } }),
    { text: "Partial 1/2", className: "partial" },
  );
  assert.deepEqual(
    status({ ...base, failed: 2, result: { status: "complete" } }),
    { text: "Failed 0/2", className: "error" },
  );
  assert.deepEqual(
    status({ ...base, runs: [{}, {}], result: { status: "complete" } }),
    { text: "Completed 2/2", className: "complete" },
  );
  assert.deepEqual(
    status({ ...base, result: { status: "cancelled" } }),
    { text: "Cancelled 0/2", className: "running" },
  );
});

test("decode matrix pivots per-length rows into one row per model", () => {
  const { utils } = loadBenchUtils();
  const rows = [
    { modelId: "a", length: 100, summary: { decodeTpsP50: 10 } },
    { modelId: "a", length: 500, summary: { decodeTpsP50: 8 } },
    { modelId: "b", length: 100, summary: { decodeTpsP50: 20 } },
    { modelId: "b", length: 500, summary: { decodeTpsP50: null } },
  ];

  const matrix = Array.from(utils.buildDecodeMatrixRows(rows, [100, 500, 1000]));
  assert.deepEqual(Array.from(matrix, (row) => row.modelId), ["a", "b"]);
  assert.equal(matrix[0].tps100, 10);
  assert.equal(matrix[0].tps500, 8);
  assert.equal(matrix[0].tps1000, null);
  assert.equal(matrix[1].tps100, 20);
  assert.equal(matrix[1].tps500, null);
  assert.deepEqual([...matrix[0].byLength.keys()], [100, 500]);
});

test("decode measurement prefers server reasoning tokens over the character estimate", () => {
  const { utils } = loadBenchUtils();
  const stream = {
    measurement: {
      completionTokens: 120,
      serverReasoningTokens: 40,
      ttftMs: 5,
      ttftContentMs: 25,
      lastTokenMs: 900,
      lastContentTokenMs: 925,
      endToEndLatencyMs: 1000,
    },
    reasoningText: "r".repeat(40),
    outputText: "r".repeat(40) + "c".repeat(120),
  };

  const measurement = utils.buildDecodeMeasurement(
    stream,
    { disableThinking: true, fixedOutput: true },
    100,
    true,
  );
  assert.equal(measurement.reasoningTokens, 40);
  assert.equal(measurement.visibleOutputTokens, 80);
  assert.equal(measurement.reasoningTokenSource, "server");
  assert.equal(measurement.ttftMs, 25);
  assert.equal(measurement.decodeTimeMs, 900);
  assert.equal(measurement.totalLatencyMs, 1000);
  assert.equal(measurement.decodeTokensPerSecond, 79 / 0.9);
  assert.equal(measurement.reasoningRequired, true);
  assert.equal(measurement.thinkingDisabled, false);
  assert.equal(measurement.fixedLengthApplied, true);
  assert.equal(measurement.outputTokens, 100);
});

test("decode measurement estimates the reasoning split when the server omits it", () => {
  const { utils } = loadBenchUtils();
  const stream = {
    measurement: {
      completionTokens: 100,
      serverReasoningTokens: null,
      ttftMs: 1,
      ttftContentMs: 10,
      lastTokenMs: null,
      lastContentTokenMs: 1010,
      endToEndLatencyMs: 1100,
    },
    reasoningText: "r".repeat(50),
    outputText: "r".repeat(50) + "c".repeat(150),
  };

  const measurement = utils.buildDecodeMeasurement(
    stream,
    { disableThinking: false, fixedOutput: false },
    100,
    false,
  );
  assert.equal(measurement.reasoningTokenSource, "estimated");
  assert.equal(measurement.reasoningTokens, 25);
  assert.equal(measurement.visibleOutputTokens, 75);
  assert.equal(measurement.decodeTimeMs, 1000);
  assert.equal(measurement.decodeTokensPerSecond, 74);
  assert.equal(measurement.thinkingDisabled, false);
  assert.equal(measurement.fixedLengthApplied, false);
});

test("decode measurement with no reasoning keeps every token visible", () => {
  const { utils } = loadBenchUtils();
  const stream = {
    measurement: {
      completionTokens: 100,
      serverReasoningTokens: 0,
      ttftMs: 1,
      ttftContentMs: 2,
      lastTokenMs: 10,
      lastContentTokenMs: 1002,
      endToEndLatencyMs: 1100,
    },
    reasoningText: "",
    outputText: "c".repeat(400),
  };

  const measurement = utils.buildDecodeMeasurement(
    stream,
    { disableThinking: true, fixedOutput: true },
    100,
    true,
  );
  assert.equal(measurement.reasoningTokens, 0);
  assert.equal(measurement.visibleOutputTokens, 100);
  assert.equal(measurement.reasoningRequired, false);
  assert.equal(measurement.thinkingDisabled, true);
  assert.equal(measurement.decodeTokensPerSecond, 99);
});

test("splitCompletionTokens clamps the reasoning share to the server total", () => {
  const { utils } = loadBenchUtils();
  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.splitCompletionTokens(10, 100, 50))),
    { reasoningTokens: 10, visibleOutputTokens: 0 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.splitCompletionTokens(0, 5, 10))),
    { reasoningTokens: 0, visibleOutputTokens: 0 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.splitCompletionTokens(Number.NaN, 5, 10))),
    { reasoningTokens: 0, visibleOutputTokens: 0 },
  );
  // A negative character count is treated as zero reasoning.
  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.splitCompletionTokens(7, -3, 10))),
    { reasoningTokens: 0, visibleOutputTokens: 7 },
  );
  // No output characters means the whole total is treated as visible.
  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.splitCompletionTokens(7, 5, 0))),
    { reasoningTokens: 0, visibleOutputTokens: 7 },
  );
});

test("calculateDecodeTokensPerSecond rejects non-positive time and non-finite input", () => {
  const { utils } = loadBenchUtils();
  assert.equal(utils.calculateDecodeTokensPerSecond(2, 1000), 1);
  assert.equal(utils.calculateDecodeTokensPerSecond(100, -5), null);
  assert.equal(utils.calculateDecodeTokensPerSecond(100, Number.NaN), null);
  assert.equal(utils.calculateDecodeTokensPerSecond(Number.NaN, 1000), null);
  assert.equal(utils.calculateDecodeTokensPerSecond(2, 500), 2);
});

test("summarizeDecodeRuns returns empty aggregates for no runs", () => {
  const { utils } = loadBenchUtils();
  const summary = utils.summarizeDecodeRuns([]);
  assert.equal(summary.decodeTpsP50, null);
  assert.equal(summary.decodeTpsMin, null);
  assert.equal(summary.decodeTpsMax, null);
  assert.equal(summary.ttftP50, null);
  assert.equal(summary.ttftP90, null);
  assert.equal(summary.decodeTimeP50, null);
  assert.equal(summary.totalLatencyP50, null);
  assert.equal(summary.visibleTokensP50, null);
  assert.equal(summary.reasoningTokensP50, null);
  assert.equal(summary.reasoningRequired, false);
  assert.equal(summary.completed, 0);
});

test("summarizeDecodeRuns ignores non-finite values but flags any reasoning run", () => {
  const { utils } = loadBenchUtils();
  const summary = utils.summarizeDecodeRuns([
    { decodeTokensPerSecond: 100, ttftMs: null, decodeTimeMs: 500, totalLatencyMs: 600, visibleOutputTokens: 51, reasoningTokens: 0, reasoningRequired: false },
    { decodeTokensPerSecond: 80, ttftMs: 20, decodeTimeMs: null, totalLatencyMs: 700, visibleOutputTokens: 49, reasoningTokens: 50, reasoningRequired: true },
  ]);
  assert.equal(summary.decodeTpsP50, 80);
  assert.equal(summary.decodeTpsMin, 80);
  assert.equal(summary.decodeTpsMax, 100);
  assert.equal(summary.ttftP50, 20);
  assert.equal(summary.decodeTimeP50, 500);
  assert.equal(summary.totalLatencyP90, 700);
  assert.equal(summary.reasoningRequired, true);
  assert.equal(summary.completed, 2);
});

test("decodeOutputTokensForRun supports one run per length", () => {
  const { utils } = loadBenchUtils();
  const lengths = [100, 500, 1000];
  assert.equal(utils.decodeOutputTokensForRun(0, lengths, 1), 100);
  assert.equal(utils.decodeOutputTokensForRun(1, lengths, 1), 500);
  assert.equal(utils.decodeOutputTokensForRun(2, lengths, 1), 1000);
  assert.equal(utils.decodeOutputTokensForRun(-1, lengths, 1), 100);
});

test("decode run rows keep model order and ignore non-integer failed runs", () => {
  const { utils } = loadBenchUtils();
  const results = [
    { modelId: "b", runs: [], errors: [{ run: 1, message: "boom" }] },
    { modelId: "a", runs: [], errors: [{ run: "warmup" }, { run: 2.5 }, { run: 3 }] },
  ];

  const rows = utils.buildDecodeRunRows(results, [100, 500], 2);
  assert.deepEqual(
    Array.from(rows, (row) => [row.modelId, row.length, row.failed]),
    [["b", 100, 1], ["b", 500, 0], ["a", 100, 0], ["a", 500, 1]],
  );
});

test("decode group status reports partial queued and error states", () => {
  const { utils } = loadBenchUtils();
  const status = (view) => JSON.parse(JSON.stringify(utils.decodeGroupStatus(view)));
  assert.deepEqual(
    status({ runs: [{}], failed: 0, perGroup: 2, lengthIndex: 0, result: { status: "queued" } }),
    { text: "Partial 1/2", className: "partial" },
  );
  assert.deepEqual(
    status({ runs: [], failed: 0, perGroup: 2, lengthIndex: 0, result: { status: "error" } }),
    { text: "Error 0/2", className: "error" },
  );
  // Completed groups keep their label even after a cancellation.
  assert.deepEqual(
    status({ runs: [{}, {}], failed: 0, perGroup: 2, lengthIndex: 0, result: { status: "cancelled" } }),
    { text: "Completed 2/2", className: "complete" },
  );
});

test("decode matrix returns no rows for empty input", () => {
  const { utils } = loadBenchUtils();
  assert.deepEqual(Array.from(utils.buildDecodeMatrixRows([], [100, 500])), []);
});

test("decode measurement returns no speed when content timing is missing", () => {
  const { utils } = loadBenchUtils();
  const stream = {
    measurement: {
      completionTokens: 100,
      serverReasoningTokens: 0,
      ttftMs: 5,
      ttftContentMs: null,
      lastTokenMs: null,
      lastContentTokenMs: null,
      endToEndLatencyMs: 10,
    },
    reasoningText: "",
    outputText: "abc",
  };

  const measurement = utils.buildDecodeMeasurement(
    stream,
    { disableThinking: false, fixedOutput: false },
    100,
    false,
  );
  assert.equal(measurement.ttftMs, null);
  assert.equal(measurement.decodeTimeMs, null);
  assert.equal(measurement.decodeTokensPerSecond, null);
  assert.equal(measurement.visibleOutputTokens, 100);
});

test("decode measurement clamps server reasoning tokens to the completion total", () => {
  const { utils } = loadBenchUtils();
  const stream = {
    measurement: {
      completionTokens: 100,
      serverReasoningTokens: 150,
      ttftMs: 1,
      ttftContentMs: 5,
      lastTokenMs: 1005,
      lastContentTokenMs: 1005,
      endToEndLatencyMs: 1200,
    },
    reasoningText: "r".repeat(50),
    outputText: "r".repeat(50),
  };

  const measurement = utils.buildDecodeMeasurement(
    stream,
    { disableThinking: true, fixedOutput: true },
    100,
    true,
  );
  assert.equal(measurement.reasoningTokens, 100);
  assert.equal(measurement.visibleOutputTokens, 0);
  assert.equal(measurement.reasoningRequired, true);
  assert.equal(measurement.decodeTokensPerSecond, null);
});

test("streaming completion exposes server reasoning tokens from usage details", async () => {
  const { context, utils } = loadBenchUtils();
  const sse = [
    'data: {"choices":[{"delta":{"content":"hi"}}]}',
    "",
    'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":100,"completion_tokens_details":{"reasoning_tokens":80}}}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  context.fetch = async () => new Response(sse, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const stream = await utils.runStreamingChatCompletion({
    modelId: "test-model",
    config: { logToConsole: false, requireServerTokenCounts: true, timeoutMs: 1000 },
    outerSignal: new AbortController().signal,
    runLabel: "run-1",
    connection: { endpoint: "https://example.test/v1", apiKey: "secret" },
    body: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
    logName: "test",
  });

  assert.equal(stream.measurement.completionTokens, 100);
  assert.equal(stream.measurement.serverReasoningTokens, 80);
});

test("concurrency handles empty input and more workers than items", async () => {
  const { utils } = loadBenchUtils();
  await utils.runWithConcurrency([], 3, async () => {
    throw new Error("should never run");
  });

  const seen = [];
  await utils.runWithConcurrency(["a", "b"], 5, async (item) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    seen.push(item);
  });
  assert.deepEqual(seen, ["a", "b"]);
});

test("calculateCostPerCorrect preserves a legitimate zero-dollar cost", () => {
  const { utils } = loadBenchUtils();
  assert.equal(utils.calculateCostPerCorrect(0, 4), 0);
  assert.equal(utils.calculateCostPerCorrect(2, 4), 0.5);
  assert.equal(utils.calculateCostPerCorrect(null, 4), null);
  assert.equal(utils.calculateCostPerCorrect(2, 0), null);
});

test("token usage breakdown shows total, input, and output counts", () => {
  const { utils } = loadBenchUtils();
  assert.equal(utils.formatTokenUsageBreakdown({
    requestCount: 1,
    totalTokens: 100,
    promptTokens: 10,
    completionTokens: 90,
    hasEstimated: false,
  }), "100 (10 in + 90 out)");
  assert.equal(utils.formatTokenUsageBreakdown({
    requestCount: 1,
    totalTokens: 100,
    promptTokens: 10,
    completionTokens: 90,
    hasEstimated: true,
  }), "100 (10 in + 90 out) *");
  assert.equal(utils.formatTokenUsageBreakdown({ requestCount: 0 }), "-");
});

test("benchmark error tooltip shows a short error and console guidance", () => {
  const { utils } = loadBenchUtils();
  assert.equal(utils.formatBenchmarkErrorTooltip({ errors: [] }), "");
  assert.equal(utils.formatBenchmarkErrorTooltip({
    errors: [{ run: 2, message: "Connection reset by peer" }],
  }), "Run 2: Connection reset by peer\nCheck console for details.");
  assert.equal(utils.formatBenchmarkErrorTooltip({
    errors: [
      { run: 1, message: "First failure" },
      { run: "warmup", message: "The endpoint rejected the request" },
    ],
  }), "Warm-up: The endpoint rejected the request (2 errors total)\nCheck console for details.");
  const shortened = utils.formatBenchmarkErrorTooltip({
    errors: [{ run: 1, message: "x".repeat(300) }],
  });
  assert.match(shortened, /^Run 1: x+…\nCheck console for details\.$/);
  assert.ok(shortened.split("\n")[0].length <= 160);
});

test("aggregate cost per correct is unavailable when any usage is unpriced", () => {
  const { utils } = loadBenchUtils();
  assert.equal(utils.calculateAggregateCostPerCorrect({
    cost: 2,
    pricedUsageCount: 1,
    hasUnpriced: false,
  }, 4), 0.5);
  assert.equal(utils.calculateAggregateCostPerCorrect({
    cost: 0,
    pricedUsageCount: 1,
    hasUnpriced: false,
  }, 4), 0);
  assert.equal(utils.calculateAggregateCostPerCorrect({
    cost: 2,
    pricedUsageCount: 1,
    hasUnpriced: true,
  }, 4), null);
  assert.equal(utils.calculateAggregateCostPerCorrect({
    cost: 0,
    pricedUsageCount: 0,
    hasUnpriced: true,
  }, 4), null);
});

test("aggregate benchmark status reflects model outcomes", () => {
  const { utils } = loadBenchUtils();
  const result = (status, runCount = 0) => ({
    status,
    runs: Array.from({ length: runCount }, () => ({})),
  });

  assert.equal(utils.deriveBenchmarkRunStatus([
    result("complete", 2),
    result("complete", 2),
  ]), "complete");
  assert.equal(utils.deriveBenchmarkRunStatus([
    result("complete", 2),
    result("error"),
  ]), "partial");
  assert.equal(utils.deriveBenchmarkRunStatus([
    result("partial", 1),
    result("error"),
  ]), "partial");
  assert.equal(utils.deriveBenchmarkRunStatus([
    result("error"),
    result("error"),
  ]), "error");
  assert.equal(utils.deriveBenchmarkRunStatus([], {}), "error");
  assert.equal(utils.deriveBenchmarkRunStatus([
    result("complete", 2),
  ], { wasAborted: true }), "cancelled");
  assert.equal(utils.deriveBenchmarkRunStatus([
    result("complete", 2),
  ], { orchestrationFailed: true }), "error");
});

test("thinking accuracy counts measured request failures as incorrect", () => {
  const { utils } = loadBenchUtils();
  const summary = utils.summarizeThinkingAccuracy({
    runs: [
      { correct: true, formatCompliant: true },
      { correct: false, formatCompliant: true },
    ],
    errors: [
      { run: "warmup", message: "ignored warm-up failure" },
      { run: 3, message: "timeout" },
    ],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    correct: 1,
    compliant: 2,
    total: 3,
    successful: 2,
    failed: 1,
    accuracy: 1 / 3,
    formatCompliance: 2 / 3,
  });
});

test("thinking accuracy aggregates successful and failed attempts across models", () => {
  const { utils } = loadBenchUtils();
  const summary = utils.summarizeRunThinkingAccuracy([
    {
      runs: [{ correct: true, formatCompliant: true }],
      errors: [{ run: 2, message: "timeout" }],
    },
    {
      runs: [
        { correct: true, formatCompliant: true },
        { correct: false, formatCompliant: false },
      ],
      errors: [],
    },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    correct: 2,
    compliant: 2,
    total: 4,
    successful: 3,
    failed: 1,
  });
});

test("rendering failures do not turn successful requests into benchmark failures", async () => {
  const { renderErrors, utils } = loadBenchUtils();
  const result = {
    modelId: "test-model",
    status: "queued",
    warmup: null,
    runs: [],
    errors: [],
  };
  const controller = new AbortController();
  const measurement = {
    ttftMs: 10,
    endToEndLatencyMs: 100,
    tokensPerSecond: 50,
    promptTokens: 5,
    completionTokens: 10,
  };

  await utils.runBenchmarkSequence(
    result,
    { runs: 1 },
    controller.signal,
    async () => measurement,
    () => { throw new Error("synthetic render failure"); },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.runs.length, 1);
  assert.deepEqual(result.errors, []);
  assert.ok(renderErrors.length >= 1);
});

test("concurrency runs different items in parallel but never overlaps one item's work", async () => {
  const { utils } = loadBenchUtils();
  let active = 0;
  let maxActive = 0;
  const activePerItem = new Map();
  const items = ["a", "b", "c", "d"];

  await utils.runWithConcurrency(items, 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    activePerItem.set(item, (activePerItem.get(item) ?? 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(activePerItem.get(item), 1, `item ${item} overlapped with itself`);
    active -= 1;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual([...activePerItem.keys()], items);
  assert.deepEqual([...activePerItem.values()], [1, 1, 1, 1]);
});

test("concurrency stops scheduling new items after a failure but finishes in-flight work", async () => {
  const { utils } = loadBenchUtils();
  const items = ["a", "b", "c", "d", "e", "f"];
  const started = [];
  let resolved = 0;

  await assert.rejects(
    () => utils.runWithConcurrency(items, 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, 5));
      resolved += 1;
      if (item === "b") throw new Error("boom");
    }),
    /boom/,
  );

  // The worker owning "b" failed; its sibling may pick up one more item while
  // "b" is in flight, but no further items are scheduled after the failure.
  assert.ok(started.includes("a") && started.includes("b"));
  assert.ok(started.length < items.length, `expected work to stop early, started ${started.join(",")}`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(resolved, started.length, "in-flight work should settle before rejecting");
});

test("benchmark sequence never overlaps runs for the same model", async () => {
  const { utils } = loadBenchUtils();
  const result = { modelId: "test-model", status: "queued", warmup: null, runs: [], errors: [] };
  let active = 0;
  let maxActive = 0;

  await utils.runBenchmarkSequence(
    result,
    { runs: 3 },
    new AbortController().signal,
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 3));
      active -= 1;
      return {
        ttftMs: 10,
        endToEndLatencyMs: 100,
        tokensPerSecond: 50,
        promptTokens: 5,
        completionTokens: 10,
      };
    },
    () => {},
  );

  assert.equal(maxActive, 1);
  assert.equal(result.runs.length, 3);
  assert.equal(result.status, "complete");
});

test("benchmark sequence preserves successful runs and records measured failures", async () => {
  const { utils } = loadBenchUtils();
  const result = {
    modelId: "test-model",
    status: "queued",
    warmup: null,
    runs: [],
    errors: [],
  };
  const calls = [];
  const measurement = {
    ttftMs: 10,
    endToEndLatencyMs: 100,
    tokensPerSecond: 50,
    promptTokens: 5,
    completionTokens: 10,
  };

  await utils.runBenchmarkSequence(
    result,
    { runs: 3 },
    new AbortController().signal,
    async ({ runIndex, label }) => {
      calls.push(label);
      if (runIndex === 1) throw new Error("synthetic measured failure");
      return measurement;
    },
    () => {},
  );

  assert.deepEqual(calls, ["warmup", "run-1", "run-2", "run-3"]);
  assert.equal(result.status, "partial");
  assert.deepEqual(Array.from(result.runs, (run) => run.index), [1, 3]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), [
    { run: 2, message: "synthetic measured failure" },
  ]);
});

test("benchmark sequence reports error when every measured run fails", async () => {
  const { utils } = loadBenchUtils();
  const result = {
    modelId: "test-model",
    status: "queued",
    warmup: null,
    runs: [],
    errors: [],
  };

  await utils.runBenchmarkSequence(
    result,
    { runs: 2 },
    new AbortController().signal,
    async ({ runIndex }) => {
      if (runIndex >= 0) throw new Error(`failed ${runIndex + 1}`);
      return { promptTokens: 1, completionTokens: 1 };
    },
    () => {},
  );

  assert.equal(result.status, "error");
  assert.equal(result.runs.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), [
    { run: 1, message: "failed 1" },
    { run: 2, message: "failed 2" },
  ]);
});

test("benchmark sequence stops after cancellation without inventing failures", async () => {
  const { utils } = loadBenchUtils();
  const controller = new AbortController();
  const result = {
    modelId: "test-model",
    status: "queued",
    warmup: null,
    runs: [],
    errors: [],
  };

  await utils.runBenchmarkSequence(
    result,
    { runs: 3 },
    controller.signal,
    async ({ runIndex }) => {
      if (runIndex === -1) controller.abort();
      return { promptTokens: 1, completionTokens: 1 };
    },
    () => {},
  );

  assert.equal(result.status, "cancelled");
  assert.equal(result.runs.length, 0);
  assert.deepEqual(result.errors, []);
});

test("SSE parsing accepts data chunks and ignores protocol noise", () => {
  const { utils } = loadBenchUtils();
  assert.equal(utils.parseSseLine(""), null);
  assert.equal(utils.parseSseLine(": keepalive"), null);
  assert.equal(utils.parseSseLine("data: [DONE]"), null);
  assert.equal(utils.parseSseLine("data: not-json"), null);

  const chunk = utils.parseSseLine(
    'data: {"choices":[{"delta":{"content":"hi","reasoning_content":"think"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
  );
  assert.deepEqual(JSON.parse(JSON.stringify(utils.extractSseChunkData(chunk))), {
    completionTokens: 2,
    promptTokens: 3,
    reasoningTokens: null,
    finishReason: "stop",
    contentDelta: "hi",
    reasoningDelta: "think",
  });

  const detailed = utils.parseSseLine(
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":100,"completion_tokens_details":{"reasoning_tokens":80}}}',
  );
  assert.equal(utils.extractSseChunkData(detailed).reasoningTokens, 80);

  const flatReasoning = utils.parseSseLine(
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":100,"reasoning_tokens":60}}',
  );
  assert.equal(utils.extractSseChunkData(flatReasoning).reasoningTokens, 60);
});

test("stream exchange capture is opt-in", async () => {
  const { context, utils } = loadBenchUtils();
  const sse = [
    'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":null}]}',
    "",
    'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  context.fetch = async () => new Response(sse, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  const baseOptions = {
    modelId: "test-model",
    config: { logToConsole: false, requireServerTokenCounts: true, timeoutMs: 1000 },
    outerSignal: new AbortController().signal,
    runLabel: "run-1",
    connection: { endpoint: "https://example.test/v1", apiKey: "secret" },
    body: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
    logName: "test",
  };

  const uncaptured = await utils.runStreamingChatCompletion(baseOptions);
  assert.equal(uncaptured.request, null);
  assert.equal(uncaptured.response, null);
  assert.equal(uncaptured.consolidatedOutput, null);
  assert.equal(uncaptured.contentText, "hello");

  const captured = await utils.runStreamingChatCompletion({
    ...baseOptions,
    outerSignal: new AbortController().signal,
    captureExchange: true,
  });
  assert.match(captured.request, /Authorization: Bearer \[REDACTED\]/);
  assert.match(captured.response, /\[chunk 1\]/);
  assert.match(captured.consolidatedOutput, /hello/);
});

test("streaming completion tracks visible-token timing separately from reasoning", async () => {
  const { context, utils } = loadBenchUtils();
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"let me think "}}]}',
    "",
    'data: {"choices":[{"delta":{"reasoning_content":"about it"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":" world"}}]}',
    "",
    'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":9}}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  context.fetch = async () => new Response(sse, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const stream = await utils.runStreamingChatCompletion({
    modelId: "test-model",
    config: { logToConsole: false, requireServerTokenCounts: true, timeoutMs: 1000 },
    outerSignal: new AbortController().signal,
    runLabel: "run-1",
    connection: { endpoint: "https://example.test/v1", apiKey: "secret" },
    body: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
    logName: "test",
  });

  assert.equal(stream.contentText, "hello world");
  assert.equal(stream.reasoningText, "let me think about it");
  assert.ok(Number.isFinite(stream.measurement.ttftMs));
  assert.ok(Number.isFinite(stream.measurement.ttftContentMs));
  assert.ok(Number.isFinite(stream.measurement.lastContentTokenMs));
  assert.ok(stream.measurement.ttftContentMs >= stream.measurement.ttftMs);
  assert.ok(stream.measurement.lastContentTokenMs >= stream.measurement.ttftContentMs);

  const split = utils.splitCompletionTokens(
    stream.measurement.completionTokens,
    stream.reasoningText.length,
    stream.outputText.length,
  );
  assert.equal(split.reasoningTokens + split.visibleOutputTokens, 9);
  assert.ok(split.visibleOutputTokens > 0);
  assert.ok(split.reasoningTokens > 0);
});

test("streaming completion rejects missing server usage when required", async () => {
  const { context, utils } = loadBenchUtils();
  const sse = [
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  context.fetch = async () => new Response(sse, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  await assert.rejects(
    utils.runStreamingChatCompletion({
      modelId: "test-model",
      config: { logToConsole: false, requireServerTokenCounts: true, timeoutMs: 1000 },
      outerSignal: new AbortController().signal,
      runLabel: "run-1",
      connection: { endpoint: "https://example.test/v1", apiKey: "secret" },
      body: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
      logName: "test",
    }),
    /omitted prompt or completion token usage/,
  );
});

test("streaming completion estimates missing usage when allowed", async () => {
  const { context, utils } = loadBenchUtils();
  const sse = [
    'data: {"choices":[{"delta":{"content":"hello world"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  context.fetch = async () => new Response(sse, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const stream = await utils.runStreamingChatCompletion({
    modelId: "test-model",
    config: { logToConsole: false, requireServerTokenCounts: false, timeoutMs: 1000 },
    outerSignal: new AbortController().signal,
    runLabel: "run-1",
    connection: { endpoint: "https://example.test/v1", apiKey: "secret" },
    body: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
    logName: "test",
  });

  assert.equal(stream.measurement.tokenCountEstimated, true);
  assert.equal(stream.measurement.promptTokenCountEstimated, true);
  assert.equal(stream.measurement.completionTokenCountEstimated, true);
  assert.ok(stream.measurement.promptTokens > 0);
  assert.ok(stream.measurement.completionTokens > 0);
});
