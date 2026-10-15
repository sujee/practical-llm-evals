#!/usr/bin/env bash
# Verifies the .env file with real calls. It never prints a value of .env.
#   1. All variables are set.
#   2. GET /v1/models works (URL and key are right).
#   3. MODEL is in the model list.
#   4. A chat request with 1 output token works (MODEL works).
# Exit code 0: all checks passed. Exit code 1: a check failed.
cd "$(dirname "$0")"
REQUIRED="BASE_URL API_KEY MODEL"
CHECK_TOKENIZER=0

if [ ! -f .env ]; then
  echo ".env: MISSING (copy .env.example to .env)"; exit 1
fi
set -a; . ./.env; set +a

fail=0
ok()   { printf '%-34s OK%s\n' "$1" "${2:+ ($2)}"; }
bad()  { printf '%-34s FAILED%s\n' "$1" "${2:+ ($2)}"; fail=1; }

for v in $REQUIRED; do
  val="${!v:-}"
  if [ -z "$val" ] || [ "$val" = "your_api_key_here" ]; then bad "$v" "missing"; else ok "$v" "set"; fi
done
[ "$fail" = 1 ] && { echo; echo "Set the missing values in .env and run this again."; exit 1; }

BASE="${BASE_URL%/}"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT

# 2. Model list
code=$(curl -s --max-time 30 -o "$tmp" -w "%{http_code}" "$BASE/v1/models" -H "Authorization: Bearer $API_KEY")
if [ "$code" = "200" ]; then
  ok "GET /v1/models" "$code"
  # 3. Model in list
  if MODEL_ID="$MODEL" python3 -c 'import json,os,sys; d=json.load(open(sys.argv[1])); ids=[m.get("id") for m in d.get("data",[])]; sys.exit(0 if os.environ["MODEL_ID"] in ids else 1)' "$tmp" 2>/dev/null; then
    ok "MODEL is in the model list"
  else
    bad "MODEL is in the model list" "not found. Check MODEL"
  fi
else
  case "$code" in
    401|403) hint="the API key is wrong or has no access" ;;
    404)     hint="check BASE_URL. It must have no /v1 at the end" ;;
    000)     hint="no connection. Check BASE_URL and your network" ;;
    *)       hint="unexpected status" ;;
  esac
  bad "GET /v1/models" "$code: $hint"
fi

# 4. One-token chat request
code=$(curl -s --max-time 60 -o /dev/null -w "%{http_code}" "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Hi\"}],\"max_tokens\":1}")
if [ "$code" = "200" ]; then ok "Chat request (1 token)" "$code"; else bad "Chat request (1 token)" "$code"; fi

# 5. Tokenizer
if [ "$CHECK_TOKENIZER" = 1 ]; then
  code=$(curl -s --max-time 30 -o /dev/null -w "%{http_code}" "https://huggingface.co/$TOKENIZER/resolve/main/tokenizer.json")
  case "$code" in
    200|302|307) ok "Tokenizer on Hugging Face" ;;
    401|403)     bad "Tokenizer on Hugging Face" "$code: gated. Use another tokenizer of the same family" ;;
    404)         bad "Tokenizer on Hugging Face" "404: not found. Check TOKENIZER" ;;
    *)           bad "Tokenizer on Hugging Face" "$code" ;;
  esac
fi

echo
if [ "$fail" = 0 ]; then echo "All checks passed."; else echo "Some checks failed. Fix .env and run this again."; fi
exit $fail
