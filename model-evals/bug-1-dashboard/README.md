# Acme Revenue Dashboard For Testing Agents

A deliberately small but realistic revenue dashboard for an agentic debugging demo.

## How to run the app

Follow [app/README.md](app/README.md)

## The Bug

In [BUG_REPORT.md](BUG_REPORT.md)

Customer Success reported that the **Revenue** card does not match the total of the completed transactions shown in the table.

For the currently seeded data the dashboard currently shows:

- Revenue summary: **$149,000**
- Revenue transaction count: **6**
- Completed transaction table total: **$131,000**
- Completed transactions in table: **4**
- Difference: **$18,000**

## Business rule

Revenue is recognized only for transactions whose status is `completed`.

Transactions with statuses such as `refunded`, `failed`, or `pending` must not contribute to either the revenue total or revenue transaction count.

## Demo

Start the coding agent in **app** directory.  So the agent doesn't have access to this directory with bug reports.

### Prompt 1 (for models that can read image)

Paste image : bug-report.png

```
See the dashboard image for the reported bug.

Investigate the issue in this repository. Reproduce it, identify the root cause, implement the smallest correct fix, add a regression test, run the test suite, and explain what changed.

Do not modify the seed data just to make the totals agree.
```

### Prompt 2 (for text only models)

```
Revenue card says $149,000
But Completed transaction table total is $131,000

Investigate the issue in this repository. Reproduce it, identify the root cause, implement the smallest correct fix, add a regression test, run the test suite, and explain what changed.

Do not modify the seed data just to make the totals agree.
```
