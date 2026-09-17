const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(cents / 100);

async function loadDashboard() {
  const [summaryResponse, transactionsResponse] = await Promise.all([
    fetch("/api/summary"),
    fetch("/api/transactions"),
  ]);

  const summary = await summaryResponse.json();
  const transactionPayload = await transactionsResponse.json();
  const rows = transactionPayload.transactions
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  document.querySelector("#revenue").textContent = money(summary.total_cents);

  const tbody = document.querySelector("#transactions");
  tbody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.created_at.slice(0, 10)}</td>
        <td><code>${row.id}</code></td>
        <td>${row.customer}</td>
        <td><span class="status-pill">${row.status}</span></td>
        <td class="money">${money(row.amount_cents)}</td>
      </tr>`
    )
    .join("");
}

loadDashboard();
