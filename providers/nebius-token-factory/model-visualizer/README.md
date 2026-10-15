# Nebius Token Factory Models

Visualizations of the models on Token Factory.

## 📊 Visualizations

[View all visualizations live](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/index.html)

- 📈 [Intelligence and Pricing](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#pricing) — AA Intelligence Index and price
- 📅 [Release Timeline](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#release) — AA Intelligence Index and model release date
- 🪜 [Context Frontier](https://sujee.github.io/practical-llm-evals/providers/nebius-token-factory/model-visualizer/#context) — the largest context window over time

## Get the latest model info

[Latest models list file](../data/tf-models-list.json)

The public list is at https://tokenfactory.nebius.com/api/public/models_info

```bash
curl   https://tokenfactory.nebius.com/api/public/models_info
```

You can also use the models API of the OpenAI-compatible endpoint:

```bash
export NEBIUS_API_KEY='api key goes here'

curl --request GET \
  --url https://api.tokenfactory.nebius.com/v1/models?verbose=true \
  --header "Authorization: Bearer $NEBIUS_API_KEY"
  
# format the output
curl --request GET \
  --url https://api.tokenfactory.nebius.com/v1/models?verbose=true \
  --header "Authorization: Bearer $NEBIUS_API_KEY" | jq
```


### Test locally

To test on your computer:

```bash
# run in this folder
python -m http.server 8000
```

Open http://localhost:8000

Do not open `index.html` directly in the browser. It may not work.

## Refresh the models

**1. Update the TF master catalog**

[../data/tf-models-list.json](../data/tf-models-list.json)

```bash
curl   https://tokenfactory.nebius.com/api/public/models_info |  jq > ../data/tf-models-list.json
```

**2. Refresh the AA index**

Ask a coding agent to do this. Start the agent in the folder `providers/nebius-token-factory/`.

```
Use  @data/tf-models-list.json as source.  Research Artificial Analysis Index page https://artificialanalysis.ai/   and update intelligence scores in files @data/tf-models-by-aa-intelligence.csv  and  @data/tf-models-by-aa-intelligence.json.  Remove any models not listed in @data/tf-models-list.json
Print a summary of what is updated.
```


**3. Choose the models to highlight**

Add them to [model-info.json](model-info.json). Ask your coding agent to do this. Start the agent in the folder `providers/nebius-token-factory`.

```
Use @data/tf-models-by-aa-intelligence.json as reference.
Update @model-visualizer/model-info.json.
Calculate blended pricing.
Print out what was updated.
```

**4. Check the result locally**

```bash
# run in this folder
python -m http.server 8000
```

Open http://localhost:8000

Do not open `index.html` directly in the browser. It may not work.
