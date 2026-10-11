#!/bin/bash
set -euo pipefail
umask 077
BLINK_SIGNING_DIR="$RUNNER_TEMP/blink-ios-signing"
BLINK_KEYCHAIN="$BLINK_SIGNING_DIR/signing.keychain-db"
BLINK_PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
case "${1:-}" in
  install)
    for BLINK_SECRET_NAME in APPLE_TEAM_ID IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROFILE_BASE64; do
      if [[ -z "${!BLINK_SECRET_NAME:-}" ]]; then echo "Missing GitHub environment setting: $BLINK_SECRET_NAME"; exit 1; fi
    done
    mkdir -p "$BLINK_SIGNING_DIR" "$BLINK_PROFILE_DIR"
    python3 - <<'PY'
import base64, os
from pathlib import Path
p = Path(os.environ['RUNNER_TEMP']) / 'blink-ios-signing'
for variable, filename in [('IOS_CERTIFICATE_BASE64','distribution.p12'),('IOS_PROFILE_BASE64','profile.mobileprovision')]:
    try:
        payload = base64.b64decode(os.environ[variable], validate=True)
    except Exception:
        raise SystemExit(variable + ' is not valid single-line Base64')
    (p / filename).write_bytes(payload)
PY
    security cms -D -i "$BLINK_SIGNING_DIR/profile.mobileprovision" > "$BLINK_SIGNING_DIR/profile.plist"
    python3 scripts/ios-signing-config.py "$BLINK_SIGNING_DIR/profile.plist" "$APPLE_TEAM_ID" \
      ios/App/App.xcodeproj/project.pbxproj "$BLINK_SIGNING_DIR/ExportOptions.plist" > "$BLINK_SIGNING_DIR/profile-uuid"
    BLINK_PROFILE_UUID="$(cat "$BLINK_SIGNING_DIR/profile-uuid")"
    cp "$BLINK_SIGNING_DIR/profile.mobileprovision" "$BLINK_PROFILE_DIR/$BLINK_PROFILE_UUID.mobileprovision"
    BLINK_KEYCHAIN_PASSWORD="$(openssl rand -hex 32)"
    security create-keychain -p "$BLINK_KEYCHAIN_PASSWORD" "$BLINK_KEYCHAIN"
    security set-keychain-settings -lut 21600 "$BLINK_KEYCHAIN"
    security unlock-keychain -p "$BLINK_KEYCHAIN_PASSWORD" "$BLINK_KEYCHAIN"
    security import "$BLINK_SIGNING_DIR/distribution.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$BLINK_KEYCHAIN" >/dev/null
    security set-key-partition-list -S apple-tool:,apple: -k "$BLINK_KEYCHAIN_PASSWORD" "$BLINK_KEYCHAIN" >/dev/null
    security list-keychains -d user -s "$BLINK_KEYCHAIN" "$HOME/Library/Keychains/login.keychain-db"
    ;;
  archive)
    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
      -sdk iphoneos -destination 'generic/platform=iOS' -archivePath build/ios-signed/App.xcarchive \
      CURRENT_PROJECT_VERSION="$GITHUB_RUN_NUMBER.$GITHUB_RUN_ATTEMPT" archive > "$BLINK_SIGNING_DIR/archive.log" 2>&1 || {
        echo 'Signed archive failed. Private signing logs are not published; check certificate/profile pairing and team settings.'; exit 1;
      }
    ;;
  export)
    xcodebuild -exportArchive -archivePath build/ios-signed/App.xcarchive \
      -exportPath build/ios-signed/export -exportOptionsPlist "$BLINK_SIGNING_DIR/ExportOptions.plist" \
      > "$BLINK_SIGNING_DIR/export.log" 2>&1 || {
        echo 'IPA export failed. Check the App Store distribution certificate and provisioning profile.'; exit 1;
      }
    ;;
  upload)
    for BLINK_SECRET_NAME in ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_BASE64; do
      if [[ -z "${!BLINK_SECRET_NAME:-}" ]]; then echo "Missing GitHub environment secret: $BLINK_SECRET_NAME"; exit 1; fi
    done
    # altool searches this documented directory. It exists only on the isolated runner.
    mkdir -p "$HOME/.appstoreconnect/private_keys"
    python3 - <<'PY'
import base64, os, re
from pathlib import Path
key_id = os.environ['ASC_KEY_ID']
if not re.fullmatch(r'[A-Z0-9]{10}', key_id):
    raise SystemExit('Invalid App Store Connect key identifier')
try:
    key = base64.b64decode(os.environ['ASC_PRIVATE_KEY_BASE64'], validate=True)
except Exception:
    raise SystemExit('ASC_PRIVATE_KEY_BASE64 is not valid single-line Base64')
if b'-----BEGIN PRIVATE KEY-----' not in key:
    raise SystemExit('Expected an App Store Connect .p8 private key')
(Path.home() / '.appstoreconnect/private_keys' / ('AuthKey_' + key_id + '.p8')).write_bytes(key)
PY
    xcrun altool --validate-app --file build/ios-signed/export/App.ipa --type ios \
      --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" > "$BLINK_SIGNING_DIR/validate.log" 2>&1 || {
        echo 'Apple binary validation failed. Check the app record, agreements, export compliance and API-key permissions.'; exit 1;
      }
    xcrun altool --upload-app --file build/ios-signed/export/App.ipa --type ios \
      --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" > "$BLINK_SIGNING_DIR/upload.log" 2>&1 || {
        echo 'Apple upload failed. Check the app record, build number and API-key permissions.'; exit 1;
      }
    echo 'Build uploaded for Apple processing. This does not submit an App Store release or invite testers.'
    ;;
  cleanup)
    security delete-keychain "$BLINK_KEYCHAIN" >/dev/null 2>&1 || true
    if [[ -f "$BLINK_SIGNING_DIR/profile-uuid" ]]; then
      BLINK_PROFILE_UUID="$(cat "$BLINK_SIGNING_DIR/profile-uuid")"
      if [[ "$BLINK_PROFILE_UUID" =~ ^[A-Fa-f0-9-]{36}$ ]]; then rm -f "$BLINK_PROFILE_DIR/$BLINK_PROFILE_UUID.mobileprovision"; fi
    fi
    if [[ -n "${ASC_KEY_ID:-}" && "$ASC_KEY_ID" =~ ^[A-Z0-9]{10}$ ]]; then rm -f "$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"; fi
    rm -rf "$BLINK_SIGNING_DIR"
    ;;
  *) echo 'Usage: ios-cloud-sign.sh install|archive|export|upload|cleanup'; exit 2 ;;
esac
