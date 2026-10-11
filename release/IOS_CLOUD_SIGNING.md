# iPhone builds without local Xcode

Use the already-connected GitHub repository and its macOS runners. No new builder account or MCP is required. `.github/workflows/ios-cloud.yml` checks a Release iphoneos archive on pull requests and offers a manual, main-only signed/export/upload job. The App Store Connect/TestFlight plugin search did not surface a matching integration; more integrations may exist in the plugin directory. Apple still requires valid signing credentials regardless of the interface used.

## What is automatic

The credential-free check builds for a physical-device architecture, verifies bundled web files and privacy manifest, checks the upload tool, and publishes an **unsigned** device archive. That archive is not installable on an iPhone. The signed job imports credentials into a temporary runner keychain, validates the team/app/profile/expiry, configures only the App target, archives/exports an App Store IPA, verifies its packaged game, and optionally validates/uploads it to Apple. It never submits a public App Store release or invites testers. Upload is off by default. Signed execution is limited to manual runs on main in this repository, behind the `ios-signing` environment.

## One-time owner setup — no local Xcode needed

1. In GitHub repo Settings → Environments, create **ios-signing**. Restrict its deployment branches to **main** and require the owner as reviewer before adding credentials. Keep this workflow reviewed on main; do not enable secrets for arbitrary branches, forks or pull requests. This restriction is a required setup step outside the workflow file.
2. In Apple Developer Certificates, Identifiers & Profiles, confirm the explicit **com.blinkstop.app** App ID exists in the intended team. Reuse existing valid credentials if available. Otherwise use macOS Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority to create a CSR and private key; this tool ships with macOS and does not require Xcode. Use the CSR to request an **Apple Distribution** certificate in the developer website. Import Apple's downloaded .cer into Keychain Access so it pairs with the private key, then export that identity as a password-protected **.p12**. Do not revoke other certificates to make room without checking what apps use them.
3. In the developer website, create/download an **App Store Connect** provisioning profile for that explicit App ID and distribution certificate. Development/ad hoc/enterprise profiles are deliberately rejected. The current validator expects the new app's App ID prefix to equal its Team ID; if Apple's registered identifier uses a legacy prefix, stop and update the validator from verified account data rather than weakening checks blindly.
4. Create/confirm the Blink Stop app record in App Store Connect with that bundle ID. The current Individual membership means the legal personal name is the seller/developer name. The public support email remains the company contact. Decide any membership change before creating the first listing if a company seller name is desired.
5. Add the following **environment** variable/secrets directly in GitHub's UI. Do not send keys, certificate passwords, p12/p8 files or secret values through chat, commit them, or place them in www. Local copies belong in private storage; build/ is Git-ignored here but is not a substitute for secure backup.

| Kind | Name | Value |
| --- | --- | --- |
| Variable | APPLE_TEAM_ID | The owner's verified 10-character Apple team identifier |
| Secret | IOS_CERTIFICATE_BASE64 | Single-line Base64 of the .p12 signing identity |
| Secret | IOS_CERTIFICATE_PASSWORD | Password used to export that .p12 |
| Secret | IOS_PROFILE_BASE64 | Single-line Base64 of the App Store .mobileprovision file |

For upload to Apple, request API access if needed under App Store Connect → Users and Access → Integrations. Generate a **team API key** with the minimum role that can upload builds (confirm Developer role access for your team), download its .p8 once and store it securely. Team keys can affect all apps in that account, so use a dedicated key and review its role. Add:

| Secret | Value |
| --- | --- |
| ASC_KEY_ID | The key's 10-character key ID |
| ASC_ISSUER_ID | App Store Connect issuer ID |
| ASC_PRIVATE_KEY_BASE64 | Single-line Base64 of the .p8 private key |

On macOS, to copy a file's single-line Base64 without printing it to a terminal/chat, use `base64 -i '/private/path/to/file' | tr -d '\n' | pbcopy`, then paste into the named GitHub environment secret. Keep the certificate password private too. Do not grant broader roles just to bypass an unexplained upload error.

## Run and test

Once reviewed/merged and configured, GitHub → Actions → **iOS cloud archive and TestFlight** → Run workflow → **main**. Leave upload off to test signing/export first. A successful run provides `ios-signed-candidate` with App.ipa; an App Store-signed IPA is intended for Apple processing, not direct installation. Rerun with upload selected to send it to Apple. The build number uses run number and attempt so reruns remain distinct.

After Apple processes the upload, handle any agreements/export-compliance questions, add your own account as an internal TestFlight tester and install TestFlight on the iPhone. Then complete release/DEVICE_TESTS.md. External beta testing and public store submission are separate steps. Physical blink accuracy, sharing destinations and comfort remain untested until the phone observations are recorded.

Only the IPA is uploaded as a signed artifact, retained seven days; certificates, profiles, keys, private build logs and keychains are not artifacts. Runner-local credentials are removed in an always-run cleanup step; GitHub-hosted machines are also ephemeral. Logs intentionally omit raw signing/Apple upload output to keep account data private. If signing fails, diagnose the credentials and app registration without exposing private logs publicly.

## Alternatives and sources

A compatible older Apple Xcode download may also work, but the App Store incompatibility alone does not establish which version supports this Intel Mac. The cloud path avoids relying on local compatibility. Apple's current documentation says initial Xcode Cloud setup uses Xcode, so it is not the primary workaround for this case.

- GitHub signing: https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications
- Apple CSR: https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request
- Apple distribution profiles: https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
- Apple API keys: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api
- Apple upload tools: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- Apple Xcode Cloud initial setup: https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow
- Xcode version requirements: https://developer.apple.com/xcode/system-requirements
