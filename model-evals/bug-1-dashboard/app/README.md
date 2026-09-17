# Acme Revenue Dashboard

A deliberately small but realistic revenue dashboard for an agentic debugging demo.


## Business rule

Revenue is recognized only for transactions whose status is `completed`.

Transactions with statuses such as `refunded`, `failed`, or `pending` must not contribute to the revenue total.

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
