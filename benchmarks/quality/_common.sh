# The other scripts source this file. It loads .env and checks the required variables.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
for v in BASE_URL API_KEY MODEL; do
  if [ -z "${!v:-}" ]; then echo "Missing $v. Copy .env.example to .env and set the value." >&2; exit 1; fi
done
