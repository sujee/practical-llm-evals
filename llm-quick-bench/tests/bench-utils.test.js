const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

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
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "bench-utils.js"), "utf8");
  vm.runInContext(`${source}\nthis.__benchUtils = {
    buildRunThroughputSeries,
    calculateAggregateCostPerCorrect,
    calculateCostPerCorrect,
    createTableSorter,
    deriveBenchmarkRunStatus,
    extractSseChunkData,
    formatBenchmarkErrorTooltip,
    formatTokenUsageBreakdown,
    getVisibleColumnDefinitions,
    parseSseLine,
    runBenchmarkSequence,
    runStreamingChatCompletion,
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
    finishReason: "stop",
    contentDelta: "hi",
    reasoningDelta: "think",
  });
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
