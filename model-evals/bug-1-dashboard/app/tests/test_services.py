from datetime import date, datetime, timezone

from app.models import Transaction
from app.services import completed_transactions_for_day, summarize_day
from app.store import load_transactions


def test_transaction_table_only_returns_completed_transactions():
    rows = completed_transactions_for_day(load_transactions(), date(2026, 9, 15))
    assert [tx.id for tx in rows] == ["txn_1002", "txn_1003", "txn_1004"]
    assert sum(tx.amount_cents for tx in rows) == 12_200_000


def test_summary_calculates_completed_revenue_for_simple_day():
    transactions = [
        Transaction(
            id="txn_test_1",
            customer="Example Co",
            amount_cents=250_000,
            status="completed",
            created_at=datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc),
        ),
        Transaction(
            id="txn_test_2",
            customer="Demo Labs",
            amount_cents=350_000,
            status="completed",
            created_at=datetime(2026, 9, 14, 15, 0, tzinfo=timezone.utc),
        ),
    ]

    summary = summarize_day(transactions, date(2026, 9, 14))
    assert summary["transaction_count"] == 2
    assert summary["total_cents"] == 600_000
