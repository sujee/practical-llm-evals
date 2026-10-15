[Home](../../README.md) › [Benchmarks](../README.md) › [perf](./README.md) › load

# perf: Load Test

The load test (`load.sh`) shows how an endpoint behaves when many clients send requests at the same time. It runs 1, 10, and 50 clients, and answers these questions: Does TTFT get worse? Does tokens/sec per user drop? Does total throughput grow? Do errors or 429 responses occur? It uses [AIPerf](https://github.com/ai-dynamo/aiperf). Do the [setup](./README.md#setup) first.

**Cost:** the full test sends about 560 requests. Start with 1 and 10 clients.

## With an agent

Start a coding agent in this folder (`benchmarks/perf`) and say:

> Run a load test. Start with 1 and 10 clients. Ask me before you run 50 clients.

The agent uses the settings in your `.env`. It follows the runbook in [AGENTS.md](./AGENTS.md). It runs 1 and 10 clients, asks you before the 50-client level, and explains the results in a table. It never reads or prints your API key.

## By hand

```bash
./load.sh 1 10      # first run: 1 and 10 clients
./load.sh           # full test: 1, 10, and 50 clients
```

## The command

`load.sh` prints the command for each client count before it runs it. It hides your API key. This is what it runs:

```bash
for C in 1 10 50; do
  uv run aiperf profile \
    --model "$MODEL" --url "$BASE_URL" --api-key "$API_KEY" \
    --endpoint-type chat --streaming --tokenizer "$TOKENIZER" \
    --isl 1000 --osl 300 \
    --extra-inputs ignore_eos:true min_tokens:300 \
    --concurrency $C --warmup-request-count $C \
    --request-count $((C * 8 < 20 ? 20 : C * 8)) \
    --output-artifact-dir artifacts/c$C
done
```

For each client count C, the script runs C clients, C warmup requests, and 8 requests for each client (20 at minimum). All levels use the same prompt length (1000 tokens) and output length (300 tokens). Then the results are comparable. The script uses 300 output tokens, not 500, to keep the cost of 50 clients low.

## Best practice

- Run `./load.sh 1 10` first. Run `./load.sh` (1, 10, and 50 clients) after you see the trend.
- Report p50 and p90. Add p99 only for runs with 100 or more requests (the 50-client level).
- Run the test again at another time of day. Shared endpoints are noisy.
- Run the client on a VM near the endpoint when the numbers matter.

## Read the 1 → 10 → 50 results

Put the three runs in one table.

| Clients | TTFT p50 | TTFT p90 | TTFT p99 | Tok/s per user | Total output tok/s | Req/s | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | |
| 10 | | | | | | | |
| 50 | | | | | | | |

Use p50 and p90 for tests with fewer than 100 requests. Add p99 for larger tests, such as the 50-client level.

What the results mean:

- **Tok/s per user stays flat and total tok/s grows in a line.** The endpoint scales well.
- **Tok/s per user drops and total tok/s stops growing.** The endpoint reached its capacity. More clients share a fixed pool.
- **TTFT p90 jumps but p50 does not.** Requests wait in a queue. Some requests wait for a free slot.
- **HTTP 429 or timeouts.** The provider limits your rate. Check the limits of your account first. A rate limit is not a capacity limit.

For the caveats, the closed-loop and open-loop explanation, flags, advanced options, and problems, see [load-details.md](./load-details.md).
