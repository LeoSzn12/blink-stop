# Blink Stop

A camera-based staring challenge with Classic, Precision, Endurance, and Daily modes.
Face landmarks are processed on the device using bundled MediaPipe assets. Scores
stay in local storage; this candidate has no Firebase, advertising, or analytics.

## Run locally

Use Node.js 22 or newer and Python 3:

```sh
npm ci
npm test
python3 -m http.server 4173 --bind 127.0.0.1 --directory www
```

Open http://127.0.0.1:4173. Camera access requires localhost or HTTPS. Choose a mode,
allow the camera, and keep your eyes open during calibration. Camera-denied recovery
instructions appear in the menu. After an online visit finishes installing the
service worker, reload once; the packaged game and policies can then load offline.

## Deploy the website

The existing Vercel project is `blink-stop` in `ankit-patels-projects-7d88a2c4`.
`vercel.json` installs with `npm ci`, builds with `npm run build`, and publishes only
`www`. Generated `vendor/` assets are packaged during the build and must not be
omitted. Feature-branch deployments are protected previews.

The policy/support pages identify Nova Acquisitions LLC and its public contact.
See `release/STORE_SUBMISSION.md` for store disclosures and remaining release checks.
Smoke-test the exact deployment
with a real camera, then verify the game and both policy pages on each public
domain. The previous production deployment is
`dpl_3vMCGMByfsvUy7s3Es3Mkc9t9XkM`; keep it available for rollback.

## Native apps

`www` is also the Capacitor payload. Build it before `npx cap sync`.
See [LAUNCH_QA.md](LAUNCH_QA.md) for device testing, signing, and store requirements.
Headless browser checks verify loading, inference initialization, and layout;
they do not establish blink accuracy on physical phones.
