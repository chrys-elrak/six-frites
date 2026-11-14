---
description: Build the production mobile app (a = Android APK + Play AAB, i = iOS to App Store Connect, all = both) and record it in apps/mobile/RELEASES.md
argument-hint: "[a|i|all] (default: all)"
---

Hand this to the `release-builder` agent with the target `$ARGUMENTS` (empty means `all`). Relay its report to the user: each artifact's path, version, build number and sha256, and what it added to `apps/mobile/RELEASES.md`. If it stopped to ask something (version bump, changelog notes, uncommitted code), ask the user and send their answer back to the same agent.
