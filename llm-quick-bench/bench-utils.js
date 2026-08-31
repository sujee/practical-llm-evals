class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.status = statusCode;
  }
}

function isSecureEndpoint(rawEndpoint) {
  let url;
  try {
    url = new URL(rawEndpoint.trim());
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    // `URL.hostname` returns IPv6 hosts in the bracketed form (e.g. "[::1]"),
    // per the WHATWG URL host serializer, so the comparison must use brackets.
    const host = url.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }
  return false;
}

function buildApiUrl(rawEndpoint, resourcePath) {
  const url = new URL(rawEndpoint.trim());
  const basePath = url.pathname
    .replace(/\/(models|chat\/completions)\/?$/i, "")
    .replace(/\/+$/, "");
  url.pathname = `${basePath}/${resourcePath}`;
  url.hash = "";
  return url;
}

function buildChatCompletionsUrl(rawEndpoint) {
  const url = buildApiUrl(rawEndpoint, "chat/completions");
  return url.toString();
}

function buildApiHeaders(apiKey, { accept, contentType } = {}) {
  const headers = {};
  if (accept) headers.Accept = accept;
  if (contentType) headers["Content-Type"] = contentType;
  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function formatBenchmarkRequest(requestUrl, body) {
  const headers = buildApiHeaders("[REDACTED]", {
    accept: "text/event-stream",
    contentType: "application/json",
  });
  return [
    `POST ${requestUrl}`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    "",
    JSON.stringify(body, null, 2),
  ].join("\n");
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
}

function shuffleWithSeed(items, seed) {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function summarizeRuns(runs) {
  return {
    ttftMedian: percentile(runs.map((run) => run.ttftMs), 0.5),
    ttftP95: percentile(runs.map((run) => run.ttftMs), 0.95),
    e2eMedian: percentile(runs.map((run) => run.endToEndLatencyMs), 0.5),
    e2eP95: percentile(runs.map((run) => run.endToEndLatencyMs), 0.95),
    tpsMedian: percentile(runs.map((run) => run.tokensPerSecond), 0.5),
    tpsP95: percentile(runs.map((run) => run.tokensPerSecond), 0.95),
  };
}

function summarizeBenchmarkUsage(result) {
  const requests = [result.warmup, ...result.runs].filter(Boolean);
  const promptTokens = requests.reduce((sum, request) => sum + request.promptTokens, 0);
  const completionTokens = requests.reduce((sum, request) => sum + request.completionTokens, 0);
  const inputPrice = result.pricing?.inputPerMillionTokens;
  const outputPrice = result.pricing?.outputPerMillionTokens;
  const hasPricing = inputPrice != null && outputPrice != null;
  return {
    requestCount: requests.length,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    hasEstimated: requests.some((request) => request.tokenCountEstimated),
    cost: requests.length > 0 && hasPricing
      ? ((promptTokens * inputPrice) + (completionTokens * outputPrice)) / 1_000_000
      : null,
  };
}

function summarizeRunUsage(results) {
  return results.reduce((total, result) => {
    const usage = summarizeBenchmarkUsage(result);
    total.promptTokens += usage.promptTokens;
    total.completionTokens += usage.completionTokens;
    total.totalTokens += usage.totalTokens;
    total.cost += usage.cost ?? 0;
    total.requestCount += usage.requestCount;
    if (usage.requestCount > 0 && usage.cost !== null) total.pricedUsageCount += 1;
    if (usage.hasEstimated) total.estimatedModelCount += 1;
    total.hasEstimated ||= usage.hasEstimated;
    total.hasUnpriced ||= usage.requestCount > 0 && usage.cost === null;
    return total;
  }, {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    requestCount: 0,
    pricedUsageCount: 0,
    estimatedModelCount: 0,
    hasEstimated: false,
    hasUnpriced: false,
  });
}

function createBenchmarkRun({ selectedModels, connection, config, methodology, runSeed }) {
  return {
    status: "running",
    startedAt: new Date().toISOString(),
    provider: connection.provider,
    endpoint: buildChatCompletionsUrl(connection.endpoint),
    environment: {
      userAgent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    methodology,
    config,
    sampleExchange: null,
    runSeed,
    executionOrder: null,
    results: selectedModels.map((model) => ({
      modelId: model.modelId,
      pricing: {
        inputPerMillionTokens: model.inputPrice,
        outputPerMillionTokens: model.outputPrice,
      },
      status: "queued",
      warmup: null,
      runs: [],
      errors: [],
      totalTestTimeMs: null,
    })),
  };
}

function estimateTokenCount(text) {
  return Math.max(1, Math.round(text.length / 4));
}

function estimatePromptTokenCount(messages) {
  const contentTokens = messages.reduce((sum, message) => sum + estimateTokenCount(message.content), 0);
  return contentTokens + (messages.length * 4) + 2;
}

function clampInteger(value, minimum, maximum) {
  const parsed = Number(value);
  const clamped = Number.isFinite(parsed) ? Math.round(parsed) : minimum;
  return Math.min(maximum, Math.max(minimum, clamped));
}

function formatMilliseconds(value) {
  return value === null ? "-" : `${Math.round(value).toLocaleString()} ms`;
}

function formatRate(value) {
  return value === null ? "-" : `${value.toFixed(1)} tok/s`;
}

function formatDuration(value) {
  if (value === null || value === undefined) return "-";
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(1)}s`;
}

function formatInteger(value) {
  return Math.round(value).toLocaleString();
}

function formatCost(value) {
  if (value === null || value === undefined) return "-";
  if (value > 0 && value < 0.000001) return "<$0.000001";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function compareValues(left, right) {
  if (left === right) return 0;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return normalizedValue(left).localeCompare(normalizedValue(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizedValue(value) {
  return String(value);
}

function toCsvRow(values) {
  return values.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
}

function fileTimestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function downloadFile(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getVisibleExportColumns(headers, visibleColumns, columnAttr) {
  return headers
    .filter((header) => visibleColumns.has(header.dataset[columnAttr]))
    .map((header) => ({
      key: header.dataset[columnAttr],
      label: header.querySelector("button span").textContent,
    }));
}

function exportBenchmarkCsvFile({ filenamePrefix, columns, results, getValue, getTotal }) {
  const header = columns.map((column) => column.label);
  const rows = results.map((result) => columns.map((column) => getValue(result, column.key)));
  rows.push(columns.map((column) => getTotal(column.key)));
  downloadFile(
    `${filenamePrefix}-${fileTimestamp()}.csv`,
    [header, ...rows].map(toCsvRow).join("\n"),
    "text/csv",
  );
}

function exportBenchmarkJsonFile({
  filenamePrefix,
  columns,
  results,
  getValue,
  getTotal,
  metadata = {},
}) {
  const toSelectedObject = (result) => Object.fromEntries(
    columns.map((column) => [column.key, getValue(result, column.key)]),
  );
  const payload = {
    exportedAt: new Date().toISOString(),
    selectedColumns: columns.map((column) => column.key),
    ...metadata,
    results: results.map(toSelectedObject),
    total: Object.fromEntries(columns.map((column) => [column.key, getTotal(column.key)])),
  };
  downloadFile(
    `${filenamePrefix}-${fileTimestamp()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

// --- Shared benchmark infrastructure (column picker, sort state, run sequence) ---
// Used by both Raw Speed Test 1 and Thinking Test 1 to keep column-management,
// warmup/measured-loop, and SSE parsing logic in one place instead of duplicated
// across the two benchmark files. Each helper is intentionally idempotent and
// pure of test-specific state so the test files can call them with their own
// headers, storage keys, sort-state holders, and per-run callbacks.

function loadVisibleColumnSet(storageKey, allKeys, defaultColumns) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) {
      const valid = saved.filter((key) => allKeys.includes(key));
      if (valid.length > 0) return new Set(valid);
    }
  } catch {
    // Storage may be unavailable in strict privacy contexts; use defaults.
  }
  return new Set((defaultColumns ?? allKeys).slice());
}

function saveVisibleColumnSet(storageKey, visibleColumns) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...visibleColumns]));
  } catch {
    // Column selection still works for this session when storage is unavailable.
  }
}

