#!/usr/bin/env bash
# Runs lm-evaluation-harness against the endpoint.
# Usage: ./lm_eval.sh [tasks] [limit]     default: gsm8k,ifeval  10   (use limit 0 for the full set)
. "$(dirname "$0")/_common.sh"
TASKS="${1:-gsm8k,ifeval}"
LIMIT="${2:-10}"
export OPENAI_API_KEY="$API_KEY"
ARGS=()
[ "$LIMIT" != "0" ] && ARGS+=(--limit "$LIMIT")
uv run lm_eval run \
  --model local-chat-completions \
  --model_args "model=$MODEL,base_url=$BASE_URL/v1/chat/completions,num_concurrent=${CONCURRENT:-8},max_retries=3" \
  --tasks "$TASKS" \
  --apply_chat_template \
  --gen_kwargs "temperature=0,max_gen_toks=${MAX_GEN_TOKS:-4096}" \
  --output_path results/ --log_samples \
  ${ARGS[@]+"${ARGS[@]}"}
