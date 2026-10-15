# Acme Revenue Dashboard For Testing Agents

A small, realistic revenue dashboard. It contains a planted bug for a demo of agentic debugging.

## How to run the app

Follow [app/README.md](app/README.md).

## The Bug

The bug report is in [BUG_REPORT.md](BUG_REPORT.md).

Customer Success reported that the **Revenue** card does not match the total of the completed transactions in the table.

With the seeded data, the dashboard shows:

- Revenue summary: **$120,000**
- Completed transaction table total: **$100,000**
- Difference: **$20,000**

## Business rule

The dashboard counts revenue only for transactions with the status `completed`.

Transactions with a status such as `refunded`, `failed`, or `pending` must not add to the revenue total or to the revenue transaction count.

## Demo

Start the coding agent in the **app** folder. Then the agent cannot read the bug reports in this folder.

### Prompt 1 (for models that can read images)

Paste the image `bug-report.png`.

```
See the dashboard image for the reported bug.

Investigate the issue in this repository. Reproduce it, identify the root cause, implement the smallest correct fix, add a regression test, run the test suite, and explain what changed.

Do not modify the seed data just to make the totals agree.
```

### Prompt 2 (for text-only models)

```
Revenue card says $120,000
But Completed transaction table total is $100,000

Investigate the issue in this repository. Reproduce it, identify the root cause, implement the smallest correct fix, add a regression test, run the test suite, and explain what changed.

Do not modify the seed data just to make the totals agree.
```

## Check the fix

Restart the app and check the summary. It must show $100,000.

Run `git status` and `git diff` to see the new tests.
