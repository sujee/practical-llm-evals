[Home](../../README.md) › [Benchmarks](../README.md) › [perf](./README.md) › other tools

# perf: Other Benchmark Tools

The speed test and the load test in this folder use [AIPerf](https://github.com/ai-dynamo/aiperf). These tools do similar work. Use them if AIPerf does not fit your needs. To run the tests, go back to the [README](./README.md).

| Tool | Notes | Use it when |
| --- | --- | --- |
| **[AIPerf](https://github.com/ai-dynamo/aiperf)** ⭐ | NVIDIA tool. It replaces GenAI-Perf. It has simple flags, percentile reports with CSV and JSON export, closed-loop and open-loop load, and goodput SLOs. It works with any OpenAI-compatible endpoint. | Default choice. This project uses it. |
| [vLLM `vllm bench serve`](https://docs.vllm.ai/en/latest/benchmarking/cli/) | Many published results use it. The client needs the `vllm` package. Use `--max-concurrency N` or `--request-rate R`. | You want numbers to compare with vLLM results. |
| [GuideLLM](https://github.com/vllm-project/guidellm) | A vLLM-project tool. It has strong sweep and SLO reports, and the profiles `sweep`, `concurrent`, `constant`, `poisson`, and `throughput`. Its CLI changes between versions. Run `guidellm run --help`. | Capacity planning, or finding the saturation point automatically. |
| [LLMPerf](https://github.com/ray-project/llmperf) | A Ray project. It was common for hosted APIs. It is archived and not maintained. | You must reproduce old results. |
| [Inference Benchmarker](https://github.com/huggingface/inference-benchmarker) | A Hugging Face tool with a terminal UI. It targets TGI. It can also test OpenAI-compatible servers. | You already use the HF stack. |
| [Locust](https://locust.io/), [k6](https://k6.io/) | General HTTP load tools. You write the scenario and calculate TTFT yourself. | You have a mixed workload or existing load-test tools. |
| [`simple_speed_test.py`](../../utils/simple_speed_test.py) in this repo | A short script. One request, fixed length. | You want a quick test with no install. |
| [LLM Quick Bench](https://github.com/sujee/llm-quick-bench), [ZebraBench](../tools.md) | Browser tools. | You want a UI and no install. |

### vLLM bench example

Use this tool if you want numbers that you can compare with vLLM results.

```bash
uv tool install vllm   # large install. Best on Linux.
vllm bench serve \
  --backend openai-chat \
  --base-url "$BASE_URL" \
  --endpoint /v1/chat/completions \
  --model "$MODEL" \
  --dataset-name random \
  --random-input-len 1000 \
  --random-output-len 500 \
  --ignore-eos \
  --num-prompts 20 \
  --max-concurrency 1 \
  --save-result
```

Run `vllm bench serve --help` first. The flags and the API-key handling change between vLLM versions. We did not test this command.
