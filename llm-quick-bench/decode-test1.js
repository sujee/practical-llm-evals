// Decode Test - client-observed output generation speed.
//
// Reuses the shared model loader and selection state owned by speed-test1.js and
// the streaming/summary/format helpers in bench-utils.js. Each model runs one
// measured test per configured output length (comma-separated in the form and
// defaulting to 100, 500, 1000 tokens), streaming a short fixed prompt, and
// measures for every run:
//
//   Decode Speed = (visible output tokens - 1) / (first -> last visible token time)
//   TTFT         = request start -> first visible output token
//   Decode Time  = first visible output token -> last visible output token
//   Total Latency = request start -> stream completion
//
// When a model emits reasoning content, those tokens are excluded from the decode
// speed and the run is marked "reasoning required". The visible/reasoning token
// split prefers the server's exact reasoning-token count and falls back to a
// character-proportional estimate when the endpoint reports only the combined total.
// Results render as one table row per model/output-length run and update live.
//
// Loaded with `defer`, after speed-test1.js and thinking-test1.js.

const DECODE_PROMPT = "Generate a continuous stream of lowercase English words separated by single spaces. Do not use punctuation, numbers, headings, explanations, or formatting. Begin immediately and continue generating until stopped.";
// Fallback only: used when the output-lengths field parses to no valid values.
// The tests that run always come from the field, never from this list.
const DECODE_DEFAULT_OUTPUT_TOKENS = [100, 500, 1000];

const decodeForm = document.querySelector("#decode-form");
const decodeLengthsInput = document.querySelector("#decode-lengths");
const decodeRunsInput = document.querySelector("#decode-runs");
const decodeConcurrencyInput = document.querySelector("#decode-concurrency");
const decodeTimeoutInput = document.querySelector("#decode-timeout");
const decodePromptInput = document.querySelector("#decode-prompt");
const decodeDisableThinkingInput = document.querySelector("#decode-disable-thinking");
const decodeFixedOutputInput = document.querySelector("#decode-fixed-output");
const decodeRequireServerTokensInput = document.querySelector("#decode-require-server-tokens");
const decodeLogConsoleInput = document.querySelector("#decode-log-console");
// Exclude any control that is disabled/read-only in the markup so toggling the
// form back on after a run does not enable it.
const decodeConfigInputs = [...decodeForm.querySelectorAll("input, select, textarea")]
  .filter((control) => !control.disabled && !control.readOnly);
const decodeRunButton = document.querySelector("#decode-run-button");
const decodeCancelButton = document.querySelector("#decode-cancel-button");
const decodeStatus = document.querySelector("#decode-status");
const decodeResults = document.querySelector("#decode-results");
const decodeBody = document.querySelector("#decode-body");
const decodeMatrix = document.querySelector("#decode-matrix");
const decodeChart = document.querySelector("#decode-chart");
const decodeUsageNote = document.querySelector("#decode-usage-note");
const decodeSummaryTime = document.querySelector("#decode-summary-time");
const decodeSummaryBest = document.querySelector("#decode-summary-best");
const decodeSummaryTotalTokens = document.querySelector("#decode-summary-total-tokens");
const decodeSummaryCost = document.querySelector("#decode-summary-cost");
const exportDecodeCsvButton = document.querySelector("#export-decode-csv");
const exportDecodeJsonButton = document.querySelector("#export-decode-json");
const exportDecodeMatrixCsvButton = document.querySelector("#export-decode-matrix-csv");
const exportDecodeMatrixJsonButton = document.querySelector("#export-decode-matrix-json");
const decodeColumnOptions = document.querySelector("#decode-column-options");
const showAllDecodeColumnsButton = document.querySelector("#show-all-decode-columns");
const decodeTemplateCode = document.querySelector("#decode-request-template-code");
const decodeSampleRequestNote = document.querySelector("#decode-sample-request-note");
const decodeSampleRequestCode = document.querySelector("#decode-sample-request-code");
const decodeSampleResponseNote = document.querySelector("#decode-sample-response-note");
const decodeSampleResponseCode = document.querySelector("#decode-sample-response-code");
const decodeSampleOutputNote = document.querySelector("#decode-sample-output-note");
const decodeSampleOutputCode = document.querySelector("#decode-sample-output-code");

const decodeColumns = [
  { key: "modelId", label: "Model" },
  { key: "length", label: "Output tokens" },
  { key: "status", label: "Status" },
  { key: "decodeTpsP50", label: "Decode Speed p50 (tok/s)" },
  { key: "ttftP50", label: "TTFT p50" },
  { key: "ttftP90", label: "TTFT p90" },
  { key: "decodeTimeP50", label: "Decode Time p50" },
  { key: "totalLatencyP50", label: "Total Latency p50" },
  { key: "totalLatencyP90", label: "Total Latency p90" },
  { key: "visibleTokensP50", label: "Visible tokens" },
  { key: "reasoningTokensP50", label: "Reasoning tokens" },
  { key: "reasoningStatus", label: "Reasoning" },
];

const decodeColumnPreferenceKey = "llm-quick-bench:decode-columns:v1";
const defaultDecodeColumns = decodeColumns.map((column) => column.key);

// Leaderboard pivot (one row per model, one column per output length). The
// columns follow the configured output lengths, so the shared table controller
// is rebuilt whenever the active lengths change; the longest length stays the
// default sort column. Returns true when the table was recreated.
let decodeMatrixColumns = [];
let decodeMatrixTable = null;
let decodeMatrixLengthsKey = null;

