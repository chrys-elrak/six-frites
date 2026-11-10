#!/bin/sh
# Builds the Google Play bundle, signed with our key as the upload key, into dist/. Play builds have no in-app update
# offer and no gallery permissions. The last prebuild puts android/ back, or the next Koera Store build would inherit
# the blocked permissions.
set -e
cd "$(dirname "$0")/.."

. ./scripts/release-info.sh
[ -f signing/release.env ] && { set -a; . ./signing/release.env; set +a; }
: "${SIX_KEYSTORE:=signing/release.p12}"
: "${SIX_KEYSTORE_PASSWORD:?Set SIX_KEYSTORE_PASSWORD, or put it in signing/release.env}"
export SIX_KEYSTORE_PASSWORD

export EXPO_PUBLIC_API_URL=https://six-frites.koera.mg
export EXPO_PUBLIC_WEB_URL=https://six-frites.koera.mg

PLAY_STORE=1 CI=1 npx expo prebuild -p android
(cd android && PLAY_STORE=1 ./gradlew bundleRelease)

aab="dist/six-frites-$version.aab"
mkdir -p dist
mv android/app/build/outputs/bundle/release/app-release.aab "$aab"
zip -qd "$aab" 'META-INF/*'
jarsigner -keystore "$SIX_KEYSTORE" -storetype PKCS12 -storepass:env SIX_KEYSTORE_PASSWORD -digestalg SHA-256 -sigalg SHA256withRSA "$aab" six-frites
jarsigner -verify "$aab"

CI=1 npx expo prebuild -p android --clean
grep -E 'versionCode|versionName' android/app/build.gradle | head -2
ls -lh "$aab"
shasum -a 256 "$aab"
