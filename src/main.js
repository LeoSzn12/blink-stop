import { checkBlink, setBlinkThreshold, resetBlinkState, getBlinkThreshold } from './blinkDetection.js';
import { audioManager } from './audioManager.js';

import { createFaceLossTracker, createCalibrationTracker, createTrackingFreshness } from './gameRules.mjs';
import { createSerializedInference } from './inference.mjs';
import { appendScore } from './leaderboard.mjs';
import { cameraErrorMessage } from './cameraHelp.mjs';
import { createGameOverCameraStop } from './roundLifecycle.mjs';
import { sharePayload, shareClipboardText, formatScore, inviteLine, challengeUrl, challengeHeadline, PUBLIC_PLAY_URL } from './share.mjs';
import { createSurpriseRound, createRewardedDemo } from './surprise.mjs';
import { createSocialUI } from './social.mjs';
import { SKINS, SKIN_STORAGE_KEY, resolveSkin, storedSkinValue, drawSkinOverlay, composeSelfie, selfieCaption } from './skins.mjs';
import { createVersusMatch, largestFace } from './versus.mjs';
import { parseNames, createParty, createDeck, forfeitCards, jokeCards } from './party.mjs';
import { drawReel } from './reel.mjs';
import { createBalloonRound, drawBalloons, BALLOON_MISSES } from './balloons.mjs';
import { clipSupported, createClipBuffer, encodeClip, pickClipType, clipExtension } from './clip.mjs';

// DOM Elements
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const container = document.querySelector('.container');

// Screens
const menuScreen = document.getElementById('menu-screen');
const gameHud = document.getElementById('game-hud');
const gameOverScreen = document.getElementById('game-over-screen');
const calibrationScreen = document.getElementById('calibration-screen');
const enduranceScreen = document.getElementById('endurance-screen');

const uploadProgress = document.getElementById('upload-progress');
const calibrationLoader = document.querySelector('.loader-bar');
const calibrationStatus = document.getElementById('calibration-status');
const calibrationHint = document.getElementById('calibration-hint');
const restartCameraBtn = document.getElementById('restart-camera-btn');

// UI Elements
const modeBtns = document.querySelectorAll('.mode-btn');
const modeSelection = document.querySelector('.mode-selection');
const optionBtns = document.querySelectorAll('.option-btn');
const precisionOptions = document.getElementById('precision-options');
const precisionBackBtn = document.getElementById('precision-back-btn');
const surpriseOptions = document.getElementById('surprise-options');
const surpriseSound = document.getElementById('surprise-sound');
const surpriseOverlay = document.getElementById('surprise-overlay');
const demoScreen = document.getElementById('demo-ad-screen');
const demoCountdown = document.getElementById('demo-countdown');
const demoClaimBtn = document.getElementById('demo-claim-btn');
const demoBonusBtn = document.getElementById('demo-bonus-btn');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');
const loadingMsg = document.getElementById('loading-msg');
const cameraError = document.getElementById('camera-error');
const cameraProblem = document.getElementById('camera-problem');
const cameraRetryBtn = document.getElementById('camera-retry-btn');
const eyeTrackingStatus = document.getElementById('eye-tracking-status');
const precisionTargetLabel = document.getElementById('precision-target-label');
const scoreDisplay = document.getElementById('score');
const targetDisplay = document.getElementById('target-display');
const hudLabel = document.getElementById('hud-label');
const eyeStatusDisplay = document.getElementById('eye-status');
const gameOverTitle = document.getElementById('game-over-title');
const finalScoreLabel = document.getElementById('final-score-label');
const finalScoreVal = document.getElementById('final-score-val');
const leaderboardList = document.getElementById('leaderboard-list');

const saveScoreBtn = document.getElementById('save-score-btn');
const playerNameInput = document.getElementById('player-name-input');
const shareBtn = document.getElementById('share-btn');
const selfieContainer = document.getElementById('selfie-container');
const selfiePreview = document.getElementById('selfie-preview');
const selfieBtn = document.getElementById('selfie-btn');
const skinBtns = document.querySelectorAll('.skin-btn');
const skinGreeting = document.getElementById('skin-greeting');
let selfieFile = null;

// Holiday/party skin: hats on the camera view, matching colors, and a framed photo.
let currentSkin = 'CLASSIC';
function applySkin(id, remember = false) {
    currentSkin = SKINS[id] ? id : 'CLASSIC';
    for (const key of Object.keys(SKINS)) document.body.classList.remove(`skin-${key.toLowerCase()}`);
    if (currentSkin !== 'CLASSIC') document.body.classList.add(`skin-${currentSkin.toLowerCase()}`);
    skinBtns.forEach(btn => btn.setAttribute('aria-checked', String(btn.dataset.skin === currentSkin)));
    if (skinGreeting) skinGreeting.textContent = SKINS[currentSkin].menuLine;
    if (remember) {
        try { localStorage.setItem(SKIN_STORAGE_KEY, storedSkinValue(currentSkin)); }
        catch (err) { console.warn('Skin preference not saved:', err); }
    }
}
try { applySkin(resolveSkin(localStorage.getItem(SKIN_STORAGE_KEY))); }
catch (err) { applySkin(resolveSkin(null)); }
skinBtns.forEach(btn => btn.addEventListener('click', () => applySkin(btn.dataset.skin, true)));

// Party features: head-to-head, party tournament, blink reel, forfeits, distraction jokes.
const partyOptions = document.getElementById('party-options');
const partyScreen = document.getElementById('party-screen');
const partyTitle = document.getElementById('party-title');
const partyMessage = document.getElementById('party-message');
const partyStandings = document.getElementById('party-standings');
const partyDareBox = document.getElementById('party-dare-box');
const partyDare = document.getElementById('party-dare');
const partyGoBtn = document.getElementById('party-go-btn');
const partySkipBtn = document.getElementById('party-skip-btn');
const partyReelBtn = document.getElementById('party-reel-btn');
const partyReelStatus = document.getElementById('party-reel-status');
const partyNextBtn = document.getElementById('party-next-btn');
const dareBox = document.getElementById('dare-box');
const dareText = document.getElementById('dare-text');
const jokeCard = document.getElementById('joke-card');
const olympicsOptions = document.getElementById('olympics-options');
const balloonLayer = document.getElementById('balloon-layer');
const balloonCtx = balloonLayer.getContext('2d');
let balloonRound = null, balloonEyeClosed = false, balloonFrameId = null, balloonEnd = null;
const livesDisplay = document.getElementById('lives-display');

// Face filter pick: a game started from the menu first shows the live camera with the
// skin on your face, so you choose your look right before playing. Retry skips it.
const skinPickScreen = document.getElementById('skin-pick-screen');
const skinPickMode = document.getElementById('skin-pick-mode');
const SKIN_PICK_MODES = ['CLASSIC', 'PRECISION', 'ENDURANCE', 'DAILY', 'VERSUS', 'DISTRACT', 'BALLOON', 'SURPRISE'];
const MODE_NAMES = { CLASSIC: 'Endurance', PRECISION: 'Precision', ENDURANCE: '30 Seconds', DAILY: 'Daily', VERSUS: 'Stare-down', DISTRACT: 'Distraction', BALLOON: 'Balloon Pop', SURPRISE: 'Surprise' };
let pickSkinNext = false;
let shareLine = 'Think you can beat me?'; // invite text that travels with a shared photo
let shareUrl = PUBLIC_PLAY_URL; // challenge link that travels with a shared photo or clip
let party = null;            // active party tournament, in memory only
let partyStage = null;       // NEXT_TURN | FINAL | CHAMPION
let partyTurn = false;       // the current round is a party turn
let partyReel = [];          // [{ url, name }] framed photos from this party only
let reelUrl = '', reelFile = null;
let versusMatch = null, versusEvent = null, versusLastFrame = null, versusStartedAt = 0;
let versusNames = null;      // [left, right] names for a party final
let dareDeck = null, dareTarget = '', jokeDeck = null, jokeShownAt = -Infinity;

// UI Elements (New - World Record & Precision)
const worldRecordDisplay = document.getElementById('world-record-display');
const wrValue = document.getElementById('wr-value');
const challengeHud = document.getElementById('challenge-hud');
const challengeHudValue = document.getElementById('challenge-hud-value');

// ---------- Blink clip ----------
// While a solo round runs, the last few seconds of the camera view are kept as small
// frames in memory. After a blink they become a short video, made on this phone.
const CLIP_MODES = ['CLASSIC', 'PRECISION', 'ENDURANCE', 'DAILY', 'SURPRISE', 'DISTRACT'];
const clipBtn = document.getElementById('clip-btn');
const clipPreview = document.getElementById('clip-preview');
const clipCanMake = clipSupported(window);
const clip = createClipBuffer({ makeCanvas: () => document.createElement('canvas') });
let clipBlob = null, clipFile = null, clipUrl = '', clipMaking = false, clipEncoding = false;
let clipCaption = null, clipSkin = 'CLASSIC', clipToken = 0, clipFinishTimer = null, lastFrameAt = 0;

function updateClipButton() {
    clipBtn.classList.toggle('hidden', !clipCanMake || (!clipMaking && !clipBlob));
    clipBtn.disabled = !clipBlob;
    clipBtn.innerText = clipBlob ? 'SHARE CLIP' : 'MAKING YOUR CLIP...';
}

function clearClip() {
    clipToken++;
    clearTimeout(clipFinishTimer);
    clip.reset();
    clipBlob = null; clipFile = null; clipMaking = false; clipEncoding = false;
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    clipUrl = '';
    clipPreview.removeAttribute('src');
    clipPreview.classList.add('hidden');
    updateClipButton();
}

function captureClipFrame(now) {
    if (!clipCanMake || !CLIP_MODES.includes(currentMode)) return;
    if (gameState !== 'PLAYING' && gameState !== 'ENDURANCE' && !clip.waiting) return;
    clip.push(canvasElement, now);
    if (clip.ready) makeClip();
}

// Called from endGame: only a real blink gets a clip.
function startClip(reason, elapsed, score) {
    if (reason !== 'BLINK' || !clipCanMake || !CLIP_MODES.includes(currentMode) || !clip.mark(lastFrameAt, elapsed)) {
        clip.reset();
        return;
    }
    clipMaking = true;
    clipCaption = selfieCaption({ reason, mode: currentMode, elapsed, target: precisionTarget, score });
    clipSkin = currentSkin;
    clearTimeout(clipFinishTimer);
    // If the camera stops before the after-blink frames arrive, make it from what we have.
    clipFinishTimer = setTimeout(() => { if (clip.finish()) makeClip(); }, 2500);
    updateClipButton();
}

