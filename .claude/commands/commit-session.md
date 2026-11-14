---
description: Commit only the work done in this session (or a given session), with no attribution
argument-hint: "[optional: session id; default this session]"
allowed-tools: Bash(git:*), Bash(jq:*), Bash(ls:*), Bash(grep:*), Bash(date:*), Bash(npm test:*), Read, Edit
---

Commit the uncommitted changes made by one Claude session, and nothing else. Other sessions' changes in the same files stay uncommitted.

## 1. Find the session's changes

- No `$ARGUMENTS`: the session is this conversation. List every file you changed in it, with Edit, Write, or a Bash/python/sed edit, and what you changed in each.
- `$ARGUMENTS` is a session id: read `~/.claude/projects/-Users-chrys-develops-six-frites/$ARGUMENTS.jsonl` and list its changes with
  `jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input.file_path // .input.command // empty'`.
  Read the `old_string`/`new_string` inputs to know which hunks are its own.

Match them against `git diff HEAD` and `git status --short`. Keep only the hunks this session wrote. A hunk that is already committed or was reverted is skipped. When a shared file such as `RELEASE_NOTES.md`, `changelog.ts` or an i18n file also has other sessions' hunks, take only this session's hunks.

## 2. Split and commit

One commit per task in the session. A `/clear` or a new user request starts a new task. Show the plan, each message with its files or hunks, then commit oldest task first. Use the private-index steps and the Rules from `.claude/commands/commit-all.md`: never stage in the shared index, no attribution of any kind, a release note in the same commit as the change members see, no secrets, no push.

End with `git log --oneline` of the new commits and `git status --short`. Say what was left uncommitted because it belongs to other sessions, and ask whether to push.
