# Acme Revenue Dashboard

A small, realistic revenue dashboard for a demo of agentic debugging.

## Business rule

The dashboard counts revenue only for transactions with the status `completed`.

Transactions with a status such as `refunded`, `failed`, or `pending` must not add to the revenue total.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open http://127.0.0.1:8000

## Tests

```bash
pytest -q
```
