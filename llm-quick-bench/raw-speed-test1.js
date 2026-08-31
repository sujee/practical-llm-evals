const form = document.querySelector("#connection-form");
const tabs = [...document.querySelectorAll('[role="tab"]')];
const tabPanels = [...document.querySelectorAll('[role="tabpanel"]')];
const providerSelect = document.querySelector("#provider");
const endpointInput = document.querySelector("#endpoint");
const endpointHint = document.querySelector("#endpoint-hint");
const apiKeyInput = document.querySelector("#api-key");
const toggleKeyButton = document.querySelector("#toggle-key");
const loadButton = document.querySelector("#load-button");
const connectionControls = [providerSelect, endpointInput, apiKeyInput, toggleKeyButton];
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const modelCount = document.querySelector("#model-count");
const tableHead = document.querySelector("#models-head");
const tableBody = document.querySelector("#models-body");
const exportModelsCsvButton = document.querySelector("#export-models-csv");
const exportModelsJsonButton = document.querySelector("#export-models-json");
const selectNewestModelsButton = document.querySelector("#select-newest-models");
const selectIntelligentModelsButton = document.querySelector("#select-intelligent-models");
const selectAllModelsButton = document.querySelector("#select-all-models");
const invertModelSelectionButton = document.querySelector("#invert-model-selection");
const selectNoModelsButton = document.querySelector("#select-no-models");
const modelSearchInput = document.querySelector("#model-search");
const modelSelectionButtons = [
  selectNewestModelsButton,
  selectIntelligentModelsButton,
  selectAllModelsButton,
  invertModelSelectionButton,
  selectNoModelsButton,
];
const benchmarkForm = document.querySelector("#benchmark-form");
const runsInput = document.querySelector("#runs");
const maxTokensInput = document.querySelector("#max-tokens");
const concurrencyInput = document.querySelector("#concurrency");
const timeoutInput = document.querySelector("#timeout");
const promptInput = document.querySelector("#benchmark-prompt");
const logConsoleInput = document.querySelector("#log-console");
const disableThinkingInput = document.querySelector("#disable-thinking");
const fixedOutputInput = document.querySelector("#fixed-output");
const requireServerTokensInput = document.querySelector("#require-server-tokens");
const benchmarkConfigInputs = [...benchmarkForm.querySelectorAll("input, textarea")];
const requestTemplateCode = document.querySelector("#request-template-code");
const sampleRequestNote = document.querySelector("#sample-request-note");
const sampleRequestCode = document.querySelector("#sample-request-code");
const sampleResponseNote = document.querySelector("#sample-response-note");
const sampleResponseCode = document.querySelector("#sample-response-code");
const sampleOutputNote = document.querySelector("#sample-output-note");
const sampleOutputCode = document.querySelector("#sample-output-code");
const runButton = document.querySelector("#run-button");
const cancelButton = document.querySelector("#cancel-button");
const benchmarkStatus = document.querySelector("#benchmark-status");
const benchmarkResults = document.querySelector("#benchmark-results");
const benchmarkBody = document.querySelector("#benchmark-body");
const usageNote = document.querySelector("#usage-note");
const summaryTime = document.querySelector("#summary-time");
const summaryInputTokens = document.querySelector("#summary-input-tokens");
const summaryOutputTokens = document.querySelector("#summary-output-tokens");
const summaryTotalTokens = document.querySelector("#summary-total-tokens");
const summaryCost = document.querySelector("#summary-cost");
const exportCsvButton = document.querySelector("#export-csv");
const exportJsonButton = document.querySelector("#export-json");
const benchmarkSortHeaders = [...document.querySelectorAll("[data-benchmark-column]")];
const benchmarkColumnOptions = document.querySelector("#benchmark-column-options");
const showAllColumnsButton = document.querySelector("#show-all-columns");
const benchmarkColumnKeys = benchmarkSortHeaders.map((header) => header.dataset.benchmarkColumn);
const benchmarkColumnPreferenceKey = "llm-quick-bench:benchmark-columns:v8";

const endpointPresets = {
  nebius: {
    endpoint: "https://api.tokenfactory.nebius.com/v1",
    hint: "Nebius OpenAI-compatible API base URL.",
  },
  openai: {
    endpoint: "https://api.openai.com/v1",
    hint: "OpenAI API base URL.",
  },
  together: {
    endpoint: "https://api.together.ai/v1",
    hint: "Together AI OpenAI-compatible API base URL.",
  },
  baseten: {
    endpoint: "https://inference.baseten.co/v1",
    hint: "Baseten OpenAI-compatible inference API base URL.",
  },
};

const columns = [
  { key: "selected", label: "Run" },
  { key: "modelId", label: "Model ID" },
  { key: "releaseDate", label: "Release date" },
  { key: "aaIndex", label: "AA Index" },
  { key: "contextWindow", label: "Context window" },
  { key: "parameterCount", label: "Parameters" },
  { key: "inputPrice", label: "Input / 1M" },
  { key: "outputPrice", label: "Output / 1M" },
  { key: "blendedPrice", label: "Blended / 1M (3:1)" },
];
let models = [];
let sortState = { key: "releaseDate", direction: "descending" };
let benchmarkRun = null;
let benchmarkAbortController = null;
let benchmarkStartedAtMs = null;
let benchmarkClockInterval = null;
let modelsLoading = false;
let modelFilterText = "";
let benchmarkSortState = { key: "tpsMedian", direction: "descending" };
let visibleBenchmarkColumns = loadVisibleBenchmarkColumns();
if (!visibleBenchmarkColumns.has(benchmarkSortState.key)) {
  benchmarkSortState = { key: [...visibleBenchmarkColumns][0], direction: "ascending" };
}

providerSelect.addEventListener("change", () => {
  const preset = endpointPresets[providerSelect.value];
  if (preset) {
    endpointInput.value = preset.endpoint;
    endpointHint.textContent = preset.hint;
    renderRequestTemplate();
    return;
  }
  endpointHint.textContent = "Enter a base URL or the full /models URL.";
  endpointInput.focus();
  endpointInput.select();
  renderRequestTemplate();
});

