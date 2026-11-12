#!/bin/sh
# Uploads the APK from build-android-release.sh, or the one given, to Koera Store and publishes it with its English
# notes, which tells the Six Frites API to send phones the "new version" notice.
set -e
cd "$(dirname "$0")/.."
: "${STORE_ADMIN_PASSWORD:?Set STORE_ADMIN_PASSWORD to the Koera Store admin password}"
. ./scripts/release-info.sh

release="${STORE_URL:-https://store.koera.mg}/api/admin/apps/six-frites/releases/$version"
apk=${1:-android/app/build/outputs/apk/release/app-release.apk}
curl -fsS -o /dev/null -u ":$STORE_ADMIN_PASSWORD" -T "$apk" "$release?filename=app-release.apk"
node -e 'console.log(JSON.stringify({ published: true, notes: process.argv[1] }))' "$notes" |
  curl -fsS -o /dev/null -u ":$STORE_ADMIN_PASSWORD" -X PATCH -H 'content-type: application/json' --data-binary @- "$release"
echo "Published $version on Koera Store"