function makeClip() {
    if (!clipMaking || clipEncoding || !clip.ready) return;
    clipEncoding = true;
    clearTimeout(clipFinishTimer);
    const token = clipToken;
    encodeClip(clip, { skinId: clipSkin, caption: clipCaption, doc: document, Recorder: window.MediaRecorder, type: pickClipType(window.MediaRecorder) })
        .then(blob => {
            if (token !== clipToken) return;
            clipBlob = blob;
            const name = `blink-stop-clip.${clipExtension(blob.type)}`;
            clipFile = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
            clipUrl = URL.createObjectURL(blob);
            clipPreview.src = clipUrl;
            clipPreview.classList.remove('hidden');
            clipPreview.play?.().catch(() => {});
        })
        .catch(err => console.warn('Blink clip skipped:', err))
        .finally(() => {
            if (token !== clipToken) return;
            clip.reset(); // the finished video replaces the frames
            clipMaking = false;
            clipEncoding = false;
            updateClipButton();
        });
}

clipBtn.addEventListener('click', async () => {
    if (!clipBlob || clipBtn.disabled) return;
    const name = `blink-stop-clip.${clipExtension(clipBlob.type)}`;
    const text = `${shareLine} Play free: ${shareUrl} #BlinkStop`;
    if (window.Capacitor?.isNativePlatform?.()) {
        clipBtn.disabled = true;
        try {
            const { exportNativeClip } = await import('./deviceActions.mjs');
            await exportNativeClip(clipBlob, name, text);
            clipBtn.innerText = 'SHARE CLIP';
        } catch (error) {
            clipBtn.innerText = 'SHARE CANCELLED — TRY AGAIN';
        } finally {
            clipBtn.disabled = false;
        }
        return;
    }
    if (clipFile && navigator.share && navigator.canShare?.({ files: [clipFile] })) {
        try {
            await navigator.share({ files: [clipFile], title: 'Blink Stop', text });
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return; // The clip stays here.
        }
    }
    const link = document.createElement('a');
    link.download = name;
    link.href = clipUrl;
    link.click();
});
const finalScoreSub = document.getElementById('final-score-sub');
const gameOverWorldRecord = document.getElementById('game-over-world-record');

// Face Tracking Status
const faceStatus = document.getElementById('face-status');
const faceStatusText = document.getElementById('face-status-text');

// Game State
let gameState = 'MENU'; 
let currentMode = 'CLASSIC'; 
let startTime = 0;
let animationFrameId;
let calibrationFrameId;
let precisionTarget = 10.00;
let precisionChoice = 10; // The player's own pick; Precision starts with it in one tap. 
let calibrationStartTime = 0;
let calibrationLastFrame = null;
let calibrationFirstFrame = null;
const calibrationHintText = 'Face the camera with your eyes comfortably open. Put a light in front of you, not behind you.';
let calibrationLastEye = null;
let lastScore = null;
let lastResult = null;
let activeChallenge = null;
let currentEAR = 0.3;
let baselineEAR = 0.3;
let minEARValue = 0.3;
let cameraSession = 0;
let surpriseRound = null;
let soundEnabled = true;
let demoRound = null;
let demoReturnState = 'MENU';
let demoFrameId;
const faceLoss = createFaceLossTracker();
const calibration = createCalibrationTracker();
const tracking = createTrackingFreshness();
function beginChallenge(challenge) {
    if (!['MENU', 'GAME_OVER'].includes(gameState)) return;
    hideChallengeBanner();
    showMenu(); // Release the previous player's camera before the handoff.
    activeChallenge = challenge;
    precisionTarget = challenge.mode === 'PRECISION' ? challenge.target : precisionTarget;
    document.getElementById('challenge-status').textContent = `${challenge.mode}: friend's reported result ${formatScore(challenge.mode, challenge.score)}${challenge.mode === 'PRECISION' ? ' target' : ''}.`;
    if (challenge.mode === 'SURPRISE') {
        container.classList.add('surprise-mode');
        modeSelection.classList.add('hidden');
        surpriseOptions.classList.remove('hidden');
        document.getElementById('surprise-start-btn').focus();
    } else startGame(challenge.mode);
}
// A friend's challenge link: show the number to beat, in their skin. The camera stays
// off until the player taps to play.
const challengeBanner = document.getElementById('challenge-banner');
let linkedChallenge = null;
function hideChallengeBanner() {
    linkedChallenge = null;
    challengeBanner.classList.add('hidden');
}
function showChallengeBanner(challenge, skin) {
    linkedChallenge = challenge;
    if (skin) applySkin(skin);
    const { title, line } = challengeHeadline(challenge, skin || currentSkin);
    document.getElementById('challenge-banner-title').textContent = `${SKINS[currentSkin].icon} ${title}`;
    document.getElementById('challenge-banner-line').textContent = line;
    challengeBanner.classList.remove('hidden');
}
document.getElementById('challenge-banner-play').addEventListener('click', () => { if (linkedChallenge) beginChallenge(linkedChallenge); });
document.getElementById('challenge-banner-dismiss').addEventListener('click', hideChallengeBanner);
const social = createSocialUI(beginChallenge, { onLinkedChallenge: showChallengeBanner });

// Eye tracking (about 10 MB) gets ready while the player is still on the home screen,
// so a slow connection is spent here and not inside a round's calibration time.
let eyeTrackingWarm = null;
let eyeTrackingReady = false;
function setEyeTrackingStatus(text) {
    if (eyeTrackingStatus && eyeTrackingStatus.textContent !== text) eyeTrackingStatus.textContent = text;
}
function warmEyeTracking() {
    if (eyeTrackingWarm) return eyeTrackingWarm;
    if (typeof FaceMesh !== 'function') return (eyeTrackingWarm = Promise.resolve(false));
    setEyeTrackingStatus('Getting eye tracking ready...');
    const mesh = new FaceMesh({ locateFile: file => `vendor/face_mesh/${file}` });
    mesh.setOptions({ maxNumFaces: 2, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    eyeTrackingWarm = Promise.resolve()
        .then(() => (typeof mesh.initialize === 'function' ? mesh.initialize() : undefined))
        .then(() => {
            eyeTrackingReady = true;
            setEyeTrackingStatus('Eye tracking ready. Pick a game!');
            setTimeout(() => { if (eyeTrackingReady) setEyeTrackingStatus(''); }, 4000);
            return true;
        })
        .catch(err => {
            console.warn('Eye tracking warm-up failed:', err);
            setEyeTrackingStatus('');
            return false;
        })
        .finally(() => { try { mesh.close(); } catch {} });
    return eyeTrackingWarm;
}

// The offline copy is saved after the warm-up, so a first visit downloads the model
// once instead of twice at the same time.
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./service-worker.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed: ', err));
}
window.addEventListener('load', () => {
    // Never hold the offline copy back for long if the warm-up is slow or stuck.
    Promise.race([warmEyeTracking(), new Promise(resolve => setTimeout(resolve, 20000))]).finally(registerServiceWorker);
});

// Initialize Audio on user interaction
document.addEventListener('click', () => {
    audioManager.resume();
});

// Camera problems show at the top of the home screen, with a way to try again.
let retryMode = null;
function showCameraProblem(message, { restart = false } = {}) {
    cameraError.textContent = message;
    cameraError.classList.remove('hidden');
    restartCameraBtn.classList.toggle('hidden', !restart);
    cameraRetryBtn.classList.toggle('hidden', restart || !retryMode);
    cameraProblem.classList.remove('hidden');
    try { cameraProblem.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); } catch {}
}
function hideCameraProblem() {
    cameraError.classList.add('hidden');
    restartCameraBtn.classList.add('hidden');
    cameraRetryBtn.classList.add('hidden');
    cameraProblem.classList.add('hidden');
}

// A quick double tap must not open a menu and then start whatever sits under the
// finger in it (Blink Olympics then Stare-down). Back buttons clear the guard.
const TAP_GUARD_MS = 450;
let lastMenuTapAt = -Infinity;
function tapTooSoon() { return performance.now() - lastMenuTapAt < TAP_GUARD_MS; }
function armTapGuard() { lastMenuTapAt = performance.now(); }
function clearTapGuard() { lastMenuTapAt = -Infinity; }

function setPrecisionChoice(seconds) {
    precisionChoice = seconds;
    if (precisionTargetLabel) precisionTargetLabel.textContent = `${seconds} seconds`;
    optionBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.time) === seconds));
}

// MediaPipe Setup
function createSessionFaceMesh(session, maxNumFaces = 1) {
    const mesh = new FaceMesh({ locateFile: file => `vendor/face_mesh/${file}` });
    mesh.setOptions({
        maxNumFaces,
        refineLandmarks: false, // Keep OFF for performance
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    // The callback belongs to this instance, not the mutable current mesh.
    mesh.onResults(results => onResults(results, session));
    return mesh;
}

let faceMesh = null;
let activeMesh = null;
function closeFaceMesh(mesh) {
    Promise.resolve().then(() => mesh.close()).catch(error => console.warn('FaceMesh close failed:', error));
}

// Custom Camera Loop with Decoupled Detection
let resultSession = null;
const inference = createSerializedInference(async (image, session) => {
    const mesh = faceMesh;
    activeMesh = mesh;
    resultSession = session;
    try {
        await mesh.send({ image });
    } finally {
        resultSession = null;
        activeMesh = null;
        if (mesh !== faceMesh) closeFaceMesh(mesh);
    }
});
let detectionInterval = null;

async function startCameraLoop(session) {
    // 1. Start Video Stream First (Independent of FaceMesh)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: window.innerWidth < 768 ? 480 : 640 },
                height: { ideal: window.innerWidth < 768 ? 360 : 480 },
                facingMode: 'user'
            }
        });
        if (session !== cameraSession || document.hidden) {
            stream.getTracks().forEach(track => track.stop());
            return false;
        }
        videoElement.srcObject = stream;
        stream.getTracks().forEach(track => track.addEventListener('ended', () => {
            if (session !== cameraSession || videoElement.srcObject !== stream) return;
            showMenu();
            showCameraProblem('Camera disconnected. Check your camera and try again.');
        }));

        // Wait for video to actually play
        if (videoElement.readyState < 1) {
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = resolve;
                videoElement.onerror = () => reject(new Error('Camera video unavailable'));
            });
        }
        if (session !== cameraSession || document.hidden) return false;
        await videoElement.play();
        if (session !== cameraSession || document.hidden) return false;

        // 2. If eye tracking is still downloading, finish that first (one download, and
        // calibration time only starts once it can actually see eyes).
        if (eyeTrackingWarm && !eyeTrackingReady) {
            loadingMsg.innerText = 'LOADING EYE TRACKING...';
            await eyeTrackingWarm;
            if (session !== cameraSession || document.hidden) return false;
        }

        // 3. Start Detection Loop (Decoupled)
        startDetectionLoop(session);
        return true;

    } catch (err) {
        console.error("Camera init error:", err);
        throw err; // Propagate to caller
    }
}

