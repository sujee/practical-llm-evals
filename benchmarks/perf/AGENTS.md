# AGENTS.md — perf

Instructions for agents that run the speed test and the load test in this folder. The [benchmarks rules](../AGENTS.md) and the [root rules](../../AGENTS.md) also apply.

The user normally starts you in this folder (`benchmarks/perf/`). If not, change to it. The endpoint settings (URL, model, key) are in `.env`. The user can also give the URL or the model in the prompt. Then use those values.

## Rules for secrets

- Never read, print, or edit the API key. Do not run `cat .env`, `echo $API_KEY`, or a command that shows the value.
- Never ask the user to paste a key in the chat. The user puts the key in `.env`.
- Use `./verify-env.sh` to check the settings. It makes a quick API call. It prints only OK or FAILED, never a value.

## Setup (for every task)

1. **Install.** Run `uv --version`. If uv is not installed, tell the user to install it (see [README.md](./README.md#setup)). Then run `uv sync`.
2. **Set up `.env`.** If `.env` does not exist, copy `.env.example` to `.env`. Write the values that the user gave you: `BASE_URL` (no trailing `/v1`) and `MODEL`. If a value is missing, ask for it. Write `TOKENIZER` yourself: it is a Hugging Face tokenizer id, so use the tokenizer of the model. If you do not know it, use one from the same model family. Tell the user which one you chose. Leave `API_KEY` for the user. If the key is in an environment variable, tell the user to add it to `.env`.
3. **Check the settings.** Run `./verify-env.sh`. If a check shows FAILED, tell the user what failed and how to fix `.env`. Stop until the user does.

The tests use real tokens. Start with a small test. Ask the user before an expensive test. If the user approves the cost in the prompt, do not ask again.

## Task: "Do a speed test"

1. Do the setup above.
2. **Run a small test.** Run `./speed.sh 5`. If it fails, see "Failures" below.
3. **Run the full test.** Run `./speed.sh`. It sends 20 requests and costs few tokens. At the end, the script prints a summary (it runs `summarize.py`).
4. **Report.** Write the final output (see "Final output" below). Use the summary as your data.

Do not run `./load.sh` unless the user asks for a load test.

### Speed data

`./speed.sh` ends with a summary from `summarize.py`. This is your data. Do not paste it as the final answer. It reads `artifacts/speed/profile_export_aiperf.json`. To print it again, run `uv run python summarize.py`. This is an example of the data from a real run:

```text
Speed summary: deepseek-ai/DeepSeek-V4.1-Flash at https://api.tokenfactory.nebius.com
Date: 2026-10-13   Tool: aiperf 0.13.0
Test: 1 client(s), ISL 1,000, OSL 500, 20 requests (2 warmup)

TTFT p50 / p90 (ms):              712 / 798
Inter-token latency p50 (ms):     4.2
Tokens/sec per user p50:          237
Request latency p50 / p90 (ms):   2,783 / 3,954
Output sequence length (mean):    499.9
Errors:                           0 of 20

Notes:
- Reasoning model: about 98% of the output tokens are thinking tokens. ...
```

Add one line, "Client: <where you ran it>" (for example, a laptop or a cloud VM), because network latency is part of TTFT.

Rules for the numbers:
- Check that the output sequence length is near 500. If it is much lower, say that the server ignored `ignore_eos`, and that the tokens/sec number is not reliable.
- Use p50 and p90. With 20 requests, do not report p99.
- Keep the notes that the summary prints. They explain thinking tokens and cache reads.
- Do not add numbers that are not in the AIPerf output.
- Say how the numbers compare with the user's expectations only if the user gave a target.

## Task: "Do a load test"

1. Do the setup above.
2. **Run the small test.** Run `./load.sh 1 10`. It sends about 100 requests.
3. **Ask before the 50-client level.** It sends about 450 more requests (with warmup). Tell the user the cost and get approval.
4. **Run it.** After approval, run `./load.sh 50`.
5. **Report.** Run `uv run python summarize.py artifacts/c1 artifacts/c10 artifacts/c50` (use the folders that exist). Use one table of data, with one row for each client count:

```text
Clients | TTFT p50 / p90 (ms) | Tokens/sec per user p50 | Output tokens/sec (all) | Requests/sec | Errors
```

Rules for the load numbers:
- Add a short reading. If tokens/sec per user stays flat and total throughput grows, the endpoint scales well. If total throughput stops growing, the endpoint reached its capacity. Say if TTFT p90 jumps, and if there are 429 errors or timeouts. See [load.md](./load.md#read-the-1--10--50-results).
- Add p99 only for a run with 100 or more requests.
- A 429 error is a rate limit, not a capacity limit. Say so.
- The client can be the bottleneck at 50 clients on a laptop. Say where you ran the test.
- Do not add numbers that are not in the output.

## Final output

Write the final answer for a person, not for a log file. Use plain words and short sentences. Explain each number. Use this layout for the speed test and the load test:

1. **Title:** the test, the model, and the endpoint.
2. **Result:** one or two sentences in plain words.
3. **Table** with three columns: Metric, Value, What it means. Write one short sentence of explanation for each row. For the load test, use one row for each client count and add a column for each key number.
4. **Notes:** one sentence for each note (thinking tokens, cache reads, errors, output length). Say what the note means for the numbers.
5. **Setup:** clients, input and output tokens, number of requests, date, tool version, and where you ran the client.
6. **Next step:** one suggestion, for example the load test after a speed test.

Example for the speed test (the values are an example):

```markdown
## Speed test: Qwen/Qwen3.8-27B at https://api.tokenfactory.nebius.com

**Result:** The first token arrives after about 0.6 seconds. After that, one user receives about 300 tokens each second.

| Metric | Value | What it means |
| --- | --- | --- |
| Time to first token (p50 / p90) | 579 / 617 ms | Half of the requests got the first token in 579 ms or less. 9 of 10 got it in 617 ms or less. |
| Tokens per second for one user (p50) | 294 | A typical user sees about 294 tokens each second after the first token. |
| Request latency (p50 / p90) | 2.3 s / 2.4 s | A full answer of 500 tokens takes about 2.3 seconds. |
| Errors | 0 of 5 | All requests worked. |

**Notes**
- The model is a reasoning model. Almost all output tokens are thinking tokens. The first token can be a thinking token, so it is not the time to the answer.
- The endpoint read some prompt tokens from its cache. TTFT can be a little too low for those requests.

**Setup:** 1 client, 1000 input tokens, 500 output tokens, 5 requests, 2025-01-01, aiperf 0.13.0, client on a laptop.

**Next step:** Run the load test (`./load.sh 1 10`) to see what happens with more users.
```

For the load test, end the result with a short reading. Say if the endpoint scales well. Say where it reaches its capacity. Say if there are rate limits (429).

## Failures

| Symptom | Action |
| --- | --- |
| `verify-env.sh` shows FAILED | Read the hint on the line. Ask the user to fix the value in `.env`. |
| All requests fail | Check the status code only. Run `set -a; . ./.env; set +a; curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/v1/models" -H "Authorization: Bearer $API_KEY"`. Check that `BASE_URL` has no `/v1` and that `MODEL` is in the model list. |
| 401 or 403 | The key is wrong or has no access. Ask the user to check it. |
| 429 | The provider limits the rate. Wait, and run `./speed.sh 5` again. |
| 429 errors during `load.sh` | Report the rate limit. Run a lower client count, and do not retry in a loop. |
| Tokenizer download fails | Use another tokenizer from the same model family. |
| Output length much lower than 500 | Report it. Do not hide it. |

If a script has a bug, tell the user what failed. Do not change the scripts to make a test pass.

## More information

- [vocabulary-and-methodology.md](../vocabulary-and-methodology.md): the meaning of a metric
- [speed.md](./speed.md) and [load.md](./load.md): how to run each test and read the results
- [speed-details.md](./speed-details.md) and [load-details.md](./load-details.md): caveats, flags, advanced options, and problems
- [other-tools.md](./other-tools.md): other benchmark tools
