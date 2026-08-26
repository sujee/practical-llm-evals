// Thinking Test 1 - data-processing benchmark.
// Each question generates a fresh randomized table of {id, name, score} rows
// and asks the model to return the id and name of the row with the highest score.
// Grading requires the final non-empty line to exactly match
// "Final answer: <id>|<name>" and compares it (integer id, case-insensitive name) to the
// pre-computed answer. The prompt is regenerated per question from a deterministic
// seed, so the model never sees the same table twice within a run.
//
// Shares the global lexical scope with bench-utils.js and raw-speed-test1.js (classic
// <script> loaded with `defer`, in that order). Endpoint, streaming, scheduling,
// summary, column-management, formatting, and export helpers live in bench-utils.js.
// raw-speed-test1.js owns the model loader and shared selection/connection state.

const MAX_THINKING_ROWS = 200;

const thinkingColumnPreferenceKey = "quick-llm-bench:thinking-columns:v5";
const defaultThinkingColumns = [
  "modelId",
  "status",
  "accuracy",
  "ttftMedian",
  "tpsMedian",
  "e2eMedian",
  "totalTokens",
  "totalTestTimeMs",
  "cost",
];

const thinkingForm = document.querySelector("#thinking-form");
const thinkingRunsInput = document.querySelector("#thinking-runs");
const thinkingRowsInput = document.querySelector("#thinking-rows");
const thinkingFormatSelect = document.querySelector("#thinking-format");
const thinkingConcurrencyInput = document.querySelector("#thinking-concurrency");
const thinkingTimeoutInput = document.querySelector("#thinking-timeout");
const thinkingDisableThinkingInput = document.querySelector("#thinking-disable-thinking");
const thinkingRequireServerTokensInput = document.querySelector("#thinking-require-server-tokens");
const thinkingLogConsoleInput = document.querySelector("#thinking-log-console");
const thinkingConfigInputs = [...thinkingForm.querySelectorAll("input, select, textarea")];
const thinkingRunButton = document.querySelector("#thinking-run-button");
const thinkingCancelButton = document.querySelector("#thinking-cancel-button");
const thinkingStatus = document.querySelector("#thinking-status");
const thinkingResults = document.querySelector("#thinking-results");
const thinkingBody = document.querySelector("#thinking-body");
const thinkingUsageNote = document.querySelector("#thinking-usage-note");
const thinkingSummaryTime = document.querySelector("#summary-thinking-time");
const thinkingSummaryAccuracy = document.querySelector("#summary-thinking-accuracy");
const thinkingSummaryTotalTokens = document.querySelector("#summary-thinking-total-tokens");
const thinkingSummaryCost = document.querySelector("#summary-thinking-cost");
const thinkingSummaryCostPerCorrect = document.querySelector("#summary-thinking-cost-per-correct");
const exportThinkingCsvButton = document.querySelector("#export-thinking-csv");
const exportThinkingJsonButton = document.querySelector("#export-thinking-json");
const thinkingSortHeaders = [...document.querySelectorAll("[data-thinking-column]")];
const thinkingColumnOptions = document.querySelector("#thinking-column-options");
const showAllThinkingColumnsButton = document.querySelector("#show-all-thinking-columns");
const thinkingColumnKeys = thinkingSortHeaders.map((header) => header.dataset.thinkingColumn);
const thinkingTemplateCode = document.querySelector("#thinking-request-template-code");
const thinkingSampleRequestNote = document.querySelector("#thinking-sample-request-note");
const thinkingSampleRequestCode = document.querySelector("#thinking-sample-request-code");
const thinkingSampleResponseNote = document.querySelector("#thinking-sample-response-note");
const thinkingSampleResponseCode = document.querySelector("#thinking-sample-response-code");
const thinkingSampleOutputNote = document.querySelector("#thinking-sample-output-note");
const thinkingSampleOutputCode = document.querySelector("#thinking-sample-output-code");

let thinkingRun = null;
let thinkingAbortController = null;
let thinkingStartedAtMs = null;
let thinkingClockInterval = null;
let thinkingSortState = { key: "accuracy", direction: "descending" };
let visibleThinkingColumns = loadVisibleThinkingColumns();
if (!visibleThinkingColumns.has(thinkingSortState.key)) {
  thinkingSortState = { key: [...visibleThinkingColumns][0], direction: "ascending" };
}

