# Blink Stop web launch — October 10, 2026

Public game: https://www.playblinkstop.com/

The owner authorized launch. PR #1 was merged, and Vercel deployed main to production automatically. The tested runtime head is 8cfd2607a6621eb0a917ca6af2d2fc0620d2b204; the launch merge is 92d69bb168b46f08874dd9c007aef526c370e6fc. The first release deployment is dpl_CdYgN9Kuc9fXRZjejUrJpNMqJr3P. Documentation-only follow-ups preserve the same web payload.

## Verified
- 72 local automated checks and all three CI jobs pass: https://github.com/LeoSzn12/blink-stop/actions/runs/38111407680
- Fresh unauthenticated HTTPS reads of all 42 public web files match the tested local build byte-for-byte, including policies and packaged inference assets.
- https://playblinkstop.com/ redirects to the matching canonical game; https://blink-stop.vercel.app/ also serves the matching game.
- Public privacy: https://www.playblinkstop.com/privacy.html
- Public terms: https://www.playblinkstop.com/tos.html
- Public support: https://www.playblinkstop.com/support.html
- A fresh Chrome profile on the live canonical site passes the complete synthetic-camera flow: Surprise warning/calibration/result, bonus demo skip/completion, PNG sharing/download, friend handoff, malformed code/link rejection, direct Precision link without automatic camera access, target matching, blink comparison, and confirmed menu exit releasing the camera and clearing transient UI. Observed page errors: none. Game requests remain on the canonical origin.
- Native CI creates an unsigned iOS simulator build, Android debug APK and unsigned release AAB for the runtime head. These are test artifacts, not store submissions.

## Sharing and updates
Shared play links carry a reported mode, target and score in a URL fragment. The friend explicitly accepts before camera access. Cards contain no camera photo or nickname. No automated posting, live ad SDK, analytics, accounts or remote score backend is enabled. Existing browser tabs may keep an older service-worker version until all game tabs close; reopen the site for the current version.

## Remaining native release work
Real iPhone and Android camera accuracy/comfort, native social destination compatibility, accessibility/update QA, developer account/team setup, signed builds and final store forms/screenshots remain pending. Automated synthetic input does not establish physical camera accuracy or store acceptance.

## Recovery
The prior production deployment dpl_3vMCGMByfsvUy7s3Es3Mkc9t9XkM remains the rollback target. A rollback restores the older game and disclosures, so recheck the public policy pages and shared links if used. Do not remove that deployment until the owner decides it is no longer needed.
