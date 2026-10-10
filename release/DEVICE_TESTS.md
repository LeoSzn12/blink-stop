# Physical device acceptance record

No physical-device results have been recorded for this candidate. Fill one record
for each actual device and signed build. An unchecked item is not a pass.

Commit/build identifier: pending
iPhone model/iOS version/TestFlight build: pending
Android model/OS version/signed APK or Play build: pending
Tester/date: pending

| Test | iPhone evidence | Android evidence |
| --- | --- | --- |
| Clean install opens all modes and bundled policies offline | Pending | Pending |
| Camera allow/deny/revoke/retry gives correct recovery | Pending | Pending |
| All five modes calibrate with actual open eyes and detect a blink/wink | Pending | Pending |
| Face loss/stalled inference disqualifies instead of awarding a score | Pending | Pending |
| Endurance completes at 30 seconds with continuous face tracking | Pending | Pending |
| Menu, lock, background, interruption, and rapid retry stop old sessions/audio | Pending | Pending |
| Save/rank/relaunch local scores; DQ never saves a perfect Precision result | Pending | Pending |
| Native score sharing opens the sheet; cancellation is retryable | Pending | Pending |
| Native selfie export saves a usable JPEG in chosen destination | Pending | Pending |
| Cancelled export, next export, and Clear Local Data handle cache correctly | Pending | Pending |
| Clear Local Data removes scores/theme; unrelated data and exported copies remain | Pending | Pending |
| VoiceOver/TalkBack, large text, small screen, rotation, and safe areas work | Pending | Pending |
| Glasses, ordinary/low light, varied faces, and camera orientation tested | Pending | Pending |
| Network observation shows no camera/landmark/score uploads or ad/analytics requests | Pending | Pending |
| Extended play, memory, temperature, and battery are acceptable | Pending | Pending |
| Upgrade preserves intended local data and replaces stale assets/policies | Pending | Pending |

Record observed behavior, screenshots when useful, failures, and the exact build
that fixes each failure. Signed releases must be retested after code or SDK changes.

Surprise prototype: confirm clear opt-in, sound off by default, readable exit, one brief interruption, 30-second cap, blink/DQ handling, and cancellation on background/retry. Confirm demo camera indicator is off, early claim is disabled, Skip preserves the result, completion changes only the session theme, and backgrounding gives no reward. Inspect network to confirm no ad provider is contacted.