function startDetectionLoop(session) {
    if (detectionInterval) clearInterval(detectionInterval);

    // Run detection at 20 FPS (good balance between performance and accuracy)
    detectionInterval = setInterval(async () => {
        if (videoElement.paused || videoElement.ended) return;
        try {
            await inference.send(videoElement, session);
        } catch (error) {
            console.warn("FaceMesh skipped:", error);
        }
    }, 50); // 50ms = 20 FPS
}

function stopDetectionLoop() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = null;
    // A send already in flight remains locked until it actually settles.
}


// Initialize
modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        if (tapTooSoon()) return;
        armTapGuard();
        hideCameraProblem();
        activeChallenge = null;
        pickSkinNext = SKIN_PICK_MODES.includes(mode);

        if (mode === 'CLASSIC') {
            startGame('CLASSIC');
        } else if (mode === 'PRECISION') {
            precisionTarget = precisionChoice;
            startGame('PRECISION');
        } else if (mode === 'ENDURANCE') {
            startGame('ENDURANCE');
        } else if (mode === 'DAILY') {
            startGame('DAILY');
        } else if (mode === 'VERSUS') {
            versusNames = null;
            startGame('VERSUS');
        } else if (mode === 'DISTRACT') {
            startGame('DISTRACT');
        } else if (mode === 'BALLOON') {
            startGame('BALLOON');
        } else if (mode === 'OLYMPICS') {
            modeSelection.classList.add('hidden');
            olympicsOptions.classList.remove('hidden');
            olympicsOptions.querySelector('[data-mode="BALLOON"]').focus();
        } else if (mode === 'PARTY') {
            olympicsOptions.classList.add('hidden');
            partyOptions.classList.remove('hidden');
            document.getElementById('party-names').focus();
        } else if (mode === 'SURPRISE') {
            container.classList.add('surprise-mode');
            modeSelection.classList.add('hidden');
            surpriseOptions.classList.remove('hidden');
            document.getElementById('surprise-start-btn').focus();
        }
    });
});

document.getElementById('surprise-start-btn').addEventListener('click', () => { pickSkinNext = true; startGame('SURPRISE'); });
document.getElementById('calibration-cancel-btn').addEventListener('click', () => (party ? returnToParty() : showMenu()));
restartCameraBtn.addEventListener('click', () => window.location.reload());
cameraRetryBtn.addEventListener('click', () => {
    if (!retryMode || gameState !== 'MENU') return;
    if (retryMode === 'PRECISION') precisionTarget = precisionChoice;
    startGame(retryMode);
});
document.getElementById('precision-change-btn').addEventListener('click', () => {
    if (tapTooSoon()) return;
    armTapGuard();
    hideCameraProblem();
    modeSelection.classList.add('hidden');
    precisionOptions.classList.remove('hidden');
    (precisionOptions.querySelector('.option-btn.active') || optionBtns[0])?.focus();
});
document.getElementById('surprise-back-btn').addEventListener('click', () => {
    clearTapGuard();
    activeChallenge = null;
    document.getElementById('challenge-status').textContent = '';
    container.classList.remove('surprise-mode');
    surpriseOptions.classList.add('hidden');
    modeSelection.classList.remove('hidden');
    document.querySelector('[data-mode="SURPRISE"]').focus();
});

document.getElementById('demo-menu-btn').addEventListener('click', startDemoAd);
demoBonusBtn.addEventListener('click', startDemoAd);
document.getElementById('demo-skip-btn').addEventListener('click', () => finishDemoAd(false));
demoClaimBtn.addEventListener('click', () => finishDemoAd(true));

function startDemoAd() {
    if (gameState !== 'MENU' && gameState !== 'GAME_OVER') return;
    if (gameState === 'GAME_OVER' && lastScore === null) return;
    demoReturnState = gameState;
    gameOverCameraStop.cancel();
    stopCameraAndDetection();
    audioManager.stopDrone();
    container.classList.add('ad-demo');
    surpriseOverlay.classList.add('hidden');
    menuScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameState = 'AD_DEMO';
    demoRound = createRewardedDemo(performance.now());
    demoClaimBtn.disabled = true;
    demoScreen.classList.remove('hidden');
    document.getElementById('demo-skip-btn').focus();
    updateDemoAd();
}

function updateDemoAd() {
    if (gameState !== 'AD_DEMO' || !demoRound) return;
    const progress = demoRound.observe(performance.now());
    const message = progress.complete ? 'Preview complete — your demo theme is ready.' : `${Math.ceil(progress.remaining / 1000)} seconds`;
    if (demoCountdown.textContent !== message) demoCountdown.textContent = message;
    demoClaimBtn.disabled = !progress.complete;
    if (!progress.complete) demoFrameId = requestAnimationFrame(updateDemoAd);
}

function finishDemoAd(claim) {
    if (gameState !== 'AD_DEMO' || !demoRound) return;
    if (claim && !demoRound.claim(performance.now())) return;
    if (claim) document.body.classList.add('theme-demo');
    demoRound.cancel();
    demoRound = null;
    cancelAnimationFrame(demoFrameId);
    demoScreen.classList.add('hidden');
    container.classList.remove('ad-demo');
    gameState = demoReturnState;
    const screen = gameState === 'GAME_OVER' ? gameOverScreen : menuScreen;
    screen.classList.remove('hidden');
    (gameState === 'GAME_OVER' ? demoBonusBtn : document.getElementById('demo-menu-btn')).focus();
}

precisionBackBtn.addEventListener('click', () => {
    clearTapGuard();
    precisionOptions.classList.add('hidden');
    modeSelection.classList.remove('hidden');
    document.querySelector('[data-mode="PRECISION"]').focus();
});

optionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (tapTooSoon()) return;
        // The pick is remembered, so the Precision button starts it next time.
        setPrecisionChoice(Number(e.currentTarget.dataset.time));
        precisionTarget = precisionChoice;
        pickSkinNext = true;

        // Start Game
        startGame('PRECISION');
    });
});

restartBtn.addEventListener('click', () => startGame(currentMode));
menuBtn.addEventListener('click', () => (party ? returnToParty() : showMenu()));

// Home button in HUD (MENU button)
const homeBtn = document.getElementById('home-btn');
if (homeBtn) {
    homeBtn.addEventListener('click', () => {
        if (['PLAYING', 'ENDURANCE', 'VERSUS', 'BALLOON'].includes(gameState)) {
            if (confirm(party ? 'Stop this round? The turn will start over.' : 'Return to menu? Your current game will end.')) {
                if (party) returnToParty();
                else endGame('MENU_EXIT');
            }
        } else if (party) {
            returnToParty();
        } else {
            showMenu();
        }
    });
}

// Home: one clear way back from every screen. In-game screens with the HUD use its own
// Home button; everywhere else a floating Home button sits at the top left.
const homeFab = document.getElementById('home-fab');
function updateHomeFab() {
    const onMenu = !menuScreen.classList.contains('hidden');
    const atHome = onMenu && !modeSelection.classList.contains('hidden');
    const hudUp = !gameHud.classList.contains('hidden');
    const show = !atHome && !hudUp;
    homeFab.classList.toggle('hidden', !show);
    document.body.classList.toggle('home-fab-on', show);
    document.body.classList.toggle('menu-sub', onMenu && !atHome);
}
homeFab.addEventListener('click', () => {
    if (['PLAYING', 'ENDURANCE', 'VERSUS', 'BALLOON'].includes(gameState)) {
        if (!confirm('Go home? Your current game will end.')) return;
    } else if (party && !confirm('Go home? This ends the party.')) return;
    clearTapGuard();
    showMenu();
    try { window.scrollTo?.(0, 0); } catch { /* not scrollable */ }
    updateHomeFab();
});
if (typeof MutationObserver === 'function') {
    new MutationObserver(updateHomeFab).observe(document.getElementById('ui-layer'), { subtree: true, attributes: true, attributeFilter: ['class'] });
}
updateHomeFab();

// Stop camera and detection helper function
function stopCameraAndDetection() {
    cameraSession++;
    stopDetectionLoop();
    // Retire the instance now, but never close a send still in progress.
    const mesh = faceMesh;
    faceMesh = null;
    if (mesh && mesh !== activeMesh) closeFaceMesh(mesh);

    // Stop video stream to release camera
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        console.log('Camera stopped');
    }
}


const gameOverCameraStop = createGameOverCameraStop(stopCameraAndDetection);

// Leaderboard System
const Leaderboard = {
    get(mode) {
        try {
            const data = localStorage.getItem(`blink_lb_${mode}`);
            if (!data) return [];
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed) || !parsed.every(item =>
                (typeof item === 'number' && Number.isFinite(item)) ||
                (item && typeof item === 'object' && typeof item.name === 'string' && typeof item.score === 'number' && Number.isFinite(item.score)))) return null;
            // Migration: Convert old number scores to objects, without rewriting stored data.
            return parsed.map(item => typeof item === 'number' ? { name: 'ANONYMOUS', score: item } : item);
        } catch (err) {
            console.warn('Local scores unavailable:', err);
            return null;
        }
    },
    save(mode, score, name) {
        const scores = this.get(mode);
        if (scores === null) return false;
        scores.push({ name: name || 'ANONYMOUS', score: score });

        // Sort: Classic (Higher is better), Precision (Lower is better)
        if (mode === 'PRECISION') {
            scores.sort((a, b) => a.score - b.score);
        } else {
            scores.sort((a, b) => b.score - a.score);
        }

        const top5 = scores.slice(0, 5);
        try {
            localStorage.setItem(`blink_lb_${mode}`, JSON.stringify(top5));
            return true;
        } catch (err) {
            console.warn('Local score not saved:', err);
            return false;
        }
    },
    render(mode) {
        const scores = this.get(mode);
        leaderboardList.innerHTML = '';
        if (scores === null) {
            leaderboardList.textContent = 'Local scores unavailable; existing data was not changed';
            return;
        }

        if (scores.length === 0) {
            leaderboardList.innerHTML = '<li>No scores yet</li>';
            return;
        }

        scores.forEach((entry, index) => {
            appendScore(leaderboardList, entry, index, mode, document);
        });
    }
};

// Save Score Event
saveScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim().toUpperCase();
    if (!name) return;

    if (lastScore === null) return;

    // Save to local leaderboard; do not claim success if storage is corrupt or unavailable.
    if (!Leaderboard.save(currentMode, lastScore, name)) {
        saveScoreBtn.innerText = 'NOT SAVED — LOCAL STORAGE UNAVAILABLE';
        return;
    }
    Leaderboard.render(currentMode);

    saveScoreBtn.innerText = "SAVED (LOCAL)";

    saveScoreBtn.disabled = true;
    playerNameInput.disabled = true;
});

