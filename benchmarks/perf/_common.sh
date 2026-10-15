# The other scripts source this file. It loads .env and checks the required variables.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
for v in BASE_URL API_KEY MODEL TOKENIZER; do
  if [ -z "${!v:-}" ]; then echo "Missing $v. Copy .env.example to .env and set the value." >&2; exit 1; fi
done
# Settings for the speed and load runs. Set an environment variable to change them.
ISL="${ISL:-1000}"   # input tokens
OSL="${OSL:-300}"    # output tokens
COMMON=(
  --model "$MODEL" --url "$BASE_URL" --api-key "$API_KEY"
  --endpoint-type chat --streaming --tokenizer "$TOKENIZER"
  --isl "$ISL" --osl "$OSL"
  --extra-inputs ignore_eos:true "min_tokens:$OSL"
)

# Prints the AIPerf command (the API key is hidden), then runs it.
run_aiperf() {
  local prev="" a
  printf 'Running: uv run aiperf profile'
  for a in "$@"; do
    if [ "$prev" = "--api-key" ]; then printf " '<hidden>'"; else printf ' %q' "$a"; fi
    prev="$a"
  done
  printf '\n\n'
  uv run aiperf profile "$@"
}
