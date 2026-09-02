# Repository Instructions

## Testing

After every change, run the full test suite before reporting the work complete:

```bash
node --test tests/*.test.js
```

If the tests fail, fix the failure and rerun the full suite. If the suite cannot be run, clearly report why.

## Versioning

The application version is the positive integer `LLM_QUICK_BENCH_VERSION` value in `version.js`. It is displayed with a `v` prefix, such as `v2`.

Do not increment the version for ordinary commits. Increment it by exactly one only when publishing. Use integers only—never semantic versions, decimals, or dotted version strings. A publish must contain exactly one version increment, regardless of how many commits it includes.

## Git Discipline

Never commit or push automatically. Always ask the user for explicit approval before each commit and before each push.

## Publishing

Publishing happens only from the `main` branch and its worktree.

After the user explicitly approves publishing completed and tested work from another branch:

1. Ensure the completed work is committed on the working branch. Ordinary work commits do not change the version.
2. Increment the version by exactly one and commit that publishing change on the working branch, after obtaining explicit commit approval.
3. Verify that the `main` worktree is clean.
4. Merge the working branch into `main` from the `main` worktree.
5. Run the full test suite in the `main` worktree.
6. Ask for explicit push approval, then push `main` to `origin`.

Do not publish by pushing a feature or working branch instead of `main`.
