#!/bin/sh
# Starts Metro and opens the dev build on every connected Android device (a), the iPhone simulator (i), or both
# (all, the default). With "prod" the app talks to the production API instead of the Docker stack. Metro stays in
# the foreground; screenshots are allowed. Usage: scripts/dev.sh [a|i|all] [prod]
set -e
cd "$(dirname "$0")/.."

target=all
for arg in "$@"; do
  case $arg in
    a|android) target=a ;;
    i|ios|iphone) target=i ;;
    all) target=all ;;
    prod) export EXPO_PUBLIC_API_URL=https://six-frites.koera.mg EXPO_PUBLIC_WEB_URL=https://six-frites.koera.mg ;;
    *) echo "Usage: $0 [a|i|all] [prod]" >&2; exit 1 ;;
  esac
done
export EXPO_PUBLIC_ALLOW_SCREEN_CAPTURE=1
echo "API: ${EXPO_PUBLIC_API_URL:-from .env}"

lsof -ti tcp:8081 -sTCP:LISTEN | xargs kill 2>/dev/null || true

(
  until curl -s localhost:8081/status | grep -q running; do sleep 1; done
  url="sixfrites://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
  if [ $target != i ]; then
    for d in $(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }'); do
      for p in 8081 4000 3000 8333; do adb -s "$d" reverse tcp:$p tcp:$p >/dev/null; done
      adb -s "$d" shell am force-stop com.sixfrites.app
      adb -s "$d" shell am start -a android.intent.action.VIEW -d "'$url'" com.sixfrites.app 2>&1 | grep -q Error &&
        echo "$d: no Six Frites dev build, install it with: npx expo run:android --device $d --no-bundler" ||
        echo "$d: opened"
    done
  fi
  if [ $target != a ]; then
    sim=$(xcrun simctl list devices booted | grep -o -m1 -E '[0-9A-F-]{36}') ||
      sim=$(xcrun simctl list devices available | grep -m1 'iPhone 17 Pro (' | grep -o -E '[0-9A-F-]{36}')
    xcrun simctl boot "$sim" 2>/dev/null || true
    open /Applications/Xcode.app/Contents/Applications/DeviceHub.app
    xcrun simctl terminate "$sim" com.sixfrites.app 2>/dev/null || true
    xcrun simctl launch "$sim" com.sixfrites.app >/dev/null && echo "iOS simulator: opened" ||
      echo "iOS simulator: no Six Frites dev build, install it with: npx expo run:ios --device \"iPhone 17 Pro\""
  fi
) &

exec npx expo start --dev-client --port 8081 --clear
