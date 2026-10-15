[Home](../../README.md) › [Benchmarks](../README.md) › [quality](./README.md) › details

# quality: Explanations, Flags, and Other Tools

A fast endpoint is not useful if its answers are wrong. Quality tests check that an endpoint gives the same quality of answers that you expect from the model. They find providers that quantize too much, cut context, or have a broken chat template, reasoning parser, or tool-call parser.

Details for the quality tests in this folder. To run the tests, go back to the [README](./README.md).

## Best practice

Use these defaults. They are the values that the scripts use. Change a value only when you have a reason.

| Step | Command | Why |
| --- | --- | --- |
| 1. Check `.env` | `./verify-env.sh` | Finds a wrong URL, key, or model before you spend tokens. |
| 2. Smoke test | `./lm_eval.sh` | `gsm8k` and `ifeval`, 10 questions each. It checks that the chain works and that the answers have the right format. The score is not reliable yet. |
| 3. Comparison | `./lm_eval.sh gsm8k,ifeval 200` | With 200 questions, a score near 0.8 has a Stderr of about 0.03. Use the same settings for every endpoint that you compare. |
| 4. Instruction following | `./ifbench.sh` | 300 prompts. It uses more tokens, so run it after the smoke test works. Read the line "Empty responses". |

Rules for good results:
- **Use temperature 0.** The scripts do. Then the results are repeatable.
- **Read the samples.** Open `results/` and look at some answers before you trust a score.
- **Use the same token limit** for every endpoint that you compare.
- **For a reasoning model,** increase `MAX_GEN_TOKENS` or `MAX_TOKENS` if the scores are very low and the answers end in the middle, or are empty.
- **Do not compare with a published score.** Prompt format and answer extraction are different. Compare endpoints with each other.

## Two questions

1. **Does this endpoint serve the model faithfully?** Run the same standard benchmark on the endpoint. Compare the score to the published score of the model or to the endpoint of another provider. Most of this guide answers this question.
2. **Which model is best for my task?** Make a small test set from your own prompts. Public benchmarks are a poor proxy for your workload.

## Tool landscape