thinkingCancelButton.addEventListener("click", () => thinkingAbortController?.abort());
exportThinkingCsvButton.addEventListener("click", exportThinkingCsv);
exportThinkingJsonButton.addEventListener("click", exportThinkingJson);
thinkingSortHeaders.forEach((header) => {
  header.querySelector("button").addEventListener("click", () => {
    sortThinkingBy(header.dataset.thinkingColumn);
  });
});
[
  thinkingRowsInput,
  thinkingFormatSelect,
  thinkingDisableThinkingInput,
].forEach((control) => {
  control.addEventListener("input", renderThinkingRequestTemplate);
  control.addEventListener("change", renderThinkingRequestTemplate);
});
initializeThinkingColumnPicker();
resetThinkingResults();
showAllThinkingColumnsButton.addEventListener("click", () => {
  visibleThinkingColumns.clear();
  thinkingColumnKeys.forEach((key) => visibleThinkingColumns.add(key));
  saveVisibleThinkingColumns();
  syncThinkingColumnPicker();
  renderThinkingResults();
});
document.addEventListener("models:selection-changed", updateThinkingRunButtonState);
renderThinkingMethodologySample();
renderThinkingRequestTemplate();
updateThinkingRunButtonState();

thinkingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (benchmarkAbortController != null) {
    setThinkingStatus("Raw Speed Test 1 is already running.", true);
    return;
  }
  const selectedModels = models.filter((model) => model.selected);
  if (selectedModels.length === 0) {
    setThinkingStatus("Select at least one model to run.", true);
    return;
  }

  const config = {
    runs: clampInteger(thinkingRunsInput.value, 1, 50),
    rowCount: clampInteger(thinkingRowsInput.value, 5, MAX_THINKING_ROWS),
    dataFormat: thinkingFormatSelect.value,
    concurrency: clampInteger(thinkingConcurrencyInput.value, 1, 12),
    timeoutMs: clampInteger(thinkingTimeoutInput.value, 10, 600) * 1000,
    logToConsole: thinkingLogConsoleInput.checked,
    disableThinking: thinkingDisableThinkingInput.checked,
    requireServerTokenCounts: thinkingRequireServerTokensInput.checked,
  };
  const connection = {
    provider: providerSelect.value,
    endpoint: endpointInput.value,
    apiKey: apiKeyInput.value.trim(),
  };

  thinkingAbortController = new AbortController();
  thinkingStartedAtMs = performance.now();
  const runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  thinkingRun = createBenchmarkRun({
    selectedModels,
    connection,
    config,
    runSeed,
    methodology: {
      temperature: 0,
      topP: 1,
      operation: "highest score",
      prompt: "regenerated per question from seeded random rows of {id, name, score}",
      grading: "require final non-empty line to exactly match 'Final answer: <id>|<name>'; correct if integer id and case-insensitive name match expected",
      percentile: "nearest rank",
    },
  });
  exportThinkingCsvButton.disabled = false;
  exportThinkingJsonButton.disabled = false;
  const scheduledResults = shuffleWithSeed([...thinkingRun.results], runSeed);
  thinkingRun.executionOrder = scheduledResults.map((result) => result.modelId);
  setThinkingRunning(true);
  thinkingResults.hidden = false;
  renderThinkingResults();
  setThinkingStatus(`Running ${selectedModels.length} models with up to ${Math.min(config.concurrency, selectedModels.length)} in parallel…`);

  try {
    await runWithConcurrency(
      scheduledResults,
      config.concurrency,
      (result) => benchmarkThinkingModel(result, config, thinkingAbortController.signal, connection, runSeed),
    );
    const completed = thinkingRun.results.filter((result) => result.runs.length > 0).length;
    const failed = thinkingRun.results.filter((result) => result.status === "error").length;
    const partial = thinkingRun.results.filter((result) => result.status === "partial").length;
    setThinkingStatus(
      thinkingAbortController.signal.aborted
        ? `Cancelled. Preserved results for ${completed} completed model${completed === 1 ? "" : "s"}.`
        : `Finished ${completed} model${completed === 1 ? "" : "s"}${partial ? `; ${partial} had failed runs` : ""}${failed ? `; ${failed} failed` : ""}.`,
      failed > 0 && completed === 0,
    );
  } finally {
    thinkingRun.status = thinkingAbortController.signal.aborted ? "cancelled" : "complete";
    thinkingRun.finishedAt = new Date().toISOString();
    thinkingRun.totalTestTimeMs = performance.now() - thinkingStartedAtMs;
    thinkingRun.usage = summarizeRunUsage(thinkingRun.results);
    thinkingRun.accuracy = summarizeRunThinkingAccuracy(thinkingRun.results);
    setThinkingRunning(false);
    renderThinkingResults();
    thinkingAbortController = null;
    thinkingStartedAtMs = null;
  }
});

