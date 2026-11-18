# App Store listing and launch checklist (iOS 1.0)

Prepared November 18, 2026. Copy below is ready to paste into App Store Connect.
Everything here describes the build on this branch; re-read it against the final
TestFlight build before submitting. See STORE_SUBMISSION.md for the privacy and
content-rating reasoning and DEVICE_TESTS.md for the phone checks.

## Where things stand

- Signing already works: the `iOS cloud archive and TestFlight` workflow ran a
  signed archive on main on October 14, 2026 with the `ios-signing` environment,
  and the owner installed TestFlight build 1.0 (2.1) on an iPhone 14.
- The calibration fix (PR #3) has not been confirmed on that iPhone yet.
- `Info.plist` now declares `ITSAppUsesNonExemptEncryption = false` (the app only
  uses the operating system's standard encryption), so App Store Connect stops
  asking the export-compliance question for every build, and
  `NSPhotoLibraryAddUsageDescription`, which iOS requires before the share
  sheet's Save Image action can write a photo or card to the library.
- Store screenshots: Candidate checks, run manually (Actions > Candidate checks >
  Run workflow), uploads `ios-store-menu-screenshots` with a 6.9-inch iPhone and a
  13-inch iPad capture of the real native menu. Those are the two required sizes
  for a universal app. Add real gameplay shots too if you can.

## Owner steps, in order

1. Merge the holiday skins pull request into main.
2. GitHub > Actions > iOS cloud archive and TestFlight > Run workflow on main,
   with "upload to TestFlight" ticked.
3. When Apple finishes processing (TestFlight shows the new build), install it on
   your iPhone and play one round with each skin in normal and dim light. Check
   that calibration completes and Share Photo opens the share sheet.
4. GitHub > Actions > Candidate checks > Run workflow on main, then download the
   `ios-store-menu-screenshots` artifact.
5. App Store Connect > Blink Stop > the 1.0 version page: paste the listing below,
   upload the screenshots, choose the new build, and complete App Privacy, Age
   Rating and pricing (Free).
6. Add for Review > Submit. Apple's review usually takes a day or two; a rejection
   comes with a reason you can reply to from the same page.

## Listing copy

Build 1.0 (8.1) has the menu as shown under GAME MODES. Leave out the BLINK
OLYMPICS section for that build. For a build with the new home screen (Endurance,
Precision, Blink Olympics), rename Classic to Endurance, Endurance to 30 Seconds,
add the BLINK OLYMPICS section, and say "choose Endurance" in the review notes.

- **Name (30):** Blink Stop
- **Subtitle (30):** Staring contest party game
- **Promotional text (170):** New for the holidays: Thanksgiving, Christmas and Party skins put a hat on your head while you play, then frame the moment you blinked for the group chat.
- **Keywords (100):** staring contest,dont blink,party game,family,holiday,thanksgiving,christmas,friends,challenge,eyes
- **Primary category:** Games. Subcategories: Casual, Family.
- **Support URL:** https://www.playblinkstop.com/support.html
- **Marketing URL:** https://www.playblinkstop.com/
- **Privacy Policy URL:** https://www.playblinkstop.com/privacy.html
- **Copyright:** 2026 Nova Acquisitions LLC (or the seller's legal name if the
  Apple membership stays Individual)
- **Price:** Free. No in-app purchases.

### Description

Don't blink.

Blink Stop is a staring contest against your own camera. Hold your eyes open as
long as you can. The moment you blink, the round ends and the game catches you
mid-blink.

Made for get-togethers: pass the phone around the Thanksgiving table, settle
who does the dishes at the Christmas party, or kill time in a long line.

HOLIDAY SKINS
• Thanksgiving: a pilgrim hat and turkey feathers follow your face
• Christmas: a Santa hat and falling snow
• Party: a party hat and confetti for any celebration
After each round, Share Photo frames the moment you blinked with your time,
ready for the family group chat.

GAME MODES
• Classic: how long can you last?
• Precision: blink as close to 5, 10 or 15 seconds as you can
• Endurance: survive 30 seconds
• Daily: a new twist every day
• Surprise: an optional 30-second round with a sudden face (it can startle you)

BLINK OLYMPICS
• Balloon Pop: blink to pop balloons as they float through the zone
• Stare-down: two faces, one phone, first to blink loses
• Party tournament: 2 to 8 players pass the phone, the top two meet in a final, and the champion gets a crown
• Blink Reel: everyone's caught-blinking photos in one picture
• Dares for whoever blinks first, themed for each holiday
• Distraction: the phone tells jokes while you try not to blink

CHALLENGE FRIENDS
Share a challenge card or code. Friends play the same mode and target on their
own phone, or hand yours over with Friend's Turn.

PRIVATE BY DESIGN
Blink detection runs entirely on your device. Camera frames are never uploaded,
there are no accounts, ads or tracking, and scores stay on your phone. Photos
are only shared when you tap Share Photo.

Blink normally between rounds and take breaks. Blink Stop is entertainment, not a
health or vision tool.

## App Review notes

No sign-in, payment or server is needed. Open the app, choose a skin (optional),
then Classic, and allow front-camera access. Keep your face in view with eyes
open while it calibrates, then blink to end the round. The hat is drawn on the
device over the camera preview; detection reads the camera frames, not the
drawings. Share Photo opens the system share sheet with a framed JPEG; Share Card
exports a photo-free PNG. Surprise Mode is opt-in, shows a warning first, and has
sound off by default. Head-to-head needs two people in front of the front
camera; Party mode keeps typed names and round photos in memory only and
discards them when the party ends. Camera frames, landmarks and scores never leave the device.

## App Privacy answers

Data Not Collected. All camera processing is on the device; sharing is started by
the user and goes to the app they choose. Confirm against the build's privacy
report before submitting.

## Age rating questionnaire

Answer from the final build. Surprise Mode shows a sudden illustrated face, so
answer the fear/horror question as infrequent and mild. No violence, gambling,
purchases, messaging, user-generated content, web browsing or location.
