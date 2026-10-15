#!/usr/bin/env bash
# Speed test with one client. It measures TTFT, inter-token latency, and tokens/sec per user.
# Usage: ./speed.sh [request_count]     (env: ISL default 1000, OSL default 500)
OSL="${OSL:-500}"   # speed test default. load.sh uses 300.
. "$(dirname "$0")/_common.sh"
N="${1:-20}"
run_aiperf "${COMMON[@]}" \
  --concurrency 1 --warmup-request-count 2 --request-count "$N" \
  --output-artifact-dir "artifacts/speed"

echo
uv run python summarize.py artifacts/speed
