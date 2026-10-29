#!/bin/sh
set -e
cd "$(dirname "$0")/.."

export EXPO_PUBLIC_API_URL=https://six-frites.koera.mg
export EXPO_PUBLIC_WEB_URL=https://six-frites.koera.mg

CI=1 npx expo prebuild -p android
(cd android && ./gradlew assembleRelease)

apk=android/app/build/outputs/apk/release/app-release.apk
grep -E 'versionCode|versionName' android/app/build.gradle | head -2
ls -lh "$apk"
shasum -a 256 "$apk"