function rebuildDecodeMatrixTable(lengths) {
  const key = lengths.join(",");
  if (key === decodeMatrixLengthsKey) return false;
  decodeMatrixLengthsKey = key;
  decodeMatrixColumns = [
    { key: "modelId", label: "Model" },
    ...lengths.map((length) => ({
      key: `tps${length}`,
      label: String(length),
    })),
  ];
  decodeMatrixTable = createBenchmarkTable({
    columns: decodeMatrixColumns,
    columnAttr: "decodeMatrixColumn",
    preferenceKey: "llm-quick-bench:decode-matrix-columns:v1",
    initialSortKey: `tps${lengths[lengths.length - 1]}`,
    initialSortDirection: "descending",
    onSort: renderDecodeMatrix,
  });
  return true;
}

let decodeRun = null;
let decodeAbortController = null;
let decodeStartedAtMs = null;
let decodeStopClock = null;
let decodeSampleCapturePending = false;

const decodeTable = createBenchmarkTable({
  columns: decodeColumns,
  columnAttr: "decodeColumn",
  preferenceKey: decodeColumnPreferenceKey,
  defaultColumns: defaultDecodeColumns,
  initialSortKey: "modelId",
  initialSortDirection: "ascending",
  pickerContainer: decodeColumnOptions,
  showAllButton: showAllDecodeColumnsButton,
  onSort: renderDecodeResults,
});

exportDecodeCsvButton.addEventListener("click", exportDecodeCsv);
exportDecodeJsonButton.addEventListener("click", exportDecodeJson);
exportDecodeMatrixCsvButton.addEventListener("click", exportDecodeMatrixCsv);
exportDecodeMatrixJsonButton.addEventListener("click", exportDecodeMatrixJson);
decodeCancelButton.addEventListener("click", () => decodeAbortController?.abort());
document.addEventListener("models:selection-changed", updateDecodeRunButtonState);
document.addEventListener("models:selection-changed", () => {
  if (decodeAbortController == null) renderDecodeResults();
});
[decodeLengthsInput, decodePromptInput, decodeDisableThinkingInput, decodeFixedOutputInput].forEach((control) => {
  control.addEventListener("input", renderDecodeRequestTemplate);
  control.addEventListener("change", renderDecodeRequestTemplate);
});
decodeLengthsInput.addEventListener("input", () => {
  if (isDecodeBenchmarkRunning()) return;
  if (rebuildDecodeMatrixTable(getActiveDecodeOutputTokenOptions())) {
    renderBenchmarkSafely(renderDecodeResults, "Decode Test output lengths change");
  }
});
providerSelect.addEventListener("change", renderDecodeRequestTemplate);
endpointInput.addEventListener("input", renderDecodeRequestTemplate);

decodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (typeof speedAbortController !== "undefined" && speedAbortController != null) {
    setDecodeStatus("Speed Test 1 is already running.", true);
    return;
  }
  if (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null) {
    setDecodeStatus("Thinking Test 1 is already running.", true);
    return;
  }
  const selectedModels = models.filter((model) => model.selected);
  if (selectedModels.length === 0) {
    setDecodeStatus("Select at least one model to run.", true);
    return;
  }

  const prompt = decodePromptInput.value.trim();
  if (!prompt) {
    setDecodeStatus("Enter a benchmark prompt.", true);
    return;
  }

  const runsPerConfig = clampInteger(decodeRunsInput.value, 1, 20);
  const outputTokenLengths = getDecodeOutputTokenOptions();
  const config = {
    runsPerConfig,
    runs: runsPerConfig * outputTokenLengths.length,
    outputTokenLengths: [...outputTokenLengths],
    concurrency: clampInteger(decodeConcurrencyInput.value, 1, 12),
    timeoutMs: clampInteger(decodeTimeoutInput.value, 10, 600) * 1000,
    prompt,
    logToConsole: decodeLogConsoleInput.checked,
    disableThinking: decodeDisableThinkingInput.checked,
    fixedOutput: decodeFixedOutputInput.checked,
    requireServerTokenCounts: decodeRequireServerTokensInput.checked,
  };
  const connection = {
    provider: providerSelect.value,
    endpoint: endpointInput.value,
    apiKey: apiKeyInput.value.trim(),
  };

  decodeAbortController = new AbortController();
  decodeStartedAtMs = performance.now();
  const runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  decodeRun = createBenchmarkRun({
    selectedModels,
    connection,
    config,
    runSeed,
    methodology: {
      temperature: 0,
      topP: 1,
      prompt: "short fixed prompt requesting a continuous stream of lowercase words",
      outputLengths: config.outputTokenLengths.join(", ") + " tokens",
      runsPerOutputLength: runsPerConfig,
      percentiles: "decode speed p50; TTFT p50/p90; total latency p50/p90; nearest rank",
      decodeSpeed: "(visible output tokens - 1) / seconds from first visible token to last visible token",
      ttft: "request dispatch to first visible output token",
      decodeTime: "first visible output token to last visible output token",
      totalLatency: "request dispatch to response stream close",
      reasoning: "reasoning content is excluded from decode speed and marks the run 'reasoning required'",
      visibleTokens: "server completion-token total minus the reasoning share; the server's reported reasoning-token count when available, otherwise a character-proportional estimate",
      fixedOutput: "min_tokens plus ignore_eos when the endpoint supports it",
      percentile: "nearest rank",
    },
  });
  rebuildDecodeMatrixTable(config.outputTokenLengths);
  exportDecodeCsvButton.disabled = false;
  exportDecodeJsonButton.disabled = false;
  exportDecodeMatrixCsvButton.disabled = false;
  exportDecodeMatrixJsonButton.disabled = false;
  const scheduledResults = shuffleWithSeed([...decodeRun.results], runSeed);
  decodeRun.executionOrder = scheduledResults.map((result) => result.modelId);
  setDecodeRunning(true);
  decodeResults.hidden = false;
  renderBenchmarkSafely(renderDecodeResults, "Decode Test initial state");
  renderBenchmarkSafely(renderDecodeMethodologySample, "Decode Test sample exchange reset");
  scrollToBenchmarkResults(decodeResults);
  setDecodeStatus(`Running ${selectedModels.length} models × ${config.outputTokenLengths.length} output lengths (${config.outputTokenLengths.join(", ")}) × ${runsPerConfig} runs with up to ${Math.min(config.concurrency, selectedModels.length)} models in parallel…`);

  let orchestrationFailed = false;
  try {
    await runWithConcurrency(
      scheduledResults,
      config.concurrency,
      (result) => benchmarkDecodeModel(result, config, decodeAbortController.signal, connection),
    );
    const completed = decodeRun.results.filter((result) => result.runs.length > 0).length;
    const failed = decodeRun.results.filter((result) => result.status === "error").length;
    const partial = decodeRun.results.filter((result) => result.status === "partial").length;
    setDecodeStatus(
      decodeAbortController.signal.aborted
        ? `Cancelled. Preserved results for ${completed} completed model${completed === 1 ? "" : "s"}.`
        : `Finished ${completed} model${completed === 1 ? "" : "s"}${partial ? `; ${partial} had failed runs` : ""}${failed ? `; ${failed} failed` : ""}.`,
      failed > 0 && completed === 0,
    );
  } catch (error) {
    orchestrationFailed = true;
    console.error("[LLM Quick Bench] Decode Test orchestration failed.", error);
    setDecodeStatus(error.message || "Decode Test stopped unexpectedly.", true);
  } finally {
    const wasAborted = decodeAbortController?.signal.aborted ?? false;
    decodeRun.status = deriveBenchmarkRunStatus(decodeRun.results, {
      wasAborted,
      orchestrationFailed,
    });
    decodeRun.finishedAt = new Date().toISOString();
    decodeRun.totalTestTimeMs = performance.now() - decodeStartedAtMs;
    decodeRun.usage = summarizeRunUsage(decodeRun.results);
    decodeAbortController = null;
    decodeStartedAtMs = null;
    decodeSampleCapturePending = false;
    setDecodeRunning(false);
    renderBenchmarkSafely(renderDecodeResults, "Decode Test final state");
    if (typeof updateSpeedRunButtonState === "function") updateSpeedRunButtonState();
    if (typeof updateThinkingRunButtonState === "function") updateThinkingRunButtonState();
  }
});