// Share Logic
shareBtn.addEventListener('click', async () => {
    if (lastScore === null || !lastResult) return;
    const payload = sharePayload(lastResult);

    if (window.Capacitor?.isNativePlatform?.()) {
        try {
            const { shareNativeScore } = await import('./deviceActions.mjs');
            await shareNativeScore(payload);
        } catch (error) {
            console.log('Native share cancelled or unavailable:', error);
        }
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share(payload);
        } catch (err) {
            console.log('Share failed:', err);
        }
    } else {
        // Fallback to clipboard; keep Share retryable when unavailable or denied.
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(shareClipboardText(lastResult));
            const originalText = shareBtn.innerText;
            shareBtn.innerText = "COPIED!";
            setTimeout(() => shareBtn.innerText = originalText, 2000);
        } catch (err) {
            shareBtn.innerText = 'CLIPBOARD UNAVAILABLE — COPY SCORE MANUALLY';
        }
    }
});

function clearSelfie() {
    selfieFile = null;
    selfiePreview.removeAttribute('src');
    selfieContainer.classList.add('hidden');
}

// Save Selfie Logic
selfieBtn.addEventListener('click', async () => {
    if (!selfiePreview.src || selfieBtn.disabled) return;
    if (window.Capacitor?.isNativePlatform?.()) {
        selfieBtn.disabled = true;
        try {
            const { exportNativeSelfie } = await import('./deviceActions.mjs');
            await exportNativeSelfie(selfiePreview.src);
            selfieBtn.innerText = 'SHARE PHOTO';
        } catch (error) {
            selfieBtn.innerText = 'SHARE CANCELLED — TRY AGAIN';
        } finally {
            selfieBtn.disabled = false;
        }
        return;
    }
    await shareJpegOnWeb(selfiePreview.src, selfieFile, 'blink-stop-photo');
});

// Web: share sheet with the prepared file where supported, otherwise a download.
async function shareJpegOnWeb(dataUrl, file, baseName) {
    if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'Blink Stop', text: `${shareLine} Play free: ${shareUrl} #BlinkStop` });
            return 'shared';
        } catch (error) {
            if (error?.name === 'AbortError') return 'cancelled'; // The photo stays here.
        }
    }
    const link = document.createElement('a');
    link.download = `${baseName}-${Date.now()}.jpg`;
    link.href = dataUrl;
    link.click();
    return 'downloaded';
}

function jpegFile(dataUrl, name) {
    if (typeof File !== 'function' || typeof atob !== 'function') return null;
    // Prepare bytes before the tap so the browser keeps share activation.
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), ch => ch.charCodeAt(0));
    return new File([bytes], name, { type: 'image/jpeg' });
}

// Framed result photo from the frozen camera frame (hats included).
function makeSelfie(caption) {
    try {
        const dataUrl = composeSelfie(canvasElement, currentSkin, caption, document);
        selfiePreview.src = dataUrl;
        selfieContainer.classList.remove('hidden');
        selfieFile = jpegFile(dataUrl, 'blink-stop-photo.jpg');
        return dataUrl;
    } catch (e) {
        console.error("Selfie capture failed", e);
        selfieContainer.classList.add('hidden');
        return null;
    }
}

function showDare(box, textEl, target) {
    if (!dareDeck) dareDeck = createDeck(forfeitCards(currentSkin));
    dareTarget = target;
    textEl.textContent = `Dare for ${target}: ${dareDeck.next()}`;
    box.classList.remove('hidden');
}
document.getElementById('new-dare-btn').addEventListener('click', () => { if (dareTarget) showDare(dareBox, dareText, dareTarget); });
document.getElementById('party-new-dare-btn').addEventListener('click', () => { if (dareTarget) showDare(partyDareBox, partyDare, dareTarget); });

function stopBalloons() {
    cancelAnimationFrame(balloonFrameId);
    balloonRound = null;
    balloonEyeClosed = false;
    balloonCtx.clearRect(0, 0, balloonLayer.width, balloonLayer.height);
    balloonLayer.classList.add('hidden');
    livesDisplay.classList.add('hidden');
}

function hideJoke() {
    stopBalloons();
    jokeCard.classList.add('hidden');
    jokeCard.textContent = '';
    jokeShownAt = -Infinity;
}
// Distraction round: a new joke every 4 seconds, starting 1.5 seconds in.
function updateJokes(elapsedSeconds) {
    if (elapsedSeconds < 1.5 || elapsedSeconds - jokeShownAt < 4) return;
    if (!jokeDeck) jokeDeck = createDeck(jokeCards(currentSkin));
    jokeShownAt = elapsedSeconds;
    jokeCard.textContent = jokeDeck.next();
    jokeCard.classList.remove('hidden');
}

// ---------- Balloon Pop ----------
function sizeBalloonLayer() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round((balloonLayer.clientWidth || window.innerWidth || 360) * ratio);
    const height = Math.round((balloonLayer.clientHeight || window.innerHeight || 640) * ratio);
    if (balloonLayer.width !== width || balloonLayer.height !== height) {
        balloonLayer.width = width;
        balloonLayer.height = height;
    }
}

// Lives are shown as three balloons at the top of the screen; a lost one fades out.
function renderBalloonLives() {
    const left = balloonRound ? balloonRound.livesLeft() : BALLOON_MISSES;
    const icons = [];
    for (let i = 0; i < BALLOON_MISSES; i++) {
        const icon = document.createElement('span');
        icon.textContent = '🎈';
        icon.className = i < left ? 'life' : 'life lost';
        icons.push(icon);
    }
    livesDisplay.replaceChildren?.(...icons);
    livesDisplay.setAttribute('aria-label', `${left} ${left === 1 ? 'life' : 'lives'} left`);
}

function startBalloonRound() {
    gameState = 'BALLOON';
    balloonRound = createBalloonRound();
    balloonEyeClosed = false;
    balloonEnd = null;
    startTime = Date.now();
    balloonLayer.classList.remove('hidden');
    sizeBalloonLayer();
    hudLabel.innerText = 'POPPED';
    scoreDisplay.innerText = '0';
    gameHud.classList.remove('hidden');
    gameHud.classList.add('active');
    livesDisplay.classList.remove('hidden');
    renderBalloonLives();
    faceStatus.classList.remove('hidden', 'not-detected');
    faceStatusText.innerText = 'Blink when a balloon is in the zone';
    updateBalloonLoop();
}

function updateBalloonLoop() {
    if (gameState !== 'BALLOON' || !balloonRound) return;
    const now = performance.now();
    if (tracking.stale(now)) return endBalloon(true);
    if (balloonRound.update(now).length) {
        if (navigator.vibrate) navigator.vibrate(60);
        faceStatusText.innerText = 'One got away!';
        renderBalloonLives();
    }
    sizeBalloonLayer();
    drawBalloons(balloonCtx, balloonRound, currentSkin, balloonLayer.width, balloonLayer.height, now);
    if (balloonRound.over) return endBalloon(false);
    balloonFrameId = requestAnimationFrame(updateBalloonLoop);
}

// A pop is the moment the eyes close; holding them shut does not pop again.
function handleBalloonEye(eye, now) {
    if (!balloonRound) return;
    if (eye && Number.isFinite(eye.minEar) && eye.minEar > 0 && eye.minEar <= 1) {
        if (!tracking.observe(now)) return endBalloon(true);
        faceLoss.observe(true, now);
        faceStatus.classList.remove('not-detected');
        currentEAR = eye.ear;
        minEARValue = eye.minEar;
        if (eye.blinking && !balloonEyeClosed) {
            const result = balloonRound.blink(now);
            if (result?.hit) {
                scoreDisplay.innerText = String(result.score);
                faceStatusText.innerText = 'POP!';
                if (navigator.vibrate) navigator.vibrate(25);
            } else if (result) {
                faceStatusText.innerText = 'Too early!';
                renderBalloonLives();
                if (navigator.vibrate) navigator.vibrate(60);
            }
            if (balloonRound.over) return endBalloon(false);
        }
        balloonEyeClosed = !!eye.blinking;
    } else {
        resetBlinkState();
        balloonEyeClosed = false;
        faceStatus.classList.add('not-detected');
        faceStatusText.innerText = 'Face not detected – move closer & improve lighting';
        if (faceLoss.observe(false, now)) endBalloon(true);
    }
}

function endBalloon(faceLost) {
    if (gameState !== 'BALLOON' || !balloonRound) return;
    balloonEnd = { score: balloonRound.score, elapsed: balloonRound.elapsed(performance.now()), faceLost };
    endGame('BALLOON_OVER');
}

// ---------- Party tournament ----------
document.getElementById('party-back-btn').addEventListener('click', () => {
    clearTapGuard();
    partyOptions.classList.add('hidden');
    olympicsOptions.classList.remove('hidden');
    olympicsOptions.querySelector('[data-mode="PARTY"]').focus();
});
document.getElementById('olympics-back-btn').addEventListener('click', () => {
    clearTapGuard();
    olympicsOptions.classList.add('hidden');
    modeSelection.classList.remove('hidden');
    document.querySelector('[data-mode="OLYMPICS"]').focus();
});
document.getElementById('party-start-btn').addEventListener('click', () => {
    const status = document.getElementById('party-setup-status');
    try {
        party = createParty(parseNames(document.getElementById('party-names').value));
    } catch (error) {
        status.textContent = error.message;
        return;
    }
    status.textContent = '';
    partyReel = [];
    reelUrl = ''; reelFile = null;
    dareDeck = null;
    showPartyScreen('NEXT_TURN');
});
partyGoBtn.addEventListener('click', () => {
    if (!party) return;
    if (partyStage === 'NEXT_TURN') {
        partyTurn = true;
        versusNames = null;
        startGame('CLASSIC');
    } else if (partyStage === 'FINAL') {
        partyTurn = false;
        versusNames = party.finalists();
        startGame('VERSUS');
    } else if (partyStage === 'CHAMPION') {
        const names = party.players.join('\n');
        endParty();
        showMenu();
        modeSelection.classList.add('hidden');
        partyOptions.classList.remove('hidden');
        document.getElementById('party-names').value = names;
    }
});
partySkipBtn.addEventListener('click', () => {
    if (!party || partyStage !== 'FINAL') return;
    party.skipFinal();
    showPartyScreen('CHAMPION');
});
document.getElementById('party-end-btn').addEventListener('click', () => { endParty(); showMenu(); });
partyNextBtn.addEventListener('click', () => { if (party) returnToParty(); });
partyReelBtn.addEventListener('click', async () => {
    if (!reelUrl || partyReelBtn.disabled) return;
    if (window.Capacitor?.isNativePlatform?.()) {
        partyReelBtn.disabled = true;
        try {
            const { exportNativeSelfie } = await import('./deviceActions.mjs');
            await exportNativeSelfie(reelUrl);
        } catch (error) {
            partyReelStatus.textContent = 'Sharing cancelled. Your reel is still here.';
        } finally { partyReelBtn.disabled = false; }
        return;
    }
    const result = await shareJpegOnWeb(reelUrl, reelFile, 'blink-stop-reel');
    if (result === 'cancelled') partyReelStatus.textContent = 'Sharing cancelled. Your reel is still here.';
});

