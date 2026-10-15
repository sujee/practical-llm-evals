#!/usr/bin/env bash
# IFBench. Generates responses from the endpoint, then scores them.
# Usage: ./ifbench.sh            (env: MAX_TOKENS default 8192, WORKERS default 8)
. "$(dirname "$0")/_common.sh"
[ -d IFBench ] || ./setup_ifbench.sh
OUT="$PWD/results/ifbench"; mkdir -p "$OUT"
SAFE="${MODEL//\//-}"
PROJECT="$PWD"
cd IFBench
# Run in the IFBench folder, so that its imports and data paths work. The dependencies come from the environment of this project.
uv run --project "$PROJECT" python generate_responses.py \
  --api-base "$BASE_URL/v1" --api-key "$API_KEY" --model "$MODEL" \
  --temperature 0 --max-tokens "${MAX_TOKENS:-8192}" --workers "${WORKERS:-8}" \
  --output-file "$OUT/$SAFE-responses.jsonl"
uv run --project "$PROJECT" python -m run_eval \
  --input_data=data/IFBench_test.jsonl \
  --input_response_data="$OUT/$SAFE-responses.jsonl" \
  --output_dir="$OUT/$SAFE-eval"

# Count empty responses. The scorer counts them as failures.
uv run --project "$PROJECT" python - "$OUT/$SAFE-responses.jsonl" <<'PY'
import json, sys
rows = [json.loads(line) for line in open(sys.argv[1])]
empty = sum(1 for r in rows if not r["response"].strip())
print(f"\nEmpty responses: {empty} of {len(rows)}")
if empty:
    print("The scorer counts empty responses as failures. A reasoning model can use all output tokens for thinking.")
    print("Increase MAX_TOKENS and run again, or check the sample answers.")
PY
