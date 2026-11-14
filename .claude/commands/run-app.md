---
description: Run the dev build on Android (a), the iPhone simulator (i) or both, against the local API or prod
argument-hint: "[a|i|all] [prod] (default: all, local API)"
allowed-tools: Bash(apps/mobile/scripts/dev.sh:*), Bash(curl:*), Bash(grep:*), Bash(tail:*), Bash(adb:*), Bash(xcrun simctl:*)
---

Run `apps/mobile/scripts/dev.sh $ARGUMENTS` with `run_in_background: true`. It replaces any Metro already on port 8081, so the API choice (`prod` or the local Docker stack from `.env`) always takes effect.

Then wait until the background output has an `opened` (or `no Six Frites dev build`) line for each target and Metro has printed `Bundled` for each platform; with `--clear` the first bundle takes a minute or two. Check `curl -s localhost:8081/json/list | grep deviceName` lists every device that was opened.

Reply in two or three lines: which devices are running, which API they use (local or prod), and any device that needs the dev build installed, with the command the script printed. Offer to install it.

While this Metro runs, keep each change refreshed on the running apps (Fast Refresh; reload through the Metro inspector if a change doesn't show).
