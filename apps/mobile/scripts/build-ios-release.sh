#!/bin/sh
# Archives the iOS app against the production server and uploads it to App Store Connect, from where it goes to
# TestFlight and review. It signs with the Apple Distribution certificate and the App Store profiles (the app's and
# its share extension's) that scripts/ios-signing-setup.mjs made, and uploads with the App Store Connect API key: signing/apple.env sets
# APPLE_KEY_ID, APPLE_ISSUER_ID and the keychain's password, and the key itself is signing/AuthKey_<APPLE_KEY_ID>.p8.
set -e
cd "$(dirname "$0")/.."

. ./scripts/release-info.sh
. ./signing/apple.env

export EXPO_PUBLIC_API_URL=https://six-frites.koera.mg
export EXPO_PUBLIC_WEB_URL=https://six-frites.koera.mg

key="$PWD/signing/AuthKey_$APPLE_KEY_ID.p8"
[ -f "$key" ] || { echo "Missing $key" >&2; exit 1; }
set -- -allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$APPLE_KEY_ID" -authenticationKeyIssuerID "$APPLE_ISSUER_ID"

CI=1 npx expo prebuild -p ios
security unlock-keychain -p "$APPLE_KEYCHAIN_PASSWORD" "$HOME/Library/Keychains/six-frites-build.keychain-db"
plutil -replace aps-environment -string production ios/SixFrites/SixFrites.entitlements
python3 - ios/SixFrites.xcodeproj/project.pbxproj <<'PY'
import re, sys
path = sys.argv[1]
s = open(path).read()
profiles = {"com.sixfrites.app": "Six Frites App Store", "com.sixfrites.app.share-extension": "Six Frites Share App Store"}
def sign(m):
    block = m.group(0)
    found = re.search(r'PRODUCT_BUNDLE_IDENTIFIER = "?([\w.-]+)"?;', block)
    if not found or found.group(1) not in profiles:
        return block
    block = re.sub(r"\s*(CODE_SIGN_STYLE|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER|DEVELOPMENT_TEAM) = [^;]*;", "", block)
    manual = f'CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profiles[found.group(1)]}";\n\t\t\t\t'
    return block.replace(found.group(0), manual + found.group(0))
s = re.sub(r"buildSettings = \{[^{}]*\};\s*name = Release;", sign, s)
open(path, "w").write(s)
PY
archive=dist/SixFrites-$version.xcarchive
rm -rf "$archive"
xcodebuild -workspace ios/SixFrites.xcworkspace -scheme SixFrites -configuration Release -destination generic/platform=iOS \
  -archivePath "$archive" DEVELOPMENT_TEAM=BDJ7N2QQ43 archive
xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist scripts/ios-export.plist -exportPath dist/ios "$@"
printf '\nUploaded %s to App Store Connect. It shows up in TestFlight once Apple has processed it.\n' "$version"
