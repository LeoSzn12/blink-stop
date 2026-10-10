# Blink Stop submission package

Prepared October 9, 2026 for Nova Acquisitions LLC, California, USA.
Support/privacy contact: novaacquisitionsllc@gmail.com.
Version 1 is free, for a general audience age 13+, with no ads, analytics SDK,
in-app purchases, login, or public leaderboard. Current app ID: com.blinkstop.app.
Store-assigned ratings must come from each platform's questionnaire, not this
audience decision. Confirm identifier availability in both consoles before signing.

## Public policy destinations

The app bundles privacy.html, tos.html, support.html, and notices.html. They identify
the operator and contact and describe camera landmarks, local scores, selfie cache,
user-directed exports, website hosting logs, email support, retention, deletion,
children, and comfortable gameplay. The proposed public URLs are:

- https://www.playblinkstop.com/privacy.html
- https://www.playblinkstop.com/tos.html
- https://www.playblinkstop.com/support.html

These are release destinations, not verified candidate URLs yet. The current public
site runs the older build. Publish the matching policy pages and read them back over
unauthenticated HTTPS before entering them in either store. Google requires a public
HTML privacy page rather than a protected preview or PDF.

## Apple App Privacy working answers

Camera frames, landmarks, local scores, entered nicknames, theme preference, and
selfie previews are processed locally. There is no identification, face-template
database, tracking, or automated upload. Native score/selfie sharing is initiated by
the user and handed to a destination they select.

The proposed standalone-native answer is **Data Not Collected**, subject to checking
the exact signed binary and all resolved native SDKs. Apple excludes solely on-device
processing from collection. Do not blindly reuse this answer for the hosted website:
website hosting requests and emailed support correspondence have separate practices.
Check user-directed sharing against the final console questionnaire and SDK report.

The app contains PrivacyInfo.xcprivacy, declares no tracking/collected data, and uses
FileTimestamp reason C617.1 for Filesystem access to the app's own cache. Verify the
archive's aggregated privacy report and every transitive SDK manifest. A plist syntax
check and simulator build are not an App Store privacy validation result.

## Google Play App Content working answers

- Ads: no. App access: all features available without login.
- Target audience: select relevant 13+ age groups; not designed for children under 13.
- Content rating: game with no real-money gambling, purchases, messaging, public UGC,
  or prizes. Answer the actual questionnaire from the final content.
- Data safety: proposed no app-developer collection/sharing of device data for this
  local-only build. Verify SDK behavior and Google's exceptions for user-initiated
  sharing before submitting the form. Do not infer encryption answers from HTTPS
  when the native app itself does not transmit gameplay data.
- Permissions: camera for local blink detection; Internet for WebView support.
  No microphone, contacts, location, ad ID, broad storage, or photo-library permission.
- Account deletion: no in-app account exists. Clear Local Data removes game storage;
  users can request deletion of support correspondence by email.
- API target: 36 in source. Verify the compiled merged manifest and any new Play
  requirement at submission time.

## Reviewer instructions

No credentials, payment, or external server are needed to play. Open the app, read
the camera/local-data explanation, choose Classic, and allow front-camera access.
Keep your face visible and eyes open for calibration, then blink to finish. Precision
offers 5/10/15-second targets; Endurance lasts up to 30 seconds; Daily changes visuals. Optional Surprise Mode adds a sudden illustrated face during a 30-second round after a clear opt-in screen; sound is off by default. Reassess fear/horror content answers for the final store rating.
Menu/backgrounding releases the camera. Face loss invalidates a round. Scores stay
on the device. Save Selfie opens a system export sheet, and Share Score shares text.
Support provides local-data deletion, troubleshooting, and policy/license links.
Blink comfortably; this is entertainment, not a health or vision-improvement tool.

## Candidate artifacts and release sequence

GitHub Actions first runs the browser/logic suite, then compiles Android debug APK,
unsigned release AAB, and an unsigned iOS simulator app using Xcode 26.3. Each native
artifact's web payload is compared byte-for-byte with www. These artifacts prove
compilation/packaging, not camera accuracy or store eligibility. The simulator app
cannot be installed on an iPhone; the unsigned AAB cannot be submitted as a release.

Before submission:

1. Verify both native jobs pass at the exact commit and inspect their artifacts.
2. Confirm Apple Developer Program membership/team; enroll/verify the Google Play
   organization account. Keep passwords, certificates, private keys, and recovery
   codes out of the repository and chat.
3. Complete physical iPhone and Android QA in DEVICE_TESTS.md. Use TestFlight and
   Play internal/closed testing with signed device builds. If the Play account is a
   newly created personal account, Google may require the documented closed-test
   period before production access; an organization account has different rules.
4. Publish and verify the matching policy/support URLs, review policy wording, and
   generate truthful store screenshots from the signed app.
5. Complete privacy, age/content, export-compliance, rights, and SDK/license forms
   from the final binaries. Do not select unavailable functionality or future ads.
6. Sign an iOS archive using the owner's Apple team; validate in Xcode and upload to
   TestFlight. Sign Android AAB with the owner-managed upload key and enable Play App
   Signing. Validate 16 KB page compatibility if any native .so libraries are present.
7. Review the complete listing and then submit for store review with the owner.

## Primary sources checked

- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple privacy answers](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple SDK minimums](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)
- [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Google Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google new personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem)
- [Capacitor Share](https://capacitorjs.com/docs/apis/share)

Requirements can change; re-check them immediately before the signed submission.

## October 10 prototype extension

Surprise Mode and a session-only bonus-theme demo are now in the candidate. The demo is clearly labeled, uses a local placeholder, stops the camera, offers Skip, and never contacts an advertiser or earns revenue. Live ad SDKs, consent, targeting, privacy-label changes, and ad-unit approval are not implemented. Before live monetization, update these disclosures from the actual SDK and re-test. Add Surprise Mode and demo skip/completion/background cases to physical-device QA.
