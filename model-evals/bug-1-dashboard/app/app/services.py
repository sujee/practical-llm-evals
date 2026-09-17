from datetime import date

from .models import Transaction


def transactions_for_day(
    transactions: list[Transaction], target_date: date | None
) -> list[Transaction]:
    """Return all transactions, optionally filtered to a reporting day."""
    if target_date is None:
        return list(transactions)
    return [tx for tx in transactions if tx.created_at.date() == target_date]


def completed_transactions_for_day(
    transactions: list[Transaction], target_date: date
) -> list[Transaction]:
    """Return completed transactions for the requested reporting day."""
    return [
        tx
        for tx in transactions
        if tx.created_at.date() == target_date and tx.status == "completed"
    ]


def summarize_day(
    transactions: list[Transaction], target_date: date | None
) -> dict:
    """Return revenue summary metrics, optionally scoped to a reporting day."""
    matching = transactions_for_day(transactions, target_date)

    total_cents = sum(tx.amount_cents for tx in matching)
    return {
        "date": target_date.isoformat() if target_date else None,
        "transaction_count": len(matching),
        "total_cents": total_cents,
    }
