# AGENTS.md — quality

Instructions for agents that run the quality tests in this folder. The [benchmarks rules](../AGENTS.md) and the [root rules](../../AGENTS.md) also apply.

The user normally starts you in this folder (`benchmarks/quality/`). If not, change to it. The endpoint settings (URL, model, key) are in `.env`. The user can also give the URL or the model in the prompt. Then use those values.

## Rules for secrets

- Never read, print, or edit the API key. Do not run `cat .env`, `echo $API_KEY`, or a command that shows the value.
- Never ask the user to paste a key in the chat. The user puts the key in `.env`.
- Use `./verify-env.sh` to check the settings. It makes a quick API call. It prints only OK or FAILED, never a value.

## Setup (for every task)

1. **Install.** Run `uv --version`. If uv is not installed, tell the user to install it (see [README.md](./README.md#1-setup)). Then run `uv sync`.
2. **Set up `.env`.** If `.env` does not exist, copy `.env.example` to `.env`. Write only the values that the user gave you: `BASE_URL` (no trailing `/v1`) and `MODEL`. If a value is missing, ask for it. Leave `API_KEY` for the user. If the key is in an environment variable, tell the user to add it to `.env`.
3. **Check the settings.** Run `./verify-env.sh`. If a check shows FAILED, tell the user what failed and how to fix `.env`. Stop until the user does.

The tests use real tokens. Start with a small test. Ask the user before an expensive test. If the user approves the cost in the prompt, do not ask again.

## Task: "Do a quality test"

1. Do the setup above.
2. **Run the small test.** Run `./lm_eval.sh`. It runs `gsm8k` and `ifeval` with 10 questions each.
3. **Report the scores.** Write the final output (see "Final output" below). Use the `Value` and `Stderr` of each row as your data. Use these rules:
   - For `gsm8k`, report `flexible-extract`. The `strict-match` row is often 0 for chat models, because they do not write the answer as `#### 18`. Say this, and do not report 0 as the quality of the model.
   - For `ifeval`, report the four rows (prompt level and instruction level, strict and loose).
   - With 10 questions, the Stderr is large. Say that this is a smoke test, not a comparison.
4. **Ask before a bigger test.** A larger `lm_eval.sh` run (for example 200 questions) and `./ifbench.sh` (300 prompts, up to 8,192 output tokens each) use many tokens. Tell the user the cost and get approval.
5. **IFBench.** After approval, run `./ifbench.sh`. Report the prompt-level and instruction-level scores, strict and loose. The paper reports prompt-level loose accuracy. Report the line "Empty responses: N of 300". The scorer counts empty responses as failures, so the scores are too low if N is not zero.

For a reasoning model, the default token limits can cut off the answers. If the scores are very low and the answers end in the middle (or are empty), tell the user, and suggest a larger `MAX_GEN_TOKENS` or `MAX_TOKENS`.

Do not add numbers that are not in the output.

## Final output

Write the final answer for a person, not for a log file. Use plain words and short sentences. Explain each number. Use this layout:

1. **Title:** the test, the model, and the endpoint.
2. **Result:** one or two sentences in plain words. Say if the test is a smoke test or a comparison.
3. **Table** with three columns: Test, Score, What it means. Write one short sentence of explanation for each row.
4. **Notes:** one sentence for each note (strict-match scores of 0, empty responses, cut-off answers). Say what the note means for the scores.
5. **Setup:** tasks, number of questions, token limit, date, and tool version.
6. **Next step:** one suggestion, for example a larger run with 200 questions.

Example (the values are an example):

```markdown
## Quality test: Qwen/Qwen3.8-27B at https://api.tokenfactory.nebius.com

**Result:** This is a smoke test with 5 questions for each task. It shows that the endpoint works. The scores are not reliable yet.

| Test | Score | What it means |
| --- | --- | --- |
| gsm8k (flexible-extract) | 0.8 ± 0.2 | 4 of 5 math problems were right. With 5 questions, the uncertainty is large. |
| ifeval, prompt level (strict) | 0.8 ± 0.2 | In 4 of 5 prompts, the model followed all instructions. |
| ifeval, instruction level (strict) | 0.625 | About 6 of 10 single instructions were followed. |

**Notes**
- gsm8k `strict-match` shows 0. The model writes "**Answer: $18**" and not "#### 18". The answers are right, so do not use this row.

**Setup:** gsm8k and ifeval, 5 questions each, token limit 4096, 2025-01-01, lm-evaluation-harness.

**Next step:** Run `./lm_eval.sh gsm8k,ifeval 200` for a score that you can compare.
```

## Failures

| Symptom | Action |
| --- | --- |
| `verify-env.sh` shows FAILED | Read the hint on the line. Ask the user to fix the value in `.env`. |
| All requests fail | Check the status code only. Run `set -a; . ./.env; set +a; curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/v1/models" -H "Authorization: Bearer $API_KEY"`. Check that `BASE_URL` has no `/v1` and that `MODEL` is in the model list. |
| 401 or 403 | The key is wrong or has no access. Ask the user to check it. |
| 429 | The provider limits the rate. Use a lower `CONCURRENT` or `WORKERS`, and run the test again. |
| A task name is not found | Run `uv run lm_eval ls tasks` to see the names. |

If a script has a bug, tell the user what failed. Do not change the scripts to make a test pass.

## More information

- [details.md](./details.md): how to read the scores, flags, and other tools
- [vocabulary-and-methodology.md](../vocabulary-and-methodology.md): the meaning of a term
