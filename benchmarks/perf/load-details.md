[Home](../../README.md) › [Benchmarks](../README.md) › [perf](./README.md) › load details

# perf: Load Test Details

Reference for the [load test](./load.md): closed and open loop, caveats, flags, advanced options, and problems. For other benchmark tools, see [other-tools.md](./other-tools.md).

## Closed loop and open loop

- **Closed loop (`--concurrency N`)**: N clients each send a request, wait for the response, and then send the next one. This models N users at the same time. If the server is slow, the load goes down. **Use this for the 1/10/50 test.**
- **Open loop (`--request-rate R`)**: R requests arrive each second, whatever the state of the server. This models public traffic. Queues can grow without limit. Use it to find the breaking point.

## Caveats

- Your client can be the bottleneck at 50 or more streams on a small laptop or a slow network. If the result is important, run the client on a VM near the endpoint.
- Shared and serverless endpoints have noisy neighbors. Repeat the test at different times.
- 50 clients with long prompts and long outputs cost a lot. Use short outputs for the first test.

## Flags

The load test uses the flags of the [speed test](./speed-details.md#flags). For the load test, set these flags like this:

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--concurrency` | Number of requests in flight (closed loop). | 1 for the speed test. 1, 10, and 50 for the load test. |
| `--request-count` | Total requests to send. | 20–50 for speed. At least 5–10 × the concurrency for load. |
| `--warmup-request-count`, `--warmup-concurrency` | Warmup before the measurement. AIPerf leaves it out of the statistics. | 2–5 for speed. The same as the concurrency for load. |

## Advanced (optional)

You do not need these for a normal test. In these examples, `...` stands for the common flags (`--model`, `--url`, `--api-key`, and others).

### Fixed duration

Run a level for a fixed time. Do not use a fixed request count. `--benchmark-duration` stops new requests after N seconds. AIPerf still counts responses that arrive during the grace period.

```bash
uv run aiperf profile ... --concurrency 50 --benchmark-duration 120 --benchmark-grace-period 30
```

### Open loop (find the limit)

```bash
uv run aiperf profile ... --request-rate 5  --benchmark-duration 60
uv run aiperf profile ... --request-rate 20 --benchmark-duration 60
```

### Goodput with SLO targets

Goodput counts only the requests that meet a latency target. Latency values are in ms. `output_token_throughput_per_user` is in tokens/sec.

```bash
uv run aiperf profile ... --concurrency 50 --request-count 300 \
  --goodput request_latency:15000 inter_token_latency:50
```

The metric tags in the `--help` examples are `request_latency`, `inter_token_latency`, and `output_token_throughput_per_user`.

| Flag | Meaning | Guidance |
| --- | --- | --- |
| `--request-rate` | Target requests per second (open loop). | Increase it until latency or errors become bad. |
| `--benchmark-duration` | Maximum run time in seconds. | 60–120 seconds for each level gives steady-state numbers. |
| `--benchmark-grace-period` | Extra seconds to wait for requests in flight at the end. | 30 seconds for long outputs. |
| `--concurrency-ramp-duration` | Seconds to increase to the target concurrency. | Use it at high concurrency. It prevents a burst of connections at the start. |
| `--request-timeout-seconds` | Timeout for each request. A slower request counts as a failure. | Use a realistic value, for example 120. |
| `--failed-request-threshold` | Stops the run early when the failure ratio exceeds this value. | Saves money when you reach rate limits. |
| `--goodput` | SLO targets for the goodput calculation. | See the example above. |

## Problems and solutions

| Problem | Cause and solution |
| --- | --- |
| Many 429 errors in `load.sh` | The provider limits your rate. Run `./load.sh 1 10`, or check the limits of your account. |

For other problems (missing variables, failed requests, tokenizer), see the [speed test problems](./speed-details.md#problems-and-solutions).
