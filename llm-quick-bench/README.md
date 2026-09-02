# Quick LLM Bench

## What is it?

A quick and easy browser-based tool for benchmarking LLM inference endpoints. No spinning up VMs, setting up Python environments, or installing packages.

It measures response speed, token throughput, latency, accuracy, token usage, and estimated cost. Results can be exported as CSV or JSON.

> **Note:** This is designed to be a quick benchmark—hence the name. It is not intended to replace comprehensive benchmarking tools.

## Prerequisites

- The URL of your OpenAI-compatible endpoint
- An API key for that endpoint

## How to run it


[![Try Quick LLM Bench live](https://img.shields.io/badge/TRY_IT_LIVE-Launch_Quick_LLM_Bench-6c5ce7?style=for-the-badge)](https://sujee.github.io/practical-llm-evals/llm-quick-bench/)

Enter your endpoint URL and API key, load the available models, select the models you want to compare, and run a benchmark.

## Develop locally


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