function endParty() {
    party = null; partyStage = null; partyTurn = false; versusNames = null;
    partyReel = []; reelUrl = ''; reelFile = null; dareTarget = '';
}

// From a finished round (or a cancelled one) back to the party's next step.
function returnToParty() {
    if (!party) return showMenu();
    gameOverCameraStop.cancel();
    cancelAnimationFrame(animationFrameId);
    cancelAnimationFrame(calibrationFrameId);
    stopCameraAndDetection();
    audioManager.stopDrone();
    hideJoke();
    clearSelfie();
    faceLoss.reset();
    resetBlinkState();
    versusMatch = null;
    loadingMsg.style.display = 'none';
    gameOverScreen.classList.remove('versus-result', 'party-turn');
    partyNextBtn.classList.add('hidden');
    dareBox.classList.add('hidden');
    if (party.champion()) showPartyScreen('CHAMPION');
    else if (party.turnsDone()) showPartyScreen('FINAL');
    else showPartyScreen('NEXT_TURN');
}

function renderStandings() {
    partyStandings.innerHTML = '';
    party.standings().forEach((entry, index) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        const score = document.createElement('span');
        name.textContent = `${index + 1}. ${entry.name}`;
        score.textContent = `${entry.score.toFixed(2)}s`;
        li.append(name, score);
        partyStandings.appendChild(li);
    });
}

function showPartyScreen(stage) {
    partyStage = stage;
    gameState = 'PARTY';
    partyTurn = false;
    [menuScreen, gameOverScreen, calibrationScreen, gameHud, enduranceScreen].forEach(el => { el.classList.add('hidden'); el.classList.remove('active'); });
    faceStatus.classList.add('hidden');
    partyOptions.classList.add('hidden');
    container.className = 'container';
    partyDareBox.classList.add('hidden');
    partySkipBtn.classList.add('hidden');
    partyReelBtn.classList.add('hidden');
    partyReelStatus.textContent = '';
    renderStandings();
    if (stage === 'NEXT_TURN') {
        partyTitle.textContent = 'PASS THE PHONE';
        partyMessage.textContent = `Turn ${party.turnNumber()} of ${party.players.length}: ${party.current()}, you're up. Eyes open, no do-overs.`;
        partyGoBtn.textContent = `START ${party.current().toUpperCase()}'S TURN`;
    } else if (stage === 'FINAL') {
        const [left, right] = party.finalists();
        partyTitle.textContent = 'THE FINAL';
        partyMessage.textContent = `${left} vs ${right}, head-to-head. Sit side by side with a light in front of you: ${left} on the left, ${right} on the right. First to blink loses.`;
        partyGoBtn.textContent = 'START THE FINAL';
        partySkipBtn.classList.remove('hidden');
    } else {
        const champion = party.champion();
        partyTitle.textContent = `👑 ${champion.toUpperCase()} WINS!`;
        partyMessage.textContent = party.finalPlayed() ? `${champion} won the final.` : `${champion} had the longest stare.`;
        partyGoBtn.textContent = 'NEW PARTY';
        const last = party.lastPlace();
        if (last && last !== champion) showDare(partyDareBox, partyDare, last);
        if (partyReel.length) {
            partyReelBtn.classList.remove('hidden');
            buildReel(champion);
        }
    }
    partyScreen.classList.remove('hidden');
    partyScreen.classList.add('active');
    partyGoBtn.focus();
}

function addToReel(url, name) {
    if (party && url) partyReel.push({ url, name });
}

async function buildReel(champion) {
    partyReelBtn.disabled = true;
    partyReelStatus.textContent = 'Making your Blink Reel...';
    const reelParty = party;
    try {
        const photos = await Promise.all(partyReel.slice(-9).map(({ url, name }) => new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve({ image, name });
            image.onerror = () => resolve({ image: null, name });
            image.src = url;
        })));
        if (party !== reelParty) return;
        reelUrl = drawReel(photos, currentSkin, { champion, doc: document });
        shareLine = `Our Blink Stop party reel 🎉 ${champion} took the crown!`;
        shareUrl = PUBLIC_PLAY_URL;
        reelFile = jpegFile(reelUrl, 'blink-stop-reel.jpg');
        partyReelStatus.textContent = `${photos.length} caught-blinking photo${photos.length === 1 ? '' : 's'} in one picture.`;
    } catch (error) {
        console.warn('Reel failed:', error);
        partyReelStatus.textContent = 'The reel could not be made on this device.';
    } finally { partyReelBtn.disabled = false; }
}

// ---------- Head-to-head ----------
function versusName(side) {
    return versusNames ? versusNames[side === 'LEFT' ? 0 : 1] : side === 'LEFT' ? 'Left player' : 'Right player';
}

function startVersusCalibration() {
    cancelAnimationFrame(calibrationFrameId);
    gameState = 'VERSUS_CALIBRATING';
    versusMatch = createVersusMatch();
    versusEvent = null;
    versusLastFrame = null;
    calibrationStartTime = performance.now();
    calibrationStatus.innerText = 'FINDING BOTH FACES';
    calibrationHint.innerText = versusNames
        ? `${versusNames[0]} on the left, ${versusNames[1]} on the right, cheek to cheek. Light in front of you, eyes open normally.`
        : 'Two players side by side, both faces in view. Light in front of you, eyes open normally.';
    calibrationLoader.style.width = '0%';
    [menuScreen, gameOverScreen, partyScreen].forEach(el => { el.classList.add('hidden'); el.classList.remove('active'); });
    calibrationScreen.classList.remove('hidden');
    calibrationScreen.classList.add('active');
    updateVersusLoop();
}

function handleVersusFrame(faces, now) {
    if (!versusMatch) return;
    versusLastFrame = now;
    versusEvent = versusMatch.observe(faces, now, videoElement.videoWidth, videoElement.videoHeight);
    if (versusEvent.started && gameState === 'VERSUS_CALIBRATING') beginVersusPlay();
    else if (versusMatch.phase === 'DONE' && gameState === 'VERSUS') endVersus(versusMatch.outcome);
}

function beginVersusPlay() {
    gameState = 'VERSUS';
    calibrationScreen.classList.add('hidden');
    calibrationScreen.classList.remove('active');
    startTime = Date.now();
    versusStartedAt = performance.now();
    if (soundEnabled) audioManager.startDrone();
    gameHud.classList.remove('hidden');
    gameHud.classList.add('active');
    faceStatus.classList.remove('hidden', 'not-detected');
    faceStatusText.innerText = `${versusName('LEFT')} vs ${versusName('RIGHT')}`;
}

function updateVersusLoop() {
    const now = performance.now();
    if (gameState === 'VERSUS_CALIBRATING') {
        const elapsed = now - calibrationStartTime;
        calibrationLoader.style.width = `${(versusEvent?.progress || 0) * 100}%`;
        if (elapsed >= 20000) {
            const back = party ? returnToParty : showMenu;
            back();
            const message = 'Could not see both faces clearly. Sit side by side, cheek to cheek, with a light in front of you, and hold the phone at eye level.';
            if (party) partyMessage.textContent = message;
            else showCameraProblem(message);
            return;
        }
        const stale = versusLastFrame === null || now - versusLastFrame >= 1000;
        const message = stale ? (elapsed >= 4000 ? 'WAITING FOR EYE TRACKING' : 'FINDING BOTH FACES')
            : versusEvent?.status === 'NEED_TWO' ? `${versusEvent.faces === 1 ? 'ONE FACE FOUND' : 'NO FACES FOUND'}: BOTH OF YOU IN VIEW`
            : versusEvent?.status === 'EYES' ? 'LOOK FORWARD, EYES OPEN NORMALLY' : 'BOTH FACES FOUND: HOLD STEADY';
        if (calibrationStatus.innerText !== message) calibrationStatus.innerText = message;
        calibrationFrameId = requestAnimationFrame(updateVersusLoop);
    } else if (gameState === 'VERSUS') {
        if (versusLastFrame === null || now - versusLastFrame >= 1000) {
            endVersus(versusMatch.stall(now));
            return;
        }
        scoreDisplay.innerText = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
        const lost = versusEvent && versusEvent.faces !== undefined && versusEvent.faces < 2;
        faceStatus.classList[lost ? 'add' : 'remove']('not-detected');
        faceStatusText.innerText = lost ? 'Both faces in view, please!' : `${versusName('LEFT')} vs ${versusName('RIGHT')}`;
        const meterFill = document.getElementById('eye-meter-fill');
        if (meterFill && versusEvent?.openness) meterFill.style.width = `${Math.min(versusEvent.openness.LEFT, versusEvent.openness.RIGHT) * 100}%`;
        animationFrameId = requestAnimationFrame(updateVersusLoop);
    }
}

