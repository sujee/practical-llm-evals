# AGENTS.md

Instructions for agents that work in this repo. Folder-specific instructions are in the `AGENTS.md` files in the sub-folders.

## What is in this repo

| Path | Content |
| --- | --- |
| `benchmarks/` | Ready-to-run uv projects to test LLM inference endpoints (speed, quality, load). Start at `benchmarks/README.md`. The runbooks are `benchmarks/perf/AGENTS.md` and `benchmarks/quality/AGENTS.md`. |
| `providers/` | Data and visualizations for each provider. See `providers/nebius-token-factory/AGENTS.md`. |
| `utils/` | Small test scripts (uv project) |
| `fun/` | Games and demos that coding agents made |
| `model-evals/` | Test cases for coding agents |
| `llm-quick-bench/` | A pointer to the repo that this project became |

## Read files from disk

The user edits files while you work. Always read the latest version of a file from disk before you change it or answer questions about it. Do not use an earlier copy from the conversation. Keep the edits of the user. Do not undo them.

## Writing style: ASD-STE100

Write all Markdown files in Simplified Technical English (ASD-STE100). Use the [asd-ste100 skill](https://github.com/danyuchn/asd-ste100-skill). It has the rules and a linter.

- Install it:

```bash
git clone https://github.com/danyuchn/asd-ste100-skill ~/.claude/skills/asd-ste100
```

- Run the linter before you finish. There must be 0 hard violations.

```bash
python3 ~/.claude/skills/asd-ste100/scripts/ste-lint.py <files>
```

- Do not change commands, code, URLs, or numbers.
- Keep hedges. Do not change "may" or "not tested" to a fact.
- Do not apply the rules to prompts that people paste into a model, or to quoted text.

## Python projects

- Use [uv](https://docs.astral.sh/uv/). Do not use `pip` or `venv` directly in new instructions.
- Each project has a `pyproject.toml` and a `uv.lock`. Include both in the commits that the user approves.
- Put the settings in a `.env` file. Add a `.env.example` file with names and no secrets. Git ignores `.env`.
- Never write API keys in files or in commands that you show.

## Verification

- Do not claim that a command works if you did not run it. If you could not run it, write "not tested" next to it in the docs.

## Git discipline

Never commit or push automatically. Ask for approval before each commit and before each push.
When the user says **"publish"**, this is the approval for the commit, merge, and push sequence below.

### "Publish" means: merge to `main` with the worktree, then push to origin

`main` is checked out in a sibling worktree of the repo root. For this reason, `git checkout main` fails in this worktree. Do the merge from the `main` worktree. Prefer a fast-forward. Then push both branches:

```bash
MAIN="$(git rev-parse --show-toplevel)/../main"

git -C "$MAIN" status --short              # must be empty before you continue
git -C "$MAIN" pull --ff-only origin main
git -C "$MAIN" merge --ff-only <current-branch>
git -C "$MAIN" push origin main
git push origin <current-branch>           # also keep the remote feature branch in sync
```

Notes:
- If the `--ff-only` merge fails because `main` diverged, ask the user what to do. Do not make a merge commit yourself.
- Use `git -C "$MAIN" ...` for each step. Never use `cd` to leave the worktree.
- If the `main` worktree has changes, or is out of sync with `origin/main` in a way that `--ff-only` cannot fix, stop and ask.