| Tool | Notes | Use it when |
| --- | --- | --- |
| **[lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)** ⭐ | An EleutherAI tool. Many leaderboards use it. It has hundreds of tasks (GSM8K, MMLU-Pro, GPQA, IFEval, HumanEval, and others). It works with OpenAI-compatible endpoints. | Default choice. This guide uses it. |
| [Inspect AI](https://inspect.aisi.org.uk/) | A framework from UK AISI. It has a clean Python API, many built-in evals, good support for agents and tool use, and a log viewer. | You need custom evals or agentic tasks. |
| [LightEval](https://github.com/huggingface/lighteval) | A Hugging Face tool with a scope like the harness. | You use the HF ecosystem. |
| [EvalScope](https://github.com/modelscope/evalscope) | A ModelScope tool. It has benchmarks and a built-in perf tool. | You want quality and perf in one tool. |
| [IFBench](https://github.com/allenai/IFBench) | The instruction-following benchmark of Ai2. It uses constraints that models did not see. It has its own scripts and is not part of the harness. | You need strict instruction following ([below](#ifbench-precise-instruction-following)). |
| [promptfoo](https://www.promptfoo.dev/) | Test cases in YAML with assertions and an LLM judge. It compares providers side by side. | You want to test your own prompts or run regression tests in CI. |
| [OpenAI simple-evals](https://github.com/openai/simple-evals) | Small reference implementations (MMLU, GPQA, MATH, HumanEval, and others). | You want to read reference code. |
| [Kimi Vendor Verifier](https://github.com/MoonshotAI/K2-Vendor-Verifier) | Checks how well a provider serves tool calls (schema validity, accuracy) for Kimi models. | You need valid tool calls. |
| [Artificial Analysis](https://artificialanalysis.ai/) | Independent scores and provider comparisons. You do not run it. | You want reference numbers quickly. |

## Recommended: lm-evaluation-harness

The raw commands below use these variables. The scripts read them from `.env`. For the raw commands, set them in your shell:

```bash
export BASE_URL="https://api.tokenfactory.nebius.com"   # no trailing /v1. The tools add the path.
export API_KEY="..."                                    # your key
export MODEL="Qwen/Qwen3.8-27B"                    # model id from GET /v1/models
```

### Settings of the script

The script `lm_eval.sh` reads the environment variables `CONCURRENT` (default 8) and `MAX_GEN_TOKENS` (default 4096). The results go to `results/`.

### Install (manual)

```bash
git clone --depth 1 https://github.com/EleutherAI/lm-evaluation-harness
cd lm-evaluation-harness
uv pip install -e ".[api]"      # or: pip install -e ".[api]"
lm_eval run --help
```

### Run lm_eval yourself

This command is what `lm_eval.sh` runs, with the default tasks (`gsm8k` and `ifeval`) and 10 questions. For a comparison, change `--limit 10` to `--limit 200`.

```bash
export OPENAI_API_KEY="$API_KEY"    # the OpenAI-style backends read this variable

lm_eval run \
  --model local-chat-completions \
  --model_args "model=$MODEL,base_url=$BASE_URL/v1/chat/completions,num_concurrent=8,max_retries=3" \
  --tasks gsm8k,ifeval \
  --apply_chat_template \
  --gen_kwargs "temperature=0,max_gen_toks=4096" \
  --limit 10 \
  --output_path results/ \
  --log_samples
```

Always start with `--limit 10`. Read the logged samples before you spend money on a bigger run. If the outputs are cut off or malformed, fix that first (see the caveats).

### Advanced examples (optional)

You do not need these for a normal test. Add harder or larger tasks when you have a reason:

```bash
lm_eval run ... --tasks gsm8k,ifeval,mmlu_pro --limit 200
```

In this example, `...` stands for the other flags of the command above. These task names exist (we checked): `gsm8k`, `ifeval`, `mmlu_pro`, `gpqa_diamond_cot_zeroshot`, `humaneval`, `mbpp`, `aime24`. To list all tasks, run `lm_eval ls tasks`.

The tasks `humaneval` and `mbpp` run code that the model wrote. The harness needs an opt-in flag (`--confirm_run_unsafe_code`). Run them in a sandbox.

### What the tasks measure

| Task | Measures | Cost |
| --- | --- | --- |
| `gsm8k` (default) | Grade-school math word problems. A quick check of reasoning and answer format. | Low |
| `ifeval` (default) | Following instructions that code can check ("write 3 paragraphs", "no commas"). | Low |
| `mmlu_pro` | Broad knowledge. 10-choice questions in 14 subjects. | Medium (large) |
| `gpqa_diamond_cot_zeroshot` | Hard science questions at graduate level. | Low to medium. Reasoning models need long outputs. |
| `aime24` | Competition math. A hard reasoning test. | Few questions, very long outputs. |
| `humaneval`, `mbpp` | Python code generation. Tests check the code. | Low |

### Parameters

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--model` | The backend. `local-chat-completions` uses `/v1/chat/completions`. `local-completions` uses `/v1/completions`. | Chat endpoints are the usual case. |
| `--model_args` | Comma-separated `key=value` pairs for the backend: `model` (served model id), `base_url` (full URL with the path), `num_concurrent` (parallel requests), `max_retries`. | A higher `num_concurrent` is faster but can reach rate limits. |
| `--tasks` | Comma-separated task names. | Run `lm_eval ls tasks`. |
| `--apply_chat_template` | Wraps prompts in the chat format. | Use it for instruct and chat models. |
| `--limit` | Evaluates only N examples for each task (or a fraction). | Smoke test: 10. Comparisons: 200 or more. Report full runs without `--limit`. |
| `--gen_kwargs` | Generation parameters, for example `temperature=0,max_gen_toks=4096`. | Use temperature 0 for repeatable results. Increase the token limit for reasoning models. |
| `--output_path` | Folder for the result JSON. | |
| `--log_samples` | Saves each prompt and response. | Always use it. You need it to debug bad scores. |

**Advanced (optional):**

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--num_fewshot` | Number of in-context examples. | Use the same number as the reference score that you compare with. |

### Caveats

- **Chat endpoints support only generative tasks.** Chat APIs do not return logprobs. Multiple-choice tasks that use log-likelihood (for example `hellaswag` and the original `mmlu`) do not run. Use generative variants (`mmlu_pro`, `gsm8k`, `ifeval`, and others).
- **Reasoning models need a large `max_gen_toks`.** If not, thinking uses the budget and the answers are cut off. The scores are then too low. Also check how the harness handles `<think>` blocks.
- **Your scores will not match published numbers exactly.** Prompt format, few-shot count, answer extraction, and sampling settings are different. Compare two endpoints with identical settings. Do not try to match a published number.
- **Small samples are noisy.** With `--limit 100`, one question is one percentage point. Check the reported standard error before you rank endpoints.
- Quality can change over time. Run the test again after provider announcements.

## IFBench: precise instruction following

[IFBench](https://github.com/allenai/IFBench) (Ai2) tests if a model follows *new* output constraints that it did not see before. Examples are "include keyword X exactly twice", word and sentence limits, and formatting rules. It has 300 test prompts. Code checks each constraint. An LLM judge is not used. It is a harder follow-up to `ifeval`. Ai2 made it because models can overfit to the constraints of `ifeval`.

**IFBench is not a task in lm-evaluation-harness.** (`lm_eval ls tasks` has no `ifbench`.) It runs as its own two-step process. First, generate responses from your endpoint. Then score them.

The script `ifbench.sh` reads the environment variables `MAX_TOKENS` (default 8192) and `WORKERS` (default 8). The output goes to `results/ifbench/`.

### Install (manual)

```bash
git clone --depth 1 https://github.com/allenai/IFBench
cd IFBench
uv sync
```

The `ifbench` package is not on PyPI. The generation and scoring scripts are in the repo, not in the package.

### Step 1: generate responses from the endpoint

The script `generate_responses.py` of the repo calls any OpenAI-compatible `/chat/completions` endpoint. The `--api-base` value **includes `/v1`**. This is different from `--url` in AIPerf.

```bash
uv run python generate_responses.py \
  --api-base "$BASE_URL/v1" \
  --api-key "$API_KEY" \
  --model "$MODEL" \
  --temperature 0 \
  --max-tokens 8192 \
  --workers 8 \
  --output-file data/responses.jsonl
```

### Step 2: score the responses

```bash
uv run python -m run_eval \
  --input_data=data/IFBench_test.jsonl \
  --input_response_data=data/responses.jsonl \
  --output_dir=eval
```

The command writes `eval/eval_results_strict.jsonl` and `eval/eval_results_loose.jsonl`. The paper usually reports **prompt-level loose accuracy**. This is the share of prompts where the response met *all* constraints after "loose" normalization. For example, loose scoring can ignore markdown or an extra first or last line that the model added. (We did not read the IFBench code for this. The description follows the IFEval method.)

### Parameters

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--api-base` | Base URL with `/v1`. | You can also set `API_BASE` in `.env`. |
| `--api-key` | Bearer token. | You can also set `API_KEY` in `.env`. |
| `--model` | Served model id. | |
| `--temperature` | Sampling temperature. | The repo default is 0.6. The Ai2 README says they evaluate at 0. Use 0 to compare endpoints. |
| `--max-tokens` | Output limit. The repo default is 4096. | Use a much higher value for reasoning models. If not, thinking uses the budget. |
| `--workers` | Parallel requests. | Stay below your rate limit. |

**Advanced (optional):**

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--seed` | Sent as `seed` (default 42). | Some providers ignore it. |
| `--resume` | Skips prompts that are already in the output file. | Use it only for interrupted runs. It does not retry prompts that had an error. The script saves those as empty responses. |

### Example result

From a real run of `ifbench.sh` against a reasoning model (300 prompts, `MAX_TOKENS` 8192, no request errors):

```text
strict:  prompt-level 0.680   instruction-level 0.677
loose:   prompt-level 0.713   instruction-level 0.706
Empty responses: 38 of 300
```

The 38 empty responses count as failures, so the scores are lower than the model can reach. A reasoning model can use all 8,192 tokens for thinking and send an empty answer. We did not check the cause in the raw responses. A larger `MAX_TOKENS` is the first thing to try.

### Caveats

- **The scorer counts failed requests as failures.** The script saves `""` when a request has an error. At the end, the script prints the number of errors. If the number is not zero, run the script again before you compare endpoints. Use a lower `--workers` value if you reach rate limits. `--resume` does *not* retry these prompts, because the script saves the empty responses as completed.
- **Reasoning models:** the scorer reads the whole response. If the thinking text is in `content`, remove it first. Ai2 says they extract the answer and remove the reasoning chain.
- Use the same temperature and token limit for each endpoint that you compare.
- Use IFBench and `ifeval` together. A model can do well on one and badly on the other.

## Your own tests (promptfoo)

For tests on your own task, a small YAML file is better than a leaderboard. This is a sketch.

```yaml
# promptfooconfig.yaml
providers:
  - id: openai:chat:Qwen/Qwen3.8-27B
    config:
      apiBaseUrl: https://api.tokenfactory.nebius.com/v1
      apiKeyEnvar: API_KEY
prompts:
  - "Extract the invoice total as a number: {{text}}"
tests:
  - vars: { text: "Total due: $1,234.50" }
    assert:
      - type: contains
        value: "1234.5"
```

```bash
npx promptfoo@latest eval && npx promptfoo@latest view
```

To compare two endpoints, add a second entry in `providers`. The file runs the same tests on both.

The config keys come from memory of the promptfoo documentation. We did not test them. Check them against the current documentation before you use them.

## Results

| Script | Where to find the results |
| --- | --- |
| `lm_eval.sh` | A table in the terminal. Files in `results/<model>/`: `results_*.json` (scores) and `samples_*.jsonl` (each prompt and answer). |
| `ifbench.sh` | A report in the terminal. Files in `results/ifbench/`: the responses, and the folder `<model>-eval/` with strict and loose scores. |

Git ignores the `results/` folder.

### Read the `lm_eval.sh` table

| Column | Meaning |
| --- | --- |
| `Value` | The score. 0.8 means 80% of the questions were right. |
| `Stderr` | The uncertainty. With few questions, it is large. Use 200 or more questions before you compare endpoints. |

Example from a real run (5 questions, so the Stderr is large):

```text
|gsm8k |flexible-extract|exact_match|0.8|±0.2|
|      |strict-match    |exact_match|0.0|±0.0|
```

- **`gsm8k`:** use `flexible-extract`. The `strict-match` filter wants the answer in the form `#### 18`. Chat models often write "**Answer: $18**" instead. Then `strict-match` shows 0 even when the answers are right. Open `samples_gsm8k_*.jsonl` to see the real answers.
- **`ifeval`:** the table has four rows. They are `prompt_level` and `inst_level`, each with `strict` and `loose`. A prompt counts as right only if all of its instructions are met. An instruction level score counts each instruction by itself. Loose is more forgiving than strict.
- **IFBench:** the paper reports prompt-level loose accuracy. The strict and loose results are in the `eval` folder.

## Problems and solutions

| Problem | Cause and solution |
| --- | --- |
| `Missing BASE_URL` (or another variable) | You did not create `.env`, or it has no value for that variable. Do Step 3. |
| `uv: command not found` | uv is not installed. Do Step 1. |
| Every request fails | Check `BASE_URL` (no `/v1`), `API_KEY`, and `MODEL`. Run the `curl` command in Step 3. |
| Many 429 errors | The provider limits your rate. Use a lower `CONCURRENT` or `WORKERS`. |
| Scores are very low and the answers end in the middle | The token limit is too small for a reasoning model. Increase `MAX_GEN_TOKENS` or `MAX_TOKENS`. |
| `gsm8k` shows `strict-match` 0 | The answer format is different. Read `flexible-extract`. |
| `ifbench.sh` ends with "Errors: N" | Some requests failed. The script saved an empty response for each one, and the scorer counts them as wrong. Run the script again. `--resume` does not retry these. |
| A task name is not found | Run `uv run lm_eval ls tasks` to see the names. |

## Files

| File | Purpose |
| --- | --- |
| `lm_eval.sh`, `ifbench.sh` | The tests |
| `_common.sh` | Loads `.env` and checks the variables |
| `setup_ifbench.sh` | Clones IFBench into `IFBench/`. `ifbench.sh` runs it when needed. |
| `.env.example` | Template for `.env` |
| `pyproject.toml`, `uv.lock` | The dependency list and the locked versions |

## Test status

We ran `./lm_eval.sh gsm8k 5`, `./lm_eval.sh ifeval 5`, and the full `./ifbench.sh` (300 prompts) against a live endpoint, and all worked. We did not run the other `lm_eval.sh` tasks (for example `mmlu_pro`) or a full-size run. If a script fails, tell the repo owner.
