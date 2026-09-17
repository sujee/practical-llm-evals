import json
from datetime import datetime
from pathlib import Path

from .models import Transaction

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "transactions.json"


def load_transactions() -> list[Transaction]:
    raw = json.loads(DATA_FILE.read_text())
    return [
        Transaction(
            id=item["id"],
            customer=item["customer"],
            amount_cents=item["amount_cents"],
            status=item["status"],
            created_at=datetime.fromisoformat(item["created_at"].replace("Z", "+00:00")),
        )
        for item in raw
    ]
