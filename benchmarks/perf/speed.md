[Home](../../README.md) › [Benchmarks](../README.md) › [perf](./README.md) › speed

# perf: Speed Test

The speed test (`speed.sh`) measures what one client sees. It measures the time until the first token arrives (TTFT) and how fast tokens stream after that (tokens/sec, ITL). It uses [AIPerf](https://github.com/ai-dynamo/aiperf). Do the [setup](./README.md#setup) first.

**Cost:** the test sends 20 requests. Start with 5.

## With an agent

Start a coding agent in this folder (`benchmarks/perf`) and say:

> Do a speed test.

The agent uses the settings in your `.env`. It follows the runbook in [AGENTS.md](./AGENTS.md). It runs 5 requests, then the full test of 20 requests, and explains the results. It never reads or prints your API key.

## By hand

```bash
./speed.sh 5        # first run: 5 requests
./speed.sh          # full test: 20 requests
```

To change the prompt or output length, set `ISL` or `OSL` first. For example: `ISL=8000 ./speed.sh`.

## The command

`speed.sh` prints this command before it runs it. It hides your API key.

```bash
uv run aiperf profile \
  --model "$MODEL" --url "$BASE_URL" --api-key "$API_KEY" \
  --endpoint-type chat --streaming --tokenizer "$TOKENIZER" \
  --isl 1000 --osl 500 \
  --extra-inputs ignore_eos:true min_tokens:500 \
  --concurrency 1 --warmup-request-count 2 --request-count 20 \
  --output-artifact-dir artifacts/speed
```

| Setting | Value | Why |
| --- | --- | --- |
| Clients | 1 | This is a single-user test. For more clients, use the [load test](./load-details.md). |
| Input tokens (`--isl`) | 1000 | A typical prompt. |
| Output tokens (`--osl`) | 500 | A long output gives stable tokens/sec numbers. |
| Warmup requests | 2 | AIPerf leaves them out of the statistics. See [Tip 3](../vocabulary-and-methodology.md#tip-3-warm-up-then-repeat). |
| Requests | 20 | Enough for p50 and p90. Not enough for p99. |
| Streaming | On | Needed to measure TTFT and ITL. |
| Output length | Forced | `ignore_eos` and `min_tokens` make the model produce the full length. See [Tip 1](../vocabulary-and-methodology.md#tip-1-control-the-output-length). |

The prompts are random, and each run uses new prompts. This stops a prefix cache from making TTFT too low. See [Tip 4](../vocabulary-and-methodology.md#tip-4-prevent-caching).

To change the lengths, set `ISL` and `OSL` before the script. For example: `ISL=8000 ./speed.sh`.

## Best practice

- Run `./speed.sh 5` first, and then `./speed.sh`.
- Report p50 and p90. With 20 requests, p99 is just the slowest request.
- Check that `Output Sequence Length` in the report is near 500.
- Run the test again at another time of day. Shared endpoints are noisy.
- Run the client near the endpoint when the numbers matter. A laptop adds network time.
- Record the setup. See [Tip 7](../vocabulary-and-methodology.md#tip-7-record-the-setup).

## Read the results

| Report row | What it shows |
| --- | --- |
| Time to First Token (ms) | Responsiveness. p50 is typical. p90 is the slow tail. See [TTFT](../vocabulary-and-methodology.md#most-common-metrics) and [percentiles](../vocabulary-and-methodology.md#percentiles-p50-p90-p95-p99). |
| Inter Token Latency (ms) | How smooth the stream is. |
| Output Token Throughput Per User (tokens/sec/user) | **The tokens/sec that a user sees** for one stream. |
| Output Token Throughput (tokens/sec) | The total for all clients. Use it for the load test. |
| Request Latency (ms) | Total time for the request. |
| Output Sequence Length | The token count that the model produced. It must be near 500. If it is much lower, the server ignored `ignore_eos`. Then the tokens/sec comparison is not reliable. |

For the caveats (thinking tokens, chunked tokens), flags, advanced options, and problems, see [speed-details.md](./speed-details.md).