// Builds the visible-columns checkbox dropdown inside `container`. Each checkbox
// corresponds to a column key from `headers` (via their data-${columnAttr} attribute)
// and toggles membership in `visibleColumns` (a Set). `onChange(visibleColumns)`
// runs after each successful toggle - the place to fix sort state, save, and
// re-render. Mutates the existing Set instance so closures elsewhere keep working.
function buildColumnPicker({
  headers,
  columnAttr,
  container,
  visibleColumns,
  onChange,
}) {
  container.replaceChildren();
  headers.forEach((header) => {
    const key = header.dataset[columnAttr];
    const label = document.createElement("label");
    label.className = "column-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.checked = visibleColumns.has(key);
    const text = document.createElement("span");
    text.textContent = header.querySelector("button span").textContent;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        visibleColumns.add(key);
      } else if (visibleColumns.size === 1) {
        checkbox.checked = true;
        return;
      } else {
        visibleColumns.delete(key);
      }
      onChange(visibleColumns);
    });
    label.append(checkbox, text);
    container.append(label);
  });
}

function syncColumnPicker(container, visibleColumns) {
  container.querySelectorAll("input").forEach((checkbox) => {
    checkbox.checked = visibleColumns.has(checkbox.value);
  });
}

// Refreshes hidden / aria-sort / sort-icon state on the visible column headers.
// Pass the per-test headers array, the data-attribute name carried on each header
// (e.g. "benchmarkColumn" or "thinkingColumn"), the visible-columns Set, and the
// active sort state { key, direction }.
function updateSortHeaders({ headers, columnAttr, visibleColumns, sortState }) {
  headers.forEach((header) => {
    const key = header.dataset[columnAttr];
    header.hidden = !visibleColumns.has(key);
    const isActive = key === sortState.key;
    header.classList.toggle("sorted-column", isActive);
    header.setAttribute("aria-sort", isActive ? sortState.direction : "none");
    header.querySelector(".sort-icon").textContent = isActive
      ? sortState.direction === "ascending" ? "↑" : "↓"
      : "↕";
  });
}

