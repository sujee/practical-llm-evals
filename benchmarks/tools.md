[Home](../README.md) › [Benchmarks](./README.md) › tools

# Graduated Projects and Other Tools

## 🎓 Graduated projects

These browser-based projects started in this repo. They now have their own repos.

| Project | What it does | Link |
| --- | --- | --- |
| **LLM Quick Bench** | A browser benchmark for inference endpoints. It needs no VM and no Python setup. | [repo](https://github.com/sujee/llm-quick-bench) |
| **ZebraBench** | A browser benchmark for endpoints. It measures speed, throughput, latency, accuracy, token use, and estimated cost. Its tests are speed, thinking, decode, needle (long context), prefill, and prompt cache. It exports CSV and JSON. | [repo](https://github.com/sujee/zebrabench), [live](https://sujee.github.io/zebrabench) |
| **LLM Derby** | A horse race. Three or four models answer the same trivia questions. Each correct answer moves the horse of that model forward. It compares accuracy, speed, and cost. A simulator mode needs no API keys. | [repo](https://github.com/sujee/llm-derby), [live](https://sujee.github.io/llm-derby) |
| **LLM Snake Arena** | Two models each control a snake on a shared grid. It compares response speed, reliability, and decision-making. It works with OpenAI-compatible and Anthropic APIs. | [repo](https://github.com/sujee/llm-snake-arena) |

Derby and Snake Arena are also in the [fun projects](../fun/README.md).

Which axes each project covers:

| Project | Speed | Quality | Scale |
| --- | --- | --- | --- |
| LLM Quick Bench | ✅ | | |
| ZebraBench | ✅ | ✅ (accuracy, needle) | |
| LLM Derby | ✅ | ✅ (trivia) | |
| LLM Snake Arena | ✅ | ✅ (decision-making) | |

Use these projects for fast, visual comparisons. Use the CLI tools in this folder when you need repeatable numbers, many concurrent clients, or standard benchmark scores.

## Other resources

### Public comparison sites (no work needed)

- [Artificial Analysis](https://artificialanalysis.ai/): independent speed, price, and quality comparisons of providers. The [Nebius model visualizer](../providers/nebius-token-factory/model-visualizer/README.md) in this repo uses its intelligence scores.
- [OpenRouter](https://openrouter.ai/): throughput and latency statistics for each provider of the same model.
- [LMArena](https://lmarena.ai/): model rankings from human votes.

### More benchmark tools

| Area | Tool | Why it is useful |
| --- | --- | --- |
| Capacity | [GuideLLM](https://github.com/vllm-project/guidellm) | Automatic rate sweeps and SLO reports |
| Quality and perf | [EvalScope](https://github.com/modelscope/evalscope) | Both in one tool |
| Agents and tool use | [Inspect AI](https://inspect.aisi.org.uk/), [BFCL (Berkeley Function Calling Leaderboard)](https://gorilla.cs.berkeley.edu/leaderboard.html) | Accuracy of tool calls |
| Long context | [RULER](https://github.com/NVIDIA/RULER), needle-in-a-haystack tests (ZebraBench has one) | Shows if quality holds at 32k–128k tokens |
| Custom tests and CI | [promptfoo](https://www.promptfoo.dev/) | Regression tests on your own prompts |
| Load | [Locust](https://locust.io/), [k6](https://k6.io/) | General load testing |

We did not check the links for BFCL, RULER, and EvalScope.

### Ideas to add to this repo

- **Prompt-cache test.** Send the same long prefix two times. Compare the TTFT of the two requests. ZebraBench has this test.
- **Tool-call correctness.** Check for valid JSON, the right function, and parallel calls.
- **Structured output.** Measure how often the output follows a JSON schema.
- **Long-context degradation.** Measure TTFT and accuracy at 8k, 32k, and 128k tokens.
- **Cost for each task.** Multiply tokens used by price. Show it with speed and quality.
- **Reliability over time.** Run a small benchmark on a schedule. Log the error rate and p90 latency each day.
