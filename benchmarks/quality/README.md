[Home](../../README.md) › [Benchmarks](../README.md) › quality

# quality: Answer-Quality Tests for LLM Endpoints

This project checks if an OpenAI-compatible endpoint gives good answers. It uses [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) and [IFBench](https://github.com/allenai/IFBench). Follow the three steps below: set up, then run the tests with an agent or by hand.

🤖 **Short on time?** You do not need to copy and paste the commands. Let your coding agent do it. See [2. Using an agent](#2-using-an-agent).

| Script | Test | Measures |
| --- | --- | --- |
| `lm_eval.sh` | Tasks from lm-evaluation-harness. The default is `gsm8k` and `ifeval`, 10 questions each. | Math reasoning (`gsm8k`) and instruction following (`ifeval`) |
| `ifbench.sh` | IFBench, 300 prompts | Instruction following with constraints that models did not see before |

For explanations, flags, results, and other tools, see [details.md](./details.md).

**Cost:** quality tests use real tokens. The default of 10 questions is cheap. A full run is not. For example, `gsm8k` has 1,319 questions, and `ifbench.sh` always sends 300 prompts with up to 8,192 output tokens each. Start small.

## 1. Setup

You need macOS or Linux with `bash` and `git`, and an API key for an OpenAI-compatible endpoint.

**Install uv.** This project uses the [uv](https://docs.astral.sh/uv/) package manager.

```bash
# mac
brew install uv

# any platform
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Install the dependencies.** This creates a `.venv` folder and installs lm-evaluation-harness and the packages that IFBench needs.

```bash
cd benchmarks/quality
uv sync
```

**Set your endpoint in `.env`.** Copy the example file. Then edit `.env`. Git ignores `.env`, so your key does not go into the repo.

```bash
cp .env.example .env
```

| Variable | Meaning | Example |
| --- | --- | --- |
| `BASE_URL` | Base URL of the endpoint. No `/v1` at the end. | `https://api.tokenfactory.nebius.com` |
| `API_KEY` | Your API key. | `your_api_key_here` |
| `MODEL` | Model id, as the endpoint lists it. | `Qwen/Qwen3.8-27B` |

Check the `.env` file. The script makes a quick API call and checks your URL, key, and model. It never prints your key.

```bash
./verify-env.sh
```

## 2. Using an agent

Start a coding agent in this folder (`benchmarks/quality`) and say:

> Run a quality test. Use 10 questions for each task.

The agent uses the settings in your `.env`. It follows the runbook in [AGENTS.md](./AGENTS.md). It checks your `.env` without showing the key, runs a small test, asks you before an expensive test, and gives you a summary. It never reads or prints your API key.

## 3. Manual

**lm-evaluation-harness:**

```bash
./lm_eval.sh                       # gsm8k and ifeval, 10 questions each
./lm_eval.sh gsm8k,mmlu_pro 200    # choose the tasks and the number of questions (0 = all)
```

**IFBench** (all 300 prompts, so it uses more tokens):

```bash
./ifbench.sh                       # clones IFBench on the first run, generates responses, scores them
```

The results are in `results/`. For a reasoning model, set a larger token limit first, for example `MAX_GEN_TOKENS=16000 ./lm_eval.sh` or `MAX_TOKENS=16000 ./ifbench.sh`. If not, the thinking can use all tokens and the answer is empty.

## Next

[details.md](./details.md) explains how to read the scores, the flags, problems and solutions, and other tools.
