# Dev Notes

## Local testing

```bash
cd llm-quick-bench
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Your API key is used only for the current browser session and is not saved. Requests are sent directly from your browser to the selected endpoint.

## Test

```bash
node --test tests/*.test.js
```

## Model Info

Models meta data is in : [model-info.json](model-info.json)
