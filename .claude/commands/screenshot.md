---
description: Screenshot the connected Android phone (a) or the booted iPhone simulator (i) into ~/Downloads
argument-hint: "[a|android|i|iphone|<adb serial>] (default: a)"
allowed-tools: Bash(adb:*), Bash(xcrun simctl:*), Bash(ls:*), Bash(stat:*), Bash(rm:*), Read
---

Take a screenshot and save it in ~/Downloads. Argument: `$ARGUMENTS`.

Pick the target from the argument:
- empty, `a` or `android`: the first USB Android device in `adb devices -l` (a line with `usb:`, not `emulator-`).
- `i`, `iphone` or `ios`: the booted iOS simulator.
- anything else: treat it as an adb serial.

Android:
1. If no device matches, say so and stop.
2. `f=~/Downloads/<model>-$(date +%Y%m%d-%H%M%S).png; adb -s <serial> exec-out screencap -p > "$f"`, with `<model>` the device's `model:` from `adb devices -l`, lowercased.
3. If the file is 0 bytes, Six Frites is in front and blocking screenshots. Delete the empty file and tell the user that Metro has to run with `EXPO_PUBLIC_ALLOW_SCREEN_CAPTURE=1` and the app needs a force-stop and relaunch. Offer to do that for them.

iPhone:
1. Find the booted simulator with `xcrun simctl list devices booted`. If none is booted, say so and stop.
2. `f=~/Downloads/<name>-$(date +%Y%m%d-%H%M%S).png; xcrun simctl io booted screenshot "$f"`, with `<name>` the device name lowercased and spaces turned into `_` (e.g. `iphone_17_pro`).

Then Read the image so you can see it, and reply with the full path and one line on what is on screen.
