[Home](../../README.md) › [Benchmarks](../README.md) › [perf](./README.md) › speed details

# perf: Speed Test Details

Reference for the [speed test](./speed.md): caveats, flags, advanced options, problems, and files. For other benchmark tools, see [other-tools.md](./other-tools.md).

## Caveats

- A reasoning model can stream thinking tokens in a separate field (`reasoning_content`). Some tools do not count these as the first token. Check how your tool handles them, or disable thinking.
- Example from a real run: a reasoning model made about 98% of its 500 output tokens as thinking tokens. Only 1 of 20 requests reached an answer token. The report row "Time to First Token" was about 718 ms. The row "Time to First Output Token" was about 2,788 ms, from only one sample. Quote the TTFT number as "time to the first streamed token", not as "time to the answer".
- Some providers put several tokens in one chunk. This makes ITL look larger and tokens/sec per user look too high. On servers that support `continuous_usage_stats`, use `--use-server-token-count --per-chunk-usage` to fix this.

## Flags

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--model`, `-m` | Model id in the request body. | Use an id from `GET /v1/models`. |
| `--url`, `-u` | Base URL of the server. AIPerf adds the path for `--endpoint-type`, for example `/v1/chat/completions`. | Do not add `/v1/...`. |
| `--api-key` | Sent as `Authorization: Bearer <key>`. | Use an environment variable. Do not paste keys into your shell history. |
| `--endpoint-type` | API type: `chat`, `completions`, `responses`, `embeddings`, and others. | Use `chat` for most LLMs. |
| `--streaming` | Use streamed (SSE) responses. | **Required** for TTFT and ITL. Without it, AIPerf measures only total latency. |
| `--tokenizer` | HF tokenizer that builds prompts and counts tokens. | Use the tokenizer of the model if you can. |
| `--isl` (`--prompt-input-tokens-mean`) | Input sequence length. Mean prompt tokens. | 128 is a short chat. 1000–2000 is typical. 8000 or more is RAG or long context. |
| `--osl` (`--prompt-output-tokens-mean`) | Output sequence length. AIPerf sends it as `max_completion_tokens`. | 256–500 gives stable tokens/sec numbers. |
| `--extra-inputs` | More fields for the request body, as `key:value` pairs. | `ignore_eos:true min_tokens:N` forces full-length output on servers that support them. |
| `--concurrency` | Number of requests in flight (closed loop). | 1 for the speed test. 1, 10, and 50 for the load test. |
| `--request-count` | Total requests to send. | 20–50 for speed. At least 5–10 × the concurrency for load. |
| `--warmup-request-count`, `--warmup-concurrency` | Warmup before the measurement. AIPerf leaves it out of the statistics. | 2–5 for speed. The same as the concurrency for load. |
| `--output-artifact-dir` | Folder for reports (JSON, CSV). | The default is `./artifacts/...`. |

## Advanced (optional)

You do not need these for a normal test.

### Sweep prompt lengths

TTFT grows with prompt length. A comma-separated list sweeps the values.

```bash
uv run aiperf profile --model "$MODEL" --url "$BASE_URL" --api-key "$API_KEY" \
  --endpoint-type chat --streaming --tokenizer "$TOKENIZER" \
  --isl 128,1024,8192 --osl 256 \
  --concurrency 1 --request-count 10
```

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--isl-stddev`, `--osl-stddev` | Add random variation to the lengths (normal distribution). | Use 0 to compare endpoints. Use a value above 0 to copy real traffic. |
| `--use-server-token-count` | Count tokens from the `usage` field of the server. The default is client-side tokenization. | Use it if you cannot get the matching tokenizer. |

## Problems and solutions

| Problem | Cause and solution |
| --- | --- |
| `Missing BASE_URL` (or another variable) | You did not create `.env`, or it has no value for that variable. Do the setup in the [README](./README.md#setup). |
| `uv: command not found` | uv is not installed. See the [README](./README.md#setup). |
| Every request fails | Check `BASE_URL` (no `/v1`), `API_KEY`, and `MODEL`. Run the `curl` command in [Run AIPerf yourself](#run-aiperf-yourself). |
| Tokenizer download fails | Check your internet access. Some tokenizers need a Hugging Face login. Use another tokenizer from the same family. |
| Output Sequence Length is much lower than `OSL` | The provider ignores `ignore_eos` or `min_tokens`. Compare tokens/sec only between runs with similar output lengths. |

## Files

The scripts print a short summary (`summarize.py`) after the AIPerf report. AIPerf saves CSV and JSON reports in `artifacts/speed/`. Git ignores `artifacts/`. To print the summary again, run `uv run python summarize.py artifacts/speed`.

| File | Purpose |
| --- | --- |
| `speed.sh`, `load.sh` | The tests |
| `_common.sh` | Loads `.env` and sets the shared AIPerf flags |
| `summarize.py` | Prints a short summary of a run. Uses only the Python standard library. |
| `verify-env.sh` | Checks `.env` with a quick API call (model list, 1-token chat request, tokenizer). It never prints a value. |
| `.env.example` | Template for `.env` |
| `pyproject.toml`, `uv.lock` | The dependency list (AIPerf) and the locked versions |
