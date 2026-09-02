# Repository Instructions

## Testing

After every change, run the full test suite before reporting the work complete:

```bash
node --test tests/*.test.js
```

If the tests fail, fix the failure and rerun the full suite. If the suite cannot be run, clearly report why.

## Versioning

The application version is the `LLM_QUICK_BENCH_VERSION` value in `version.js` and follows semantic versioning.

Every commit must increase the version. Use a patch increment by default; use a minor or major increment when the change warrants it or the user requests it. Include the version update in the same commit as the associated changes.

## Publishing

Publishing happens only from the `main` branch and its worktree.

After completing and testing work on any other branch:

1. Commit the work, including its version increment, on the working branch.
2. Verify that the `main` worktree is clean.
3. Merge the working branch into `main` from the `main` worktree.
4. Run the full test suite in the `main` worktree.
5. Push `main` to `origin`.

Do not publish by pushing a feature or working branch instead of `main`.