function isDecodeBenchmarkRunning() {
  return decodeAbortController != null;
}

function updateDecodeRunButtonState() {
  decodeRunButton.disabled = !models?.some((model) => model.selected)
    || modelsLoading
    || decodeAbortController != null
    || (typeof speedAbortController !== "undefined" && speedAbortController != null)
    || (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null);
}

function setDecodeRunning(isRunning) {
  const otherRunning = (typeof speedAbortController !== "undefined" && speedAbortController != null)
    || (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null);
  decodeRunButton.disabled = isRunning
    || otherRunning
    || !models?.some((model) => model.selected)
    || modelsLoading;
  decodeRunButton.firstElementChild.textContent = isRunning ? "Running…" : "Run selected";
  decodeRunButton.setAttribute("aria-busy", String(isRunning));
  decodeCancelButton.hidden = !isRunning;
  decodeConfigInputs.forEach((control) => { control.disabled = isRunning; });
  loadButton.disabled = isRunning;
  connectionControls.forEach((control) => { control.disabled = isRunning; });
  modelSelectionButtons.forEach((button) => { button.disabled = isRunning; });
  document.querySelectorAll("#models-body .model-select").forEach((checkbox) => { checkbox.disabled = isRunning; });
  if (typeof speedRunButton !== "undefined") {
    speedRunButton.disabled = isRunning
      || speedAbortController != null
      || !models.some((model) => model.selected)
      || modelsLoading;
  }
  if (typeof thinkingRunButton !== "undefined") {
    thinkingRunButton.disabled = isRunning
      || thinkingAbortController != null
      || !models.some((model) => model.selected)
      || modelsLoading;
  }
  if (isRunning) startDecodeClock(); else stopDecodeClock();
}

function setDecodeStatus(message, isError = false) {
  decodeStatus.textContent = message;
  decodeStatus.classList.toggle("error", isError);
}

function buildDecodeRequestBody(modelId, config, includeUsage = true, provider = null, fixedOutput = config.fixedOutput, outputTokens = config.outputTokenLengths[0]) {
  const outputLimitField = provider === "openai" ? "max_completion_tokens" : "max_tokens";
  const body = {
    model: modelId,
    messages: buildBenchmarkMessages(config.prompt),
    stream: true,
    temperature: 0,
    top_p: 1,
    [outputLimitField]: outputTokens,
  };
  if (includeUsage) body.stream_options = { include_usage: true };
  if (config.disableThinking) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  if (fixedOutput) {
    body.min_tokens = outputTokens;
    body.ignore_eos = true;
  }
  return body;
}

