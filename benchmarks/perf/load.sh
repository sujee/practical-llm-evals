#!/usr/bin/env bash
# Load test with 1, 10, and 50 concurrent clients (closed loop). Each level uses the same prompt and output lengths.
# Usage: ./load.sh [levels...]          (default: 1 10 50; env: ISL, OSL)
. "$(dirname "$0")/_common.sh"
LEVELS=("$@"); [ ${#LEVELS[@]} -eq 0 ] && LEVELS=(1 10 50)
for C in "${LEVELS[@]}"; do
  N=$((C * 8)); [ "$N" -lt 20 ] && N=20      # 8 requests for each client, 20 at minimum
  echo "=== concurrency $C ($N requests) ==="
  run_aiperf "${COMMON[@]}" \
    --concurrency "$C" --warmup-request-count "$C" --request-count "$N" \
    --output-artifact-dir "artifacts/c$C"
done

echo
uv run python summarize.py $(for C in "${LEVELS[@]}"; do echo "artifacts/c$C"; done)
