# AGENTS.md — Nebius Token Factory model visualization

Instructions for agents maintaining this provider's data and visualization.

## What lives here

| Path | Purpose |
| --- | --- |
| `data/tf-models-list.json` | Master catalog of every model on Token Factory (raw API dump) |
| `data/tf-models-by-aa-intelligence.json` | Artificial Analysis Intelligence Index, one object per catalog model |
| `data/tf-models-by-aa-intelligence.csv` | Same AA data as above, flat CSV for spreadsheets |
| `model-visualizer/model-info.json` | Curated subset the charts actually render (scores + pricing) |
| `model-visualizer/` | Static ECharts site (`index.html`, `app.js`) |

Treat `data/tf-models-list.json` as the source of truth for *which* models exist and raw pricing/context.
Treat the AA files as the source of truth for intelligence scores.
`model-info.json` is hand-curated and only needs to cover the models worth highlighting.

The user-facing version of this same workflow is in `model-visualizer/README.md`.

## Git discipline

Never commit or push automatically. Always ask for explicit approval before each commit and before each push.

## 1. Refresh the Token Factory catalog

Fetch the master catalog and pretty-print it (this replaces the file wholesale — do not hand-edit it):

```bash
curl -sS https://tokenfactory.nebius.com/api/public/models_info | jq > data/tf-models-list.json
```

Sanity-check the result:

```bash
jq -e . data/tf-models-list.json >/dev/null && jq -r 'length' data/tf-models-list.json
```

Notes:
- `created_at` may be either a Unix timestamp (seconds) or an ISO string depending on the entry. Preserve whatever the API returns.
- The public API response schema changes over time. Legacy fields such as `fine_tune`, `logo_url`, and `policy_url` may disappear; that is expected and fine to drop.
- Diff against the previous revision to see what actually changed before touching the downstream files:
  ```bash
  git diff --stat data/tf-models-list.json
  ```

## 2. Cross-reference with Artificial Analysis

Source: <https://artificialanalysis.ai/leaderboards/models>

For every model in `tf-models-list.json`, find the matching AA model and record its **Artificial Analysis Intelligence Index** (use the highest-effort/reasoning variant, e.g. `(max)` or `(high)`). Record the index methodology version shown on the page (`v4.3` at time of writing) in `aa_intelligence_index_version`.

Update **both** `data/tf-models-by-aa-intelligence.json` and `data/tf-models-by-aa-intelligence.csv` so they stay in sync. Rules:

- Include one entry per model in `tf-models-list.json`; **remove models no longer in the catalog** and **add newly added models**.
- Use the catalog `name` verbatim (e.g. `DeepSeek V4.1 Flash`), and copy `type` and `vendor` from the catalog.
- `aa_slug` is the model's page slug, i.e. the last path segment of `https://artificialanalysis.ai/models/<slug>`. Use `null` if AA does not track it.
- `aa_intelligence_index` is the integer score, or `null` when unavailable (embeddings, untracked models). In the CSV write `N/A` for those.
- Set `last_updated` to today's date (`YYYY-MM-DD`) for every entry on each refresh.
- Keep both files sorted by `aa_intelligence_index` descending (untracked/`null` entries at the end), matching the existing ordering.

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

### Validate before moving on

```bash
# AA files agree with each other and with the catalog (all should print nothing)
comm -3 <(jq -r '.[].name' data/tf-models-by-aa-intelligence.json | sort) \
        <(jq -r '.[].name' data/tf-models-list.json | sort)
comm -3 <(tail -n +2 data/tf-models-by-aa-intelligence.csv | cut -d, -f1 | sort) \
        <(jq -r '.[].name' data/tf-models-by-aa-intelligence.json | sort)
```

## 3. Update pricing and the chart data (`model-info.json`)

`model-info.json` is the curated input for the visualization. Prices live in the catalog under
`flavors[].input_price_per_million_tokens` and `flavors[].output_price_per_million_tokens` (USD per 1M tokens).

Only add models worth highlighting — not every catalog entry. For each highlighted model set:

- `model_id` — the fully-qualified id, exactly `flavors[0].model_id` (e.g. `deepseek-ai/DeepSeek-V4.1-Flash`).
- `aa_intelligence_index` — pull from `data/tf-models-by-aa-intelligence.json`.
- `context_window_K` — from the catalog `context_window_k` (already in K tokens; `1024` means 1M).
- `param_count` — total parameters in billions. The catalog `size_b` is `0` for many 2026 MoE models, so take the real total from AA / the model card when it is missing.
- `model_release_date` — `YYYY-MM-DD`, the model's actual release date (catalog `created_at`, AA, or the model card).
- `price_input_1m` / `price_output_1m` — catalog flavor prices.
- `pricing_blended_1m` — **calculated**, never copied:
  ```
  pricing_blended_1m = 0.75 * price_input_1m + 0.25 * price_output_1m
  ```
  (the documented 3:1 input:output blend).

Finally bump the top-level `updated_at` to today's date.

Example:

```
price_input_1m  = 0.30
price_output_1m = 1.20
blended         = 0.75*0.30 + 0.25*1.20 = 0.525
```

Validate and compute blends in one pass:

```bash
jq -e . model-visualizer/model-info.json >/dev/null
jq -r '.models[] | "\(.model_id)\tblended=\((0.75*.price_input_1m + 0.25*.price_output_1m)*1000|round/1000)\tlisted=\(.pricing_blended_1m)"' \
  model-visualizer/model-info.json
```

## 4. Verify locally

The charts fetch JSON over HTTP, so serve the directory rather than opening the file directly:

```bash
python -m http.server 8000 --directory model-visualizer
```

Then open <http://localhost:8000>. Check the Intelligence vs price, release timeline, and context frontier charts render the new/updated models.