async function benchmarkDecodeModel(result, config, signal, connection) {
  await runBenchmarkSequence(
    result,
    config,
    signal,
    ({ runIndex, label, includeUsage }) => {
      // Runs are serial per model and grouped by output length: the first
      // `runsPerConfig` runs use the first length, then the next group, etc.
      const outputTokens = decodeOutputTokensForRun(
        runIndex,
        config.outputTokenLengths,
        config.runsPerConfig,
      );
      return runDecodeCompletion(
        result.modelId,
        outputTokens,
        config,
        signal,
        includeUsage,
        label,
        connection,
      );
    },
    renderDecodeResults,
  );
}

async function runDecodeCompletion(modelId, outputTokens, config, outerSignal, includeUsage, runLabel, connection) {
  const captureExchange = runLabel.startsWith("run-")
    && decodeRun != null
    && decodeRun.sampleExchange == null
    && !decodeSampleCapturePending;
  if (captureExchange) decodeSampleCapturePending = true;
  let stream;
  let fixedLengthApplied = Boolean(config.fixedOutput);
  const requestOptions = {
    modelId,
    config,
    outerSignal,
    runLabel,
    connection,
    logName: "Decode Test",
    captureExchange,
  };
  try {
    try {
      stream = await runStreamingChatCompletion({
        ...requestOptions,
        body: buildDecodeRequestBody(modelId, config, includeUsage, connection.provider, config.fixedOutput, outputTokens),
      });
    } catch (error) {
      // Some OpenAI-compatible endpoints reject min_tokens / ignore_eos. Fall back
      // to max_tokens-only so the run still measures decode speed, just without a
      // hard length floor.
      if (!(fixedLengthApplied && error instanceof HttpError && error.status === 400)) throw error;
      fixedLengthApplied = false;
      console.warn(
        `[Decode Test] ${modelId} · ${runLabel} rejected min_tokens/ignore_eos; retrying without a forced output length.`,
      );
      stream = await runStreamingChatCompletion({
        ...requestOptions,
        body: buildDecodeRequestBody(modelId, config, includeUsage, connection.provider, false, outputTokens),
      });
    }

    const measurement = buildDecodeMeasurement(stream, config, outputTokens, fixedLengthApplied);
    if (measurement.reasoningRequired) {
      console.warn(
        `[Decode Test] ${modelId} · ${runLabel} emitted reasoning content (~${measurement.reasoningTokens} tokens); reported as "reasoning required" and excluded from decode speed.`,
      );
    }

    if (captureExchange && decodeRun && !decodeRun.sampleExchange) {
      decodeRun.sampleExchange = {
        modelId,
        runLabel,
        capturedAt: new Date().toISOString(),
        request: stream.request,
        response: stream.response,
        consolidatedOutput: stream.consolidatedOutput,
      };
      renderBenchmarkSafely(renderDecodeMethodologySample, "Decode Test sample exchange");
    }

    logBenchmarkEvent(config, "Decode Test", "completion summary", {
      model: modelId,
      run: runLabel,
      outputTokens,
      measurement,
    });
    return measurement;
  } finally {
    // Release the capture slot even when the first or retry request throws, so a
    // later measured run can still capture a sample exchange.
    if (captureExchange) decodeSampleCapturePending = false;
  }
}

function getDecodeRunsPerConfig() {
  if (decodeRun?.config?.runsPerConfig) return decodeRun.config.runsPerConfig;
  return clampInteger(decodeRunsInput?.value, 1, 20);
}

// Parses the comma-separated output-lengths field; falls back to the
// 100/500/1000 defaults when nothing valid can be parsed.
function getDecodeOutputTokenOptions() {
  const lengths = parseDecodeOutputTokenOptions(decodeLengthsInput?.value);
  return lengths.length > 0 ? lengths : [...DECODE_DEFAULT_OUTPUT_TOKENS];
}

// Rows, the leaderboard matrix, and the chart follow the active run's lengths
// while results exist; otherwise they preview the lengths in the form field.
function getActiveDecodeOutputTokenOptions() {
  const runLengths = decodeRun?.config?.outputTokenLengths;
  if (Array.isArray(runLengths) && runLengths.length > 0) return runLengths;
  return getDecodeOutputTokenOptions();
}

// Flattens model results into one row per model × output length. Each row carries
// the group's completed runs and an aggregate summary, so rows exist before a run
// finishes and the table is visible and fills in during a run.
function getDecodeRunRows() {
  const results = decodeRun
    ? decodeRun.results
    : models.filter((model) => model.selected).map((model) => ({
      modelId: model.modelId,
      runs: [],
      errors: [],
      status: null,
      pricing: {
        inputPerMillionTokens: model.inputPrice,
        outputPerMillionTokens: model.outputPrice,
      },
    }));
  return buildDecodeRunRows(results, getActiveDecodeOutputTokenOptions(), getDecodeRunsPerConfig());
}

function getDecodeSortValue(view, key) {
  const summary = view.summary;
  switch (key) {
    case "modelId": return view.modelId;
    case "length": return view.length;
    case "status": return decodeGroupStatus(view).text;
    case "reasoningStatus": return summary.reasoningRequired ? 1 : 0;
    default: return summary[key];
  }
}

// One row per model with a p50 decode-speed value per output length, keyed as
// `tps<length>` for the leaderboard table plus a `byLength` map for the chart.
function getDecodeMatrixRows() {
  return buildDecodeMatrixRows(getDecodeRunRows(), getActiveDecodeOutputTokenOptions());
}

function getDecodeMatrixSortValue(row, key) {
  return key === "modelId" ? row.modelId : row[key];
}

