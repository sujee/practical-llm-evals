# AGENTS.md — Nebius Token Factory model visualization

These instructions are for agents that maintain the data and the visualization of this provider.

The [root AGENTS.md](../../AGENTS.md) has the rules for writing style and Git. Those rules also apply here.

## What is here

| Path | Purpose |
| --- | --- |
| `data/tf-models-list.json` | Master catalog of all models on Token Factory (raw API dump) |
| `data/tf-models-by-aa-intelligence.json` | Artificial Analysis Intelligence Index, one object for each catalog model |
| `data/tf-models-by-aa-intelligence.csv` | The same AA data as a flat CSV for spreadsheets |
| `model-visualizer/model-info.json` | A curated subset. The charts show these models (scores and prices). |
| `model-visualizer/` | Static ECharts site (`index.html`, `app.js`) |

`data/tf-models-list.json` is the source of truth for which models exist, and for raw prices and context sizes.
The AA files are the source of truth for intelligence scores.
A person curates `model-info.json`. It must contain only the models that are worth highlighting.

The user-facing version of this workflow is in `model-visualizer/README.md`.

## 1. Refresh the Token Factory catalog

Fetch the master catalog and pretty-print it. This replaces the file. Do not edit the file by hand.

```bash
curl -sS https://tokenfactory.nebius.com/api/public/models_info | jq > data/tf-models-list.json
```

Check the result:

```bash
jq -e . data/tf-models-list.json >/dev/null && jq -r 'length' data/tf-models-list.json
```

Notes:
- `created_at` can be a Unix timestamp (seconds) or an ISO string. This depends on the entry. Keep the value that the API returns.
- The schema of the public API response changes over time. Old fields such as `fine_tune`, `logo_url`, and `policy_url` can disappear. This is expected. You can drop them.
- Before you change the downstream files, look at the diff to see what changed:
  ```bash
  git diff --stat data/tf-models-list.json
  ```

## 2. Cross-reference with Artificial Analysis

Source: <https://artificialanalysis.ai/leaderboards/models>

For each model in `tf-models-list.json`, find the matching AA model. Record its **Artificial Analysis Intelligence Index**. Use the variant with the highest effort or reasoning, for example `(max)` or `(high)`. Record the version of the index methodology that the page shows (`v4.3` at the time of writing) in `aa_intelligence_index_version`.

Update **both** `data/tf-models-by-aa-intelligence.json` and `data/tf-models-by-aa-intelligence.csv`. They must stay in sync. Rules:

- Include one entry for each model in `tf-models-list.json`. **Remove models that are no longer in the catalog.** **Add new models.**
- Copy the catalog `name` exactly (for example `DeepSeek V4.1 Flash`). Copy `type` and `vendor` from the catalog.
- `aa_slug` is the page slug of the model. It is the last path segment of `https://artificialanalysis.ai/models/<slug>`. Use `null` if AA does not track the model.
- `aa_intelligence_index` is the integer score. Use `null` if it is not available (embeddings, untracked models). In the CSV, write `N/A` for these.
- On each refresh, set `last_updated` to today's date (`YYYY-MM-DD`) for every entry.
- Sort both files by `aa_intelligence_index`, highest first. Put untracked (`null`) entries at the end. This is the existing order.

### JSON entry shape

```json
{
    "name": "DeepSeek V4.1 Flash",
    "type": "image2text",
    "vendor": "deepseek",
    "aa_slug": "deepseek-v4-1-flash",
    "aa_intelligence_index": 40,
    "last_updated": "2026-09-16",
    "aa_intelligence_index_version": "v4.3"
}
```

### CSV columns

```
model,AA_intelligence_index,aa_intelligence_index_version,last_updated
```

### Check the files before you continue

```bash
# The AA files agree with each other and with the catalog (each command must print nothing)
comm -3 <(jq -r '.[].name' data/tf-models-by-aa-intelligence.json | sort) \
        <(jq -r '.[].name' data/tf-models-list.json | sort)
comm -3 <(tail -n +2 data/tf-models-by-aa-intelligence.csv | cut -d, -f1 | sort) \
        <(jq -r '.[].name' data/tf-models-by-aa-intelligence.json | sort)
```

## 3. Update prices and chart data (`model-info.json`)

`model-info.json` is the curated input for the visualization. The catalog has the prices in
`flavors[].input_price_per_million_tokens` and `flavors[].output_price_per_million_tokens` (USD for 1M tokens).

Add only the models that are worth highlighting. Do not add all catalog entries. For each highlighted model, set these fields:

- `model_id` — the full model id. Use exactly `flavors[0].model_id` (for example `deepseek-ai/DeepSeek-V4.1-Flash`).
- `aa_intelligence_index` — copy it from `data/tf-models-by-aa-intelligence.json`.
- `context_window_K` — copy the catalog `context_window_k`. It is already in K tokens. `1024` means 1M.
- `param_count` — total parameters in billions. For many MoE models of 2026, the catalog `size_b` is `0`. Then take the total from AA or the model card.
- `model_release_date` — `YYYY-MM-DD`. Use the real release date of the model (catalog `created_at`, AA, or the model card).
- `price_input_1m` and `price_output_1m` — the prices of the catalog flavor.
- `pricing_blended_1m` — **calculate** it. Never copy it:
  ```
  pricing_blended_1m = 0.75 * price_input_1m + 0.25 * price_output_1m
  ```
  This is the documented 3:1 blend of input and output.

At the end, set the top-level `updated_at` to today's date.

Example:

```
price_input_1m  = 0.30
price_output_1m = 1.20
blended         = 0.75*0.30 + 0.25*1.20 = 0.525
```

Check the file and calculate the blends in one pass:

```bash
jq -e . model-visualizer/model-info.json >/dev/null
jq -r '.models[] | "\(.model_id)\tblended=\((0.75*.price_input_1m + 0.25*.price_output_1m)*1000|round/1000)\tlisted=\(.pricing_blended_1m)"' \
  model-visualizer/model-info.json
```

## 4. Check the result locally

The charts fetch JSON over HTTP. Serve the folder. Do not open the file directly:

```bash
python -m http.server 8000 --directory model-visualizer
```

Open <http://localhost:8000>. Check that the charts show the new and changed models. The charts are Intelligence vs price, release timeline, and context frontier.
