const form = document.querySelector("#connection-form");
const endpointInput = document.querySelector("#endpoint");
const apiKeyInput = document.querySelector("#api-key");
const toggleKeyButton = document.querySelector("#toggle-key");
const loadButton = document.querySelector("#load-button");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const modelCount = document.querySelector("#model-count");
const tableHead = document.querySelector("#models-head");
const tableBody = document.querySelector("#models-body");

const columns = [
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

toggleKeyButton.addEventListener("click", () => {
  const shouldShow = apiKeyInput.type === "password";
  apiKeyInput.type = shouldShow ? "text" : "password";
  toggleKeyButton.textContent = shouldShow ? "Hide" : "Show";
  toggleKeyButton.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} API key`);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Loading models…");
  setLoading(true);

  try {
    const modelReference = await loadModelReference();
    const url = buildModelsUrl(endpointInput.value);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKeyInput.value.trim()}`,
      },
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
    models = crossReferencedModels.filter((model) => !model.isEmbedding);
    const skippedEmbeddings = crossReferencedModels.length - models.length;
    sortState = { key: "releaseDate", direction: "descending" };
    renderTable();
    results.hidden = false;
    modelCount.textContent = `${models.length} model${models.length === 1 ? "" : "s"}`;
    const referenceMatches = models.filter((model) => model.referenceMatched).length;
    const skippedMessage = skippedEmbeddings === 0
      ? ""
      : ` Skipped ${skippedEmbeddings} embedding model${skippedEmbeddings === 1 ? "" : "s"}.`;
    setStatus(
      `Loaded ${models.length} model${models.length === 1 ? "" : "s"}; ${referenceMatches} matched model-info.json.${skippedMessage}`,
    );
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    results.hidden = true;
    const corsHint = error instanceof TypeError ? " The endpoint may not allow browser requests (CORS)." : "";
    setStatus(`${error.message || "Unable to load models."}${corsHint}`, true);
  } finally {
    setLoading(false);
  }
});

function buildModelsUrl(rawEndpoint) {
  const url = new URL(rawEndpoint.trim());
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/models")) {
    url.pathname = `${url.pathname}/models`;
  }
  url.searchParams.set("verbose", "true");
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
  if (price === null || price === 0) return price;
  if (isAlreadyPerMillion) return price;

  // Nested pricing fields do not consistently declare their unit. Tiny values
  // are normally per-token amounts; explicit *_per_million_tokens fields skip
  // this heuristic via getPricePerMillion().
  return Math.abs(price) < 0.001 ? price * 1_000_000 : price;
}

function renderTable() {
  tableHead.replaceChildren();
  tableBody.replaceChildren();

  const headerRow = document.createElement("tr");
  columns.forEach(({ key, label: columnLabel }) => {
    const headerCell = document.createElement("th");
    headerCell.scope = "col";

    const sortButton = document.createElement("button");
    sortButton.type = "button";
    sortButton.className = "sort-button";
    sortButton.dataset.column = key;
    sortButton.setAttribute(
      "aria-sort",
      sortState.key === key ? sortState.direction : "none",
    );

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

  const sortedModels = [...models].sort((left, right) => {
    const leftValue = left[sortState.key];
    const rightValue = right[sortState.key];
    if (isMissing(leftValue)) return isMissing(rightValue) ? 0 : 1;
    if (isMissing(rightValue)) return -1;
    const comparison = compareValues(leftValue, rightValue);
    return sortState.direction === "ascending" ? comparison : -comparison;
  });

  sortedModels.forEach((model) => {
    const row = document.createElement("tr");
    columns.forEach(({ key }) => {
      const cell = document.createElement("td");
      const rawValue = model[key];
      const displayValue = formatValue(key, rawValue);
      cell.textContent = displayValue;
      cell.title = displayValue;
      if (isMissing(rawValue)) {
        cell.className = "empty-value";
      }
      row.append(cell);
    });
    tableBody.append(row);
  });
}

function sortBy(column) {
  sortState = {
    key: column,
    direction: sortState.key === column && sortState.direction === "ascending"
      ? "descending"
      : "ascending",
  };
  renderTable();
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

function formatValue(column, value) {
  if (column === "releaseDate" && isMissing(value)) return "-";
  if (isMissing(value)) return "—";
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

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function setLoading(isLoading) {
  loadButton.disabled = isLoading;
  loadButton.firstElementChild.textContent = isLoading ? "Loading…" : "Load models";
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}
