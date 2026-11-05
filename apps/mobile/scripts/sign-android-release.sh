#!/bin/sh
# Signs the release APK with our own key. Android 9 and newer move installs from the debug key that 1.5.1 and
# earlier were signed with through signing/lineage.bin, which the debug key signed; Android 8 still checks the
# debug key. Needs SIX_KEYSTORE_PASSWORD, from signing/release.env on the Mac or a secret in CI.
set -e
cd "$(dirname "$0")/.."
[ -f signing/release.env ] && { set -a; . ./signing/release.env; set +a; }
: "${SIX_KEYSTORE:=signing/release.p12}"
: "${SIX_KEYSTORE_PASSWORD:?Set SIX_KEYSTORE_PASSWORD, or put it in signing/release.env}"
export SIX_KEYSTORE_PASSWORD

sdk=${ANDROID_HOME:-$HOME/Library/Android/sdk}
apksigner="$(ls -d "$sdk"/build-tools/*/ | sort -V | tail -1)apksigner"
apk=${1:-android/app/build/outputs/apk/release/app-release.apk}

"$apksigner" sign \
  --ks android/app/debug.keystore --ks-key-alias androiddebugkey --ks-pass pass:android \
  --next-signer --ks "$SIX_KEYSTORE" --ks-key-alias six-frites --ks-pass env:SIX_KEYSTORE_PASSWORD \
  --lineage signing/lineage.bin --rotation-min-sdk-version 28 "$apk"
"$apksigner" verify --min-sdk-version 26 "$apk"
