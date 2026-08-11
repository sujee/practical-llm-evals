# Nebius Token Factory Models

Some visualizations for Token Factory models.

## 📊 Visualizations!

[All visualizations — view live!](https://sujee.github.io/practical-llm-evals/inference/nebius-token-factory/)

- 📈 [Intelligence and Pricing](https://sujee.github.io/practical-llm-evals/inference/nebius-token-factory/#pricing) — AA Intelligence Index vs price 
- 📅 [Release Time line](https://sujee.github.io/practical-llm-evals/inference/nebius-token-factory/#release) — AA Intelligence Index vs model release date
- 🪜 [Context Frontier](https://sujee.github.io/practical-llm-evals/inference/nebius-token-factory/#context) — largest context window available over time

## Getting Model Info

[Latest models list file](tf-models-list.json)

Available here : https://tokenfactory.nebius.com/api/public/models_info  

```bash
curl   https://tokenfactory.nebius.com/api/public/models_info
```

You can also use chat completions API as below

```bash
export NEBIUS_API_KEY='api key goes here'

curl --request GET \
  --url https://api.tokenfactory.nebius.com/v1/models?verbose=true \
  --header "Authorization: Bearer $NEBIUS_API_KEY"
  
# format better
curl --request GET \
  --url https://api.tokenfactory.nebius.com/v1/models?verbose=true \
  --header "Authorization: Bearer $NEBIUS_API_KEY" | jq
```