// Returns the next sort state when a column header is clicked: toggle direction
// when the same column is selected again, otherwise reset to ascending.
function nextSortState(currentSortState, key) {
  return {
    key,
    direction: currentSortState.key === key && currentSortState.direction === "ascending"
      ? "descending"
      : "ascending",
  };
}

// Stable sort of a copy of `rows` by the active sort state, using a per-row
// `getSortValue(row, key)` projector. Missing values sort to the bottom regardless
// of direction (matching the original per-test sorters).
function sortRowsByState(rows, getSortValue, sortState) {
  return [...rows].sort((left, right) => {
    const leftValue = getSortValue(left, sortState.key);
    const rightValue = getSortValue(right, sortState.key);
    if (isMissing(leftValue)) return isMissing(rightValue) ? 0 : 1;
    if (isMissing(rightValue)) return -1;
    const comparison = compareValues(leftValue, rightValue);
    return sortState.direction === "ascending" ? comparison : -comparison;
  });
}

// Live (in-progress) test-time display for a still-running result row: returns
// elapsed ms since result.startedAtMs when the row is queued/warming/running,
// otherwise null so callers fall back to result.totalTestTimeMs.
function getLiveElapsedMs(result, statusRegex = /^run \d+\/\d+$/i) {
  if (!result.startedAtMs) return null;
  if (result.status === "queued" || result.status === "warming" || statusRegex.test(result.status)) {
    return performance.now() - result.startedAtMs;
  }
  return null;
}

function logBenchmarkEvent(config, logName, event, details) {
  if (!config.logToConsole) return;
  let serializedDetails;
  try {
    serializedDetails = JSON.stringify(details, null, 2);
  } catch {
    serializedDetails = String(details);
  }
  console.log(`[${logName}] ${event}\n${serializedDetails}`);
}

function logBenchmarkRaw(config, logName, label, rawData) {
  if (!config.logToConsole) return;
  console.log(`[${logName}] ${label}\n${rawData}`);
}

function formatAssembledOutput(reasoningText, contentText) {
  const sections = [];
  if (reasoningText) sections.push(`--- REASONING ---\n${reasoningText}`);
  if (contentText) sections.push(`--- FINAL CONTENT ---\n${contentText}`);
  return sections.join("\n\n") || "[No generated text]";
}

function formatCapturedStreamResponse(responseHeaderLines, rawResponseChunks) {
  return [
    responseHeaderLines.join("\n"),
    "",
    ...rawResponseChunks.flatMap((chunk, index) => [`[chunk ${index + 1}]`, chunk]),
  ].join("\n");
}