// Compact pivot: one row per model, one column per output length, value = p50
// tok/s. Built from the shared benchmark-table controller so every column is
// sortable and the active sort column shows the standard site styling.
function renderDecodeMatrix() {
  const thead = document.createElement("thead");
  decodeMatrixTable.renderHeaders(thead);
  const tbody = document.createElement("tbody");
  const rows = decodeMatrixTable.sortRows(getDecodeMatrixRows(), getDecodeMatrixSortValue);
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = decodeMatrixColumns.length;
    cell.className = "decode-empty-cell";
    cell.textContent = "Select one or more models above, then run the Decode Test to compare decode speeds.";
    row.append(cell);
    tbody.append(row);
  } else {
    rows.forEach((matrixRow) => {
      const row = document.createElement("tr");
      decodeMatrixColumns.forEach(({ key }) => {
        const cell = document.createElement("td");
        cell.dataset.decodeMatrixColumn = key;
        cell.hidden = !decodeMatrixTable.isVisible(key);
        if (key === "modelId") {
          cell.className = "decode-matrix-model";
          cell.textContent = matrixRow.modelId;
          cell.title = matrixRow.modelId;
        } else {
          cell.className = "decode-speed-cell";
          cell.textContent = formatDecodeRate(matrixRow[key]);
        }
        decodeMatrixTable.markCell(cell, key);
        row.append(cell);
      });
      tbody.append(row);
    });
  }

  const table = document.createElement("table");
  table.className = "decode-matrix";
  table.append(thead, tbody);
  decodeMatrix.replaceChildren(table);
}

// Friendly chart labels: prefer the catalog name from model-info.json (e.g.
// "Nemotron-3.5-Lightning" -> "Nemotron 3.5 Lightning"), falling back to the
// model id without its vendor prefix. Tooltips still show the full model id.
function shortModelLabel(modelId) {
  const match = typeof models !== "undefined"
    ? models.find((model) => model.modelId === modelId)
    : null;
  const source = match?.name || String(modelId).split("/").at(-1);
  return String(source).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

const DECODE_CHART_COLORS = [
  "#6c5ce7",
  "#00b894",
  "#e17055",
  "#0984e3",
  "#d63031",
  "#fdcb6e",
  "#00cec9",
  "#e84393",
];

// Line chart: x = output length, y = p50 decode tok/s, one line per model. Model
// labels sit to the right of each line end; hovering either a point or a line
// shows the full model id and values.
function renderDecodeChart() {
  decodeChart.replaceChildren();
  const rows = decodeMatrixTable
    .sortRows(getDecodeMatrixRows(), getDecodeMatrixSortValue)
    .filter((row) => [...row.byLength.values()].some(Number.isFinite));
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "decode-chart-empty";
    empty.textContent = "The decode-speed chart appears here once at least one measured run completes.";
    decodeChart.append(empty);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "decode-line-chart";

  const tooltip = document.createElement("div");
  tooltip.className = "decode-tooltip";
  tooltip.hidden = true;
  wrap.append(tooltip);

  const width = 900;
  const height = 320;
  const padLeft = 56;
  // Leave room on the right for the end-of-line model labels.
  const padRight = 200;
  const padTop = 20;
  const padBottom = 54;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const lengths = getActiveDecodeOutputTokenOptions();
  const allValues = rows.flatMap((row) => [...row.byLength.values()]).filter(Number.isFinite);
  const maxValue = Math.max(1, ...allValues) * 1.15;
  const xFor = (index) => (lengths.length > 1
    ? padLeft + (index / (lengths.length - 1)) * innerWidth
    : padLeft + innerWidth / 2);
  const yFor = (value) => padTop + (1 - value / maxValue) * innerHeight;

  const parts = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (i / 4) * innerHeight;
    const tickValue = Math.round(maxValue * (1 - i / 4));
    parts.push(`<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" class="decode-grid"/>`);
    parts.push(`<text x="${padLeft - 8}" y="${(y + 4).toFixed(1)}" class="decode-tick" text-anchor="end">${tickValue}</text>`);
  }
  parts.push(`<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="decode-axis"/>`);
  parts.push(`<line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="decode-axis"/>`);
  parts.push(`<text x="${padLeft}" y="${padTop - 6}" class="decode-axis-label">tok/s</text>`);
  lengths.forEach((length, index) => {
    parts.push(`<text x="${xFor(index).toFixed(1)}" y="${height - padBottom + 22}" class="decode-tick" text-anchor="middle">${length}</text>`);
  });
  parts.push(`<text x="${((padLeft + (width - padRight)) / 2).toFixed(1)}" y="${height - 8}" class="decode-axis-label" text-anchor="middle">Output tokens</text>`);

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("class", "decode-chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Decode speed p50 by output length for each model");
  svg.innerHTML = parts.join("");

  const endLabels = [];
  rows.forEach((row, index) => {
    const color = DECODE_CHART_COLORS[index % DECODE_CHART_COLORS.length];
    const points = lengths
      .map((length, position) => ({ length, x: xFor(position), value: row.byLength.get(length) }))
      .filter((point) => Number.isFinite(point.value));
    if (points.length === 0) return;

    const pointsAttribute = points
      .map((point) => `${point.x.toFixed(1)},${yFor(point.value).toFixed(1)}`)
      .join(" ");
    // Invisible thick line so hovering anywhere along the series shows a tooltip.
    const hitLine = document.createElementNS(svgNamespace, "polyline");
    hitLine.setAttribute("points", pointsAttribute);
    hitLine.setAttribute("class", "decode-series-hit");
    hitLine.dataset.model = row.modelId;
    svg.append(hitLine);

    const polyline = document.createElementNS(svgNamespace, "polyline");
    polyline.setAttribute("points", pointsAttribute);
    polyline.setAttribute("class", "decode-series");
    polyline.setAttribute("stroke", color);
    polyline.dataset.model = row.modelId;
    svg.append(polyline);

    points.forEach((point) => {
      const circle = document.createElementNS(svgNamespace, "circle");
      circle.setAttribute("cx", point.x.toFixed(1));
      circle.setAttribute("cy", yFor(point.value).toFixed(1));
      circle.setAttribute("r", "4.5");
      circle.setAttribute("fill", color);
      circle.setAttribute("class", "decode-point");
      circle.dataset.model = row.modelId;
      circle.dataset.length = String(point.length);
      circle.dataset.value = point.value.toFixed(1);
      svg.append(circle);
    });

    const last = points[points.length - 1];
    endLabels.push({
      modelId: row.modelId,
      color,
      x: last.x + 12,
      y: yFor(last.value),
      label: shortModelLabel(row.modelId),
    });
  });

  // Nudge end labels apart and pull them back inside the plot if they overflow.
  endLabels.sort((left, right) => left.y - right.y);
  const minLabelGap = 16;
  for (let i = 1; i < endLabels.length; i += 1) {
    if (endLabels[i].y - endLabels[i - 1].y < minLabelGap) {
      endLabels[i].y = endLabels[i - 1].y + minLabelGap;
    }
  }
  const lowestY = height - padBottom - 4;
  const overflow = endLabels.length > 0 ? endLabels[endLabels.length - 1].y - lowestY : 0;
  if (overflow > 0) endLabels.forEach((entry) => { entry.y -= overflow; });

  endLabels.forEach((entry) => {
    const text = document.createElementNS(svgNamespace, "text");
    text.setAttribute("x", entry.x.toFixed(1));
    text.setAttribute("y", (entry.y + 4).toFixed(1));
    text.setAttribute("class", "decode-series-label");
    text.setAttribute("fill", entry.color);
    text.textContent = entry.label;
    svg.append(text);
  });

  svg.addEventListener("mousemove", (event) => {
    const point = event.target.closest?.("circle.decode-point");
    const line = event.target.closest?.("polyline.decode-series, polyline.decode-series-hit");
    if (point) {
      tooltip.textContent = `${shortModelLabel(point.dataset.model)} · ${point.dataset.length} tokens: ${point.dataset.value} tok/s`;
      tooltip.hidden = false;
    } else if (line) {
      tooltip.textContent = shortModelLabel(line.dataset.model);
      tooltip.hidden = false;
    } else {
      tooltip.hidden = true;
      return;
    }
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  });
  svg.addEventListener("mouseleave", () => { tooltip.hidden = true; });

  wrap.append(svg);
  decodeChart.append(wrap);
}

