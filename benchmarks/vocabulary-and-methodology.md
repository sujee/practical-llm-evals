[Home](../README.md) › [Benchmarks](./README.md) › vocabulary

# Benchmark Vocabulary and Methodology

Terms and good practice for all benchmarks in this folder.

## Metric glossary

### Most common metrics

Start with these five.

| Metric | Meaning | Why it matters |
| --- | --- | --- |
| **TTFT** | Time to first token. From request sent to first streamed token. Includes network, queue, and prefill time. | The user waits this long before anything appears. It controls how fast a chat or an agent feels. |
| **Tokens/sec per user** | The decode speed that one client sees. About 1 / ITL. | A person reads at about 5 to 10 tokens/sec. A coding agent needs much more. |
| **E2E latency** | From request sent to last token received. | The user waits this long for a full answer. Agents and batch jobs care about this number. |
| **Output throughput** | Output tokens per second for all clients together. This shows system capacity. | It shows the total work that the endpoint does. A higher number means more capacity. |
| **p50, p90, p99** | Percentiles. Users feel tail latency (p90, p99) under load. See [Percentiles](#percentiles-p50-p90-p95-p99) below. | The average hides slow requests. Percentiles show what the slowest users see. |

### Other metrics

You see these in tool reports and in detailed tests.

| Metric | Meaning | Why it matters |
| --- | --- | --- |
| **ITL** | Inter-token latency. The gap between two streamed tokens. | A high or uneven ITL makes the text stream in jumps. |
| **TPOT** | Time per output token. (End-to-end latency − TTFT) / (output tokens − 1). | It shows the speed of generation, without the start-up delay. |
| **Request throughput** | Completed requests per second. | It shows how many requests the endpoint can finish. Use it to plan capacity. |
| **Goodput** | Throughput of the requests that meet a latency target ([SLO](#other-terms)). | Raw throughput can hide slow requests. Goodput counts only the requests that are fast enough. |

Tools define metrics in different ways. Compare only numbers from the same tool.

### Other terms

| Term | Meaning | Why it matters |
| --- | --- | --- |
| **Prefill** | The model reads the whole prompt before it makes the first token. | A longer prompt makes prefill slower, so TTFT grows. Test long prompts if your workload has them. |
| **Decode** | The model makes the output tokens one after the other. | The decode speed sets tokens/sec and ITL. It decides how long a long answer takes. |
| **Streaming** | The server sends each token when the model makes it. | Without streaming, a client cannot measure TTFT or ITL. Turn it on for speed tests. |
| **Thinking tokens** | Tokens that a reasoning model makes before the answer. | They count as output tokens. They add time and cost, and they change what "first token" means. |
| **ISL, OSL** | Input sequence length and output sequence length. The number of tokens in the prompt and in the answer. | Speed results depend on both. Compare tests only when ISL and OSL are the same. |
| **Concurrency** | The number of requests that are in progress at the same time. | More concurrent requests can make each request slower. This is what the load test measures. |
| **SLO** | Service level objective. A target that you set, for example "TTFT is below 1000 ms". | It turns a number into a pass or fail. Goodput uses it. |
| **Closed loop, open loop** | Two ways to send load. See [Closed loop and open loop](./perf/load-details.md#closed-loop-and-open-loop). | A closed loop slows down when the server is slow. An open loop does not. They show different limits. |

### Percentiles: p50, p90, p95, p99

A percentile is a value that a given share of requests meet or beat. For example, p90 is the value that 90% of requests meet or beat.
To find it, sort all values from smallest to largest. Then read the value at that position.

The example below has the TTFT of 20 requests. Most requests are fast. A few are very slow.

```text
TTFT (ms)      Requests
0 – 300        ███████████ 11   ◄ p50 = 280 ms   (10th of 20)
300 – 400      ████ 4
400 – 600      ██ 2
600 – 1000     █ 1              ◄ p90 = 800 ms   (18th of 20)
1000 – 2000    █ 1              ◄ p95 = 1500 ms  (19th of 20)
2000 – 4000    █ 1              ◄ p99 = 3000 ms  (20th of 20)

mean = 516 ms
```

| Percentile | Meaning | In this example |
| --- | --- | --- |
| **p50** (median) | Half of the requests are faster. Half are slower. This is the typical request. | 280 ms |
| **p90** | 9 of 10 requests are faster. 1 of 10 is slower. | 800 ms |
| **p95** (optional) | 19 of 20 requests are faster. | 1500 ms |
| **p99** | 99 of 100 requests are faster. With only 20 requests, it is the slowest one. | 3000 ms |

What to learn from the example:

- **The mean (516 ms) is not useful.** No request took about 516 ms. The slow requests pull the mean up. Use p50 for the typical case.
- **The tail is the problem.** The p50 is 280 ms, but the p99 is more than 10 times higher. A user who sees the p99 thinks that the service is broken.
- **A user makes many requests.** If a page makes 20 requests, one of them is probably slower than the p90.
- **You need enough requests.** As a rule of thumb, p50 needs about 10 requests, p90 needs about 20, and p99 needs 100 or more. With 20 requests, p99 is just the slowest request.
- **Choose percentiles for the size of the test.** Use p50 and p90 for tests with 20 to 99 requests. Add p99 for larger tests. With only 5 requests, p90 is also the slowest request.

Tools can calculate percentiles in different ways. This example takes the value at the sorted position. Some tools interpolate between two values. The results can differ a little.

## Method tips for all benchmarks

### Tip 1: Control the output length

Tokens/sec comparisons need equal output lengths. Send `min_tokens` and `ignore_eos` if the server supports them. The repo script [simple_speed_test.py](../utils/simple_speed_test.py) does this. Some providers ignore these fields, so check the reported output length.

Example with AIPerf. The report must show an `Output Sequence Length` near 500 tokens. In the examples on this page, `...` stands for the common flags (`--model`, `--url`, `--api-key`, and others).

```bash
aiperf profile ... --osl 500 --extra-inputs ignore_eos:true min_tokens:500
```

### Tip 2: Separate thinking from answers

A reasoning model sends thinking tokens before the answer. TTFT to the first thinking token is different from TTFT to the first answer token. State which one you report, or disable thinking. AIPerf shows both: the rows "Time to First Token" and "Time to First Output Token".

### Tip 3: Warm up, then repeat

The first request can hit a cold model or a cold connection. Discard some warmup requests. Run the test several times at different times of day. Shared endpoints are noisy.

Example with AIPerf. The first 2 requests do not count in the statistics.

```bash
aiperf profile ... --warmup-request-count 2 --request-count 20
```

### Tip 4: Prevent caching

A repeated prompt can hit a prefix cache and show a TTFT that is too low. Use random synthetic prompts for speed tests. Do not use the same random seed for every run. With the same seed, two runs send the same prompts, and the second run can hit the cache. Test caching separately.

Example with AIPerf. Without `--random-seed`, AIPerf uses system entropy, so each run sends different prompts. Set `--random-seed` only when you want to repeat the exact prompts.

```bash
aiperf profile ...                    # different prompts for each run
aiperf profile ... --random-seed 42   # the same prompts for each run
```

### Tip 5: Run the client near the endpoint

A laptop on Wi-Fi adds network latency to TTFT. For serious numbers, use a cloud VM in the same region. Record where you ran the test.

Example. This command measures the path from your machine to the endpoint. The `connect` time is close to the network round trip. The `first byte` and `total` times also include TLS and server time. The `/v1/models` path does not run inference. Run the command from your laptop and from a VM, and compare the `connect` numbers.

```bash
curl -s -o /dev/null "$BASE_URL/v1/models" -H "Authorization: Bearer $API_KEY" \
  -w "connect: %{time_connect}s  first byte: %{time_starttransfer}s  total: %{time_total}s\n"
```

### Tip 6: Report errors

Show the error rate and the 429 responses (HTTP "too many requests") next to latency. A throughput number that ignores failed requests is misleading.

### Tip 7: Record the setup

Save the tool version, prompt and output lengths, concurrency, date, and region with each result.

Example. Keep a note like this with each result file.

```text
date:        2026-10-13
tool:        aiperf 0.13.0
endpoint:    https://api.tokenfactory.nebius.com
model:       Qwen/Qwen3.8-27B
client:      VM, same region as the endpoint
test:        ISL 1000, OSL 300, concurrency 10, 100 requests
```

### Tip 8: Control cost

Benchmarks use real tokens. Start with small request counts.

Example. Do a first run with 5 requests. Increase the count only after the result looks right.

```bash
aiperf profile ... --concurrency 1 --request-count 5
```
