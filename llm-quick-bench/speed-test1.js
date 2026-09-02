// LLM Quick Bench — Speed Test 1 (and the shared benchmark UI layer).
//
// This single classic <script> (loaded with `defer`, after bench-utils.js and
// before thinking-test1.js) owns two things:
//
//   1. Shared model loading and selection state: the connection form, the
//      models table, model-selection buttons, endpoint presets, and the
//      model-info.json cross-reference. thinking-test1.js consumes these
//      globals (form, providerSelect, endpointInput, apiKeyInput, models,
//      modelsLoading, connectionControls, modelSelectionButtons,
//      buildBenchmarkRequestBody, buildBenchmarkMessages,
//      formatBenchmarkResultStatus, isSpeedBenchmarkRunning, setStatus, …)
//      so it must load after this file.
//   2. Speed Test 1 itself: a raw output-speed benchmark that renders one
//      stacked panel per model with one tok/s bar per run plus an overall p50
//      reference line across the completed runs.
//
// Endpoint/streaming/summary/format helpers live in bench-utils.js.

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
const modelColumnOptions = document.querySelector("#model-column-options");
const showAllModelColumnsButton = document.querySelector("#show-all-model-columns");
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
const modelColumnPreferenceKey = "llm-quick-bench:model-columns:v1";
const modelDataColumns = columns.filter((column) => column.key !== "selected");
let visibleModelColumns = loadVisibleColumnSet(
  modelColumnPreferenceKey,
  modelDataColumns.map((column) => column.key),
);
let models = [];
const modelTableSorter = createTableSorter({
  initialKey: "releaseDate",
  initialDirection: "descending",
  onSort: renderTable,
});
let modelsLoading = false;
let modelFilterText = "";
if (!visibleModelColumns.has(modelTableSorter.state.key)) {
  modelTableSorter.reset({ key: [...visibleModelColumns][0], direction: "ascending" });
}

providerSelect.addEventListener("change", () => {
  const preset = endpointPresets[providerSelect.value];
  if (preset) {
    endpointInput.value = preset.endpoint;
    endpointHint.textContent = preset.hint;
    return;
  }
  endpointHint.textContent = "Enter a base URL or the full /models URL.";
  endpointInput.focus();
  endpointInput.select();
});

endpointInput.addEventListener("input", () => {
  const normalizedEndpoint = endpointInput.value.trim().replace(/\/+$/, "");
  const matchingPreset = Object.entries(endpointPresets).find(([, preset]) => (
    preset.endpoint === normalizedEndpoint
  ));
  if (matchingPreset) {
    providerSelect.value = matchingPreset[0];
    endpointHint.textContent = matchingPreset[1].hint;
    return;
  }
  providerSelect.value = "custom";
  endpointHint.textContent = "Custom OpenAI-compatible API base URL.";
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
exportModelsCsvButton.addEventListener("click", exportModelsCsv);
exportModelsJsonButton.addEventListener("click", exportModelsJson);
buildColumnPicker({
  columns: modelDataColumns,
  container: modelColumnOptions,
  visibleColumns: visibleModelColumns,
  onChange: onModelColumnVisibilityChange,
});
showAllModelColumnsButton.addEventListener("click", showAllModelColumns);
renderTable();
updateModelResultsState();

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
    // Print every model returned by the endpoint to the console, one per line,
    // marking any that were filtered out (embedding models) and why.
    console.group(`[LLM Quick Bench] ${returnedModels.length} model(s) returned by /models`);
    returnedModels.forEach((model, index) => {
      const id = model.id ?? model.model_id ?? model.name ?? "(no id)";
      const row = crossReferencedModels[index];
      if (row?.isEmbedding) {
        const descriptor = model.type
          ?? model.model_type
          ?? model.task
          ?? model.metadata?.type
          ?? model.metadata?.task
          ?? model.pipeline_tag;
        console.log(`${index + 1}. ${id}  [FILTERED - embedding model; descriptor: ${descriptor ?? "?"}]`);
      } else {
        console.log(`${index + 1}. ${id}`);
      }
    });
    console.groupEnd();
    modelTableSorter.reset({ key: "releaseDate", direction: "descending" });
    renderTable();
    results.hidden = false;
    if (typeof resetThinkingResults === "function") resetThinkingResults();
    if (typeof resetSpeedResults === "function") resetSpeedResults();
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
    if (typeof resetThinkingResults === "function") resetThinkingResults();
    if (typeof resetSpeedResults === "function") resetSpeedResults();
    renderTable();
    updateSelectionCount();
    results.hidden = false;
    updateModelResultsState();
    const corsHint = error instanceof TypeError ? " The endpoint may not allow browser requests (CORS)." : "";
    setStatus(`${error.message || "Unable to load models."}${corsHint}`, true);
  } finally {
    setLoading(false);
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
      console.warn("[LLM Quick Bench] thinking-test1.js failed to load; model selection locking against Thinking Test 1 is disabled.");
    }
    return false;
  }
}

