[Home](../../README.md) › [Benchmarks](../README.md) › perf

# perf: Speed and Load Tests for LLM Endpoints

This project tests an OpenAI-compatible endpoint with [AIPerf](https://github.com/ai-dynamo/aiperf). Do the setup below. Then run a test with an agent, or by hand.

| Test | Run it | Details |
| --- | --- | --- |
| ⚡ Speed: TTFT, tokens/sec for one client | [speed.md](./speed.md) | [speed-details.md](./speed-details.md) |
| 📈 Load: 1, 10, and 50 clients | [load.md](./load.md) | [load-details.md](./load-details.md) |

The tests use real tokens, and you pay for them. Start small.

## Setup

You need macOS or Linux with `bash` and `git`, and an API key for an OpenAI-compatible endpoint.

**Install uv.** This project uses the [uv](https://docs.astral.sh/uv/) package manager.

```bash

## Using an agent (easiest option)

Start a coding agent in this folder (`benchmarks/perf`) and say:

> Run a speed test.

> Run a load test.

The agent uses your `.env`, runs a small test first, asks before an expensive test, and explains the results. It follows [AGENTS.md](./AGENTS.md). It never reads or prints your API key.

## By hand

See [speed.md](./speed.md) and [load.md](./load.md).

## More

- [other-tools.md](./other-tools.md): other benchmark tools
- [Benchmark vocabulary and methodology](../vocabulary-and-methodology.md): the meaning of TTFT, p90, and other terms
- [Quality tests](../quality/README.md): check the answers of the endpoint