function endVersus(outcome) {
    if (gameState !== 'VERSUS') return;
    gameState = 'GAME_OVER';
    cancelAnimationFrame(animationFrameId);
    gameOverCameraStop.schedule();
    audioManager.stopDrone();
    faceStatus.classList.add('hidden');
    gameHud.classList.add('hidden');
    gameHud.classList.remove('active');
    container.className = 'container';
    clearSelfie();
    social.render(null);
    lastResult = null;
    lastScore = null;
    saveScoreBtn.disabled = true;
    shareBtn.disabled = true;
    demoBonusBtn.disabled = true;
    finalScoreSub.classList.add('hidden');
    gameOverWorldRecord.classList.add('hidden');
    dareBox.classList.add('hidden');
    gameOverScreen.classList.add('versus-result');
    gameOverScreen.classList.remove('party-turn');
    const time = `${(outcome?.elapsed ?? 0).toFixed(2)}s`;
    let headline, detail;
    if (outcome?.result === 'WIN') {
        const winner = versusName(outcome.winner), loser = versusName(outcome.loser);
        headline = `${winner.toUpperCase()} WINS!`;
        detail = `${loser} blinked first after ${time}`;
        gameOverTitle.style.color = 'var(--neon-cyan)';
        if (soundEnabled) audioManager.playWin();
        showDare(dareBox, dareText, loser);
        if (party && versusNames) {
            party.recordFinal(winner);
            gameOverScreen.classList.add('party-turn'); // The final is decided: no rematch button.
        }
    } else if (outcome?.result === 'TIE') {
        headline = 'DEAD HEAT!';
        detail = `You both blinked at ${time}`;
        gameOverTitle.style.color = 'var(--neon-pink)';
        showDare(dareBox, dareText, `${versusName('LEFT')} and ${versusName('RIGHT')}`);
    } else {
        headline = 'FACE LEFT THE FRAME';
        detail = 'Both faces need to stay in view. Rematch?';
        gameOverTitle.style.color = 'var(--neon-red)';
    }
    gameOverTitle.innerText = headline;
    finalScoreLabel.innerText = 'THE STARE-DOWN LASTED';
    finalScoreVal.innerText = outcome?.result === 'VOID' ? '--' : time;
    finalScoreSub.innerText = detail;
    finalScoreSub.classList.remove('hidden');
    restartBtn.innerText = 'REMATCH';
    shareUrl = PUBLIC_PLAY_URL;
    shareLine = outcome?.result === 'WIN' ? `${versusName(outcome.winner)} won our Blink Stop stare-down 👀 Who's next?` : 'Blink Stop stare-down 👀 Who can beat us?';
    const photo = makeSelfie({ headline, detail });
    if (party && versusNames) {
        if (outcome?.result === 'WIN') addToReel(photo, versusName(outcome.winner));
        partyNextBtn.textContent = party.champion() ? 'CROWN THE CHAMPION' : 'BACK TO THE PARTY';
        partyNextBtn.classList.remove('hidden');
    } else partyNextBtn.classList.add('hidden');
    try {
        canvasCtx.save();
        canvasCtx.fillStyle = "rgba(255, 0, 0, 0.4)";
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
    } catch (e) { /* display only */ }
    gameOverScreen.classList.remove('hidden');
    gameOverScreen.classList.add('active');
}

function startGame(mode) {
    const pickSkin = pickSkinNext && !party;
    pickSkinNext = false;
    if (gameState === 'AD_DEMO') return;
    skinPickScreen.classList.add('hidden');
    social.reset();
    lastResult = null;
    container.className = 'container';
    if (mode === 'SURPRISE') container.classList.add('surprise-mode');
    surpriseOverlay.classList.add('hidden');
    surpriseRound = null;
    soundEnabled = mode !== 'SURPRISE' || surpriseSound.checked;
    clearSelfie();
    hideJoke();
    jokeDeck = null;
    dareBox.classList.add('hidden');
    partyNextBtn.classList.add('hidden');
    gameOverScreen.classList.remove('versus-result', 'party-turn');
    restartBtn.innerText = 'RETRY';
    partyScreen.classList.add('hidden');
    partyScreen.classList.remove('active');
    if (mode !== 'CLASSIC') partyTurn = false;
    gameOverCameraStop.cancel();
    cancelAnimationFrame(calibrationFrameId);
    cancelAnimationFrame(animationFrameId);
    // Abandon any previous camera permission prompt or pending startup.
    stopCameraAndDetection();
    const session = cameraSession;
    faceMesh = createSessionFaceMesh(session, 2); // Two faces: Stare-down needs both; solo keeps the closest player.
    hideCameraProblem();
    retryMode = party ? null : mode;
    currentMode = mode;
    loadingMsg.style.display = 'block';
    loadingMsg.innerText = 'INITIALIZING BLINK DETECTION...';

    // A friend's number to beat stays on screen during their challenge.
    const toBeat = activeChallenge && activeChallenge.mode === mode ? activeChallenge : null;
    challengeHud.classList.toggle('hidden', !toBeat);
    if (toBeat) challengeHudValue.innerText = mode === 'PRECISION' ? `${toBeat.score.toFixed(3)}s off` : formatScore(mode, toBeat.score).replace(' popped', '');
    clearClip();

    // UI Setup based on mode
    if (mode === 'PRECISION') {
        hudLabel.innerText = "TIME";
        targetDisplay.classList.remove('hidden');
        targetDisplay.querySelector('.digital-text-sm').innerText = `${precisionTarget.toFixed(2)}s`;
        worldRecordDisplay.classList.add('hidden');
    } else if (mode === 'CLASSIC') {
        hudLabel.innerText = "TIME";
        targetDisplay.classList.add('hidden');

        // Show WR in Classic
        worldRecordDisplay.classList.remove('hidden');
        wrValue.innerText = "--";

        const scores = Leaderboard.get('CLASSIC');
        const record = scores?.[0];
        wrValue.innerText = scores === null ? 'Unavailable' : record ? `${record.score.toFixed(2)}s` : 'None';
        window.currentWorldRecord = record?.score ?? null;
    } else {
        // Endurance, Daily, Surprise, Distraction and Head-to-head
        hudLabel.innerText = mode === 'VERSUS' ? 'STARE-DOWN' : "TIME";
        targetDisplay.classList.add('hidden');
        worldRecordDisplay.classList.add('hidden');
    }

    if (mode === 'DAILY') {
        const today = new Date().getDay();
        loadingMsg.innerText = `LOADING DAILY MODIFIER #${today}...`;
        if (today % 2 === 0) {
            container.classList.add('chaos-invert');
        } else {
            container.classList.add('chaos-glitch');
        }
    }

    startCameraLoop(session)
        .then(started => {
            if (!started || session !== cameraSession) return;
            loadingMsg.innerText = 'CAMERA READY...';
            if (pickSkin) { showSkinPick(mode); return; }
            setTimeout(() => {
                if (session === cameraSession && !document.hidden) (mode === 'VERSUS' ? startVersusCalibration : startCalibration)();
            }, 500);
        })
        .catch(err => {
            if (session !== cameraSession) return;
            console.error("Camera error:", err);
            loadingMsg.style.display = 'none';

            if (party) { endParty(); retryMode = null; }
            showMenu();
            showCameraProblem(cameraErrorMessage(err));
        });
}

function showSkinPick(mode) {
    gameState = 'SKIN_PICK';
    loadingMsg.style.display = 'none';
    menuScreen.classList.add('hidden');
    menuScreen.classList.remove('active');
    gameOverScreen.classList.add('hidden');
    skinPickMode.textContent = MODE_NAMES[mode] || '';
    skinPickScreen.classList.remove('hidden');
    skinPickScreen.classList.add('active');
    document.getElementById('skin-pick-play').focus();
    updateHomeFab();
}
document.getElementById('skin-pick-play').addEventListener('click', () => {
    if (gameState !== 'SKIN_PICK') return;
    skinPickScreen.classList.add('hidden');
    skinPickScreen.classList.remove('active');
    (currentMode === 'VERSUS' ? startVersusCalibration : startCalibration)();
});

function startCalibration() {
    cancelAnimationFrame(calibrationFrameId);
    gameState = 'CALIBRATING';
    faceLoss.reset();
    resetBlinkState();
    calibration.reset();
    tracking.reset();
    calibrationStartTime = performance.now();
    calibrationLastFrame = null;
    calibrationFirstFrame = null;
    calibrationLastEye = null;
    calibrationStatus.innerText = 'FINDING YOUR EYES';
    calibrationHint.innerText = calibrationHintText;
    calibrationLoader.style.width = '0%';

    menuScreen.classList.add('hidden');
    menuScreen.classList.remove('active');
    precisionOptions.classList.add('hidden');
    surpriseOptions.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');

    calibrationScreen.classList.remove('hidden');
    calibrationScreen.classList.add('active');

    updateCalibrationLoop();
}

function updateCalibrationLoop() {
    if (gameState === 'CALIBRATING') {
        const now = performance.now();
        const elapsed = now - calibrationStartTime;
        const progress = calibration.progress(now);
        calibrationLoader.style.width = `${progress * 100}%`;

        if (elapsed >= 3000 && calibration.ready(now)) {
            finishCalibration();
        } else {
            // The clock that matters starts at the first eye-tracking frame: on a slow
            // connection the first one can take a while, and that is not the player's fault.
            if (calibrationFirstFrame === null && calibrationLastFrame !== null) calibrationFirstFrame = calibrationLastFrame;
            const loading = calibrationFirstFrame === null;
            const timedOut = loading
                ? elapsed >= (eyeTrackingReady ? 15000 : 60000)
                : elapsed >= 15000 && now - calibrationFirstFrame >= 10000;
            if (timedOut) {
                const stalled = calibrationLastFrame === null || now - calibrationLastFrame >= 2000;
                if (party) {
                    returnToParty();
                    partyMessage.textContent = `Couldn't get a clear view of ${party.current()}'s eyes. Face a light, hold the phone at eye level, and try again.`;
                    return;
                }
                showMenu();
                showCameraProblem(stalled
                    ? 'Eye tracking could not start. Tap Restart camera and try again in a well-lit room.'
                    : 'Could not get a clear view of your eyes. Face a light, hold the phone at eye level, and tap Try again. You do not need to force your eyes wide open.',
                    { restart: stalled });
                return;
            }
            let message = 'FINDING YOUR EYES';
            if (calibrationLastFrame !== null && now - calibrationLastFrame < 1000) {
                message = calibrationLastEye === null ? 'FACE NOT FOUND — TRY MORE LIGHT'
                    : calibrationLastEye >= .14 && calibrationLastEye <= .6 && progress > 0
                        ? 'EYES FOUND — HOLD STEADY' : 'LOOK FORWARD, EYES OPEN NORMALLY';
            } else if (loading && elapsed >= 2000) message = 'LOADING EYE TRACKING...';
            else if (elapsed >= 4000) message = 'WAITING FOR EYE TRACKING';
            if (calibrationStatus.innerText !== message) calibrationStatus.innerText = message;
            const hint = loading && elapsed >= 6000 ? 'Slow connection? This only happens the first time. Hang on a moment.' : calibrationHintText;
            if (calibrationHint.innerText !== hint) calibrationHint.innerText = hint;
            // Keep valid samples across the three-second warm-up. Slower cameras
            // must be able to reach the required sample count without restarting.
            calibrationFrameId = requestAnimationFrame(updateCalibrationLoop);
        }
    }
}