function updateThinkingRunButtonState() {
  thinkingRunButton.disabled = !models?.some((model) => model.selected)
    || modelsLoading
    || benchmarkAbortController != null
    || thinkingAbortController != null;
}

function setThinkingRunning(isRunning) {
  thinkingRunButton.disabled = isRunning
    || benchmarkAbortController != null
    || !models?.some((model) => model.selected)
    || modelsLoading;
  thinkingRunButton.firstElementChild.textContent = isRunning ? "Running…" : "Run selected";
  thinkingRunButton.setAttribute("aria-busy", String(isRunning));
  thinkingCancelButton.hidden = !isRunning;
  thinkingConfigInputs.forEach((control) => { control.disabled = isRunning; });
  // Lock shared connection + model selection so existing models/selecting operations stay frozen mid-run.
  loadButton.disabled = isRunning;
  connectionControls.forEach((control) => { control.disabled = isRunning; });
  modelSelectionButtons.forEach((button) => { button.disabled = isRunning; });
  document.querySelectorAll("#models-body .model-select").forEach((checkbox) => { checkbox.disabled = isRunning; });
  // Cross-lock the Raw Speed Test 1 Run button so the two benchmarks can't run at once.
  if (typeof runButton !== "undefined") {
    runButton.disabled = isRunning || !models.some((model) => model.selected) || modelsLoading || benchmarkAbortController != null;
  }
  if (isRunning) startThinkingClock(); else stopThinkingClock();
}

function setThinkingStatus(message, isError = false) {
  thinkingStatus.textContent = message;
  thinkingStatus.classList.toggle("error", isError);
}

async function benchmarkThinkingModel(result, config, signal, connection, runSeed) {
  await runBenchmarkSequence(
    result,
    config,
    signal,
    ({ runIndex, label, includeUsage }) => runThinkingCompletion(
      result.modelId,
      generateThinkingTask(runSeed, runIndex, config),
      config,
      signal,
      includeUsage,
      label,
      connection,
    ),
    renderThinkingResults,
  );
}

async function runThinkingCompletion(modelId, task, config, outerSignal, includeUsage, runLabel, connection) {
  const stream = await runStreamingChatCompletion({
    modelId,
    config,
    outerSignal,
    runLabel,
    connection,
    body: buildThinkingRequestBody(modelId, config, task.prompt, includeUsage),
    logName: "Thinking Test 1",
  });
  const extracted = extractThinkingAnswer(stream.contentText);
  const correct = gradeThinkingAnswer(extracted, task.expected);
  // The server only reports the total completion-token count; split it
  // proportionally between reasoning and answer characters as an estimate.
  const reasoningTokens = stream.measurement.completionTokens > 0 && stream.outputText.length > 0
    ? Math.round(
      (stream.reasoningText.length / stream.outputText.length)
      * stream.measurement.completionTokens,
    )
    : 0;
  const answerTokens = stream.measurement.completionTokens - reasoningTokens;

  if (!correct || !extracted.ok) {
    const expectedAnswer = `${task.expected.id}|${task.expected.name}`;
    const parsedAnswer = extracted.ok ? `${extracted.id}|${extracted.name}` : null;
    const analysis = [];
    if (!extracted.ok) {
      analysis.push("Format: BROKEN - could not extract a valid `Final answer: <id>|<name>` line.");
      analysis.push(`Expected: ${expectedAnswer}`);
      if (extracted.raw === null) {
        analysis.push("Reason: no `Final answer:` line appeared in the model response.");
      } else {
        analysis.push(`Last \`Final answer:\` tail: "${extracted.raw}"`);
        const parts = extracted.raw.split("|").map((p) => p.trim());
        if (parts.length !== 2) {
          analysis.push(`Reason: expected exactly one "|" separator (got ${parts.length} parts).`);
        } else if (!Number.isInteger(Number(parts[0]))) {
          analysis.push(`Reason: id portion "${parts[0]}" is not an integer.`);
        }
      }
    } else {
      analysis.push(`Format: OK - parsed "${parsedAnswer}"`);
      analysis.push(`Expected:    ${expectedAnswer}`);
      if (extracted.id !== task.expected.id) {
        analysis.push(`Mismatch: id ${extracted.id} != expected ${task.expected.id}`);
      }
      if (extracted.name.toLowerCase() !== task.expected.name.toLowerCase()) {
        analysis.push(`Mismatch: name "${extracted.name}" != expected "${task.expected.name}"`);
      }
    }
    if (stream.reasoningText) analysis.push(`Reasoning: ${stream.reasoningText.length} chars (omitted from response above).`);
    analysis.push(`Content: ${stream.contentText.length} chars.`);
    console.log(
      `[Thinking Test 1] FAILURE · ${modelId} · ${runLabel}\n` +
      `--- MODEL RESPONSE ---\n${stream.contentText}\n` +
      `--- ANALYSIS ---\n${analysis.join("\n")}`,
    );
  }

  const measurement = {
    ...stream.measurement,
    reasoningTokens,
    answerTokens,
    correct,
    formatCompliant: extracted.ok,
    parsedAnswer: extracted.ok ? `${extracted.id}|${extracted.name}` : null,
    expectedAnswer: `${task.expected.id}|${task.expected.name}`,
  };

  if (runLabel.startsWith("run-") && thinkingRun && !thinkingRun.sampleExchange) {
    const gradingBlock = [
      "--- GRADING ---",
      `Expected: ${measurement.expectedAnswer}`,
      `Parsed:  ${measurement.parsedAnswer ?? "(no Final answer line found)"}`,
      `Correct:  ${measurement.correct}`,
    ].join("\n");
    thinkingRun.sampleExchange = {
      modelId,
      runLabel,
      capturedAt: new Date().toISOString(),
      task: {
        rowCount: task.rows.length,
        dataFormat: task.dataFormat,
        expectedAnswer: measurement.expectedAnswer,
        parsedAnswer: measurement.parsedAnswer,
        correct: measurement.correct,
      },
      request: stream.request,
      response: stream.response,
      consolidatedOutput: `${stream.consolidatedOutput}\n\n${gradingBlock}`,
    };
    renderThinkingMethodologySample();
  }

  logBenchmarkEvent(config, "Thinking Test 1", "completion summary", {
    model: modelId,
    run: runLabel,
    measurement,
  });
  return measurement;
}

