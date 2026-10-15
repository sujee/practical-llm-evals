[Home](../README.md) › Benchmarks

# Benchmarking LLM Inference Endpoints

Test an OpenAI-compatible endpoint for speed, quality, and load. Each test is a ready-to-run [uv](https://docs.astral.sh/uv/) project. Pick a test and open its README.

🤖 **Agent friendly.** Each test has agent instructions. You do not need to copy and paste commands. Let your coding agent do it.

## Learn

- [Benchmark vocabulary and methodology](./vocabulary-and-methodology.md): TTFT, percentiles (p50, p90, p99), and tips for reliable results.
- [Graduated projects and other tools](./tools.md): browser tools and other benchmark tools.

## Tests

Run all three tests, because they answer different questions. Speed depends on hardware and quantization. Quality drops when a provider quantizes too much or has a broken chat template. Scale depends on queues and rate limits. A fast endpoint is not useful if its answers are bad.

| Test | Question | Go to |
| --- | --- | --- |
| ⚡ Speed | How fast is one request? (TTFT, tokens/sec) | [perf/](./perf/README.md) |
| 📈 Load | What happens with 1, 10, and 50 concurrent clients? | [perf/](./perf/README.md) |
| 🎯 Quality | Does the endpoint return correct answers? | [quality/](./quality/README.md) |

The tests use real tokens. Start with a small test.