function finishCalibration() {
    const calibrationData = calibration.values();
    if (calibrationData.length > 0) {
        // Sort and trim the top/bottom 10% to remove noise/outliers
        calibrationData.sort((a, b) => a - b);
        const trimCount = Math.floor(calibrationData.length * 0.1);
        const validData = calibrationData.slice(trimCount, calibrationData.length - trimCount);
        
        const sum = validData.length > 0 ? validData.reduce((a, b) => a + b, 0) : calibrationData.reduce((a, b) => a + b, 0);
        const avg = sum / (validData.length > 0 ? validData.length : calibrationData.length);
        
        baselineEAR = avg;
        // A fixed 0.18 floor could exceed a person's open-eye baseline and
        // immediately end a round. Keep the threshold relative to their eyes.
        const newThreshold = Math.min(avg * 0.75, 0.35);
        setBlinkThreshold(newThreshold);
    }

    calibrationScreen.classList.add('hidden');
    calibrationScreen.classList.remove('active');

    // Start Audio Drone
    if (soundEnabled) audioManager.startDrone();

    // Reset blink detection state before starting game
    resetBlinkState();
    tracking.reset(performance.now());

    if (currentMode === 'BALLOON') {
        startBalloonRound();
    } else if (currentMode === 'ENDURANCE') {
        startEnduranceMode();
    } else {
        gameState = 'PLAYING';
        startTime = Date.now(); // Ensure this is set right before the loop starts
        if (currentMode === 'SURPRISE') surpriseRound = createSurpriseRound();

        gameHud.classList.remove('hidden');
        gameHud.classList.add('active');

        // Ensure World Record is visible if in Classic Mode
        if (currentMode === 'CLASSIC') {
            worldRecordDisplay.classList.remove('hidden');
        }

        updateGameLoop();
    }
}

function startEnduranceMode() {
    gameState = 'ENDURANCE';
    startTime = Date.now();

    enduranceScreen.classList.remove('hidden');
    enduranceScreen.classList.add('active');


    uploadProgress.style.width = '0%';

    updateEnduranceLoop();
}

function updateEnduranceLoop() {
    if (gameState === 'ENDURANCE') {
        if (tracking.stale(performance.now())) {
            endGame('DISQUALIFIED');
            return;
        }
        const elapsed = (Date.now() - startTime) / 1000;
        const duration = 30; // 30 seconds
        const progress = Math.min((elapsed / duration) * 100, 100);

        uploadProgress.style.width = `${progress}%`;

        // Update Eye Openness Meter and add tension effects
        const threshold = getBlinkThreshold();
        let openness = ((minEARValue - threshold) / (baselineEAR - threshold)) * 100;
        openness = Math.max(0, Math.min(100, openness));
        
        const meterFill = document.getElementById('eye-meter-fill');
        if (meterFill) {
            meterFill.style.width = `${openness}%`;
            if (openness > 55) {
                meterFill.style.background = 'var(--neon-cyan)';
                meterFill.style.boxShadow = '0 0 10px var(--neon-cyan)';
                container.classList.remove('tension-active');
            } else if (openness > 25) {
                meterFill.style.background = '#ff0';
                meterFill.style.boxShadow = '0 0 15px #ff0';
                container.classList.remove('tension-active');
            } else {
                meterFill.style.background = 'var(--neon-red)';
                meterFill.style.boxShadow = '0 0 20px var(--neon-red)';
                container.classList.add('tension-active');
            }
        }

        if (elapsed >= duration) {
            endGame('WIN_ENDURANCE');
        } else {
            animationFrameId = requestAnimationFrame(updateEnduranceLoop);
        }
    }
}

function showMenu() {
    social.reset();
    activeChallenge = null;
    lastResult = null;
    document.getElementById('challenge-status').textContent = '';
    document.getElementById('challenge-input').value = '';
    demoRound?.cancel();
    demoRound = null;
    cancelAnimationFrame(demoFrameId);
    demoScreen.classList.add('hidden');
    surpriseRound = null;
    surpriseOverlay.classList.add('hidden');
    audioManager.stopDrone();
    clearSelfie();
    clearClip();
    endParty();
    hideJoke();
    versusMatch = null;
    partyScreen.classList.add('hidden');
    partyScreen.classList.remove('active');
    partyOptions.classList.add('hidden');
    olympicsOptions.classList.add('hidden');
    dareBox.classList.add('hidden');
    partyNextBtn.classList.add('hidden');
    gameOverScreen.classList.remove('versus-result', 'party-turn');
    restartBtn.innerText = 'RETRY';
    gameOverCameraStop.cancel();
    gameState = 'MENU';
    cancelAnimationFrame(animationFrameId);
    cancelAnimationFrame(calibrationFrameId);
    stopCameraAndDetection();
    skinPickScreen.classList.add('hidden');
    skinPickScreen.classList.remove('active');
    // The camera has stopped: clear its last frame so the menu sits on a clean background.
    try { canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height); } catch { /* display only */ }
    calibrationScreen.classList.add('hidden');
    calibrationScreen.classList.remove('active');
    enduranceScreen.classList.add('hidden');
    enduranceScreen.classList.remove('active');
    precisionOptions.classList.add('hidden');
    surpriseOptions.classList.add('hidden');
    document.querySelector('.mode-selection').classList.remove('hidden');
    faceLoss.reset();
    resetBlinkState();

    // Hide face status
    faceStatus.classList.add('hidden');

    gameHud.classList.add('hidden');
    gameHud.classList.remove('active');

    gameOverScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');

    menuScreen.classList.remove('hidden');
    menuScreen.classList.add('active');


    // Reset Chaos
    container.className = 'container';

    loadingMsg.style.display = 'none';
    updateHomeFab();
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    // Mid-party, backgrounding releases the camera but keeps the party and its scores.
    if (party) { if (videoElement.srcObject || gameState !== 'PARTY' || loadingMsg.style.display === 'block') returnToParty(); }
    else if (videoElement.srcObject || gameState !== 'MENU' || loadingMsg.style.display === 'block') showMenu();
});

function onResults(results, session) {
    // A retired instance cannot borrow the current send's identity, even after its send settles.
    if (session !== resultSession || session !== cameraSession || !videoElement.srcObject) return;
    const now = performance.now();
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    const landmarks = largestFace(results.multiFaceLandmarks);
    // Display canvas only; detection reads the video element, never these drawings.
    try { drawSkinOverlay(canvasCtx, currentSkin, results.multiFaceLandmarks, canvasElement.width, canvasElement.height, now); }
    catch (err) { console.warn('Skin overlay skipped:', err); }
    lastFrameAt = now;
    try { captureClipFrame(now); } catch (err) { console.warn('Clip frame skipped:', err); }
    if (gameState === 'VERSUS_CALIBRATING' || gameState === 'VERSUS') {
        handleVersusFrame(results.multiFaceLandmarks || [], now);
        canvasCtx.restore();
        return;
    }
    const eye = landmarks ? checkBlink(landmarks, now, videoElement.videoWidth, videoElement.videoHeight) : null;
    if (gameState === 'BALLOON') {
        handleBalloonEye(eye, now);
        canvasCtx.restore();
        return;
    }
    if (gameState === 'CALIBRATING') {
        calibrationLastFrame = now;
        calibrationLastEye = eye && Number.isFinite(eye.minEar) && eye.minEar > 0 ? eye.minEar : null;
        calibration.observe(calibrationLastEye ?? NaN, now);
    }
    if (eye && Number.isFinite(eye.minEar) && eye.minEar > 0 && eye.minEar <= 1) {
        if ((gameState === 'PLAYING' || gameState === 'ENDURANCE') && !tracking.observe(now)) {
            endGame('DISQUALIFIED');
            canvasCtx.restore();
            return;
        }
        faceLoss.observe(true, now);

        // Update face tracking status
        if (gameState === 'PLAYING' || gameState === 'ENDURANCE') {
            faceStatus.classList.remove('hidden', 'not-detected');
            faceStatusText.innerText = 'Tracking eyes...';
        }

        // Visual Debug: Show if face is detected
        hudLabel.style.color = "var(--neon-cyan)";
        hudLabel.style.textShadow = "0 0 10px var(--neon-cyan)";

        const { blinking, ear, minEar } = eye;
        currentEAR = ear;
        minEARValue = minEar;

        if (gameState === 'PLAYING' || gameState === 'ENDURANCE') {
            if (blinking) {
                endGame();
            }
        }
    } else {
        // No face detected
        resetBlinkState();
        if (gameState === 'PLAYING' || gameState === 'ENDURANCE') { // Changed condition
            faceStatus.classList.remove('hidden');
            faceStatus.classList.add('not-detected');
            faceStatusText.innerText = 'Face not detected – move closer & improve lighting';
        }

        // Visual Debug: Dim label when no face
        hudLabel.style.color = "#555";
        hudLabel.style.textShadow = "none";

        if (gameState === 'PLAYING' || gameState === 'ENDURANCE') {
            if (faceLoss.observe(false, now)) {
                endGame('DISQUALIFIED');
            }
        }
    }
    canvasCtx.restore();
}

function updateClassicVisualStage(elapsedSeconds) {
    // Remove all stage classes first
    container.classList.remove('classic-stage-shake', 'classic-stage-invert', 'classic-stage-void-plus');

    if (elapsedSeconds < 60) {
        // Before 60 seconds: Simple pattern
        if (elapsedSeconds >= 10 && elapsedSeconds < 20) {
            // Stage B: Shake (10-20s)
            container.classList.add('classic-stage-shake');
        } else if (elapsedSeconds >= 30 && elapsedSeconds < 50) {
            // Stage C: Invert (30-50s)
            container.classList.add('classic-stage-invert');
        }
        // Stage A (Normal): 0-10s, 20-30s, 50-60s - no classes
    } else {
        // After 60 seconds: 30-second cycle (20s Void+ / 10s Normal)
        const cycleTime = (elapsedSeconds - 60) % 30;

        if (cycleTime < 20) {
            // Stage D: Void+ (20 seconds)
            container.classList.add('classic-stage-invert', 'classic-stage-shake', 'classic-stage-void-plus');
        }
        // Stage A (Normal break): Last 10 seconds of cycle - no classes
    }
}