function renderDecodeResults() {
  let runUsage = null;
  if (decodeRun) {
    runUsage = summarizeRunUsage(decodeRun.results);
    const elapsedMs = decodeRun.totalTestTimeMs
      ?? (decodeStartedAtMs === null ? null : performance.now() - decodeStartedAtMs);
    decodeSummaryTime.textContent = formatDuration(elapsedMs);
    decodeSummaryBest.textContent = formatDecodeSpeedSummary();
    decodeSummaryTotalTokens.textContent = formatInteger(runUsage.totalTokens);
    decodeSummaryCost.textContent = runUsage.requestCount === 0
      ? "-"
      : runUsage.pricedUsageCount === 0
        ? "Unpriced"
        : `${formatCost(runUsage.cost)}${runUsage.hasUnpriced ? " + unpriced" : ""}`;
    decodeSummaryCost.title = runUsage.hasUnpriced
      ? "Some selected models have no pricing metadata; their usage is excluded from this cost total."
      : "Warm-up and measured requests are included.";
  }

  const thead = document.createElement("thead");
  decodeTable.renderHeaders(thead);
  const tbody = document.createElement("tbody");
  const views = decodeTable.sortRows(getDecodeRunRows(), getDecodeSortValue);
  if (views.length === 0) {
    // Always render the table, even with no selected models or runs yet.
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = decodeColumns.length;
    cell.className = "decode-empty-cell";
    cell.textContent = "Select one or more models above, then run the Decode Test to populate this table.";
    row.append(cell);
    tbody.append(row);
  } else {
    let previousModel = null;
    views.forEach((view) => {
      const row = buildDecodeRow(view);
      if (view.modelId !== previousModel) {
        row.classList.add("decode-model-start");
        previousModel = view.modelId;
      }
      tbody.append(row);
    });
  }

  decodeBody.replaceChildren();
  const table = document.createElement("table");
  table.className = "decode-table";
  table.append(thead, tbody);
  decodeBody.append(table);

  renderDecodeMatrix();
  renderDecodeChart();

  if (decodeRun) updateDecodeUsageNote(runUsage);
}