function buildThinkingRequestBody(modelId, config, prompt, includeUsage = true) {
  const requestId = crypto.randomUUID();
  const taggedPrompt = `Request id: ${requestId}\n${prompt}`;
  const body = {
    model: modelId,
    messages: [{ role: "user", content: taggedPrompt }],
    stream: true,
    temperature: 0,
    top_p: 1,
  };
  if (includeUsage) body.stream_options = { include_usage: true };
  if (config.disableThinking) body.chat_template_kwargs = { enable_thinking: false };
  return body;
}

function generateThinkingTask(runSeed, runIndex, config) {
  const baseSeed = (runSeed >>> 0);
  const taskSeed = (baseSeed + runIndex * 2654435761) >>> 0;
  const rowCount = config.rowCount;
  if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > MAX_THINKING_ROWS) {
    throw new RangeError(`Thinking task row count must be between 1 and ${MAX_THINKING_ROWS}.`);
  }
  const scores = generateUniqueThinkingScores(rowCount, taskSeed);
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: index + 1,
    name: `user-${index + 1}`,
    score: scores[index],
  }));
  const displayRows = shuffleWithSeed([...rows], (taskSeed ^ 0x5A5A5A5A) >>> 0);
  const answerRow = rows.reduce(
    (max, row) => (row.score > max.score ? row : max),
    rows[0],
  );
  const prompt = renderThinkingPrompt(displayRows, config.dataFormat);
  const serializedTable = serializeThinkingRows(displayRows, config.dataFormat);
  return {
    seed: taskSeed,
    runIndex,
    dataFormat: config.dataFormat,
    rows: displayRows,
    expected: { id: answerRow.id, name: answerRow.name, score: answerRow.score },
    prompt,
    serializedTable,
  };
}

function generateUniqueThinkingScores(rowCount, seed) {
  const scoreMax = Math.max(rowCount * 5, 100);
  const scores = shuffleWithSeed(
    Array.from({ length: scoreMax }, (_, index) => index + 1),
    seed,
  ).slice(0, rowCount);
  if (new Set(scores).size !== rowCount) {
    throw new Error("Thinking task generation produced duplicate scores.");
  }
  return scores;
}