let _warnedAboutMissingSpeedScript = false;
function isSpeedBenchmarkRunning() {
  try {
    return speedAbortController != null;
  } catch (error) {
    if (!_warnedAboutMissingSpeedScript && error instanceof ReferenceError) {
      _warnedAboutMissingSpeedScript = true;
      console.warn("[LLM Quick Bench] speed-test1.js failed to load; model selection locking against Speed Test 1 is disabled.");
    }
    return false;
  }
}

function renderTable() {
  tableBody.replaceChildren();
  const displayedColumns = new Set(["selected", ...visibleModelColumns]);
  modelTableSorter.renderHeaders({
    container: tableHead,
    columns,
    columnAttr: "modelColumn",
    visibleColumns: displayedColumns,
  });

  const sortedModels = getVisibleSortedModels();

  sortedModels.forEach((model) => {
    const row = document.createElement("tr");
    columns.forEach(({ key }) => {
      const cell = document.createElement("td");
      cell.hidden = key !== "selected" && !visibleModelColumns.has(key);
      modelTableSorter.markCell(cell, key);
      if (key === "selected") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "model-select";
        checkbox.checked = model.selected;
        checkbox.disabled = modelsLoading || isThinkingBenchmarkRunning() || isSpeedBenchmarkRunning();
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
    button.disabled = !hasModels || modelsLoading || isThinkingBenchmarkRunning() || isSpeedBenchmarkRunning();
  });
}

function getSortedModels(source = models) {
  return modelTableSorter.sortRows(source, (model, key) => model[key]);
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

function exportModelsCsv() {
  const exportColumns = getVisibleColumnDefinitions(
    columns,
    visibleModelColumns,
    ["selected"],
  );
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
  const exportColumns = getVisibleColumnDefinitions(
    columns,
    visibleModelColumns,
    ["selected"],
  );
  const exportedModels = getSortedModels().map((model) => Object.fromEntries(
    exportColumns.map((column) => [column.key, model[column.key]]),
  ));
  const payload = {
    exportedAt: new Date().toISOString(),
    selectedColumns: exportColumns.map((column) => column.key),
    endpoint: buildModelsUrl(endpointInput.value, providerSelect.value),
    sort: modelTableSorter.state,
    modelCount: exportedModels.length,
    models: exportedModels,
  };
  downloadFile(
    `llm-models-${fileTimestamp()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function onModelColumnVisibilityChange(visibleColumns) {
  if (modelTableSorter.state.key !== "selected"
      && !visibleColumns.has(modelTableSorter.state.key)) {
    modelTableSorter.reset({ key: [...visibleColumns][0], direction: "ascending" });
  }
  saveVisibleColumnSet(modelColumnPreferenceKey, visibleModelColumns);
  renderTable();
}

function showAllModelColumns() {
  visibleModelColumns.clear();
  modelDataColumns.forEach((column) => visibleModelColumns.add(column.key));
  saveVisibleColumnSet(modelColumnPreferenceKey, visibleModelColumns);
  syncColumnPicker(modelColumnOptions, visibleModelColumns);
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
  notifySelectionChanged();
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

// === Speed Test 1 benchmark (form, results table, throughput graphs) ===


const speedForm = document.querySelector("#speed-form");
const speedRunsInput = document.querySelector("#speed-runs");
const speedMaxTokensInput = document.querySelector("#speed-max-tokens");
const speedConcurrencyInput = document.querySelector("#speed-concurrency");
const speedTimeoutInput = document.querySelector("#speed-timeout");
const speedPromptInput = document.querySelector("#speed-prompt");
const speedLogConsoleInput = document.querySelector("#speed-log-console");
const speedDisableThinkingInput = document.querySelector("#speed-disable-thinking");
const speedFixedOutputInput = document.querySelector("#speed-fixed-output");
const speedRequireServerTokensInput = document.querySelector("#speed-require-server-tokens");
const speedConfigInputs = [...speedForm.querySelectorAll("input, textarea")];
const speedRunButton = document.querySelector("#speed-run-button");
const speedCancelButton = document.querySelector("#speed-cancel-button");
const speedStatus = document.querySelector("#speed-status");
const speedResults = document.querySelector("#speed-results");
const speedGraphs = document.querySelector("#speed-graphs");
const speedBody = document.querySelector("#speed-body");
const speedUsageNote = document.querySelector("#speed-usage-note");
const speedSummaryTime = document.querySelector("#speed-summary-time");
const speedSummaryTotalTokens = document.querySelector("#speed-summary-total-tokens");
const speedSummaryCost = document.querySelector("#speed-summary-cost");
const speedColumnOptions = document.querySelector("#speed-column-options");
const showAllSpeedColumnsButton = document.querySelector("#show-all-speed-columns");
const exportSpeedCsvButton = document.querySelector("#export-speed-csv");
const exportSpeedJsonButton = document.querySelector("#export-speed-json");

const speedColumns = [
  { key: "modelId", label: "Model" },
  { key: "status", label: "Status" },
  { key: "ttftMedian", label: "TTFT median" },
  { key: "ttftP95", label: "TTFT p95" },
  { key: "tpsMin", label: "Tok/s min" },
  { key: "tpsMedian", label: "Tok/s median" },
  { key: "tpsMax", label: "Tok/s max" },
  { key: "e2eMedian", label: "E2E median" },
  { key: "e2eP95", label: "E2E p95" },
  { key: "totalTestTimeMs", label: "Test time" },
  { key: "totalTokens", label: "Tokens" },
  { key: "cost", label: "Cost" },
];
const speedColumnPreferenceKey = "llm-quick-bench:speed-columns:v4";
const defaultSpeedColumns = [
  "modelId",
  "status",
  "ttftMedian",
  "tpsMin",
  "tpsMedian",
  "tpsMax",
  "e2eP95",
  "cost",
];
let visibleSpeedColumns = loadVisibleColumnSet(
  speedColumnPreferenceKey,
  speedColumns.map((column) => column.key),
  defaultSpeedColumns,
);

let speedRun = null;
let speedAbortController = null;
let speedStartedAtMs = null;
let speedStopClock = null;
const speedTableSorter = createTableSorter({
  initialKey: "tpsMedian",
  initialDirection: "descending",
  onSort: renderSpeedResults,
});
if (!visibleSpeedColumns.has(speedTableSorter.state.key)) {
  speedTableSorter.reset({ key: [...visibleSpeedColumns][0], direction: "ascending" });
}

speedCancelButton.addEventListener("click", () => speedAbortController?.abort());
exportSpeedCsvButton.addEventListener("click", exportSpeedCsv);
exportSpeedJsonButton.addEventListener("click", exportSpeedJson);
buildColumnPicker({
  columns: speedColumns,
  container: speedColumnOptions,
  visibleColumns: visibleSpeedColumns,
  onChange: onSpeedColumnVisibilityChange,
});
showAllSpeedColumnsButton.addEventListener("click", showAllSpeedColumns);
document.addEventListener("models:selection-changed", updateSpeedRunButtonState);
document.addEventListener("models:selection-changed", () => {
  if (speedAbortController == null) renderSpeedGraphs();
});

speedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null) {
    setSpeedStatus("Thinking Test 1 is already running.", true);
    return;
  }
  const selectedModels = models.filter((model) => model.selected);
  if (selectedModels.length === 0) {
    setSpeedStatus("Select at least one model to run.", true);
    return;
  }

  const config = {
    runs: clampInteger(speedRunsInput.value, 1, 20),
    maxTokens: clampInteger(speedMaxTokensInput.value, 32, 4096),
    concurrency: clampInteger(speedConcurrencyInput.value, 1, 12),
    timeoutMs: clampInteger(speedTimeoutInput.value, 10, 600) * 1000,
    prompt: speedPromptInput.value.trim(),
    logToConsole: speedLogConsoleInput.checked,
    disableThinking: speedDisableThinkingInput.checked,
    fixedOutput: speedFixedOutputInput.checked,
    requireServerTokenCounts: speedRequireServerTokensInput.checked,
  };
  const connection = {
    provider: providerSelect.value,
    endpoint: endpointInput.value,
    apiKey: apiKeyInput.value.trim(),
  };
  if (!config.prompt) {
    setSpeedStatus("Enter a benchmark prompt.", true);
    return;
  }

  speedTableSorter.reset({ key: "tpsMedian", direction: "descending" });
  speedAbortController = new AbortController();
  speedStartedAtMs = performance.now();
  const runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  speedRun = createBenchmarkRun({
    selectedModels,
    connection,
    config,
    runSeed,
    methodology: {
      temperature: 0,
      topP: 1,
      ttft: "request dispatch to first non-empty content or reasoning delta",
      tokensPerSecond: "completion tokens / seconds from first generated delta to stream end",
      throughputChart: "one average tokens/second bar per measured run; a p50 reference line summarizes completed runs",
      endToEndLatency: "request dispatch to response stream close",
      percentile: "nearest rank",
    },
  });
  exportSpeedCsvButton.disabled = false;
  exportSpeedJsonButton.disabled = false;
  const scheduledResults = shuffleWithSeed([...speedRun.results], runSeed);
  speedRun.executionOrder = scheduledResults.map((result) => result.modelId);
  setSpeedRunning(true);
  speedResults.hidden = false;
  renderBenchmarkSafely(renderSpeedResults, "Speed Test 1 initial state");
  setSpeedStatus(`Running ${selectedModels.length} models with up to ${Math.min(config.concurrency, selectedModels.length)} in parallel… Scroll below to see per-run throughput.`);

  let orchestrationFailed = false;
  try {
    await runWithConcurrency(
      scheduledResults,
      config.concurrency,
      (result) => benchmarkSpeedModel(result, config, speedAbortController.signal, connection),
    );
    const completed = speedRun.results.filter((result) => result.runs.length > 0).length;
    const failed = speedRun.results.filter((result) => result.status === "error").length;
    const partial = speedRun.results.filter((result) => result.status === "partial").length;
    setSpeedStatus(
      speedAbortController.signal.aborted
        ? `Cancelled. Preserved results for ${completed} completed model${completed === 1 ? "" : "s"}.`
        : `Finished ${completed} model${completed === 1 ? "" : "s"}${partial ? `; ${partial} had failed runs` : ""}${failed ? `; ${failed} failed` : ""}.`,
      failed > 0 && completed === 0,
    );
  } catch (error) {
    orchestrationFailed = true;
    console.error("[LLM Quick Bench] Speed Test 1 orchestration failed.", error);
    setSpeedStatus(error.message || "Speed Test 1 stopped unexpectedly.", true);
  } finally {
    const wasAborted = speedAbortController?.signal.aborted ?? false;
    speedRun.status = deriveBenchmarkRunStatus(speedRun.results, {
      wasAborted,
      orchestrationFailed,
    });
    speedRun.finishedAt = new Date().toISOString();
    speedRun.totalTestTimeMs = performance.now() - speedStartedAtMs;
    speedRun.usage = summarizeRunUsage(speedRun.results);
    speedAbortController = null;
    speedStartedAtMs = null;
    setSpeedRunning(false);
    renderBenchmarkSafely(renderSpeedResults, "Speed Test 1 final state");
  }
});

function updateSpeedRunButtonState() {
  speedRunButton.disabled = !models?.some((model) => model.selected)
    || modelsLoading
    || speedAbortController != null
    || (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null);
}

function setSpeedRunning(isRunning) {
  speedRunButton.disabled = isRunning
    || (typeof thinkingAbortController !== "undefined" && thinkingAbortController != null)
    || !models?.some((model) => model.selected)
    || modelsLoading;
  speedRunButton.firstElementChild.textContent = isRunning ? "Running…" : "Run selected";
  speedRunButton.setAttribute("aria-busy", String(isRunning));
  speedCancelButton.hidden = !isRunning;
  speedConfigInputs.forEach((control) => { control.disabled = isRunning; });
  loadButton.disabled = isRunning;
  connectionControls.forEach((control) => { control.disabled = isRunning; });
  modelSelectionButtons.forEach((button) => { button.disabled = isRunning; });
  document.querySelectorAll("#models-body .model-select").forEach((checkbox) => { checkbox.disabled = isRunning; });
  if (typeof thinkingRunButton !== "undefined") {
    thinkingRunButton.disabled = isRunning
      || thinkingAbortController != null
      || !models.some((model) => model.selected)
      || modelsLoading;
  }
  if (isRunning) startSpeedClock(); else stopSpeedClock();
}

function setSpeedStatus(message, isError = false) {
  speedStatus.textContent = message;
  speedStatus.classList.toggle("error", isError);
}

async function benchmarkSpeedModel(result, config, signal, connection) {
  await runBenchmarkSequence(
    result,
    config,
    signal,
    ({ runIndex, label, includeUsage }) => runSpeedCompletion(
      result.modelId,
      config,
      signal,
      includeUsage,
      label,
      connection,
    ),
    renderSpeedResults,
  );
}

async function runSpeedCompletion(modelId, config, outerSignal, includeUsage, runLabel, connection) {
  const stream = await runStreamingChatCompletion({
    modelId,
    config,
    outerSignal,
    runLabel,
    connection,
    body: buildBenchmarkRequestBody(modelId, config, includeUsage, connection.provider),
    logName: "Speed Test 1",
  });
  logBenchmarkEvent(config, "Speed Test 1", "completion summary", {
    model: modelId,
    run: runLabel,
    measurement: stream.measurement,
  });
  return stream.measurement;
}

function renderSpeedResults() {
  if (!speedRun) {
    renderSpeedTable(null);
    renderSpeedGraphs();
    return;
  }
  const runUsage = summarizeRunUsage(speedRun.results);
  const elapsedMs = speedRun.totalTestTimeMs
    ?? (speedStartedAtMs === null ? null : performance.now() - speedStartedAtMs);
  speedSummaryTime.textContent = formatDuration(elapsedMs);
  speedSummaryTotalTokens.textContent = formatInteger(runUsage.totalTokens);
  speedSummaryCost.textContent = runUsage.requestCount === 0
    ? "-"
    : runUsage.pricedUsageCount === 0
      ? "Unpriced"
      : `${formatCost(runUsage.cost)}${runUsage.hasUnpriced ? " + unpriced" : ""}`;
  speedSummaryCost.title = runUsage.hasUnpriced
    ? "Some selected models have no pricing metadata; their usage is excluded from this cost total."
    : "Warm-up and measured requests are included.";

  renderSpeedTable(runUsage);
  renderSpeedGraphs();
}

function renderSpeedTable(runUsage) {
  const sortedResults = speedRun
    ? speedTableSorter.sortRows(speedRun.results, getSpeedSortValue)
    : [];
  const thead = document.createElement("thead");
  speedTableSorter.renderHeaders({
    container: thead,
    columns: speedColumns,
    columnAttr: "speedColumn",
    visibleColumns: visibleSpeedColumns,
  });

  const tbody = document.createElement("tbody");
  sortedResults.forEach((result) => {
    const summary = summarizeRuns(result.runs);
    const usage = summarizeBenchmarkUsage(result);
    const statusClass = result.status === "complete"
      ? "complete"
      : result.status === "partial" ? "partial"
      : result.status === "error" ? "error" : result.status === "queued" ? "" : "running";
    const liveTestTimeMs = result.totalTestTimeMs ?? getLiveElapsedMs(result);
    const values = [
      result.modelId,
      formatBenchmarkResultStatus(result, speedRun.config.runs),
      formatMilliseconds(summary.ttftMedian),
      formatMilliseconds(summary.ttftP95),
      formatRate(summary.tpsMin),
      formatRate(summary.tpsMedian),
      formatRate(summary.tpsMax),
      formatMilliseconds(summary.e2eMedian),
      formatMilliseconds(summary.e2eP95),
      formatDuration(liveTestTimeMs),
      formatTokenUsageBreakdown(usage),
      usage.requestCount === 0 ? "-" : usage.cost === null ? "Unpriced" : formatCost(usage.cost),
    ];
    const row = document.createElement("tr");
    row.dataset.modelId = result.modelId;
    values.forEach((value, index) => {
      const td = document.createElement("td");
      td.dataset.speedColumn = speedColumns[index].key;
      td.hidden = !visibleSpeedColumns.has(speedColumns[index].key);
      speedTableSorter.markCell(td, speedColumns[index].key);
      if (index === 1) {
        renderBenchmarkStatusCell(td, value, statusClass, result);
      } else {
        td.textContent = value;
      }
      row.append(td);
    });
    tbody.append(row);
  });

  speedBody.replaceChildren();
  const table = document.createElement("table");
  table.className = "speed-table";
  table.append(thead, tbody);
  speedBody.append(table);

  if (!runUsage) return;
  const notes = [
    "Each model has one chart with one tok/s bar per measured run; a dashed p50 line summarizes the completed run values.",
    "Usage and cost include the warm-up plus successful measured requests.",
  ];
  if (runUsage.hasEstimated) notes.push("* Some token counts are estimated because the endpoint omitted streaming usage.");
  if (runUsage.hasUnpriced) notes.push("Some models lack pricing metadata and are excluded from the displayed cost subtotal.");
  speedUsageNote.textContent = notes.join(" ");
}

function getSpeedSortValue(result, key) {
  const summary = summarizeRuns(result.runs);
  const usage = summarizeBenchmarkUsage(result);
  const values = {
    modelId: result.modelId,
    status: result.status,
    ttftMedian: summary.ttftMedian,
    ttftP95: summary.ttftP95,
    tpsMin: summary.tpsMin,
    tpsMedian: summary.tpsMedian,
    tpsMax: summary.tpsMax,
    e2eMedian: summary.e2eMedian,
    e2eP95: summary.e2eP95,
    totalTestTimeMs: result.totalTestTimeMs ?? getLiveElapsedMs(result),
    totalTokens: usage.requestCount > 0 ? usage.totalTokens : null,
    cost: usage.cost,
  };
  return values[key];
}

function onSpeedColumnVisibilityChange(visibleColumns) {
  if (!visibleColumns.has(speedTableSorter.state.key)) {
    speedTableSorter.reset({ key: [...visibleColumns][0], direction: "ascending" });
  }
  saveVisibleColumnSet(speedColumnPreferenceKey, visibleSpeedColumns);
  renderSpeedResults();
}

function showAllSpeedColumns() {
  visibleSpeedColumns.clear();
  speedColumns.forEach((column) => visibleSpeedColumns.add(column.key));
  saveVisibleColumnSet(speedColumnPreferenceKey, visibleSpeedColumns);
  syncColumnPicker(speedColumnOptions, visibleSpeedColumns);
  renderSpeedResults();
}

function exportSpeedCsv() {
  if (!speedRun) return;
  exportBenchmarkCsvFile({
    filenamePrefix: "llm-speed-test",
    columns: getVisibleColumnDefinitions(speedColumns, visibleSpeedColumns),
    results: speedTableSorter.sortRows(speedRun.results, getSpeedSortValue),
    getValue: getSpeedSortValue,
    getTotal: getSpeedTotalValue,
  });
}

function exportSpeedJson() {
  if (!speedRun) return;
  exportBenchmarkJsonFile({
    filenamePrefix: "llm-speed-test",
    columns: getVisibleColumnDefinitions(speedColumns, visibleSpeedColumns),
    results: speedTableSorter.sortRows(speedRun.results, getSpeedSortValue),
    getValue: getSpeedSortValue,
    getTotal: getSpeedTotalValue,
    metadata: {
      config: speedRun.config,
      methodology: speedRun.methodology,
      runSeed: speedRun.runSeed,
      executionOrder: speedRun.executionOrder,
    },
  });
}

function getSpeedTotalValue(key) {
  const usage = summarizeRunUsage(speedRun.results);
  const values = {
    modelId: "TOTAL RUN",
    status: speedRun.status,
    ttftMedian: null,
    ttftP95: null,
    tpsMin: null,
    tpsMedian: null,
    tpsMax: null,
    e2eMedian: null,
    e2eP95: null,
    totalTestTimeMs: speedRun.totalTestTimeMs,
    totalTokens: usage.totalTokens,
    cost: usage.hasUnpriced ? null : usage.cost,
  };
  return values[key];
}

function renderSpeedGraphs() {
  speedGraphs.replaceChildren();
  const entries = speedRun
    ? speedRun.results.map((result) => ({
      modelId: result.modelId,
      runs: result.runs,
      status: result.status,
    }))
    : models.filter((model) => model.selected).map((model) => ({
      modelId: model.modelId,
      runs: [],
      status: null,
    }));
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "table-hint";
    empty.textContent = "Select at least one model above to preview its throughput chart panel here.";
    speedGraphs.append(empty);
    return;
  }
  entries.forEach((entry) => {
    let panel = null;
    if (entry.runs.length > 0) {
      panel = buildSpeedGraphPanel(entry.modelId, entry.runs);
    }
    if (!panel) {
      panel = buildEmptySpeedGraphPanel(entry.modelId, entry.status);
    }
    speedGraphs.append(panel);
  });
}

function buildEmptySpeedGraphPanel(modelId, status = null) {
  const panel = document.createElement("div");
  panel.className = "speed-graph-panel speed-graph-panel-empty";
  const head = document.createElement("div");
  head.className = "speed-graph-head";
  const title = document.createElement("h4");
  title.textContent = modelId;
  const stat = document.createElement("span");
  const statusText = String(status ?? "");
  if (statusText === "error") stat.textContent = "error";
  else if (statusText === "cancelled") stat.textContent = "cancelled";
  else if (statusText === "partial") stat.textContent = "partial";
  else if (statusText === "warming") stat.textContent = "warming up";
  else if (/^run /.test(statusText)) stat.textContent = "running";
  else stat.textContent = "waiting for run data";
  head.append(title, stat);
  const placeholder = document.createElement("div");
  placeholder.className = "speed-graph-empty";
  if (statusText === "error") {
    placeholder.textContent = "This model failed; its throughput chart is unavailable.";
  } else if (statusText === "cancelled") {
    placeholder.textContent = "Run cancelled; chart unavailable.";
  } else if (statusText === "partial") {
    placeholder.textContent = "Some runs failed; chart appears once at least one measured run completes.";
  } else if (statusText === "warming" || /^run /.test(statusText)) {
    placeholder.textContent = "Measuring throughput…";
  } else {
    placeholder.textContent = "Throughput chart appears here once this model completes a measured run.";
  }
  panel.append(head, placeholder);
  return panel;
}

function buildSpeedGraphPanel(modelId, runs) {
  const summary = summarizeRuns(runs);
  const series = buildRunThroughputSeries(runs);
  if (series.length === 0) return null;

  const panel = document.createElement("div");
  panel.className = "speed-graph-panel";
  const head = document.createElement("div");
  head.className = "speed-graph-head";
  const title = document.createElement("h4");
  title.textContent = modelId;
  const stat = document.createElement("span");
  stat.textContent = `p50 ${summary.tpsMedian.toFixed(1)} tok/s · ${series.length} run${series.length === 1 ? "" : "s"}`;
  head.append(title, stat);

  panel.append(head, buildThroughputChart(modelId, series, summary));
  return panel;
}

function buildThroughputChart(modelId, series, summary) {
  const wrap = document.createElement("div");
  wrap.className = "speed-throughput-chart";

  const legend = document.createElement("div");
  legend.className = "speed-chart-legend";
  [
    ["run tok/s", null, "throughput"],
    ["tok/sec median", summary.tpsMedian, "p50"],
  ].forEach(([label, value, className]) => {
    const item = document.createElement("span");
    item.className = `speed-chart-legend-item ${className}`;
    item.textContent = value === null ? label : `${label} ${value.toFixed(1)} tok/s`;
    legend.append(item);
  });
  wrap.append(legend);

  const tooltip = document.createElement("div");
  tooltip.className = "speed-tooltip";
  tooltip.hidden = true;
  wrap.append(tooltip);

  const width = 720;
  const height = 250;
  const padLeft = 46;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 30;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const maxTps = Math.max(
    1,
    summary.tpsMedian,
    ...series.map((point) => point.tokensPerSecond),
  ) * 1.15;
  const toY = (v) => padTop + (1 - v / maxTps) * innerHeight;
  const band = innerWidth / series.length;
  const barWidth = Math.min(38, band * 0.6);

  const grid = [];
  for (let i = 0; i <= 3; i += 1) {
    const y = padTop + (i / 3) * innerHeight;
    const gridValue = Math.round(maxTps * (1 - i / 3));
    grid.push(`<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" class="sp-grid"/>`);
    grid.push(`<text x="${padLeft - 5}" y="${(y + 3).toFixed(1)}" class="sp-tick" text-anchor="end">${gridValue}</text>`);
  }

  const bars = series.map((point, index) => {
    const x = padLeft + index * band + (band - barWidth) / 2;
    const y = toY(point.tokensPerSecond);
    const barHeight = padTop + innerHeight - y;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" class="sp-bar sp-bar-throughput" data-label="tok/s" data-value="${point.tokensPerSecond.toFixed(1)}" data-run="${point.runNumber}"></rect>`;
  });

  const refLines = [["p50", summary.tpsMedian]].map(([label, value]) => {
    const lineY = toY(value);
    return `<line x1="${padLeft}" y1="${lineY.toFixed(1)}" x2="${width - padRight}" y2="${lineY.toFixed(1)}" class="sp-ref sp-ref-${label}"/>`;
  });

  const xLabels = series.map((point, index) => {
    const x = padLeft + index * band + band / 2;
    return `<text x="${x.toFixed(1)}" y="${height - padBottom + 17}" class="sp-tick" text-anchor="middle">${point.runNumber}</text>`;
  });

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "speed-chart");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Token throughput by run with a p50 reference line for ${modelId}`);
  svg.innerHTML = [
    ...grid,
    ...bars,
    ...refLines,
    ...xLabels,
    `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="sp-axis"/>`,
    `<line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="sp-axis"/>`,
    `<text x="${padLeft}" y="${padTop - 4}" class="sp-label">tok/s</text>`,
    `<text x="${width - padRight}" y="${height - 2}" class="sp-label" text-anchor="end">run #</text>`,
  ].join("");
  wrap.append(svg);

  svg.addEventListener("mouseover", (event) => {
    const bar = event.target.closest("rect.sp-bar");
    if (!bar) { tooltip.hidden = true; return; }
    const value = Number(bar.dataset.value);
    const formattedValue = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    tooltip.textContent = `run ${bar.dataset.run}: ${formattedValue} tok/sec`;
    tooltip.hidden = false;
  });
  svg.addEventListener("mousemove", (event) => {
    if (tooltip.hidden) return;
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  });
  svg.addEventListener("mouseout", () => { tooltip.hidden = true; });
  return wrap;
}

function resetSpeedResults() {
  speedRun = null;
  speedSummaryTime.textContent = "-";
  speedSummaryTotalTokens.textContent = "-";
  speedSummaryCost.textContent = "-";
  speedSummaryCost.removeAttribute("title");
  speedUsageNote.textContent = "Results and per-model throughput graphs will appear here after a Speed Test 1 run.";
  exportSpeedCsvButton.disabled = true;
  exportSpeedJsonButton.disabled = true;
  speedResults.hidden = false;
  renderSpeedResults();
}

function startSpeedClock() {
  stopSpeedClock();
  speedStopClock = startThrottledClock(() => {
    if (speedRun?.status === "running") updateSpeedElapsedTimes();
  });
}

function updateSpeedElapsedTimes() {
  if (!speedRun) return;
  const elapsedMs = speedRun.totalTestTimeMs
    ?? (speedStartedAtMs === null ? null : performance.now() - speedStartedAtMs);
  speedSummaryTime.textContent = formatDuration(elapsedMs);
  const resultsByModel = new Map(speedRun.results.map((result) => [result.modelId, result]));
  speedBody.querySelectorAll("tr[data-model-id]").forEach((row) => {
    const result = resultsByModel.get(row.dataset.modelId);
    const cell = row.querySelector('[data-speed-column="totalTestTimeMs"]');
    if (result && cell) {
      cell.textContent = formatDuration(result.totalTestTimeMs ?? getLiveElapsedMs(result));
    }
  });
}

function stopSpeedClock() {
  if (speedStopClock) {
    speedStopClock();
    speedStopClock = null;
  }
}

resetSpeedResults();
updateSpeedRunButtonState();