async function runStreamingChatCompletion({
  modelId,
  config,
  outerSignal,
  runLabel,
  connection,
  body,
  logName,
}) {
  const requestController = new AbortController();
  const abortFromOuter = () => requestController.abort(outerSignal.reason);
  if (outerSignal.aborted) {
    requestController.abort(outerSignal.reason);
  } else {
    outerSignal.addEventListener("abort", abortFromOuter, { once: true });
  }
  const timeoutId = setTimeout(
    () => requestController.abort(new DOMException("Request timed out", "TimeoutError")),
    config.timeoutMs,
  );
  const startedAt = performance.now();
  let reader = null;

  try {
    const requestUrl = buildChatCompletionsUrl(connection.endpoint);
    const rawRequestText = formatBenchmarkRequest(requestUrl, body);
    logBenchmarkRaw(config, logName, `${modelId} · ${runLabel} · RAW REQUEST`, rawRequestText);

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: buildApiHeaders(connection.apiKey, {
        accept: "text/event-stream",
        contentType: "application/json",
      }),
      body: JSON.stringify(body),
      signal: requestController.signal,
    });

    const responseHeaderLines = [`HTTP ${response.status} ${response.statusText}`.trim()];
    response.headers.forEach((value, key) => responseHeaderLines.push(`${key}: ${value}`));
    logBenchmarkRaw(
      config,
      logName,
      `${modelId} · ${runLabel} · RAW RESPONSE HEADERS`,
      responseHeaderLines.join("\n"),
    );

    if (!response.ok) {
      const rawErrorBody = await response.text();
      logBenchmarkRaw(config, logName, `${modelId} · ${runLabel} · RAW RESPONSE BODY`, rawErrorBody);
      let payload;
      try {
        payload = rawErrorBody ? JSON.parse(rawErrorBody) : {};
      } catch {
        payload = { message: rawErrorBody };
      }
      const message = payload?.error?.message || payload?.message || response.statusText;
      throw new HttpError(response.status, `${response.status} ${message}`.trim());
    }
    if (!response.body) throw new Error("The endpoint returned no streaming response body.");

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstTokenAt = null;
    let outputText = "";
    let reasoningText = "";
    let contentText = "";
    let rawChunkNumber = 0;
    const rawResponseChunks = [];
    let promptTokens = null;
    let completionTokens = null;
    let finishReason = null;

    const consumeLine = (line) => {
      const chunk = parseSseLine(line);
      if (!chunk) return;
      const chunkData = extractSseChunkData(chunk);
      if (chunkData.completionTokens !== null) completionTokens = chunkData.completionTokens;
      if (chunkData.promptTokens !== null) promptTokens = chunkData.promptTokens;
      if (chunkData.finishReason) finishReason = chunkData.finishReason;
      if (chunkData.contentDelta || chunkData.reasoningDelta) {
        if (firstTokenAt === null) firstTokenAt = performance.now();
        contentText += chunkData.contentDelta;
        reasoningText += chunkData.reasoningDelta;
        outputText += chunkData.reasoningDelta + chunkData.contentDelta;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      const rawResponseChunk = decoder.decode(value || new Uint8Array(), { stream: !done });
      if (rawResponseChunk) {
        rawChunkNumber += 1;
        rawResponseChunks.push(rawResponseChunk);
        logBenchmarkRaw(
          config,
          logName,
          `${modelId} · ${runLabel} · RAW RESPONSE CHUNK #${rawChunkNumber}`,
          rawResponseChunk,
        );
      }
      buffer += rawResponseChunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(consumeLine);
      if (done) break;
    }
    if (buffer) consumeLine(buffer);

    const consolidatedOutput = formatAssembledOutput(reasoningText, contentText);
    logBenchmarkRaw(
      config,
      logName,
      `${modelId} · ${runLabel} · ASSEMBLED RESPONSE`,
      consolidatedOutput,
    );

    const finishedAt = performance.now();
    if (firstTokenAt === null) throw new Error("The stream completed without generated text.");
    const completionTokenCountEstimated = completionTokens === null;
    const promptTokenCountEstimated = promptTokens === null;
    if (config.requireServerTokenCounts && (completionTokenCountEstimated || promptTokenCountEstimated)) {
      throw new Error("The endpoint omitted prompt or completion token usage required by this benchmark.");
    }
    if (completionTokenCountEstimated) completionTokens = estimateTokenCount(outputText);
    if (promptTokenCountEstimated) promptTokens = estimatePromptTokenCount(body.messages);
    const generationSeconds = Math.max((finishedAt - firstTokenAt) / 1000, 0.001);

    return {
      request: rawRequestText,
      response: formatCapturedStreamResponse(responseHeaderLines, rawResponseChunks),
      consolidatedOutput,
      outputText,
      reasoningText,
      contentText,
      measurement: {
        ttftMs: firstTokenAt - startedAt,
        endToEndLatencyMs: finishedAt - startedAt,
        tokensPerSecond: completionTokens / generationSeconds,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        tokenCountEstimated: completionTokenCountEstimated || promptTokenCountEstimated,
        promptTokenCountEstimated,
        completionTokenCountEstimated,
        outputCharacters: outputText.length,
        reasoningCharacters: reasoningText.length,
        contentCharacters: contentText.length,
        responseChunks: rawChunkNumber,
        finishReason,
      },
    };
  } catch (error) {
    logBenchmarkEvent(config, logName, "request error", {
      model: modelId,
      run: runLabel,
      name: error.name,
      message: error.message,
    });
    if (requestController.signal.aborted && !outerSignal.aborted) {
      throw new Error(`Timed out after ${Math.round(config.timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    try { await reader?.cancel(); } catch {}
    clearTimeout(timeoutId);
    outerSignal.removeEventListener("abort", abortFromOuter);
  }
}

// Drives the per-model benchmark sequence: one warm-up request, then `config.runs`
// measured runs, scoped by `signal`. The `runOnce({ runIndex, label, includeUsage })`
// callback performs the actual streaming request and returns a per-run measurement
// object pushed onto `result.runs`. `render()` is called after each status
// transition so each test's results table updates live. The warm-up retries
// without `include_usage` if the endpoint rejects it with HTTP 400, mirroring the
// original per-test bodies.
async function runBenchmarkSequence(result, config, signal, runOnce, render) {
  if (signal.aborted) {
    result.status = "cancelled";
    render();
    return;
  }
  const modelStartedAt = performance.now();
  result.startedAtMs = modelStartedAt;
  result.startedAt = new Date().toISOString();
  result.status = "warming";
  render();

  let includeUsage = true;
  try {
    try {
      result.warmup = await runOnce({ runIndex: -1, label: "warmup", includeUsage: true });
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 400) throw error;
      includeUsage = false;
      result.warmup = await runOnce({ runIndex: -1, label: "warmup-fallback", includeUsage: false });
    }

    for (let runIndex = 0; runIndex < config.runs; runIndex += 1) {
      if (signal.aborted) break;
      result.status = `run ${runIndex + 1}/${config.runs}`;
      render();
      try {
        const measuredRun = await runOnce({ runIndex, label: `run-${runIndex + 1}`, includeUsage });
        result.runs.push({ index: runIndex + 1, ...measuredRun });
      } catch (error) {
        if (signal.aborted) break;
        console.error(
          `[LLM Quick Bench] Benchmark run ${runIndex + 1} failed for ${result.modelId}.`,
          error,
        );
        result.errors.push({ run: runIndex + 1, message: error.message });
      }
      render();
    }

    result.status = signal.aborted
      ? "cancelled"
      : result.runs.length > 0
        ? result.errors.length > 0 ? "partial" : "complete"
        : "error";
  } catch (error) {
    result.status = signal.aborted ? "cancelled" : "error";
    if (!signal.aborted) {
      console.error(`[LLM Quick Bench] Benchmark warm-up failed for ${result.modelId}.`, error);
      result.errors.push({ run: "warmup", message: error.message });
    }
  }
  result.finishedAt = new Date().toISOString();
  result.totalTestTimeMs = performance.now() - modelStartedAt;
  render();
}

// Parses one raw SSE line. Returns the parsed chunk object for `data:` lines with
// valid JSON payload, or null for blank lines, comments, `[DONE]`, or unparseable
// JSON. Anything non-null is meant to be passed to extractSseChunkData().
function parseSseLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Projects a parsed SSE chunk into flat fields the consumer can apply. Token
// counts come back as null when absent (so callers can keep them on a strict
// "if (ct !== null) ..." pattern); content/reasoning deltas come back as strings
// (empty when absent). finishReason keeps the raw value or null.
function extractSseChunkData(chunk) {
  const completionTokens = Number.isFinite(chunk?.usage?.completion_tokens)
    ? chunk.usage.completion_tokens
    : null;
  const promptTokens = Number.isFinite(chunk?.usage?.prompt_tokens)
    ? chunk.usage.prompt_tokens
    : null;
  const finishReason = chunk?.choices?.[0]?.finish_reason ?? null;
  const delta = chunk?.choices?.[0]?.delta;
  const contentDelta = typeof delta?.content === "string" ? delta.content : "";
  const reasoningDelta = typeof delta?.reasoning_content === "string"
    ? delta.reasoning_content
    : typeof delta?.reasoning === "string" ? delta.reasoning : "";
  return { completionTokens, promptTokens, finishReason, contentDelta, reasoningDelta };
}