endpointInput.addEventListener("input", () => {
  const normalizedEndpoint = endpointInput.value.trim().replace(/\/+$/, "");
  const matchingPreset = Object.entries(endpointPresets).find(([, preset]) => (
    preset.endpoint === normalizedEndpoint
  ));
  if (matchingPreset) {
    providerSelect.value = matchingPreset[0];
    endpointHint.textContent = matchingPreset[1].hint;
    renderRequestTemplate();
    return;
  }
  providerSelect.value = "custom";
  endpointHint.textContent = "Custom OpenAI-compatible API base URL.";
  renderRequestTemplate();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab));
  tab.addEventListener("keydown", (event) => {
    const currentIndex = tabs.indexOf(tab);
    const keyTargets = {
      ArrowLeft: (currentIndex - 1 + tabs.length) % tabs.length,
      ArrowRight: (currentIndex + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in keyTargets)) return;
    event.preventDefault();
    const nextTab = tabs[keyTargets[event.key]];
    setActiveTab(nextTab);
    nextTab.focus();
  });
});
toggleKeyButton.addEventListener("click", () => {
  const shouldShow = apiKeyInput.type === "password";
  apiKeyInput.type = shouldShow ? "text" : "password";
  toggleKeyButton.textContent = shouldShow ? "Hide" : "Show";
  toggleKeyButton.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} API key`);
});

selectNewestModelsButton.addEventListener("click", () => selectTopModels("releaseDate", 5));
selectIntelligentModelsButton.addEventListener("click", () => selectTopModels("aaIndex", 5));
selectAllModelsButton.addEventListener("click", () => setAllModelsSelected(true));
invertModelSelectionButton.addEventListener("click", invertModelSelection);
selectNoModelsButton.addEventListener("click", () => setAllModelsSelected(false));
modelSearchInput.addEventListener("input", () => {
  modelFilterText = modelSearchInput.value;
  renderTable();
});
cancelButton.addEventListener("click", () => benchmarkAbortController?.abort());
exportCsvButton.addEventListener("click", exportBenchmarkCsv);
exportJsonButton.addEventListener("click", exportBenchmarkJson);
exportModelsCsvButton.addEventListener("click", exportModelsCsv);
exportModelsJsonButton.addEventListener("click", exportModelsJson);
benchmarkSortHeaders.forEach((header) => {
  header.querySelector("button").addEventListener("click", () => {
    sortBenchmarkBy(header.dataset.benchmarkColumn);
  });
});
initializeBenchmarkColumnPicker();
resetBenchmarkResults();
renderTable();
updateModelResultsState();
showAllColumnsButton.addEventListener("click", () => {
  visibleBenchmarkColumns.clear();
  benchmarkColumnKeys.forEach((key) => visibleBenchmarkColumns.add(key));
  saveVisibleBenchmarkColumns();
  syncBenchmarkColumnPicker();
  renderBenchmarkResults();
});
renderMethodologySample();
renderRequestTemplate();
[promptInput, maxTokensInput].forEach((input) => input.addEventListener("input", renderRequestTemplate));
[disableThinkingInput, fixedOutputInput].forEach((input) => input.addEventListener("change", renderRequestTemplate));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSecureEndpoint(endpointInput.value)) {
    setStatus("Use an HTTPS endpoint (http://localhost is also allowed) so the API key isn't sent in cleartext.", true);
    return;
  }
  setStatus("Loading models…");
  setLoading(true);

  try {
    const modelReference = await loadModelReference();
    const url = buildModelsUrl(endpointInput.value, providerSelect.value);
    const response = await fetch(url, {
      method: "GET",
      headers: buildApiHeaders(apiKeyInput.value.trim(), {
        accept: "application/json",
      }),
    });

    const payload = await readResponse(response);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || response.statusText;
      throw new Error(`${response.status} ${message}`.trim());
    }

    const returnedModels = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(returnedModels)) {
      throw new Error("The endpoint did not return a model array or an OpenAI-style { data: [] } response.");
    }

    const crossReferencedModels = returnedModels.map((model) => toTableRow(model, modelReference));
    models = crossReferencedModels
      .filter((model) => !model.isEmbedding)
      .map((model) => ({ ...model, selected: false }));
    const skippedEmbeddings = crossReferencedModels.length - models.length;
    sortState = { key: "releaseDate", direction: "descending" };
    renderTable();
    results.hidden = false;
    resetBenchmarkResults();
    if (typeof resetThinkingResults === "function") resetThinkingResults();
    setBenchmarkStatus("");
    updateSelectionCount();
    updateModelResultsState();
    const referenceMatches = models.filter((model) => model.referenceMatched).length;
    const skippedMessage = skippedEmbeddings === 0
      ? ""
      : ` Skipped ${skippedEmbeddings} embedding model${skippedEmbeddings === 1 ? "" : "s"}.`;
    setStatus(
      `Loaded ${models.length} model${models.length === 1 ? "" : "s"}; ${referenceMatches} matched model-info.json.${skippedMessage}`,
    );
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    models = [];
    resetBenchmarkResults();
    if (typeof resetThinkingResults === "function") resetThinkingResults();
    renderTable();
    updateSelectionCount();
    results.hidden = false;
    updateModelResultsState();
    setBenchmarkStatus("");
    const corsHint = error instanceof TypeError ? " The endpoint may not allow browser requests (CORS)." : "";
    setStatus(`${error.message || "Unable to load models."}${corsHint}`, true);
  } finally {
    setLoading(false);
  }
});

benchmarkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null) {
    setBenchmarkStatus("Thinking Test 1 is already running.", true);
    return;
  }
  const selectedModels = models.filter((model) => model.selected);
  if (selectedModels.length === 0) {
    setBenchmarkStatus("Select at least one model to run.", true);
    return;
  }

  const config = {
    runs: clampInteger(runsInput.value, 1, 20),
    maxTokens: clampInteger(maxTokensInput.value, 32, 4096),
    concurrency: clampInteger(concurrencyInput.value, 1, 12),
    timeoutMs: clampInteger(timeoutInput.value, 10, 600) * 1000,
    prompt: promptInput.value.trim(),
    logToConsole: logConsoleInput.checked,
    disableThinking: disableThinkingInput.checked,
    fixedOutput: fixedOutputInput.checked,
    requireServerTokenCounts: requireServerTokensInput.checked,
  };
  const connection = {
    provider: providerSelect.value,
    endpoint: endpointInput.value,
    apiKey: apiKeyInput.value.trim(),
  };
  if (!config.prompt) {
    setBenchmarkStatus("Enter a benchmark prompt.", true);
    return;
  }

  benchmarkAbortController = new AbortController();
  benchmarkStartedAtMs = performance.now();
  const runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  benchmarkRun = createBenchmarkRun({
    selectedModels,
    connection,
    config,
    runSeed,
    methodology: {
      temperature: 0,
      topP: 1,
      ttft: "request dispatch to first non-empty content or reasoning delta",
      tokensPerSecond: "completion tokens / seconds from first generated delta to stream end",
      endToEndLatency: "request dispatch to response stream close",
      percentile: "nearest rank",
    },
  });
  exportCsvButton.disabled = false;
  exportJsonButton.disabled = false;
  const scheduledResults = shuffleWithSeed([...benchmarkRun.results], runSeed);
  benchmarkRun.executionOrder = scheduledResults.map((result) => result.modelId);
  renderMethodologySample();
  setBenchmarkRunning(true);
  benchmarkResults.hidden = false;
  renderBenchmarkResults();
  setBenchmarkStatus(`Running ${selectedModels.length} models with up to ${Math.min(config.concurrency, selectedModels.length)} in parallel…`);

  try {
    await runWithConcurrency(
      scheduledResults,
      config.concurrency,
      (result) => benchmarkModel(result, config, benchmarkAbortController.signal, connection),
    );
    const completed = benchmarkRun.results.filter((result) => result.runs.length > 0).length;
    const failed = benchmarkRun.results.filter((result) => result.status === "error").length;
    const partial = benchmarkRun.results.filter((result) => result.status === "partial").length;
    setBenchmarkStatus(
      benchmarkAbortController.signal.aborted
        ? `Cancelled. Preserved results for ${completed} completed model${completed === 1 ? "" : "s"}.`
        : `Finished ${completed} model${completed === 1 ? "" : "s"}${partial ? `; ${partial} had failed runs` : ""}${failed ? `; ${failed} failed` : ""}.`,
      failed > 0 && completed === 0,
    );
  } finally {
    benchmarkRun.status = benchmarkAbortController.signal.aborted ? "cancelled" : "complete";
    benchmarkRun.finishedAt = new Date().toISOString();
    benchmarkRun.totalTestTimeMs = performance.now() - benchmarkStartedAtMs;
    benchmarkRun.usage = summarizeRunUsage(benchmarkRun.results);
    setBenchmarkRunning(false);
    renderBenchmarkResults();
    benchmarkAbortController = null;
    benchmarkStartedAtMs = null;
  }
});

function setActiveTab(activeTab) {
  tabs.forEach((tab) => {
    const isActive = tab === activeTab;
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  tabPanels.forEach((panel) => {
    panel.hidden = panel.id !== activeTab.getAttribute("aria-controls");
  });
}

function buildModelsUrl(rawEndpoint, provider) {
  const url = buildApiUrl(rawEndpoint, "models");
  if (provider === "nebius") url.searchParams.set("verbose", "true");
  return url.toString();
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 180)}`);
    throw new Error("The endpoint returned a non-JSON response.");
  }
}

