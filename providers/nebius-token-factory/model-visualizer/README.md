# Nebius Token Factory Models

Some visualizations for Token Factory models.

## 📊 Visualizations!

[All visualizations — view live!](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/index.html)

- 📈 [Intelligence and Pricing](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#pricing) — AA Intelligence Index vs price 
- 📅 [Release Time line](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#release) — AA Intelligence Index vs model release date
- 🪜 [Context Frontier](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#context) — largest context window available over time


## Getting latest model info

[Latest models list file](../data/tf-models-list.json)

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


### Test Locally

To test locally:

```bash
# from this dir
python -m http.server 8000
```

And go to url : http://localhost:8000

(if you just open the index.html in the browser, it may not work well!)

## Refreshing new models

**1 - update the TF master catalog**

[../data/tf-models-list.json](../data/tf-models-list.json)

```bash
curl   https://tokenfactory.nebius.com/api/public/models_info |  jq > ../data/tf-models-list.json
```

**2 - Refresh AA index**

Ask a coding agent  :-)

In dir `providers/nebius-token-factory/`

```
Use  @data/tf-models-list.json as source.  Research Artificial Analysis Index page https://artificialanalysis.ai/   and update intelligence scores in files @data/tf-models-by-aa-intelligence.csv  and  @data/tf-models-by-aa-intelligence.json.  Remove any models not listed in @data/tf-models-list.json
Print a summary of what is updated.
```


**3 - Pick the models we want to highlight**

add them to [model-info.json](model-info.json)

Ask your coding agent :

In dir: `providers/nebius-token-factory`

```
Use @data/tf-models-by-aa-intelligence.json as reference.
Update @model-visualizer/model-info.json.
Calculate blended pricing.
Print out what was updated.
```

**4 - Verify  locally**

```bash
# from this dir
python -m http.server 8000
```

And go to url : http://localhost:8000

(if you just open the index.html in the browser, it may not work well!)