function renderThinkingPrompt(rows, format) {
  const table = serializeThinkingRows(rows, format);
  const opener = format === "json"
    ? `The JSON array below contains ${rows.length} objects, each with an id (integer), a unique name label, and a numeric score.`
    : `The table below lists ${rows.length} rows, each with an id (integer), a unique name label, and a numeric score.`;
  return [
    opener,
    "",
    table,
    "",
    "Find the single row that has the HIGHEST score.",
    "Briefly check the scores to confirm your choice, then end your response with one line in exactly this format:",
    "",
    "Final answer: <id>|<name>",
    "",
    "Replace <id> with the row's id (an integer) and <name> with the row's exact name.",
    "Place nothing else on that final line, and do not wrap the answer in quotes or markdown.",
  ].join("\n");
}

function serializeThinkingRows(rows, format) {
  switch (format) {
    case "json":
      return JSON.stringify(rows);
    case "csv":
      return [
        "id,name,score",
        ...rows.map((row) => `${row.id},${row.name},${row.score}`),
      ].join("\n");
    case "pipe":
      return [
        "id|name|score",
        ...rows.map((row) => `${row.id}|${row.name}|${row.score}`),
      ].join("\n");
    case "markdown":
    default:
      return [
        "| id | name | score |",
        "|---|---|---|",
        ...rows.map((row) => `| ${row.id} | ${row.name} | ${row.score} |`),
      ].join("\n");
  }
}