function toTableRow(model, modelReference) {
  const modelId = model.id ?? model.model_id ?? model.name;
  const reference = findModelReference(modelId, modelReference);
  const inputPrice = getPricePerMillion(
    model.input_price_per_million_tokens,
    model.pricing?.prompt ?? model.pricing?.input,
  );
  const outputPrice = getPricePerMillion(
    model.output_price_per_million_tokens,
    model.pricing?.completion ?? model.pricing?.output,
  );

  return {
    modelId,
    referenceMatched: reference != null,
    isEmbedding: isEmbeddingModel(model, reference),
    releaseDate: normalizeReleaseDate(reference?.releaseDate),
    aaIndex: reference?.aaIndex ?? null,
    contextWindow: toNumber(
      model.context_length
        ?? model.context_window
        ?? model.max_model_len
        ?? (model.metadata?.context_window_k != null
          ? Number(model.metadata.context_window_k) * 1024
          : null)
        ?? reference?.contextWindow,
    ),
    parameterCount: getParameterCount(model, reference?.paramCount),
    inputPrice,
    outputPrice,
    blendedPrice: inputPrice != null && outputPrice != null
      ? ((3 * inputPrice) + outputPrice) / 4
      : null,
  };
}

async function loadModelReference() {
  let response;
  try {
    response = await fetch("model-info.json", { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Unable to load model-info.json. Serve the app over HTTP instead of opening index.html directly.");
  }
  if (!response.ok) {
    throw new Error(`Unable to load model-info.json (${response.status}).`);
  }

  let entries;
  try {
    entries = await response.json();
  } catch {
    throw new Error("model-info.json contains invalid JSON.");
  }
  if (!Array.isArray(entries)) {
    throw new Error("model-info.json must contain an array of models.");
  }
  return buildModelReference(entries);
}

function buildModelReference(entries) {
  const exact = new Map();
  const aliases = new Map();
  const ambiguousAliases = new Set();

  function addAlias(candidate, reference) {
    if (!candidate) return;
    const key = normalizeModelId(candidate);
    if (ambiguousAliases.has(key)) return;
    if (aliases.has(key) && aliases.get(key) !== reference) {
      aliases.delete(key);
      ambiguousAliases.add(key);
      return;
    }
    aliases.set(key, reference);
  }

  entries.forEach((entry) => {
    const score = toNumber(entry.aa_intelligence_index);
    const paramCountBillions = toNumber(entry.param_count_B);
    const contextWindow = toNumber(entry.context_window_tokens)
      ?? (toNumber(entry.context_window_K) != null
        ? toNumber(entry.context_window_K) * 1024
        : null);
    const reference = {
      aaIndex: score,
      paramCount: paramCountBillions === null ? null : paramCountBillions * 1_000_000_000,
      contextWindow,
      type: entry.type ?? null,
      releaseDate: normalizeReleaseDate(entry.model_release_date),
    };

    const name = String(entry.name ?? "");
    const fullName = entry.model_id ?? (name.includes("/") ? name : `${entry.vendor ?? ""}/${name}`);
    const repositoryId = String(entry.huggingface_url ?? "")
      .replace(/^https?:\/\/huggingface\.co\//i, "")
      .replace(/\/+$/, "");
    const baseName = String(fullName).split("/").at(-1);
    [fullName, baseName].forEach((candidate) => {
      if (candidate) exact.set(normalizeModelId(candidate), reference);
    });
    [
      repositoryId,
      repositoryId.split("/").at(-1),
      name,
      entry.aa_slug,
    ].forEach((candidate) => addAlias(candidate, reference));
  });
  return { exact, aliases };
}

function findModelReference(modelId, index) {
  if (!modelId) return null;
  const fullId = normalizeModelId(modelId);
  const baseId = normalizeModelId(String(modelId).split("/").at(-1));
  const candidates = [fullId, baseId, fullId.replace(/-fast$/, ""), baseId.replace(/-fast$/, "")];

  for (const candidate of candidates) {
    if (index.exact.has(candidate)) return index.exact.get(candidate);
  }
  for (const candidate of candidates) {
    if (index.aliases.has(candidate)) return index.aliases.get(candidate);
  }

  return null;
}

function normalizeModelId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isEmbeddingModel(model, reference) {
  const descriptors = [
    model.id,
    model.model_id,
    model.name,
    model.type,
    model.model_type,
    model.task,
    model.pipeline_tag,
    model.metadata?.type,
    model.metadata?.task,
    model.metadata?.pipeline_tag,
    reference?.type,
  ];

  return descriptors.some((value) => (
    value != null && /(^|[^a-z])(embedding|embeddings|embed)([^a-z]|$)/i.test(String(value))
  ));
}

function normalizeReleaseDate(value) {
  if (value == null || value === "") return null;

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getParameterCount(model, referenceParamCount = null) {
  const billionValue = model.size_b
    ?? model.metadata?.size_b
    ?? model.architecture?.size_b
    ?? model.parameter_count_b;
  if (billionValue != null && Number.isFinite(Number(billionValue)) && Number(billionValue) > 0) {
    return Number(billionValue) * 1_000_000_000;
  }

  const directValue = model.parameter_count
    ?? model.parameters_count
    ?? model.num_parameters
    ?? model.architecture?.parameter_count
    ?? model.architecture?.parameters;
  const parsedDirectValue = parseParameterCount(directValue);
  if (parsedDirectValue != null) return parsedDirectValue;
  if (referenceParamCount != null) return referenceParamCount;

  return parseParameterCount(model.id ?? model.model_id ?? model.name);
}

function parseParameterCount(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).replaceAll(",", "");
  const sizedMatch = text.match(/(\d+(?:\.\d+)?)\s*([BM])\b/i);
  if (sizedMatch) {
    const multiplier = sizedMatch[2].toUpperCase() === "B" ? 1_000_000_000 : 1_000_000;
    return Number(sizedMatch[1]) * multiplier;
  }

  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPricePerMillion(explicitPerMillion, ambiguousPrice) {
  if (explicitPerMillion != null) {
    return pricePerMillion(explicitPerMillion, true);
  }
  return pricePerMillion(ambiguousPrice);
}

function pricePerMillion(value, isAlreadyPerMillion = false) {
  const price = toNumber(value);
  // `null` means "no price published" (downstream treat as Unpriced).
  // A literal `0` means "free at point of use" (downstream treat as $0.00).
  // `usage.cost === null` vs `=== 0` distinguishes the two; downstream UI
  // prints "Unpriced" / "$0.0000" accordingly.
  if (price === null || price === 0) return price;
  if (isAlreadyPerMillion) return price;

  // Nested pricing fields do not consistently declare their unit. Tiny values
  // are normally per-token amounts; explicit *_per_million_tokens fields skip
  // this heuristic via getPricePerMillion().
  return Math.abs(price) < 0.001 ? price * 1_000_000 : price;
}

let _warnedAboutMissingThinkingScript = false;
function isThinkingBenchmarkRunning() {
  try {
    return thinkingAbortController != null;
  } catch (error) {
    if (!_warnedAboutMissingThinkingScript && error instanceof ReferenceError) {
      _warnedAboutMissingThinkingScript = true;
      console.warn("[LLM Quick Bench] thinking-test1.js failed to load; Raw Speed Test 1 will run but cross-benchmark locking against Thinking Test 1 is disabled.");
    }
    return false;
  }
}

function renderTable() {
  tableHead.replaceChildren();
  tableBody.replaceChildren();

  const headerRow = document.createElement("tr");
  columns.forEach(({ key, label: columnLabel }) => {
    const headerCell = document.createElement("th");
    headerCell.scope = "col";
    headerCell.classList.toggle("sorted-column", sortState.key === key);
    headerCell.setAttribute(
      "aria-sort",
      sortState.key === key ? sortState.direction : "none",
    );

    const sortButton = document.createElement("button");
    sortButton.type = "button";
    sortButton.className = "sort-button";

    const label = document.createElement("span");
    label.textContent = columnLabel;
    const icon = document.createElement("span");
    icon.className = "sort-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = sortState.key === key
      ? sortState.direction === "ascending" ? "↑" : "↓"
      : "↕";

    sortButton.append(label, icon);
    sortButton.addEventListener("click", () => sortBy(key));
    headerCell.append(sortButton);
    headerRow.append(headerCell);
  });
  tableHead.append(headerRow);

  const sortedModels = getVisibleSortedModels();

  sortedModels.forEach((model) => {
    const row = document.createElement("tr");
    columns.forEach(({ key }) => {
      const cell = document.createElement("td");
      cell.classList.toggle("sorted-column", sortState.key === key);
      if (key === "selected") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "model-select";
        checkbox.checked = model.selected;
        checkbox.disabled = modelsLoading || benchmarkAbortController != null || isThinkingBenchmarkRunning();
        checkbox.setAttribute("aria-label", `Select ${model.modelId} for benchmarking`);
        checkbox.addEventListener("change", () => {
          model.selected = checkbox.checked;
          updateSelectionCount();
        });
        cell.append(checkbox);
        row.append(cell);
        return;
      }
      const rawValue = model[key];
      const displayValue = formatValue(key, rawValue);
      cell.textContent = displayValue;
      cell.title = displayValue;
      if (isMissing(rawValue)) {
        cell.classList.add("empty-value");
      }
      row.append(cell);
    });
    tableBody.append(row);
  });
}

function updateModelResultsState() {
  const hasModels = models.length > 0;
  modelCount.textContent = `${models.length} model${models.length === 1 ? "" : "s"}`;
  exportModelsCsvButton.disabled = !hasModels;
  exportModelsJsonButton.disabled = !hasModels;
  modelSelectionButtons.forEach((button) => {
    button.disabled = !hasModels || modelsLoading || benchmarkAbortController != null;
  });
}

function getSortedModels(source = models) {
  return [...source].sort((left, right) => {
    const leftValue = left[sortState.key];
    const rightValue = right[sortState.key];
    if (isMissing(leftValue)) return isMissing(rightValue) ? 0 : 1;
    if (isMissing(rightValue)) return -1;
    const comparison = compareValues(leftValue, rightValue);
    return sortState.direction === "ascending" ? comparison : -comparison;
  });
}

function getVisibleSortedModels() {
  return getSortedModels(getFilteredModels(models));
}

function getFilteredModels(source) {
  if (!modelFilterText) return source;
  const query = modelFilterText.toLowerCase().trim();
  return source.filter((model) => modelMatchesSearch(model, query));
}

function modelMatchesSearch(model, query) {
  if (!query) return true;
  const searchable = [
    model.modelId,
    model.releaseDate,
    model.aaIndex,
    model.contextWindow,
    model.parameterCount,
  ].map((value) => (value == null ? "" : String(value)).toLowerCase());
  return searchable.some((part) => part.includes(query));
}

function setAllModelsSelected(isSelected) {
  const visibleSet = new Set(getFilteredModels(models));
  applyModelSelection((model) => (visibleSet.has(model) ? isSelected : model.selected));
}

function selectTopModels(key, limit) {
  const selectedModels = new Set(
    getFilteredModels(models)
      .filter((model) => !isMissing(model[key]))
      .sort((left, right) => (
        compareValues(right[key], left[key])
        || compareValues(left.modelId, right.modelId)
      ))
      .slice(0, limit),
  );
  applyModelSelection((model) => selectedModels.has(model));
}

function invertModelSelection() {
  const visibleSet = new Set(getFilteredModels(models));
  applyModelSelection((model) => (visibleSet.has(model) ? !model.selected : model.selected));
}

function applyModelSelection(shouldSelect) {
  models.forEach((model, index) => { model.selected = shouldSelect(model, index); });
  renderTable();
  updateSelectionCount();
}

function updateSelectionCount() {
  const count = models.filter((model) => model.selected).length;
  const hasModels = models.length > 0;
  if (hasModels) {
    setStatus(`Selected ${count} model${count === 1 ? "" : "s"}`);
  }
  runButton.disabled = count === 0 || modelsLoading || benchmarkAbortController != null;
  notifySelectionChanged();
}

function notifySelectionChanged() {
  document.dispatchEvent(new CustomEvent("models:selection-changed", {
    detail: {
      count: models.filter((model) => model.selected).length,
      hasModels: models.length > 0,
      modelsLoading,
    },
  }));
}

async function benchmarkModel(result, config, signal, connection) {
  await runBenchmarkSequence(
    result,
    config,
    signal,
    ({ label, includeUsage }) => runStreamingCompletion(
      result.modelId,
      config,
      signal,
      includeUsage,
      label,
      connection,
    ),
    renderBenchmarkResults,
  );
}

async function runStreamingCompletion(modelId, config, outerSignal, includeUsage, runLabel, connection) {
  const stream = await runStreamingChatCompletion({
    modelId,
    config,
    outerSignal,
    runLabel,
    connection,
    body: buildBenchmarkRequestBody(modelId, config, includeUsage, connection.provider),
    logName: "LLM Quick Bench",
  });
  const measurement = {
    ...stream.measurement,
    outputHealth: assessOutputHealth({
      contentText: stream.contentText,
      reasoningText: stream.reasoningText,
      completionTokens: stream.measurement.completionTokens,
      finishReason: stream.measurement.finishReason,
      maxTokens: config.maxTokens,
      disableThinking: config.disableThinking,
      fixedOutput: config.fixedOutput,
    }),
  };
  if (runLabel.startsWith("run-") && benchmarkRun && !benchmarkRun.sampleExchange) {
    benchmarkRun.sampleExchange = {
      modelId,
      runLabel,
      capturedAt: new Date().toISOString(),
      request: stream.request,
      response: stream.response,
      consolidatedOutput: stream.consolidatedOutput,
    };
    renderMethodologySample();
  }
  logBenchmarkEvent(config, "LLM Quick Bench", "completion summary", {
    model: modelId,
    run: runLabel,
    measurement,
  });
  return measurement;
}

function assessOutputHealth({ contentText, reasoningText, completionTokens, finishReason, maxTokens, disableThinking, fixedOutput }) {
  const minimumRecommendedTokens = Math.min(200, Math.max(32, Math.round(maxTokens * 0.25)));
  const reachedPlannedLimit = fixedOutput && completionTokens >= Math.floor(maxTokens * 0.95);
  const warnings = [];
  if (!contentText.trim()) warnings.push("No final content was emitted; the stream contained only reasoning tokens.");
  if (disableThinking && reasoningText.trim()) {
    warnings.push("Reasoning tokens were emitted even though disable thinking was requested; this endpoint or model may ignore chat_template_kwargs.enable_thinking.");
  }
  if (completionTokens < minimumRecommendedTokens) {
    warnings.push(`Only ${completionTokens} completion tokens were generated; ${minimumRecommendedTokens}+ is recommended for stable throughput.`);
  }
  if (fixedOutput && !reachedPlannedLimit) {
    warnings.push(`The endpoint returned ${completionTokens} of ${maxTokens} requested output tokens.`);
  } else if (!fixedOutput && finishReason === "length") {
    warnings.push("The endpoint stopped because it reached the output token limit.");
  }
  return {
    status: warnings.length === 0 ? "healthy" : "warning",
    warnings,
    hasFinalContent: Boolean(contentText.trim()),
    completionTokens,
    minimumRecommendedTokens,
    finishReason,
    reachedPlannedLimit,
  };
}

function renderBenchmarkResults() {
  if (!benchmarkRun) return;
  benchmarkBody.replaceChildren();
  let hasEstimates = false;
  let hasUnpricedUsage = false;
  let hasOutputWarnings = false;

  const runUsage = summarizeRunUsage(benchmarkRun.results);

  const elapsedMs = benchmarkRun.totalTestTimeMs
    ?? (benchmarkStartedAtMs === null ? null : performance.now() - benchmarkStartedAtMs);
  summaryTime.textContent = formatDuration(elapsedMs);
  summaryInputTokens.textContent = formatInteger(runUsage.promptTokens);
  summaryOutputTokens.textContent = formatInteger(runUsage.completionTokens);
  summaryTotalTokens.textContent = formatInteger(runUsage.totalTokens);
  summaryCost.textContent = runUsage.requestCount === 0
    ? "-"
    : runUsage.pricedUsageCount === 0
      ? "Unpriced"
      : `${formatCost(runUsage.cost)}${runUsage.hasUnpriced ? " + unpriced" : ""}`;
  summaryCost.title = runUsage.hasUnpriced
    ? "Some selected models have no pricing metadata; their usage is excluded from this cost total."
    : "Warm-up and measured requests are included.";

  updateBenchmarkSortHeaders();
  const sortedResults = getSortedBenchmarkResults();

  sortedResults.forEach((result) => {
    const summary = summarizeRuns(result.runs);
    const usage = summarizeBenchmarkUsage(result);
    const outputHealth = summarizeOutputHealth(result.runs);
    hasEstimates ||= usage.hasEstimated;
    hasUnpricedUsage ||= usage.requestCount > 0 && usage.cost === null;
    hasOutputWarnings ||= outputHealth.warnings > 0;
    const row = document.createElement("tr");
    const statusClass = result.status === "complete"
      ? "complete"
      : result.status === "partial" ? "partial"
      : result.status === "error" ? "error" : result.status === "queued" ? "" : "running";
    const statusTitle = result.errors.length > 0 ? "Check console for errors." : "";
    const liveTestTimeMs = result.totalTestTimeMs ?? getBenchmarkElapsedMs(result);
    const values = [
      result.modelId,
      formatBenchmarkResultStatus(result, benchmarkRun.config.runs),
      formatMilliseconds(summary.ttftMedian),
      formatMilliseconds(summary.ttftP95),
      formatRate(summary.tpsMedian),
      formatRate(summary.tpsP95),
      formatMilliseconds(summary.e2eMedian),
      formatMilliseconds(summary.e2eP95),
      formatDuration(liveTestTimeMs),
      usage.requestCount === 0
        ? "-"
        : `${formatInteger(usage.totalTokens)} (${formatInteger(usage.promptTokens)} in / ${formatInteger(usage.completionTokens)} out)${usage.hasEstimated ? " *" : ""}`,
      usage.requestCount === 0 ? "-" : usage.cost === null ? "Unpriced" : formatCost(usage.cost),
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      const columnKey = benchmarkColumnKeys[index];
      cell.hidden = !visibleBenchmarkColumns.has(columnKey);
      cell.classList.toggle("sorted-column", benchmarkSortState.key === columnKey);
      if (index === 1) {
        if (statusTitle) cell.title = statusTitle;
        const pill = document.createElement("span");
        pill.className = `status-pill ${statusClass}`.trim();
        pill.textContent = value;
        cell.append(pill);
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    });
    benchmarkBody.append(row);
  });

  const notes = [
    "Usage and cost include the warm-up plus successful measured requests. Failed requests without returned usage cannot be counted.",
    "Percentiles use nearest-rank selection across successful measured runs.",
  ];
  if (hasEstimates) notes.push("* Some token counts are estimated because the endpoint omitted streaming usage; compare their throughput and cost cautiously.");
  if (hasUnpricedUsage) notes.push("Some models lack pricing metadata and are excluded from the total cost.");
  if (hasOutputWarnings) notes.push("Output health warnings are diagnostic; their runs remain included in latency and throughput summaries.");
  usageNote.textContent = notes.join(" ");
}

function resetBenchmarkResults() {
  benchmarkRun = null;
  benchmarkBody.replaceChildren();
  summaryTime.textContent = "-";
  summaryInputTokens.textContent = "-";
  summaryOutputTokens.textContent = "-";
  summaryTotalTokens.textContent = "-";
  summaryCost.textContent = "-";
  summaryCost.removeAttribute("title");
  usageNote.textContent = "Results will appear here after a raw speed benchmark run.";
  exportCsvButton.disabled = true;
  exportJsonButton.disabled = true;
  benchmarkResults.hidden = false;
  updateBenchmarkSortHeaders();
}

function sortBenchmarkBy(key) {
  benchmarkSortState = nextSortState(benchmarkSortState, key);
  renderBenchmarkResults();
}

function updateBenchmarkSortHeaders() {
  updateSortHeaders({
    headers: benchmarkSortHeaders,
    columnAttr: "benchmarkColumn",
    visibleColumns: visibleBenchmarkColumns,
    sortState: benchmarkSortState,
  });
}

function initializeBenchmarkColumnPicker() {
  buildColumnPicker({
    headers: benchmarkSortHeaders,
    columnAttr: "benchmarkColumn",
    container: benchmarkColumnOptions,
    visibleColumns: visibleBenchmarkColumns,
    onChange: onBenchmarkColumnVisibilityChange,
  });
}

function onBenchmarkColumnVisibilityChange(visibleColumns) {
  if (!visibleColumns.has(benchmarkSortState.key)) {
    benchmarkSortState = { key: [...visibleColumns][0], direction: "ascending" };
  }
  saveVisibleBenchmarkColumns();
  renderBenchmarkResults();
}

function syncBenchmarkColumnPicker() {
  syncColumnPicker(benchmarkColumnOptions, visibleBenchmarkColumns);
}

function loadVisibleBenchmarkColumns() {
  return loadVisibleColumnSet(benchmarkColumnPreferenceKey, benchmarkColumnKeys);
}

function saveVisibleBenchmarkColumns() {
  saveVisibleColumnSet(benchmarkColumnPreferenceKey, visibleBenchmarkColumns);
}

function getBenchmarkSortValue(result, key) {
  const summary = summarizeRuns(result.runs);
  const usage = summarizeBenchmarkUsage(result);
  const values = {
    modelId: result.modelId,
    status: result.status,
    ttftMedian: summary.ttftMedian,
    ttftP95: summary.ttftP95,
    tpsMedian: summary.tpsMedian,
    tpsP95: summary.tpsP95,
    e2eMedian: summary.e2eMedian,
    e2eP95: summary.e2eP95,
    totalTestTimeMs: result.totalTestTimeMs ?? getBenchmarkElapsedMs(result),
    totalTokens: usage.requestCount > 0 ? usage.totalTokens : null,
    cost: usage.cost,
  };
  return values[key];
}

function formatBenchmarkResultStatus(result, totalRuns) {
  const progress = `${result.runs.length}/${totalRuns}`;
  const activeRun = /^run (\d+\/\d+)$/i.exec(result.status);
  if (activeRun) return `Running ${activeRun[1]}`;
  switch (result.status) {
    case "queued": return "Queued";
    case "warming": return "Warming up";
    case "complete": return "Completed";
    case "partial": return `Partial ${progress}`;
    case "cancelled": return `Cancelled ${progress}`;
    case "error": return "Error";
    default: return result.status;
  }
}

function summarizeOutputHealth(runs) {
  const healthy = runs.filter((run) => run.outputHealth?.status === "healthy").length;
  return {
    healthy,
    warnings: runs.length - healthy,
    total: runs.length,
    healthyRate: runs.length === 0 ? null : healthy / runs.length,
  };
}

function buildBenchmarkRequestBody(modelId, config, includeUsage = true, provider = null) {
  // OpenAI newer endpoints reject the legacy `max_tokens` field; vLLM and most
  // OpenAI-compatible servers accept it. Pick the field name by provider so
  // the request body works against either family.
  const outputLimitField = provider === "openai" ? "max_completion_tokens" : "max_tokens";
  const body = {
    model: modelId,
    messages: buildBenchmarkMessages(config.prompt),
    stream: true,
    temperature: 0,
    top_p: 1,
    [outputLimitField]: config.maxTokens,
  };
  if (includeUsage) body.stream_options = { include_usage: true };
  if (config.disableThinking) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  if (config.fixedOutput) {
    body.min_tokens = config.maxTokens;
    body.ignore_eos = true;
  }
  return body;
}

function buildBenchmarkMessages(prompt) {
  return [{ role: "user", content: prompt }];
}

function renderRequestTemplate() {
  try {
    const config = {
      prompt: promptInput.value.trim(),
      maxTokens: clampInteger(maxTokensInput.value, 32, 4096),
      disableThinking: disableThinkingInput.checked,
      fixedOutput: fixedOutputInput.checked,
    };
    const requestUrl = buildChatCompletionsUrl(endpointInput.value);
    const body = buildBenchmarkRequestBody("<selected-model>", config, true, providerSelect.value);
    requestTemplateCode.textContent = formatBenchmarkRequest(requestUrl, body);
  } catch {
    requestTemplateCode.textContent = "Enter a valid API endpoint to preview the benchmark request.";
  }
}

function renderMethodologySample() {
  const sample = benchmarkRun?.sampleExchange;
  if (!sample) {
    sampleRequestNote.textContent = "No measured run has been captured yet.";
    sampleResponseNote.textContent = "Run the benchmark to capture an actual request and its complete streamed response.";
    sampleOutputNote.textContent = "Run the benchmark to assemble the generated output from an actual measured run.";
    sampleRequestCode.textContent = "Run a benchmark to capture an actual measured request.";
    sampleResponseCode.textContent = "Run a benchmark to capture its actual streamed response.";
    sampleOutputCode.textContent = "Run a benchmark to capture its consolidated output.";
    return;
  }

  const source = `${sample.modelId} · ${sample.runLabel}`;
  sampleRequestNote.textContent = `Actual request captured from ${source}. The API key is redacted.`;
  sampleResponseNote.textContent = `Actual response captured from ${source}. Chunk labels show the decoded network reads.`;
  sampleOutputNote.textContent = `Actual generated deltas from ${source}, consolidated in arrival order.`;
  sampleRequestCode.textContent = sample.request;
  sampleResponseCode.textContent = sample.response;
  sampleOutputCode.textContent = sample.consolidatedOutput;
}

function getBenchmarkElapsedMs(result) {
  return getLiveElapsedMs(result);
}

function startBenchmarkClock() {
  stopBenchmarkClock();
  benchmarkClockInterval = setInterval(() => {
    if (benchmarkRun?.status === "running") renderBenchmarkResults();
  }, 1000);
}

function stopBenchmarkClock() {
  if (benchmarkClockInterval) {
    clearInterval(benchmarkClockInterval);
    benchmarkClockInterval = null;
  }
}

function setBenchmarkRunning(isRunning) {
  runButton.disabled = isRunning || !models.some((model) => model.selected);
  runButton.firstElementChild.textContent = isRunning ? "Running…" : "Run selected";
  runButton.setAttribute("aria-busy", String(isRunning));
  cancelButton.hidden = !isRunning;
  modelSelectionButtons.forEach((button) => { button.disabled = isRunning; });
  loadButton.disabled = isRunning;
  connectionControls.forEach((control) => { control.disabled = isRunning; });
  benchmarkConfigInputs.forEach((control) => { control.disabled = isRunning; });
  tableBody.querySelectorAll(".model-select").forEach((checkbox) => { checkbox.disabled = isRunning; });
  if (typeof thinkingRunButton !== "undefined") {
    thinkingRunButton.disabled = isRunning
      || thinkingAbortController != null
      || !models.some((model) => model.selected)
      || modelsLoading;
  }
  if (isRunning) startBenchmarkClock(); else stopBenchmarkClock();
}

function setBenchmarkStatus(message, isError = false) {
  benchmarkStatus.textContent = message;
  benchmarkStatus.classList.toggle("error", isError);
}

function exportModelsCsv() {
  const exportColumns = columns.filter((column) => column.key !== "selected");
  const header = exportColumns.map((column) => column.label);
  const rows = getSortedModels().map((model) => (
    exportColumns.map((column) => model[column.key])
  ));
  downloadFile(
    `llm-models-${fileTimestamp()}.csv`,
    [header, ...rows].map(toCsvRow).join("\n"),
    "text/csv",
  );
}

function exportModelsJson() {
  const exportColumns = columns.filter((column) => column.key !== "selected");
  const exportedModels = getSortedModels().map((model) => Object.fromEntries(
    exportColumns.map((column) => [column.key, model[column.key]]),
  ));
  const payload = {
    exportedAt: new Date().toISOString(),
    endpoint: buildModelsUrl(endpointInput.value, providerSelect.value),
    sort: sortState,
    modelCount: exportedModels.length,
    models: exportedModels,
  };
  downloadFile(
    `llm-models-${fileTimestamp()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function exportBenchmarkCsv() {
  if (!benchmarkRun) return;
  exportBenchmarkCsvFile({
    filenamePrefix: "llm-benchmark",
    columns: getVisibleBenchmarkExportColumns(),
    results: getSortedBenchmarkResults(),
    getValue: getBenchmarkSortValue,
    getTotal: getBenchmarkTotalValue,
  });
}

function exportBenchmarkJson() {
  if (!benchmarkRun) return;
  exportBenchmarkJsonFile({
    filenamePrefix: "llm-benchmark",
    columns: getVisibleBenchmarkExportColumns(),
    results: getSortedBenchmarkResults(),
    getValue: getBenchmarkSortValue,
    getTotal: getBenchmarkTotalValue,
  });
}

function getVisibleBenchmarkExportColumns() {
  return getVisibleExportColumns(
    benchmarkSortHeaders,
    visibleBenchmarkColumns,
    "benchmarkColumn",
  );
}

function getSortedBenchmarkResults() {
  return sortRowsByState(benchmarkRun.results, getBenchmarkSortValue, benchmarkSortState);
}

function getBenchmarkTotalValue(key) {
  const usage = summarizeRunUsage(benchmarkRun.results);
  const values = {
    modelId: "TOTAL RUN",
    status: benchmarkRun.status,
    ttftMedian: null,
    ttftP95: null,
    tpsMedian: null,
    tpsP95: null,
    e2eMedian: null,
    e2eP95: null,
    totalTestTimeMs: benchmarkRun.totalTestTimeMs,
    totalTokens: usage.totalTokens,
    cost: usage.hasUnpriced ? null : usage.cost,
  };
  return values[key];
}


function sortBy(column) {
  sortState = nextSortState(sortState, column);
  renderTable();
}

function formatValue(column, value) {
  if (isMissing(value)) return "-";
  if (column === "contextWindow") return formatTokenCount(value);
  if (column === "parameterCount") return formatParameterCount(value);
  if (["inputPrice", "outputPrice", "blendedPrice"].includes(column)) {
    return formatPrice(value);
  }
  return String(value);
}

function formatTokenCount(value) {
  if (value >= 1024 * 1024) return `${formatCompactNumber(value / (1024 * 1024))} M`;
  if (value >= 1024) return `${formatCompactNumber(value / 1024)} K`;
  return Math.round(value).toLocaleString();
}

function formatParameterCount(value) {
  if (value >= 1_000_000_000) return `${formatCompactNumber(value / 1_000_000_000)} B`;
  if (value >= 1_000_000) return `${formatCompactNumber(value / 1_000_000)} M`;
  return Math.round(value).toLocaleString();
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatPrice(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function setLoading(isLoading) {
  modelsLoading = isLoading;
  loadButton.disabled = isLoading;
  loadButton.firstElementChild.textContent = isLoading ? "Loading…" : "Load models";
  loadButton.setAttribute("aria-busy", String(isLoading));
  connectionControls.forEach((control) => { control.disabled = isLoading; });
  modelSelectionButtons.forEach((button) => { button.disabled = isLoading || models.length === 0; });
  tableBody.querySelectorAll(".model-select").forEach((checkbox) => { checkbox.disabled = isLoading; });
  runButton.disabled = isLoading
    || benchmarkAbortController != null
    || !models.some((model) => model.selected);
  notifySelectionChanged();
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}
