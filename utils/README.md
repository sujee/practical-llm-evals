# Model Validation Tests

Quick checks against Nebius Token Factory using the OpenAI-style **Chat Completions**
and **Responses** APIs, plus a streaming throughput test.

## TOC

- [Setup](#setup)
- [Chat + Responses smoke test](#chat--responses-smoke-test)
- [Check all models](#check-all-models)
- [Speed test](#speed-test)

## Setup

This is a [uv](https://docs.astral.sh/uv/) project.

```bash
cp env_sample.txt .env   # then set NEBIUS_API_KEY=your_api_key_here
uv sync
```

## Tests

| File | What it does | Details |
| --- | --- | --- |
| `chat_and_responses_api_test.py` | Single-model smoke test for both APIs | [details](#chat--responses-smoke-test) |
| `chat_and_responses_api_test_all_models.py` | Parallel check of every non-embedding model | [details](#check-all-models) |
| `simple_speed_test.py` | Streaming throughput and latency stats | [details](#speed-test) |

## Chat + Responses smoke test

**for a single model**

[`chat_and_responses_api_test.py`](chat_and_responses_api_test.py) calls a single
model with both the Chat Completions API and the Responses API and prints each
reply.

```bash
uv run python chat_and_responses_api_test.py
```

**Check all models**

[`chat_and_responses_api_test_all_models.py`](chat_and_responses_api_test_all_models.py)
lists every non-embedding model in the project and checks, in parallel, which
support each API. Prints per-model progress and a markdown table summary with
total time.

```bash
uv run python chat_and_responses_api_test_all_models.py
```

## Speed test

[`simple_speed_test.py`](simple_speed_test.py) streams a continuous flow of words
and reports performance. It forces a fixed-length output by setting
`min_tokens = max_tokens = 1024` with `ignore_eos=true`, and disables thinking.

Prints stats: time to first token, thinking tokens, result tokens,
tok/sec (with and without thinking), and total test time.

```bash
uv run python simple_speed_test.py [model]   # default: zai-org/GLM-5.3-Flash
```