function buildDecodeRow(view) {
  const { result, summary } = view;
  const row = document.createElement("tr");
  row.dataset.modelId = view.modelId;
  row.dataset.length = String(view.length);
  if (summary.reasoningRequired) row.classList.add("decode-run-reasoning");

  decodeColumns.forEach(({ key }) => {
    const cell = document.createElement("td");
    cell.dataset.decodeColumn = key;
    cell.hidden = !decodeTable.isVisible(key);
    decodeTable.markCell(cell, key);
    switch (key) {
      case "modelId":
        cell.textContent = view.modelId;
        cell.title = view.modelId;
        break;
      case "length":
        cell.textContent = String(view.length);
        break;
      case "status": {
        const status = decodeGroupStatus(view);
        renderBenchmarkStatusCell(cell, status.text, status.className, result);
        break;
      }
      case "reasoningTokensP50":
        cell.textContent = summary.completed === 0 || summary.reasoningTokensP50 === null
          ? "-"
          : formatInteger(summary.reasoningTokensP50);
        break;
      case "reasoningStatus":
        cell.textContent = summary.completed === 0
          ? "-"
          : summary.reasoningRequired ? "required" : "none";
        break;
      case "decodeTpsP50":
        cell.classList.add("decode-speed-cell");
        cell.textContent = formatDecodeRate(summary.decodeTpsP50);
        break;
      case "visibleTokensP50":
        cell.textContent = summary.visibleTokensP50 === null
          ? "-"
          : formatInteger(summary.visibleTokensP50);
        break;
      case "ttftP50":
      case "ttftP90":
      case "decodeTimeP50":
      case "totalLatencyP50":
      case "totalLatencyP90":
        cell.textContent = formatMilliseconds(summary[key]);
        break;
      default:
        cell.textContent = "-";
    }
    row.append(cell);
  });

  const runsTitle = summary.completed > 0
    ? `${view.modelId} · ${view.length} tokens · ${summary.completed}/${view.perGroup} runs`
    : `${view.modelId} · ${view.length} tokens · not run yet`;
  row.title = summary.reasoningRequired ? `${runsTitle} · reasoning required` : runsTitle;
  return row;
}

function updateDecodeUsageNote(runUsage) {
  const notes = [
    "Each row aggregates the runs for one model and output length. Decode speed = (visible output tokens - 1) divided by the time between the first and last visible token; one warm-up per model is excluded.",
    "Decode speed is shown as p50; TTFT and total latency are shown as p50 and p90. Higher decode tok/s is better. TTFT measures the first visible token.",
  ];
  const reasoningRuns = decodeRun.results.reduce(
    (count, result) => count + result.runs.filter((run) => run.reasoningRequired).length,
    0,
  );
  if (reasoningRuns > 0) {
    notes.push(`Reasoning content appeared in ${reasoningRuns} measured run${reasoningRuns === 1 ? "" : "s"}; those rows are marked "required" and their reasoning tokens are excluded from decode speed.`);
  }
  const estimatedReasoningRuns = decodeRun.results.reduce(
    (count, result) => count + result.runs.filter(
      (run) => run.reasoningRequired && run.reasoningTokenSource === "estimated",
    ).length,
    0,
  );
  if (estimatedReasoningRuns > 0) {
    notes.push(`The visible/reasoning token split was estimated from streamed characters for ${estimatedReasoningRuns} run${estimatedReasoningRuns === 1 ? "" : "s"}; the rest used the server's reported reasoning token count.`);
  }
  const fallbackRuns = decodeRun.results.reduce(
    (count, result) => count + result.runs.filter((run) => run.fixedLengthApplied === false).length,
    0,
  );
  if (fallbackRuns > 0) {
    notes.push(`${fallbackRuns} run${fallbackRuns === 1 ? "" : "s"} could not force a fixed output length because the endpoint rejected min_tokens/ignore_eos; those runs may stop early.`);
  }
  if (runUsage.hasEstimated) notes.push("* Some token counts are estimated because the endpoint omitted streaming usage.");
  if (runUsage.hasUnpriced) notes.push("Some models lack pricing metadata and are excluded from the displayed cost subtotal.");
  decodeUsageNote.textContent = notes.join(" ");
}

function formatDecodeRate(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(1);
}

function formatDecodeSpeedSummary() {
  const values = getDecodeRunRows()
    .map((view) => view.summary.decodeTpsP50)
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return "-";
  return `${Math.max(...values).toFixed(1)} tok/s`;
}

// Exports mirror the table: one row per model × output length, restricted to the
// columns currently selected in the column picker.
function getDecodeExportRows() {
  return getDecodeRunRows();
}

function getDecodeExportValue(view, key) {
  const summary = view.summary;
  switch (key) {
    case "modelId": return view.modelId;
    case "length": return view.length;
    case "status": return decodeGroupStatus(view).text;
    case "reasoningStatus":
      return summary.completed === 0 ? "-" : summary.reasoningRequired ? "required" : "none";
    default:
      return summary[key] ?? null;
  }
}

function getDecodeExportTotalValue(key) {
  const values = {
    modelId: "TOTAL RUN",
    length: null,
    status: decodeRun?.status ?? "",
    decodeTpsP50: null,
    ttftP50: null,
    ttftP90: null,
    decodeTimeP50: null,
    totalLatencyP50: null,
    totalLatencyP90: null,
    visibleTokensP50: null,
    reasoningTokensP50: null,
    reasoningStatus: "",
  };
  return values[key];
}

function exportDecodeCsv() {
  if (!decodeRun) return;
  exportBenchmarkCsvFile({
    filenamePrefix: "llm-decode-test",
    columns: decodeTable.getVisibleDefinitions(),
    results: getDecodeExportRows(),
    getValue: getDecodeExportValue,
    getTotal: getDecodeExportTotalValue,
  });
}

function exportDecodeJson() {
  if (!decodeRun) return;
  exportBenchmarkJsonFile({
    filenamePrefix: "llm-decode-test",
    columns: decodeTable.getVisibleDefinitions(),
    results: getDecodeExportRows(),
    getValue: getDecodeExportValue,
    getTotal: getDecodeExportTotalValue,
    metadata: {
      config: decodeRun.config,
      methodology: decodeRun.methodology,
      runSeed: decodeRun.runSeed,
      executionOrder: decodeRun.executionOrder,
    },
  });
}