function updateGameLoop() {
    if (gameState === 'PLAYING') {
        if (tracking.stale(performance.now())) {
            endGame('DISQUALIFIED');
            return;
        }
        const elapsed = (Date.now() - startTime) / 1000;
        if (currentMode === 'SURPRISE') {
            const surprise = surpriseRound.observe(elapsed * 1000);
            surpriseOverlay.classList[surprise.active ? 'remove' : 'add']('hidden');
            if (surprise.triggered && soundEnabled) audioManager.playSurprise();
            if (surprise.complete) {
                endGame('WIN_SURPRISE');
                return;
            }
        }
        scoreDisplay.innerText = `${elapsed.toFixed(2)}s`;
        if (currentMode === 'DISTRACT') updateJokes(elapsed);

        // Update Eye Openness Meter and tension effect
        const threshold = getBlinkThreshold();
        let openness = ((minEARValue - threshold) / (baselineEAR - threshold)) * 100;
        openness = Math.max(0, Math.min(100, openness));
        
        const meterFill = document.getElementById('eye-meter-fill');
        if (meterFill) {
            meterFill.style.width = `${openness}%`;
            if (openness > 55) {
                meterFill.style.background = 'var(--neon-cyan)';
                meterFill.style.boxShadow = '0 0 10px var(--neon-cyan)';
                container.classList.remove('tension-active');
            } else if (openness > 25) {
                meterFill.style.background = '#ff0';
                meterFill.style.boxShadow = '0 0 15px #ff0';
                container.classList.remove('tension-active');
            } else {
                meterFill.style.background = 'var(--neon-red)';
                meterFill.style.boxShadow = '0 0 20px var(--neon-red)';
                container.classList.add('tension-active');
            }
        }

        let beatInterval = Math.max(0.3, 1.0 - (elapsed * 0.02));
        if (currentMode === 'DAILY') beatInterval *= 0.7; // Faster heartbeat
        
        const now = Date.now() / 1000;
        if (!window.lastBeat || now - window.lastBeat > beatInterval) {
            if (soundEnabled) audioManager.playHeartbeat();
            
            // Haptic feedback if available (mobile)
            if (navigator.vibrate && currentMode !== 'SURPRISE') {
                navigator.vibrate(50);
            }
            
            window.lastBeat = now;
        }

        // Visual Stages (Classic Mode only)
        if (currentMode === 'CLASSIC') {
            updateClassicVisualStage(elapsed);
        } else if (!['DAILY', 'SURPRISE', 'DISTRACT'].includes(currentMode)) {
            if (elapsed > 10) container.classList.add('chaos-shake');
            if (elapsed > 20) container.classList.add('chaos-glitch');
            if (elapsed > 30) container.classList.add('chaos-invert');
        }

        animationFrameId = requestAnimationFrame(updateGameLoop);
    }
}

function endGame(reason = 'BLINK') {
    surpriseRound = null;
    surpriseOverlay.classList.add('hidden');
    hideJoke();
    gameOverScreen.classList.remove('versus-result', 'party-turn');
    dareBox.classList.add('hidden');
    partyNextBtn.classList.add('hidden');
    restartBtn.innerText = 'RETRY';
    if (reason === 'MENU_EXIT') {
        showMenu();
        return;
    }
    clearSelfie();
    gameState = 'GAME_OVER';
    faceLoss.reset();
    resetBlinkState();
    cancelAnimationFrame(animationFrameId);

    // Don't stop camera immediately - let user retry quickly
    // Camera will auto-stop after 5 seconds of inactivity on Game Over screen
    gameOverCameraStop.schedule();

    // Hide face status
    faceStatus.classList.add('hidden');

    try {
        // Stop/Effect Audio
        audioManager.stopDrone();
        if (soundEnabled) audioManager.playGlitch();

        // Reset Chaos and Tension
        container.className = 'container';
        container.classList.remove('tension-active');

        // Haptic failure shock
        if (navigator.vibrate && currentMode !== 'SURPRISE') navigator.vibrate([200, 100, 200]);

        const elapsed = (Date.now() - startTime) / 1000;
        let finalScoreText = '';
        let scoreToSave = 0;

        // Reset Sub-details
        finalScoreSub.classList.add('hidden');
        gameOverWorldRecord.classList.add('hidden');

        if (reason === 'BALLOON_OVER' && balloonEnd) {
            scoreToSave = balloonEnd.score;
            finalScoreText = String(balloonEnd.score);
            finalScoreLabel.innerText = balloonEnd.score === 1 ? 'BALLOON POPPED' : 'BALLOONS POPPED';
            gameOverTitle.innerText = balloonEnd.score >= 15 ? 'BALLOON CHAMPION!' : balloonEnd.score >= 5 ? 'NICE POPPING!' : 'GAME OVER';
            gameOverTitle.style.color = 'var(--neon-cyan)';
            finalScoreSub.innerText = balloonEnd.faceLost ? 'Your face left the frame' : `Out of lives`;
            finalScoreSub.classList.remove('hidden');
        } else if (reason === 'WIN_SURPRISE') {
            scoreToSave = 30;
            finalScoreText = '30.00s';
            finalScoreLabel.innerText = 'SURPRISE SURVIVOR';
            gameOverTitle.innerText = 'YOU MADE IT';
            gameOverTitle.style.color = 'var(--neon-cyan)';
            if (soundEnabled) audioManager.playWin();
        } else if (reason === 'WIN_ENDURANCE') {
            scoreToSave = 30;
            finalScoreText = "30.00s";
            finalScoreLabel.innerText = "EYES OF STEEL";
            gameOverTitle.innerText = "THEME UNLOCKED";
            gameOverTitle.style.color = "var(--neon-pink)";
            audioManager.playWin();

            // Unlock Theme
            document.body.classList.add('theme-purple');
            try {
                localStorage.setItem('blink_theme_purple', 'true');
            } catch (err) {
                console.warn('Theme preference not saved:', err);
            }
        } else if (reason === 'DISQUALIFIED') {
            scoreToSave = 0;
            finalScoreText = "OUT";
            finalScoreLabel.innerText = "YOUR FACE LEFT THE CAMERA";
            gameOverTitle.innerText = "ROUND OVER";
            gameOverTitle.style.color = "var(--neon-red)";
        } else if (currentMode === 'CLASSIC') {
            scoreToSave = elapsed;
            finalScoreText = `${elapsed.toFixed(2)}s`;
            finalScoreLabel.innerText = "YOU SURVIVED";
            gameOverTitle.innerText = "BLINK DETECTED";

            // Show World Record
            gameOverWorldRecord.classList.remove('hidden');
            if (window.currentWorldRecord) {
                gameOverWorldRecord.innerText = `Your Best: ${window.currentWorldRecord.toFixed(2)}s`;
            } else {
                gameOverWorldRecord.innerText = `Your Best: None yet!`;
            }

        } else if (currentMode === 'PRECISION') {
            const diff = Math.abs(precisionTarget - elapsed);
            scoreToSave = diff;

            // NEW: Show Actual Time as Primary Score
            finalScoreText = `${elapsed.toFixed(2)}s`;
            finalScoreLabel.innerText = "YOU BLINKED AT";

            // NEW: Show Target/Off-by as Secondary Detail
            finalScoreSub.classList.remove('hidden');
            finalScoreSub.innerText = `Target: ${precisionTarget.toFixed(2)}s (off by ${diff.toFixed(2)}s)`;

            if (diff < 0.1) {
                gameOverTitle.innerText = "PERFECT!";
                gameOverTitle.style.color = "var(--neon-cyan)";
                audioManager.playWin();
            } else {
                gameOverTitle.innerText = elapsed < precisionTarget ? "TOO EARLY" : "TOO LATE";
                gameOverTitle.style.color = "var(--neon-red)";
            }
        } else if (currentMode === 'ENDURANCE') {
            scoreToSave = elapsed;
            finalScoreText = `${elapsed.toFixed(2)}s`;
            finalScoreLabel.innerText = "YOUR EYES GAVE UP AT";
            gameOverTitle.innerText = "BLINK DETECTED";
            gameOverTitle.style.color = "var(--neon-red)";
        } else if (currentMode === 'DAILY' || currentMode === 'SURPRISE' || currentMode === 'DISTRACT') {
            scoreToSave = elapsed;
            finalScoreText = `${elapsed.toFixed(2)}s`;
            finalScoreLabel.innerText = currentMode === 'SURPRISE' ? 'SURPRISE SURVIVAL' : currentMode === 'DISTRACT' ? 'JOKES SURVIVED FOR' : 'DAILY SURVIVAL';
            gameOverTitle.innerText = "BLINK DETECTED";
            gameOverTitle.style.color = "var(--neon-pink)";
        }

        lastScore = reason === 'DISQUALIFIED' ? null : scoreToSave;
        if (lastScore !== null && ['ENDURANCE', 'SURPRISE'].includes(currentMode)) lastScore = Math.min(30, lastScore);
        lastResult = lastScore === null ? null : { mode: currentMode, score: lastScore, elapsed, target: precisionTarget };
        social.render(lastResult, activeChallenge, currentSkin);
        finalScoreVal.innerText = finalScoreText;

        // Shareable photo: the last camera frame (with the skin's hat) in a themed frame.
        shareLine = inviteLine(lastResult, currentSkin);
        shareUrl = lastResult ? challengeUrl(lastResult, currentSkin) : PUBLIC_PLAY_URL;
        startClip(reason, elapsed, scoreToSave);
        const photo = makeSelfie(selfieCaption({ reason, mode: currentMode, elapsed, target: precisionTarget, score: scoreToSave }));
        let namePrefill = '';
        if (party && partyTurn) {
            // Party turn: record the stare (a lost face counts as zero), keep the photo for the reel.
            const name = party.current();
            party.record(lastScore ?? 0);
            addToReel(photo, name);
            partyTurn = false;
            gameOverScreen.classList.add('party-turn');
            namePrefill = name.toUpperCase().slice(0, 10);
            partyNextBtn.textContent = party.turnsDone() ? 'SEE WHO MADE THE FINAL' : `NEXT UP: ${party.current().toUpperCase()}`;
            partyNextBtn.classList.remove('hidden');
        }
        // Red flash on the frozen camera view behind Game Over.
        try {
            canvasCtx.save();
            canvasCtx.fillStyle = "rgba(255, 0, 0, 0.4)";
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.restore();
        } catch (e) { /* display only */ }

        playerNameInput.value = namePrefill;
        playerNameInput.disabled = false;
        saveScoreBtn.disabled = lastScore === null;
        shareBtn.disabled = lastScore === null;
        demoBonusBtn.disabled = lastScore === null;
        selfieBtn.innerText = 'SHARE PHOTO';
        saveScoreBtn.innerText = "SAVE";

        Leaderboard.render(currentMode);

    } catch (err) {
        console.error("Error in endGame:", err);
    }

    // Stop video if in endurance mode
    if (currentMode === 'ENDURANCE') {

        enduranceScreen.classList.add('hidden');
        enduranceScreen.classList.remove('active');
    }

    // Always update UI
    gameHud.classList.add('hidden');
    gameHud.classList.remove('active');

    gameOverScreen.classList.remove('hidden');
    gameOverScreen.classList.add('active');
}

// Resize canvas to match video
videoElement.addEventListener('loadedmetadata', () => {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
});

// Check for unlocked theme on load; storage may be disabled by the browser.
try {
    if (localStorage.getItem('blink_theme_purple') === 'true') {
        document.body.classList.add('theme-purple');
    }
} catch (err) {
    console.warn('Theme preference unavailable:', err);
}
