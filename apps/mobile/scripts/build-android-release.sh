#!/bin/sh
set -e
cd "$(dirname "$0")/.."

version=$(sed -n 's/^  version: "\(.*\)",$/\1/p' app.config.ts)
notes=$(node -e '
import("../../packages/shared/src/changelog.ts").then(({ CHANGELOG }) => {
  const release = CHANGELOG.find((r) => r.version === process.argv[1]);
  if (!release) process.exit(1);
  console.log(release.notes.en.map((note) => `• ${note}`).join("\n"));
});' "$version") || {
  echo "Add $version to packages/shared/src/changelog.ts before building it." >&2
  exit 1
}

export EXPO_PUBLIC_API_URL=https://six-frites.koera.mg
export EXPO_PUBLIC_WEB_URL=https://six-frites.koera.mg

CI=1 npx expo prebuild -p android
(cd android && ./gradlew assembleRelease)

apk=android/app/build/outputs/apk/release/app-release.apk
grep -E 'versionCode|versionName' android/app/build.gradle | head -2
ls -lh "$apk"
shasum -a 256 "$apk"
printf '\nKoera Store notes for %s:\n%s\n' "$version" "$notes"