// Leaderboard pivot export: one row per model, one column per output length.
function getDecodeMatrixExportValue(row, key) {
  return key === "modelId" ? row.modelId : row[key] ?? null;
}

function getDecodeMatrixExportTotalValue(key) {
  return key === "modelId" ? "TOTAL RUN" : null;
}

function exportDecodeMatrixCsv() {
  if (!decodeRun) return;
  exportBenchmarkCsvFile({
    filenamePrefix: "llm-decode-matrix",
    columns: decodeMatrixTable.getVisibleDefinitions(),
    results: getDecodeMatrixRows(),
    getValue: getDecodeMatrixExportValue,
    getTotal: getDecodeMatrixExportTotalValue,
  });
}

function exportDecodeMatrixJson() {
  if (!decodeRun) return;
  exportBenchmarkJsonFile({
    filenamePrefix: "llm-decode-matrix",
    columns: decodeMatrixTable.getVisibleDefinitions(),
    results: getDecodeMatrixRows(),
    getValue: getDecodeMatrixExportValue,
    getTotal: getDecodeMatrixExportTotalValue,
    metadata: {
      config: decodeRun.config,
      methodology: decodeRun.methodology,
      runSeed: decodeRun.runSeed,
      executionOrder: decodeRun.executionOrder,
    },
  });
}

function renderDecodeRequestTemplate() {
  const outputTokenLengths = getDecodeOutputTokenOptions();
  const previewConfig = {
    prompt: decodePromptInput.value.trim() || DECODE_PROMPT,
    disableThinking: decodeDisableThinkingInput.checked,
    fixedOutput: decodeFixedOutputInput.checked,
    outputTokenLengths,
  };
  const endpointValue = endpointInput.value.trim() || "https://api.example.com/v1";
  let requestUrl;
  try {
    requestUrl = buildChatCompletionsUrl(endpointValue);
  } catch (error) {
    console.warn("[LLM Quick Bench] Decode Test request preview failed.", error);
    decodeTemplateCode.textContent = "Enter a valid API endpoint to preview the benchmark request.";
    return;
  }
  const body = buildDecodeRequestBody(
    "<selected-model>",
    previewConfig,
    true,
    providerSelect.value,
    previewConfig.fixedOutput,
    outputTokenLengths[0],
  );
  decodeTemplateCode.textContent = [
    `// Repeated once per output length: ${outputTokenLengths.join(", ")}`,
    formatBenchmarkRequest(requestUrl, body),
  ].join("\n");
}

function renderDecodeMethodologySample() {
  const sample = decodeRun?.sampleExchange;
  if (!sample) {
    decodeSampleRequestNote.textContent = "No measured run has been captured yet.";
    decodeSampleResponseNote.textContent = "Run the test to capture an actual request and its complete streamed response.";
    decodeSampleOutputNote.textContent = "Run the test to assemble the generated output from an actual measured run.";
    decodeSampleRequestCode.textContent = "Run a test to capture an actual measured request.";
    decodeSampleResponseCode.textContent = "Run a test to capture its actual streamed response.";
    decodeSampleOutputCode.textContent = "Run a test to capture its consolidated output.";
    return;
  }
  const source = `${sample.modelId} · ${sample.runLabel}`;
  decodeSampleRequestNote.textContent = `Actual request captured from ${source}. The API key is redacted.`;
  decodeSampleResponseNote.textContent = `Actual response captured from ${source}. Chunk labels show the decoded network reads.`;
  decodeSampleOutputNote.textContent = `Actual generated deltas from ${source}, consolidated in arrival order.`;
  decodeSampleRequestCode.textContent = sample.request;
  decodeSampleResponseCode.textContent = sample.response;
  decodeSampleOutputCode.textContent = sample.consolidatedOutput ?? "";
}

function resetDecodeResults() {
  decodeRun = null;
  decodeSampleCapturePending = false;
  decodeSummaryTime.textContent = "-";
  decodeSummaryBest.textContent = "-";
  decodeSummaryTotalTokens.textContent = "-";
  decodeSummaryCost.textContent = "-";
  decodeSummaryCost.removeAttribute("title");
  decodeUsageNote.textContent = "Results and per-run decode speeds will appear here after a Decode Test run.";
  exportDecodeCsvButton.disabled = true;
  exportDecodeJsonButton.disabled = true;
  exportDecodeMatrixCsvButton.disabled = true;
  exportDecodeMatrixJsonButton.disabled = true;
  rebuildDecodeMatrixTable(getActiveDecodeOutputTokenOptions());
  decodeResults.hidden = false;
  renderDecodeResults();
}

function startDecodeClock() {
  stopDecodeClock();
  decodeStopClock = startThrottledClock(() => {
    if (decodeRun?.status === "running") updateDecodeElapsedTimes();
  });
}

function updateDecodeElapsedTimes() {
  if (!decodeRun) return;
  const elapsedMs = decodeRun.totalTestTimeMs
    ?? (decodeStartedAtMs === null ? null : performance.now() - decodeStartedAtMs);
  decodeSummaryTime.textContent = formatDuration(elapsedMs);
}

function stopDecodeClock() {
  if (decodeStopClock) {
    decodeStopClock();
    decodeStopClock = null;
  }
}

resetDecodeResults();
renderDecodeMethodologySample();
renderDecodeRequestTemplate();
updateDecodeRunButtonState();
