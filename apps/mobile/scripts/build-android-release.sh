#!/bin/sh
set -e
cd "$(dirname "$0")/.."

. ./scripts/release-info.sh

export EXPO_PUBLIC_API_URL=https://six-frites.koera.mg
export EXPO_PUBLIC_WEB_URL=https://six-frites.koera.mg
export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=684066038623-kr1jp4al0hcoegsufvcmm1oi3e370op0.apps.googleusercontent.com

CI=1 npx expo prebuild -p android
(cd android && ./gradlew assembleRelease)

apk=android/app/build/outputs/apk/release/app-release.apk
./scripts/sign-android-release.sh "$apk"
grep -E 'versionCode|versionName' android/app/build.gradle | head -2
ls -lh "$apk"
shasum -a 256 "$apk"
mkdir -p dist && cp "$apk" "dist/six-frites-$version.apk"
npx tsx scripts/record-release.mjs "Android APK (Koera Store)" "dist/six-frites-$version.apk"
printf '\nKoera Store notes for %s:\n%s\n' "$version" "$notes"
