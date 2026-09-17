from datetime import date
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .services import summarize_day, transactions_for_day
from .store import load_transactions

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "static"

app = FastAPI(title="Acme Revenue Dashboard")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/summary")
def get_summary(report_date: date | None = Query(default=None, alias="date")):
    return summarize_day(load_transactions(), report_date)


@app.get("/api/transactions")
def get_transactions(report_date: date | None = Query(default=None, alias="date")):
    rows = transactions_for_day(load_transactions(), report_date)
    return {
        "date": report_date.isoformat() if report_date else None,
        "transactions": [
            {
                "id": tx.id,
                "customer": tx.customer,
                "amount_cents": tx.amount_cents,
                "status": tx.status,
                "created_at": tx.created_at.isoformat(),
            }
            for tx in rows
        ],
    }
