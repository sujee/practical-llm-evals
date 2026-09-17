from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Transaction:
    id: str
    customer: str
    amount_cents: int
    status: str
    created_at: datetime