function extractThinkingAnswer(contentText) {
  if (!contentText) return { ok: false, raw: null };
  const lines = contentText.split(/\r?\n/);
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  // `raw` and the regex both look at the *final* non-empty line so the
  // diagnostic and the grade stay consistent (originally `raw` was sampled
  // from the last `Final answer:`-shaped line, which could differ from the
  // line actually graded).
  // Trims leading + trailing whitespace on the final line so models that
  // indent or pad the answer aren't graded BROKEN for purely cosmetic spaces.
  const finalLine = lines[lines.length - 1].trim();
  const raw = finalLine.startsWith("Final answer:")
    ? finalLine.slice("Final answer:".length).trim()
    : null;
  const match = finalLine.match(/^Final answer: ([1-9]\d*)\|([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)$/);
  if (!match) return { ok: false, raw };
  const id = Number(match[1]);
  const name = match[2];
  return { ok: true, raw, id, name };
}

function gradeThinkingAnswer(extracted, expected) {
  if (!extracted?.ok) return false;
  return extracted.id === expected.id
    && extracted.name.toLowerCase() === expected.name.toLowerCase();
}

function renderThinkingResults() {
  if (!thinkingRun) return;
  thinkingBody.replaceChildren();
  let hasEstimates = false;
  let hasUnpricedUsage = false;

  const runUsage = summarizeRunUsage(thinkingRun.results);
  const runAccuracy = summarizeRunThinkingAccuracy(thinkingRun.results);
  const elapsedMs = thinkingRun.totalTestTimeMs
    ?? (thinkingStartedAtMs === null ? null : performance.now() - thinkingStartedAtMs);

  thinkingSummaryTime.textContent = formatDuration(elapsedMs);
  const overallAccuracy = runAccuracy.total > 0
    ? runAccuracy.correct / runAccuracy.total
    : null;
  thinkingSummaryAccuracy.textContent = formatRatioPercent(overallAccuracy);
  thinkingSummaryTotalTokens.textContent = formatInteger(runUsage.totalTokens);
  thinkingSummaryCost.textContent = runUsage.requestCount === 0
    ? "-"
    : runUsage.pricedUsageCount === 0
      ? "Unpriced"
      : `${formatCost(runUsage.cost)}${runUsage.hasUnpriced ? " + unpriced" : ""}`;
  thinkingSummaryCost.title = runUsage.hasUnpriced
    ? "Some selected models have no pricing metadata; their usage is excluded from this cost total."
    : "Warm-up and measured questions are included.";
  const totalCost = runUsage.pricedUsageCount > 0 ? runUsage.cost : null;
  thinkingSummaryCostPerCorrect.textContent = totalCost === null || runAccuracy.correct === 0
    ? "-"
    : formatCost(totalCost / runAccuracy.correct);

  updateThinkingSortHeaders();
  const sortedResults = getSortedThinkingResults();

  sortedResults.forEach((result) => {
    const summary = summarizeRuns(result.runs);
    const usage = summarizeBenchmarkUsage(result);
    const accuracy = summarizeThinkingAccuracy(result);
    hasEstimates ||= usage.hasEstimated;
    hasUnpricedUsage ||= usage.requestCount > 0 && usage.cost === null;
    const costPerCorrect = usage.cost === null || usage.cost === 0
      ? null
      : accuracy.correct > 0 ? usage.cost / accuracy.correct : null;

    const values = {
      modelId: result.modelId,
      status: formatBenchmarkResultStatus(result, thinkingRun.config.runs),
      accuracy,
      ttftMedian: formatMilliseconds(summary.ttftMedian),
      ttftP95: formatMilliseconds(summary.ttftP95),
      tpsMedian: formatRate(summary.tpsMedian),
      tpsP95: formatRate(summary.tpsP95),
      e2eMedian: formatMilliseconds(summary.e2eMedian),
      e2eP95: formatMilliseconds(summary.e2eP95),
      reasoningTokensMedian: formatInteger(
        percentile(result.runs.map((run) => run.reasoningTokens), 0.5) ?? 0,
      ),
      answerTokensMedian: formatInteger(
        percentile(result.runs.map((run) => run.answerTokens), 0.5) ?? 0,
      ),
      costPerCorrect: formatCost(costPerCorrect),
      totalTokens: usage.requestCount === 0
        ? "-"
        : `${formatInteger(usage.totalTokens)} (${formatInteger(usage.promptTokens)} in / ${formatInteger(usage.completionTokens)} out)${usage.hasEstimated ? " *" : ""}`,
      cost: usage.requestCount === 0 ? "-" : usage.cost === null ? "Unpriced" : formatCost(usage.cost),
      totalTestTimeMs: formatDuration(result.totalTestTimeMs ?? getThinkingElapsedMs(result)),
    };
    const statusClass = result.status === "complete"
      ? "complete"
      : result.status === "partial" ? "partial"
      : result.status === "error" ? "error"
      : result.status === "queued" ? "" : "running";
    const statusTitle = result.errors.map((error) => `${error.run}: ${error.message}`).join("\n");

    const row = document.createElement("tr");
    thinkingColumnKeys.forEach((key) => {
      const cell = document.createElement("td");
      cell.hidden = !visibleThinkingColumns.has(key);
      cell.classList.toggle("sorted-column", thinkingSortState.key === key);
      if (key === "status") {
        const pill = document.createElement("span");
        pill.className = `status-pill ${statusClass}`.trim();
        pill.textContent = values.status;
        if (statusTitle) pill.title = statusTitle;
        cell.append(pill);
      } else if (key === "accuracy") {
        cell.textContent = formatRatioPercent(accuracy.accuracy, 1, accuracy.correct, accuracy.total);
        const accuracyHighlight = getAccuracyHighlightClass(accuracy.accuracy);
        if (accuracyHighlight) cell.classList.add(accuracyHighlight);
      } else if (key === "formatCompliance") {
        cell.textContent = formatRatioPercent(accuracy.formatCompliance, 1, accuracy.compliant, accuracy.total);
      } else {
        cell.textContent = values[key];
      }
      row.append(cell);
    });
    thinkingBody.append(row);
  });

  const notes = [
    "Accuracy and format % include only successful measured runs; the warm-up question is excluded.",
    "Reasoning and answer token splits are estimated from character proportions; the server reports only the total.",
    "Cost per correct answer is total cost divided by correct runs; models with zero correct runs show -.",
    "Percentiles use nearest-rank selection across successful measured runs.",
  ];
  if (hasEstimates) notes.push("* Some token counts are estimated because the endpoint omitted streaming usage; compare their costs cautiously.");
  if (hasUnpricedUsage) notes.push("Some models lack pricing metadata and are excluded from the total cost.");
  thinkingUsageNote.textContent = notes.join(" ");
}

function resetThinkingResults() {
  thinkingRun = null;
  thinkingBody.replaceChildren();
  thinkingSummaryTime.textContent = "-";
  thinkingSummaryAccuracy.textContent = "-";
  thinkingSummaryTotalTokens.textContent = "-";
  thinkingSummaryCost.textContent = "-";
  thinkingSummaryCost.removeAttribute("title");
  thinkingSummaryCostPerCorrect.textContent = "-";
  thinkingUsageNote.textContent = "Results will appear here after a thinking benchmark run.";
  exportThinkingCsvButton.disabled = true;
  exportThinkingJsonButton.disabled = true;
  thinkingResults.hidden = false;
  updateThinkingSortHeaders();
}

function sortThinkingBy(key) {
  thinkingSortState = nextSortState(thinkingSortState, key);
  renderThinkingResults();
}

function updateThinkingSortHeaders() {
  updateSortHeaders({
    headers: thinkingSortHeaders,
    columnAttr: "thinkingColumn",
    visibleColumns: visibleThinkingColumns,
    sortState: thinkingSortState,
  });
}

function initializeThinkingColumnPicker() {
  buildColumnPicker({
    headers: thinkingSortHeaders,
    columnAttr: "thinkingColumn",
    container: thinkingColumnOptions,
    visibleColumns: visibleThinkingColumns,
    onChange: onThinkingColumnVisibilityChange,
  });
}

function onThinkingColumnVisibilityChange(visibleColumns) {
  if (!visibleColumns.has(thinkingSortState.key)) {
    thinkingSortState = { key: [...visibleColumns][0], direction: "ascending" };
  }
  saveVisibleThinkingColumns();
  renderThinkingResults();
}

function syncThinkingColumnPicker() {
  syncColumnPicker(thinkingColumnOptions, visibleThinkingColumns);
}

function loadVisibleThinkingColumns() {
  return loadVisibleColumnSet(thinkingColumnPreferenceKey, thinkingColumnKeys, defaultThinkingColumns);
}

function saveVisibleThinkingColumns() {
  saveVisibleColumnSet(thinkingColumnPreferenceKey, visibleThinkingColumns);
}

function getThinkingSortValue(result, key) {
  const summary = summarizeRuns(result.runs);
  const usage = summarizeBenchmarkUsage(result);
  const accuracy = summarizeThinkingAccuracy(result);
  const reasoningTokensMedian = percentile(
    result.runs.map((run) => run.reasoningTokens),
    0.5,
  );
  const answerTokensMedian = percentile(
    result.runs.map((run) => run.answerTokens),
    0.5,
  );
  const costPerCorrect = usage.cost === null || usage.cost === 0
    ? null
    : accuracy.correct > 0 ? usage.cost / accuracy.correct : null;

  const values = {
    modelId: result.modelId,
    status: result.status,
    accuracy: accuracy.accuracy,
    formatCompliance: accuracy.formatCompliance,
    ttftMedian: summary.ttftMedian,
    ttftP95: summary.ttftP95,
    tpsMedian: summary.tpsMedian,
    tpsP95: summary.tpsP95,
    e2eMedian: summary.e2eMedian,
    e2eP95: summary.e2eP95,
    reasoningTokensMedian,
    answerTokensMedian,
    costPerCorrect,
    totalTokens: usage.requestCount > 0 ? usage.totalTokens : null,
    cost: usage.cost,
    totalTestTimeMs: result.totalTestTimeMs ?? getThinkingElapsedMs(result),
  };
  return values[key];
}

function summarizeThinkingAccuracy(result) {
  const total = result.runs.length;
  const correct = result.runs.filter((run) => run.correct).length;
  const compliant = result.runs.filter((run) => run.formatCompliant).length;
  return {
    correct,
    compliant,
    total,
    accuracy: total > 0 ? correct / total : null,
    formatCompliance: total > 0 ? compliant / total : null,
  };
}

function summarizeRunThinkingAccuracy(results) {
  return results.reduce((total, result) => {
    const accuracy = summarizeThinkingAccuracy(result);
    total.correct += accuracy.correct;
    total.compliant += accuracy.compliant;
    total.total += accuracy.total;
    return total;
  }, { correct: 0, compliant: 0, total: 0 });
}

function formatRatioPercent(ratio, scale = 1, numerator = null, denominator = null) {
  if (denominator !== null) {
    if (denominator === 0) return "-";
    const pct = Math.round((numerator / denominator) * 100);
    return `${pct}% (${numerator}/${denominator})`;
  }
  if (ratio === null || ratio === undefined) return "-";
  const pct = Math.round(ratio * 100 * scale);
  return `${pct}%`;
}

function getAccuracyHighlightClass(accuracy) {
  if (accuracy === null || accuracy === undefined) return null;
  if (accuracy === 1) return "accuracy-high";
  if (accuracy < 0.5) return "accuracy-low";
  return "accuracy-mid";
}

function getThinkingElapsedMs(result) {
  return getLiveElapsedMs(result);
}

function startThinkingClock() {
  stopThinkingClock();
  thinkingClockInterval = setInterval(() => {
    if (thinkingRun?.status === "running") renderThinkingResults();
  }, 1000);
}

function stopThinkingClock() {
  if (thinkingClockInterval) {
    clearInterval(thinkingClockInterval);
    thinkingClockInterval = null;
  }
}

function renderThinkingRequestTemplate() {
  const previewConfig = {
    disableThinking: thinkingDisableThinkingInput.checked,
    rowCount: clampInteger(thinkingRowsInput.value, 5, MAX_THINKING_ROWS),
    dataFormat: thinkingFormatSelect.value,
  };
  const sampleTask = generateThinkingTask(0xC0FFEE, 0, previewConfig);
  const endpointValue = endpointInput.value.trim() || "https://api.example.com/v1";
  const requestUrl = buildChatCompletionsUrl(endpointValue);
  const body = buildThinkingRequestBody("<selected-model>", previewConfig, sampleTask.prompt);
  thinkingTemplateCode.textContent = formatBenchmarkRequest(requestUrl, body);
}

function renderThinkingMethodologySample() {
  const sample = thinkingRun?.sampleExchange;
  if (!sample) {
    thinkingSampleRequestNote.textContent = "No measured question has been captured yet.";
    thinkingSampleResponseNote.textContent = "Run the test to capture an actual request and its complete streamed response.";
    thinkingSampleOutputNote.textContent = "Run the test to assemble generated output and grading verdict from an actual measured question.";
    thinkingSampleRequestCode.textContent = "Run a test to capture an actual measured request.";
    thinkingSampleResponseCode.textContent = "Run a test to capture its actual streamed response.";
    thinkingSampleOutputCode.textContent = "Run a test to capture its consolidated output and grading.";
    return;
  }
  const source = `${sample.modelId} · ${sample.runLabel}`;
  thinkingSampleRequestNote.textContent = `Actual request captured from ${source}. The API key is redacted.`;
  thinkingSampleResponseNote.textContent = `Actual response captured from ${source}. Chunk labels show the decoded network reads.`;
  thinkingSampleOutputNote.textContent = `Actual generated deltas from ${source}, consolidated and graded.`;
  thinkingSampleRequestCode.textContent = sample.request;
  thinkingSampleResponseCode.textContent = sample.response;
  thinkingSampleOutputCode.textContent = sample.consolidatedOutput;
}

function exportThinkingCsv() {
  if (!thinkingRun) return;
  exportBenchmarkCsvFile({
    filenamePrefix: "llm-thinking-test",
    columns: getVisibleThinkingExportColumns(),
    results: getSortedThinkingResults(),
    getValue: getThinkingSortValue,
    getTotal: getThinkingTotalValue,
  });
}

function exportThinkingJson() {
  if (!thinkingRun) return;
  exportBenchmarkJsonFile({
    filenamePrefix: "llm-thinking-test",
    columns: getVisibleThinkingExportColumns(),
    results: getSortedThinkingResults(),
    getValue: getThinkingSortValue,
    getTotal: getThinkingTotalValue,
    metadata: {
      config: thinkingRun.config,
      methodology: thinkingRun.methodology,
      runSeed: thinkingRun.runSeed,
      executionOrder: thinkingRun.executionOrder,
    },
  });
}

function getVisibleThinkingExportColumns() {
  return getVisibleExportColumns(
    thinkingSortHeaders,
    visibleThinkingColumns,
    "thinkingColumn",
  );
}

function getSortedThinkingResults() {
  return sortRowsByState(thinkingRun.results, getThinkingSortValue, thinkingSortState);
}

function getThinkingTotalValue(key) {
  const usage = summarizeRunUsage(thinkingRun.results);
  const accuracy = summarizeRunThinkingAccuracy(thinkingRun.results);
  const totalCost = usage.pricedUsageCount > 0 ? usage.cost : null;
  const costPerCorrect = totalCost !== null && accuracy.correct > 0
    ? totalCost / accuracy.correct
    : null;
  const values = {
    modelId: "TOTAL RUN",
    status: thinkingRun.status,
    accuracy: accuracy.total > 0 ? accuracy.correct / accuracy.total : null,
    formatCompliance: accuracy.total > 0 ? accuracy.compliant / accuracy.total : null,
    ttftMedian: null,
    ttftP95: null,
    tpsMedian: null,
    tpsP95: null,
    e2eMedian: null,
    e2eP95: null,
    reasoningTokensMedian: null,
    answerTokensMedian: null,
    costPerCorrect,
    totalTokens: usage.totalTokens,
    cost: usage.hasUnpriced ? null : usage.cost,
    totalTestTimeMs: thinkingRun.totalTestTimeMs,
  };
  return values[key];
}
