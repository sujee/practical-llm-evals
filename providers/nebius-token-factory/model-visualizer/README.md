# Nebius Token Factory Models

Some visualizations for Token Factory models.

## 📊 Visualizations!

[All visualizations — view live!](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/index.html)

- 📈 [Intelligence and Pricing](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#pricing) — AA Intelligence Index vs price 
- 📅 [Release Time line](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#release) — AA Intelligence Index vs model release date
- 🪜 [Context Frontier](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#context) — largest context window available over time


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


## Dev Notes

To test locally:

```bash
python -m http.server
```

And go to url : http://localhost:8000/providers/nebius-token-factory/model-visualizer/

(if you just open the index.html in the browser, it may not work well!)