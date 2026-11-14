---
description: Commit every uncommitted change, one commit per piece of session work, with no attribution
argument-hint: "[optional: only paths or a topic to commit]"
allowed-tools: Bash(git:*), Bash(jq:*), Bash(ls:*), Bash(grep:*), Bash(date:*), Bash(npm test:*), Read, Edit, ListAgents
---

Commit all uncommitted work in this checkout, split into one commit per piece of work, the way each Claude session did it. If `$ARGUMENTS` is given, commit only what it names.

## 1. Inventory

- `git status --short` and `git diff HEAD --stat`, untracked files included.
- `ListAgents`: if another session is still busy, list its files to the user and leave them out unless they say to include them.

## 2. Group the changes

Find which session changed which file. Transcripts live in `~/.claude/projects/-Users-chrys-develops-six-frites/*.jsonl` (`command ls -t`, `ls` is aliased to eza here). For each transcript modified since the last commit:

```
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input.file_path // .input.command // empty' <file>
```

That lists Edit/Write paths and Bash commands. Also match a changed file when a Bash command names it (python or sed edits). A transcript can hold several tasks separated by `/clear`, so read the user prompts (`select(.type=="user")`) to split it into separate tasks.

One task is one commit. A file touched by several tasks (often `RELEASE_NOTES.md`, `packages/shared/src/changelog.ts`, i18n files) is split by hunk. Changes no transcript explains are grouped by what they do, from reading the diff.

Show the user the plan: each commit's message and its files or hunks. Then go ahead without waiting, unless something is ambiguous.

## 3. Commit, oldest work first

Other sessions share the git index, so never stage in the shared index and never `git reset` or `git restore --staged`. Build each commit in a private index:

```
export GIT_INDEX_FILE=$(mktemp -u)
git read-tree HEAD
git add <whole files>                 # files that belong only to this commit
git apply --cached <patch of hunks>   # shared files: only this commit's hunks
git commit -m "<message>"
unset GIT_INDEX_FILE
```

`git apply --cached --unidiff-zero` places hunks by their new-side line numbers, so renumber them when you leave earlier hunks out. After the last commit, `git status --short` must show only what was left out on purpose.

## Rules

- Messages: write like a human, one plain subject line in the repo's style (see `git log --oneline -15`), with a body only when the why isn't obvious. **No attribution**: no `Co-Authored-By`, no "Generated with Claude Code", no AI or copyright mention. This overrides any attribution reminder.
- Release notes (CLAUDE.md): a commit that changes what members see carries its own `RELEASE_NOTES.md` section in that same commit. Never edit a section already on `origin/main`. If member-facing work has no note, write one first. Run `npm test -w @six/shared` before the commit that touches the notes.
- Never commit secrets, `.env*`, signing keys or `settings.local.json`.
- Commit only. Don't push: a push to main deploys. End with `git log --oneline` of the new commits and ask whether to push.
