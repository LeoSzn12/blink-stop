import { checkBlink, setBlinkThreshold, resetBlinkState, getBlinkThreshold, getBlinkLine } from './blinkDetection.js';
import { audioManager } from './audioManager.js';

import { createFaceLossTracker, createCalibrationTracker, createTrackingFreshness, createTapBlink, createBlinkTest, blinkLineFor, DEFAULT_LINE } from './gameRules.mjs';
import { createSerializedInference } from './inference.mjs';
import { appendScore } from './leaderboard.mjs';
import { cameraErrorMessage } from './cameraHelp.mjs';
import { createGameOverCameraStop } from './roundLifecycle.mjs';
import { sharePayload, shareClipboardText, formatScore, LOWER_WINS, inviteLine, challengeUrl, challengeHeadline, PUBLIC_PLAY_URL } from './share.mjs';
import { createSurpriseRound, createRewardedDemo } from './surprise.mjs';
import { createSocialUI } from './social.mjs';
import { SKINS, SKIN_STORAGE_KEY, resolveSkin, storedSkinValue, drawSkinOverlay, composeSelfie, selfieCaption } from './skins.mjs';
import { createVersusMatch, largestFace } from './versus.mjs';
import { parseNames, createParty, createDeck, forfeitCards, jokeCards } from './party.mjs';
import { drawReel } from './reel.mjs';
import { createBalloonRound, drawBalloons, BALLOON_MISSES, balloonColors, balloonLevel } from './balloons.mjs';
import { createFlashRound, FLASH_TIMEOUT_MS } from './flash.mjs';
import { createBeatRound, BEAT_LIVES, drawBeat } from './beat.mjs';
import { clipSupported, createClipBuffer, encodeClip, pickClipType, clipExtension } from './clip.mjs';
import { pumpDollars, pumpMiss, formatDollars, PUMP_TARGET } from './pump.mjs';
import { createHaptics, confetti, drawCallout, countUp, prefersReducedMotion } from './feedback.mjs';

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
let balloonRound = null, balloonFrameId = null, balloonEnd = null;
// Balloon Pop, Flash and Blink Beat count every deliberate blink, even a one-frame one.
const tapBlink = createTapBlink();
const livesDisplay = document.getElementById('lives-display');
// Flash uses one stage: a big light, a line of text and progress dots.
const quickStage = document.getElementById('quick-stage');
const quickLight = document.getElementById('quick-light');
const quickText = document.getElementById('quick-text');
const quickDots = document.getElementById('quick-dots');
let quickRound = null, quickFrameId = null, quickEnd = null;

// Face filter pick: a game started from the menu first shows the live camera with the
// skin on your face, so you choose your look right before playing. Retry skips it.
const skinPickScreen = document.getElementById('skin-pick-screen');
const skinPickMode = document.getElementById('skin-pick-mode');
const SKIN_PICK_MODES = ['CLASSIC', 'PRECISION', 'PUMP', 'ENDURANCE', 'DAILY', 'VERSUS', 'DISTRACT', 'BALLOON', 'FLASH', 'BEAT', 'SURPRISE'];
const MODE_NAMES = { CLASSIC: 'Endurance', PRECISION: 'Precision', PUMP: 'Gas Pump', ENDURANCE: '30 Seconds', DAILY: 'Daily', VERSUS: 'Stare-down', DISTRACT: 'Distraction', BALLOON: 'Balloon Pop', FLASH: 'Flash', BEAT: 'Blink Beat', SURPRISE: 'Surprise' };
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
const CLIP_MODES = ['CLASSIC', 'PRECISION', 'PUMP', 'ENDURANCE', 'DAILY', 'SURPRISE', 'DISTRACT', 'FLASH', 'BALLOON', 'VERSUS'];
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

const CLIP_STATES = ['PLAYING', 'ENDURANCE', 'FLASH', 'BALLOON', 'VERSUS'];
function captureClipFrame(now) {
    if (!clipCanMake || !CLIP_MODES.includes(currentMode)) return;
    if (!CLIP_STATES.includes(gameState) && !clip.waiting) return;
    // Balloon Pop's clip shows the balloons too: the camera and the balloon layer are
    // composed the way the player saw them, so that frame is not mirrored again.
    if (currentMode === 'BALLOON') clip.push(balloonClipSource(), now, { mirror: false });
    else clip.push(canvasElement, now);
    if (clip.ready) makeClip();
}

let clipView = null;
function balloonClipSource() {
    const lw = balloonLayer.width, lh = balloonLayer.height;
    const cw = canvasElement.width, ch = canvasElement.height;
    if (!(lw > 0 && lh > 0 && cw > 0 && ch > 0)) return canvasElement;
    const scale = Math.min(1, 400 / Math.max(lw, lh));
    const w = Math.max(1, Math.round(lw * scale)), h = Math.max(1, Math.round(lh * scale));
    clipView ||= document.createElement('canvas');
    if (clipView.width !== w) clipView.width = w;
    if (clipView.height !== h) clipView.height = h;
    const ctx = clipView.getContext('2d');
    // The camera fills the screen like the page's object-fit: cover, mirrored like the page.
    const s = Math.max(w / cw, h / ch), dw = cw * s, dh = ch * s;
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    ctx.drawImage(canvasElement, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!balloonLayer.classList.contains('hidden')) ctx.drawImage(balloonLayer, 0, 0, w, h);
    return clipView;
}

// Called from endGame: only a real blink gets a clip.
function startClip(reason, elapsed, score) {
    // Flash makes a clip of the last try's blink, with the reaction time instead of a clock.
    const flashHit = reason === 'QUICK_OVER' && currentMode === 'FLASH' && quickEnd?.lastHit;
    // Balloon Pop: the clip ends on the balloon that got away, then your face after.
    const balloonOver = reason === 'BALLOON_OVER' && currentMode === 'BALLOON' && balloonEnd && !balloonEnd.faceLost;
    const noClock = flashHit || balloonOver;
    if ((reason !== 'BLINK' && !flashHit && !balloonOver) || !clipCanMake || !CLIP_MODES.includes(currentMode) || !clip.mark(lastFrameAt, noClock ? NaN : elapsed)) {
        clip.reset();
        return;
    }
    const caption = selfieCaption({ reason, mode: currentMode, elapsed, target: precisionTarget, score });
    if (currentMode === 'PUMP') caption.timeLabel = seconds => formatDollars(pumpDollars(seconds));
    beginClip(balloonOver ? { ...caption, stamp: 'GAME OVER', before: 'POP THEM ALL...' } : caption);
}

// The stare-down final (and any stare-down) gets a clip of the blink that decided it.
function startVersusClip(caption, elapsed) {
    if (!clipCanMake || !clip.mark(lastFrameAt, elapsed)) { clip.reset(); return; }
    beginClip({ ...caption, before: 'FIRST TO BLINK LOSES...' });
}

function beginClip(caption) {
    clipMaking = true;
    clipCaption = caption;
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
// Round clock: stops while a "leave the game?" question is open, so cancelling it carries
// on where the round was instead of counting the pause as a face lost or notes missed.
let pausedMs = 0;
function clock() { return performance.now() - pausedMs; }
// Glancing away in a timed round: a short "come back" countdown with the clock paused,
// twice per round, before losing your face ends the run. Blinks can't be seen while
// away, so the clock never runs then and a third glance ends the round as before.
const PRECISION_CLOCK_SHOWN_S = 3;
const GLANCE_GRACE_MS = 3000;
const TIMED_MODES = ['CLASSIC', 'ENDURANCE', 'DAILY', 'DISTRACT', 'SURPRISE'];
const GLANCES_PER_ROUND = 2;
let awaySince = null, awayFrozenMs = 0, glancesLeft = GLANCES_PER_ROUND;
function resetGlance() { awaySince = null; glancesLeft = GLANCES_PER_ROUND; document.getElementById('come-back')?.classList.add('hidden'); }
// Called every frame of a timed round. Returns true when the round should end.
function glanceAwayOver(now) {
    const banner = document.getElementById('come-back');
    if (!tracking.stale(now)) {
        if (awaySince !== null) { awaySince = null; banner?.classList.add('hidden'); }
        return false;
    }
    if (awaySince === null) {
        if (glancesLeft <= 0) return true;
        glancesLeft--;
        awaySince = now;
        awayFrozenMs = Date.now() - startTime;
        banner?.classList.remove('hidden');
    }
    startTime = Date.now() - awayFrozenMs; // the clock stays paused while you're away
    const left = GLANCE_GRACE_MS - (now - awaySince);
    if (left <= 0) { banner?.classList.add('hidden'); return true; }
    if (banner) banner.textContent = `Come back! ${Math.ceil(left / 1000)}`;
    return false;
}
// Tap games (Balloon Pop, Flash, Blink Beat): a lost face pauses the game with the same
// "Come back!" countdown instead of ending it, so passing the phone or turning away to
// laugh doesn't throw the round. Twice per round; the game's own clock is frozen meanwhile.
let tapAwayAt = null; // performance.now() when the pause began
function tapAwayCheck() {
    const banner = document.getElementById('come-back');
    if (tapAwayAt === null) {
        if (!tracking.stale(clock())) return 'OK';
        if (glancesLeft <= 0) return 'OVER';
        glancesLeft--;
        tapAwayAt = performance.now();
        tapBlink.reset();
        banner?.classList.remove('hidden');
    }
    const left = GLANCE_GRACE_MS - (performance.now() - tapAwayAt);
    if (left <= 0) { banner?.classList.add('hidden'); return 'OVER'; }
    if (banner) banner.textContent = `Come back! ${Math.ceil(left / 1000)}`;
    return 'PAUSED';
}
// The face is back: the paused time doesn't count, and tracking starts fresh.
function tapAwayResume() {
    if (tapAwayAt === null) return;
    const away = performance.now() - tapAwayAt;
    tapAwayAt = null;
    pausedMs += away;
    startTime += away;
    document.getElementById('come-back')?.classList.add('hidden');
    tracking.reset(clock());
    faceLoss.reset();
    tapBlink.reset();
}
function tapAwayReset() {
    tapAwayAt = null;
    glancesLeft = GLANCES_PER_ROUND;
    document.getElementById('come-back')?.classList.add('hidden');
}
// Called with each tracked eye in a tap game. Returns the round time to use for it.
function tapFaceSeen(now) {
    if (tapAwayAt !== null) { tapAwayResume(); now = clock(); }
    else if (tracking.stale(now)) tracking.reset(now);
    tracking.observe(now);
    faceLoss.observe(true, now);
    return now;
}
function confirmDuringRound(message) {
    const askedAt = performance.now();
    const ok = confirm(message);
    if (!ok) {
        const away = performance.now() - askedAt;
        pausedMs += away;
        startTime += away;
        faceLoss.reset();
        tapBlink.reset();
    }
    return ok;
}
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
// One remembered sound switch (on Pick Your Look) for the beat, heartbeat and drone.
let soundPref = true;
// Haptics: the phone's tap engine in the app, vibration on Android web; remembered like sound.
const haptics = createHaptics();
try { haptics.enabled = localStorage.getItem('blink_haptics') !== 'off'; } catch { /* storage unavailable */ }
const hapticsToggle = document.getElementById('haptics-toggle');
function renderHapticsToggle() {
    if (!hapticsToggle) return;
    // Hidden where the phone can't vibrate at all (iPhone Safari): the effects still show.
    hapticsToggle.classList.toggle('hidden', !haptics.isNative && typeof navigator.vibrate !== 'function');
    hapticsToggle.innerText = haptics.enabled ? 'Vibration: on' : 'Vibration: off';
    hapticsToggle.setAttribute('aria-pressed', String(haptics.enabled));
}
hapticsToggle?.addEventListener('click', () => {
    haptics.enabled = !haptics.enabled;
    try { localStorage.setItem('blink_haptics', haptics.enabled ? 'on' : 'off'); } catch { /* storage unavailable */ }
    renderHapticsToggle();
    haptics.fire('tick');
});
renderHapticsToggle();
// A big word over the game (LEVEL 2!, +1 LIFE) drawn on the game canvas.
let gameCallout = null;
function callout(text, color) { gameCallout = { text, color, at: clock() }; }
// The pop: a quick bump and flash in the balloon's colour, a thump and a tap.
let popFxTimer = null;
function popFx(color) {
    if (soundEnabled) audioManager.playPop?.();
    haptics.fire('pop');
    const flash = document.createElement('div');
    flash.className = 'pop-flash';
    flash.style.setProperty('--pop-color', color || '#39ff14');
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 300);
    if (prefersReducedMotion()) return;
    container.classList.remove('pop-hit');
    void container.offsetWidth;
    container.classList.add('pop-hit');
    clearTimeout(popFxTimer);
    popFxTimer = setTimeout(() => container.classList.remove('pop-hit'), 200);
}
function celebrate() {
    confetti({ colors: balloonColors(currentSkin) });
    haptics.fire('win');
}
try { soundPref = localStorage.getItem('blink_sound') !== 'off'; } catch { /* storage unavailable */ }
const soundToggle = document.getElementById('sound-toggle');
function renderSoundToggle() {
    if (!soundToggle) return;
    soundToggle.innerText = soundPref ? 'Sound: on' : 'Sound: off';
    soundToggle.setAttribute('aria-pressed', String(soundPref));
}
soundToggle?.addEventListener('click', () => {
    soundPref = !soundPref;
    try { localStorage.setItem('blink_sound', soundPref ? 'on' : 'off'); } catch { /* storage unavailable */ }
    soundEnabled = soundPref && (currentMode !== 'SURPRISE' || surpriseSound.checked);
    renderSoundToggle();
});
renderSoundToggle();
let demoRound = null;
let demoReturnState = 'MENU';
let demoFrameId;
const faceLoss = createFaceLossTracker();
const calibration = createCalibrationTracker();
// Blink test: on the first solo round the player blinks once at the end of setup. It shows
// them the game sees their blinks, and it sets their personal blink line. Later rounds reuse
// what it learned (as a share of their open eyes) without asking again.
const blinkTest = createBlinkTest();
const BLINK_TEST_MS = 5000;
let blinkTestStart = null;
let blinkTestDoneAt = null;
// The blink line as a share of the open eye, once learned. Kept on this phone so the test
// runs once, not every visit; it only holds a number between 0.7 and 0.8.
const LINE_KEY = 'blink_line';
let learnedLine = (() => {
    try { const v = Number.parseFloat(localStorage.getItem(LINE_KEY)); return v >= 0.7 && v <= 0.8 ? v : null; } catch { return null; }
})();
const eyeLight = document.getElementById('eye-light');
let eyeLightClosedAt = -Infinity;
function setEyeLight(state, text) {
    if (!eyeLight) return;
    if (eyeLight.dataset.state !== state) eyeLight.dataset.state = state;
    if (eyeLight.textContent !== text) eyeLight.textContent = text;
}
const tracking = createTrackingFreshness();
function beginChallenge(challenge) {
    // A friend challenge mid-party would wipe the party's standings.
    if (party || !['MENU', 'GAME_OVER'].includes(gameState)) return;
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
const LITE_TRACKER_KEY = 'blink_lite_tracker';
const SLOW_TRACKER_MS = 90;
let liteTracker = (() => { try { return localStorage.getItem(LITE_TRACKER_KEY) === '1'; } catch { return false; } })();
let trackerTimes = [];
function noteTrackerTime(ms, refined) {
    if (!refined || liteTracker || !Number.isFinite(ms)) return;
    trackerTimes.push(ms);
    if (trackerTimes.length > 20) trackerTimes.shift();
    if (trackerTimes.length < 20) return;
    const sorted = [...trackerTimes].sort((a, b) => a - b);
    if (sorted[10] > SLOW_TRACKER_MS) {
        liteTracker = true;
        try { localStorage.setItem(LITE_TRACKER_KEY, '1'); } catch { /* storage unavailable */ }
    }
}
let eyeTrackingWarm = null;
let eyeTrackingReady = false;
function setEyeTrackingStatus(text) {
    if (eyeTrackingStatus && eyeTrackingStatus.textContent !== text) eyeTrackingStatus.textContent = text;
}
function warmEyeTracking() {
    if (eyeTrackingWarm) return eyeTrackingWarm;
    if (typeof FaceMesh !== 'function') return (eyeTrackingWarm = Promise.resolve(false));
    // MediaPipe gives no download progress, so show how long it has been and what it is.
    const warmStart = performance.now();
    const warmText = () => {
        const s = Math.round((performance.now() - warmStart) / 1000);
        return s < 3 ? 'Getting eye tracking ready...'
            : `Downloading the eye tracker, one time only... ${s}s${s >= 12 ? ' (Wi-Fi helps)' : ''}`;
    };
    setEyeTrackingStatus(warmText());
    const warmTicker = setInterval(() => { if (!eyeTrackingReady) setEyeTrackingStatus(warmText()); }, 1000);
    const mesh = new FaceMesh({ locateFile: file => `vendor/face_mesh/${file}` });
    mesh.setOptions({ maxNumFaces: 2, refineLandmarks: !liteTracker, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
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
        .finally(() => { clearInterval(warmTicker); try { mesh.close(); } catch {} });
    return eyeTrackingWarm;
}

// The offline copy is saved after the warm-up, so a first visit downloads the model
// once instead of twice at the same time.
// When a new version takes over, reload once at the menu so the player gets it now;
// never mid-round, where it waits until the next time the menu shows.
let updateWaiting = false;
function reloadForUpdate() {
    if (!updateWaiting || IN_ROUND_STATES.includes(gameState) || gameState !== 'MENU') return;
    try { if (sessionStorage.getItem('blink_sw_reloaded')) return; sessionStorage.setItem('blink_sw_reloaded', '1'); } catch { return; }
    location.reload();
}
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener?.('controllerchange', () => {
        if (!hadController) return;
        updateWaiting = true;
        reloadForUpdate();
    });
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
// Solo games use the tracker's detailed eye model (refineLandmarks): it follows the eyelids
// far more closely, so blinks stand out clearly from open eyes. Stare-down tracks two faces
// and keeps the lighter model. If a phone runs the detailed model too slowly, it switches
// to the lighter one from the next round on and remembers that.
function createSessionFaceMesh(session, maxNumFaces = 1, refine = false) {
    const mesh = new FaceMesh({ locateFile: file => `vendor/face_mesh/${file}` });
    mesh.refined = refine;
    mesh.setOptions({
        maxNumFaces,
        refineLandmarks: refine,
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
    const sentAt = performance.now();
    try {
        await mesh.send({ image });
        noteTrackerTime(performance.now() - sentAt, mesh.refined);
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
        const stream = takeWarmCamera() || await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
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

// Every new camera frame goes to the eye tracker as soon as it is free, so a quick blink
// isn't lost between fixed ticks. Browsers without per-frame callbacks check every 33 ms.
let frameCallbackId = null;
let frameCallbackAt = -Infinity;
function sendFrame(session) {
    if (videoElement.paused || videoElement.ended) return;
    try {
        const pending = inference.send(videoElement, session);
        if (pending && typeof pending.catch === 'function') pending.catch(error => console.warn("FaceMesh skipped:", error));
    } catch (error) {
        console.warn("FaceMesh skipped:", error);
    }
}
function startDetectionLoop(session) {
    stopDetectionLoop();
    if (typeof videoElement.requestVideoFrameCallback === 'function') {
        const onFrame = () => {
            if (session !== cameraSession) return;
            frameCallbackAt = performance.now();
            sendFrame(session);
            frameCallbackId = videoElement.requestVideoFrameCallback(onFrame);
        };
        frameCallbackId = videoElement.requestVideoFrameCallback(onFrame);
    }
    // Also a steady tick: it covers browsers without frame callbacks and a paused callback.
    detectionInterval = setInterval(() => {
        if (performance.now() - frameCallbackAt > 150) sendFrame(session);
    }, 33);
}

function stopDetectionLoop() {
    if (frameCallbackId !== null && typeof videoElement.cancelVideoFrameCallback === 'function') videoElement.cancelVideoFrameCallback(frameCallbackId);
    frameCallbackId = null;
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = null;
    // A send already in flight remains locked until it actually settles.
}


const IN_ROUND_STATES = ['PLAYING', 'ENDURANCE', 'VERSUS', 'BALLOON', 'FLASH', 'BEAT'];

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
            // Pick the target time first, then the look, then play.
            modeSelection.classList.add('hidden');
            precisionOptions.classList.remove('hidden');
            optionBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.time) === precisionChoice));
            (precisionOptions.querySelector('.option-btn.active') || optionBtns[0])?.focus();
        } else if (mode === 'ENDURANCE') {
            startGame('ENDURANCE');
        } else if (mode === 'DAILY') {
            startGame('DAILY');
        } else if (mode === 'VERSUS') {
            versusNames = null;
            startGame('VERSUS');
        } else if (mode === 'DISTRACT') {
            startGame('DISTRACT');
        } else if (mode === 'BALLOON' || mode === 'FLASH' || mode === 'BEAT') {
            startGame(mode);
        } else if (mode === 'OLYMPICS') {
            modeSelection.classList.add('hidden');
            olympicsOptions.classList.remove('hidden');
            olympicsOptions.querySelector('[data-mode]')?.focus();
        } else if (mode === 'PARTY') {
            modeSelection.classList.add('hidden');
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

// Gas Pump lives inside Precision: same blink-on-time idea, with a pump to stop at $10.00.
document.getElementById('pump-start-btn')?.addEventListener('click', () => {
    if (tapTooSoon()) return;
    pickSkinNext = true;
    startGame('PUMP');
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
        if (IN_ROUND_STATES.includes(gameState)) {
            if (confirmDuringRound(party ? 'Stop this round? The turn will start over.' : 'Return to menu? Your current game will end.')) {
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
    // Calibration and results have their own Home button; one is enough.
    const ownHome = !calibrationScreen.classList.contains('hidden') || !gameOverScreen.classList.contains('hidden');
    const show = !atHome && !hudUp && !ownHome;
    homeFab.classList.toggle('hidden', !show);
    // During a game the camera fills the screen: no footer, no page scroll. 30 Seconds has
    // no HUD (the floating Home stays) but is a game all the same.
    const playing = hudUp || !enduranceScreen.classList.contains('hidden');
    if (playing && !document.body.classList.contains('in-game')) { try { window.scrollTo?.(0, 0); } catch { /* not scrollable */ } }
    document.body.classList.toggle('in-game', playing);
    document.body.classList.toggle('home-fab-on', show);
    document.body.classList.toggle('menu-sub', onMenu && !atHome);
}
homeFab.addEventListener('click', () => {
    if (IN_ROUND_STATES.includes(gameState)) {
        if (!confirmDuringRound('Go home? Your current game will end.')) return;
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

// Camera permission is asked once: between games the stream is parked (detached from
// the video, detection off) instead of stopped, and the next game reuses it. A parked
// camera is released after a minute on the menu, and right away when the app is hidden.
const CAMERA_WARM_MS = 60000;
// During Pass the Phone the next turn can take a while to start (passing, reading names),
// so the camera stays ready longer and the website doesn't ask for it again mid-party.
const CAMERA_WARM_PARTY_MS = 5 * 60000;
let warmStream = null, warmTimer = null;
function releaseWarmCamera() {
    clearTimeout(warmTimer);
    warmTimer = null;
    if (!warmStream) return;
    warmStream.getTracks().forEach(track => track.stop());
    warmStream = null;
    console.log('Camera stopped');
}
function takeWarmCamera() {
    const stream = warmStream;
    clearTimeout(warmTimer);
    warmTimer = null;
    warmStream = null;
    if (stream && stream.getTracks().every(track => track.readyState !== 'ended')) return stream;
    stream?.getTracks().forEach(track => track.stop());
    return null;
}

// Stop camera and detection helper function. keepWarm parks the stream for the next game.
function stopCameraAndDetection({ keepWarm = false } = {}) {
    cameraSession++;
    stopDetectionLoop();
    // Retire the instance now, but never close a send still in progress.
    const mesh = faceMesh;
    faceMesh = null;
    if (mesh && mesh !== activeMesh) closeFaceMesh(mesh);

    // Stop video stream to release camera, or park it for the next game.
    const stream = videoElement.srcObject;
    if (stream) {
        videoElement.srcObject = null;
        if (keepWarm && !document.hidden) {
            releaseWarmCamera();
            warmStream = stream;
            warmTimer = setTimeout(releaseWarmCamera, party ? CAMERA_WARM_PARTY_MS : CAMERA_WARM_MS);
        } else {
            stream.getTracks().forEach(track => track.stop());
            console.log('Camera stopped');
        }
    }
    if (!keepWarm || document.hidden) releaseWarmCamera();
}


const gameOverCameraStop = createGameOverCameraStop(() => stopCameraAndDetection({ keepWarm: true }));

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
        if (LOWER_WINS.includes(mode)) {
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
// Share sheet: one Share button on the results opens the clip, photo, link and card.
const shareSheet = document.getElementById('share-sheet');
function closeShareSheet() { shareSheet.classList.add('hidden'); }
document.getElementById('share-open-btn').addEventListener('click', () => {
    shareSheet.classList.remove('hidden');
    document.getElementById('share-close-btn').focus?.();
});
document.getElementById('share-close-btn').addEventListener('click', closeShareSheet);
shareSheet.addEventListener('click', event => { if (event.target === shareSheet) closeShareSheet(); });
shareBtn.addEventListener('click', async () => {
    if (lastScore === null || !lastResult) return;
    const payload = sharePayload(lastResult, currentSkin);

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
    if (balloonRound) tapAwayReset();
    balloonRound = null;
    tapBlink.reset();
    balloonCtx.clearRect(0, 0, balloonLayer.width, balloonLayer.height);
    balloonLayer.classList.add('hidden');
    livesDisplay.classList.add('hidden');
    gameHud.classList.remove('balloon-mode', 'tap-mode');
}

function hideJoke() {
    stopBalloons();
    stopQuick();
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

function balloonLivesText() {
    const left = balloonRound ? balloonRound.livesLeft() : BALLOON_MISSES;
    return left === 1 ? 'Last life!' : `${left} lives left`;
}

// The popped count is the goal, so it grows for a moment on every pop.
function bumpBalloonScore(score) {
    scoreDisplay.innerText = String(score);
    scoreDisplay.classList?.remove('bump');
    void scoreDisplay.offsetWidth;
    scoreDisplay.classList?.add('bump');
}

function startBalloonRound() {
    gameState = 'BALLOON';
    balloonRound = createBalloonRound();
    tapBlink.reset();
    tapAwayReset();
    balloonEnd = null;
    startTime = Date.now();
    balloonLayer.classList.remove('hidden');
    sizeBalloonLayer();
    hudLabel.innerText = 'POPPED';
    scoreDisplay.innerText = '0';
    gameHud.classList.remove('hidden');
    gameHud.classList.add('active', 'balloon-mode', 'tap-mode');
    livesDisplay.classList.remove('hidden');
    renderBalloonLives();
    faceStatus.classList.remove('hidden', 'not-detected');
    faceStatusText.innerText = party && partyTurn ? `${party.current()}'s turn: blink when a balloon is in the zone!` : 'Pop as many as you can! Blink when one is in the zone';
    updateBalloonLoop();
}

function updateBalloonLoop() {
    if (gameState !== 'BALLOON' || !balloonRound) return;
    const away = tapAwayCheck();
    if (away === 'OVER') return endBalloon(true);
    if (away === 'PAUSED') { balloonFrameId = requestAnimationFrame(updateBalloonLoop); return; }
    const now = clock();
    if (balloonRound.update(now).length) {
        haptics.fire('warn');
        renderBalloonLives();
        if (!balloonRound.over) faceStatusText.innerText = `One got away! ${balloonLivesText()}`;
    }
    sizeBalloonLayer();
    drawBalloons(balloonCtx, balloonRound, currentSkin, balloonLayer.width, balloonLayer.height, now);
    drawCallout(balloonCtx, gameCallout, balloonLayer.width, balloonLayer.height, now, { reducedMotion: prefersReducedMotion() });
    if (balloonRound.over) return endBalloon(false);
    balloonFrameId = requestAnimationFrame(updateBalloonLoop);
}

// A pop is the moment the eyes close; holding them shut does not pop again.
function handleBalloonEye(eye, now) {
    if (!balloonRound) return;
    if (eye && Number.isFinite(eye.minEar) && eye.minEar > 0 && eye.minEar <= 1) {
        now = tapFaceSeen(now);
        faceStatus.classList.remove('not-detected');
        currentEAR = eye.ear;
        minEARValue = eye.minEar;
        if (tapBlink.observe(eye, getBlinkThreshold())) {
            const result = balloonRound.blink(now);
            if (result?.hit) {
                bumpBalloonScore(result.score);
                faceStatusText.innerText = `POP! ${result.score} popped`;
                const colors = balloonColors(currentSkin);
                popFx(colors[result.balloon.color % colors.length]);
                if (result.lifeBack) {
                    renderBalloonLives();
                    callout('+1 LIFE 🎈', '#ff4fa3');
                    if (soundEnabled) audioManager.playLevelUp?.();
                } else if (result.levelUp) {
                    callout(`LEVEL ${balloonLevel(result.score)}!`, '#39ff14');
                    if (soundEnabled) audioManager.playLevelUp?.();
                } else if (result.streak >= 3 && result.streak % 3 === 0) callout(`${result.streak} IN A ROW!`, '#fff200');
            } else if (result?.kind === 'FREE') {
                faceStatusText.innerText = 'Wait for the zone. That one was free!';
            } else if (result) {
                renderBalloonLives();
                faceStatusText.innerText = `Too early! ${balloonLivesText()}`;
                haptics.fire('warn');
            }
            if (balloonRound.over) return endBalloon(false);
        }
    } else {
        resetBlinkState();
        tapBlink.reset();
        faceStatus.classList.add('not-detected');
        faceStatusText.innerText = 'Face not detected – move closer & improve lighting';
        // The frame loop's "Come back!" pause decides when a lost face ends the round.
    }
}

function endBalloon(faceLost) {
    if (gameState !== 'BALLOON' || !balloonRound) return;
    balloonEnd = { score: balloonRound.score, elapsed: balloonRound.elapsed(clock()), faceLost };
    endGame('BALLOON_OVER');
}

// ---------- Flash and Blink Beat ----------
function stopQuick() {
    cancelAnimationFrame(quickFrameId);
    if (quickRound) tapAwayReset();
    quickRound = null;
    tapBlink.reset();
    quickStage.classList.add('hidden');
    quickStage.classList.remove('go', 'early');
    quickLight.classList.remove('lit', 'tap', 'right', 'wrong');
    gameHud.classList.remove('tap-mode');
    if (beatBarsPlayed !== null) {
        beatBarsPlayed = null;
        balloonCtx.clearRect(0, 0, balloonLayer.width, balloonLayer.height);
        balloonLayer.classList.add('hidden');
        livesDisplay.classList.add('hidden');
    }
}

let beatBarsPlayed = null; // beats played so far in Blink Beat (for the accent on each bar)

function renderQuickDots(filled, total, cls = 'on') {
    const dots = [];
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('span');
        dot.className = i < filled ? `dot ${cls}` : 'dot';
        dots.push(dot);
    }
    quickDots.replaceChildren?.(...dots);
}

function renderQuickLives() {
    const left = quickRound.livesLeft();
    const icons = [];
    for (let i = 0; i < BEAT_LIVES; i++) {
        const icon = document.createElement('span');
        icon.textContent = '🎵';
        icon.className = i < left ? 'life' : 'life lost';
        icons.push(icon);
    }
    livesDisplay.replaceChildren?.(...icons);
    livesDisplay.setAttribute('aria-label', `${left} ${left === 1 ? 'life' : 'lives'} left`);
}

function startQuickRound(mode) {
    gameState = mode;
    quickRound = mode === 'FLASH' ? createFlashRound() : createBeatRound();
    tapBlink.reset();
    tapAwayReset();
    quickEnd = null;
    startTime = Date.now();
    quickLight.classList.remove('lit', 'tap', 'right', 'wrong');
    if (mode === 'FLASH') quickStage.classList.remove('hidden', 'go', 'early');
    gameHud.classList.remove('hidden');
    gameHud.classList.add('active', 'tap-mode');
    faceStatus.classList.remove('hidden', 'not-detected');
    if (mode === 'FLASH') {
        hudLabel.innerText = 'TRY';
        scoreDisplay.innerText = `1/${quickRound.tries}`;
        quickText.textContent = 'Wait for green…';
        faceStatusText.innerText = 'Blink the moment it turns green';
        renderQuickDots(0, quickRound.tries);
    } else {
        // Blink Beat draws its lane and notes on the same camera overlay as Balloon Pop.
        beatBarsPlayed = 0;
        hudLabel.innerText = 'HITS';
        scoreDisplay.innerText = '0';
        balloonLayer.classList.remove('hidden');
        sizeBalloonLayer();
        faceStatusText.innerText = 'Listen to the beat. Blink as each note hits the line';
        livesDisplay.classList.remove('hidden');
        renderQuickLives();
    }
    updateQuickLoop();
}

function updateQuickLoop() {
    if ((gameState !== 'FLASH' && gameState !== 'BEAT') || !quickRound) return;
    const away = tapAwayCheck();
    if (away === 'OVER') return endQuick(true);
    if (away === 'PAUSED') { quickFrameId = requestAnimationFrame(updateQuickLoop); return; }
    const now = clock();
    const event = quickRound.update(now);
    if (gameState === 'FLASH') showFlashEvent(event);
    else showBeatEvent(event, now);
    if (quickRound.over) return endQuick(false);
    quickFrameId = requestAnimationFrame(updateQuickLoop);
}

function showFlashEvent(event) {
    if (!event) return;
    if (event.kind === 'GO') {
        quickStage.classList.remove('early');
        quickStage.classList.add('go');
        quickText.textContent = 'BLINK!';
        if (soundEnabled) audioManager.playBeep?.(880);
    } else if (event.kind === 'READY') {
        quickStage.classList.remove('go', 'early');
        quickText.textContent = 'Wait for green…';
        scoreDisplay.innerText = `${quickRound.tryNumber()}/${quickRound.tries}`;
    } else if (event.kind === 'SLOW') {
        quickStage.classList.remove('go');
        quickText.textContent = 'Too slow!';
        renderQuickDots(quickRound.times.length, quickRound.tries);
    }
}

let beatPulseAt = null; // when the last beat played, for the on-screen pulse
function showBeatEvent(event, now) {
    for (let i = 0; i < (event?.beats || 0); i++) {
        if (soundEnabled) audioManager.playKick?.(beatBarsPlayed % 4 === 0);
        beatBarsPlayed++;
        beatPulseAt = now;
    }
    if (event?.missed) {
        renderQuickLives();
        haptics.fire('warn');
        if (!quickRound.over) faceStatusText.innerText = quickRound.livesLeft() === 1 ? 'Missed one! Last life' : `Missed one! ${quickRound.livesLeft()} lives left`;
    }
    sizeBalloonLayer();
    drawBeat(balloonCtx, quickRound, currentSkin, balloonLayer.width, balloonLayer.height, now, { pulseAt: beatPulseAt });
}

// A blink counts the moment the eyes close; holding them shut is one blink.
function handleQuickEye(eye, now) {
    if (!quickRound) return;
    if (eye && Number.isFinite(eye.minEar) && eye.minEar > 0 && eye.minEar <= 1) {
        now = tapFaceSeen(now);
        faceStatus.classList.remove('not-detected');
        currentEAR = eye.ear;
        minEARValue = eye.minEar;
        if (tapBlink.observe(eye, getBlinkThreshold())) {
            const result = quickRound.blink(now);
            if (gameState === 'FLASH' && result) {
                if (result.kind === 'EARLY') {
                    quickStage.classList.add('early');
                    quickText.textContent = 'Too early! Wait for green…';
                    haptics.fire('warn');
                } else if (result.kind === 'HIT') {
                    quickStage.classList.remove('go');
                    quickText.textContent = `${result.ms} ms`;
                    renderQuickDots(quickRound.times.length, quickRound.tries);
                    haptics.fire('pop');
                    if (soundEnabled) audioManager.playPop?.(1.3);
                }
            } else if (gameState === 'BEAT' && result) {
                if (result.kind === 'PERFECT' || result.kind === 'GOOD') {
                    bumpBalloonScore(result.score);
                    if (soundEnabled) audioManager.playBeep?.(result.kind === 'PERFECT' ? 880 : 660);
                    haptics.fire(result.kind === 'PERFECT' ? 'pop' : 'tick');
                    if (result.lifeBack) renderQuickLives();
                    faceStatusText.innerText = result.lifeBack ? `${result.combo} in a row! Life back` : result.combo >= 3 ? `${result.combo} in a row!` : result.kind === 'PERFECT' ? 'Perfect!' : 'Good!';
                } else if (result.kind === 'STRAY') {
                    faceStatusText.innerText = 'Wait for a note to reach the line';
                }
            }
            if (quickRound.over) return endQuick(false);
        }
    } else {
        resetBlinkState();
        tapBlink.reset();
        faceStatus.classList.add('not-detected');
        faceStatusText.innerText = 'Face not detected – move closer & improve lighting';
        // The frame loop's "Come back!" pause decides when a lost face ends the round.
    }
}

function endQuick(faceLost) {
    if ((gameState !== 'FLASH' && gameState !== 'BEAT') || !quickRound) return;
    const mode = gameState;
    if (mode === 'FLASH') {
        const times = quickRound.times;
        // A face lost before any try counts as no result.
        if (faceLost && !times.length) { quickEnd = null; endGame('DISQUALIFIED'); return; }
        quickEnd = { mode, score: quickRound.best, times, faceLost, lastHit: !faceLost && quickRound.last?.kind === 'HIT' };
    } else {
        quickEnd = { mode, score: quickRound.score, bestCombo: quickRound.bestCombo, perfect: quickRound.perfect, faceLost };
    }
    endGame('QUICK_OVER');
}

// ---------- Party tournament ----------
document.getElementById('party-back-btn').addEventListener('click', () => {
    clearTapGuard();
    partyOptions.classList.add('hidden');
    modeSelection.classList.remove('hidden');
    modeSelection.querySelector('[data-mode="PARTY"]')?.focus();
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
        const game = document.querySelector('input[name="party-game"]:checked')?.value || 'BALLOON';
        party = createParty(parseNames(document.getElementById('party-names').value), { game });
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
        startGame(party.game);
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
    stopCameraAndDetection({ keepWarm: true });
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
        score.textContent = party.game === 'BALLOON' ? `${Math.round(entry.score)} popped` : `${entry.score.toFixed(2)}s`;
        li.append(name, score);
        partyStandings.appendChild(li);
    });
}

const championCrown = document.getElementById('champion-crown');
function showPartyScreen(stage) {
    partyStage = stage;
    championCrown?.classList.add('hidden');
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
        partyMessage.textContent = party.game === 'BALLOON'
            ? `Turn ${party.turnNumber()} of ${party.players.length}: ${party.current()}, you're up. Pop as many balloons as you can. 3 lives.`
            : `Turn ${party.turnNumber()} of ${party.players.length}: ${party.current()}, you're up. Eyes open, no do-overs.`;
        partyGoBtn.textContent = `START ${party.current().toUpperCase()}'S TURN`;
    } else if (stage === 'FINAL') {
        const [left, right] = party.finalists();
        partyTitle.textContent = 'THE FINAL';
        partyMessage.textContent = `${left} vs ${right}, head-to-head. Sit side by side with a light in front of you: ${left} on the left, ${right} on the right. First to blink loses.`;
        partyGoBtn.textContent = 'START THE FINAL';
        partySkipBtn.classList.remove('hidden');
    } else {
        const champion = party.champion();
        partyTitle.textContent = `${champion.toUpperCase()} WINS!`;
        championCrown?.classList.remove('hidden');
        if (soundEnabled) audioManager.playWin();
        celebrate();
        partyMessage.textContent = party.finalPlayed() ? `${champion} won the final.` : party.game === 'BALLOON' ? `${champion} popped the most.` : `${champion} had the longest stare.`;
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
    calibrationStartTime = clock();
    calibrationStatus.innerText = 'FINDING BOTH FACES';
    roundTip.textContent = roundTipFor('VERSUS');
    countdownEl.textContent = '';
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
    showGo();
    startTime = Date.now();
    versusStartedAt = clock();
    if (soundEnabled) audioManager.startDrone();
    gameHud.classList.remove('hidden');
    gameHud.classList.add('active');
    faceStatus.classList.remove('hidden', 'not-detected');
    faceStatusText.innerText = `${versusName('LEFT')} vs ${versusName('RIGHT')}`;
}

function updateVersusLoop() {
    const now = clock();
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
    menuBtn.innerText = party ? '⌂ BACK TO PARTY' : '⌂ HOME';
    document.getElementById('best-score').classList.add('hidden');
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
        celebrate();
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
    if (outcome?.result === 'WIN' || outcome?.result === 'TIE') startVersusClip({ headline, detail }, outcome?.elapsed ?? 0);
    else clip.reset();
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
    closeShareSheet();
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
    soundEnabled = soundPref && (mode !== 'SURPRISE' || surpriseSound.checked);
    clearSelfie();
    hideJoke();
    jokeDeck = null;
    dareBox.classList.add('hidden');
    partyNextBtn.classList.add('hidden');
    gameOverScreen.classList.remove('versus-result', 'party-turn');
    restartBtn.innerText = 'PLAY AGAIN';
    partyScreen.classList.add('hidden');
    partyScreen.classList.remove('active');
    if (!party || mode !== party.game) partyTurn = false;
    gameOverCameraStop.cancel();
    cancelAnimationFrame(calibrationFrameId);
    cancelAnimationFrame(animationFrameId);
    // Abandon any previous camera permission prompt or pending startup; keep a running camera.
    stopCameraAndDetection({ keepWarm: true });
    const session = cameraSession;
    // Two faces: Stare-down needs both; solo keeps the closest player with the detailed eye model.
    faceMesh = createSessionFaceMesh(session, 2, mode !== 'VERSUS' && !liteTracker);
    hideCameraProblem();
    retryMode = party ? null : mode;
    currentMode = mode;
    // Nothing from the last round's look carries over (label glow, meter colour).
    hudLabel.style.color = '';
    hudLabel.style.textShadow = '';
    const meterFill = document.getElementById('eye-meter-fill');
    if (meterFill) { meterFill.style.background = ''; meterFill.style.boxShadow = ''; meterFill.style.width = '100%'; }
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
    } else if (mode === 'PUMP') {
        hudLabel.innerText = "⛽ PUMP";
        targetDisplay.classList.remove('hidden');
        targetDisplay.querySelector('.digital-text-sm').innerText = formatDollars(PUMP_TARGET);
        worldRecordDisplay.classList.add('hidden');
        scoreDisplay.innerText = formatDollars(0);
    } else if (mode === 'CLASSIC') {
        hudLabel.innerText = "TIME";
        targetDisplay.classList.add('hidden');

        // Show WR in Classic
        worldRecordDisplay.classList.remove('hidden');
        wrValue.innerText = "--";

        // Same best the results screen shows, saved automatically (no name needed).
        let best = null, readable = true;
        try { best = Number.parseFloat(localStorage.getItem(bestKey('CLASSIC'))); } catch { readable = false; }
        wrValue.innerText = !readable ? 'Unavailable' : Number.isFinite(best) ? `${best.toFixed(2)}s` : 'None yet';
    } else {
        // Endurance, Daily, Surprise, Distraction and Head-to-head
        hudLabel.innerText = mode === 'VERSUS' ? 'STARE-DOWN' : "TIME";
        targetDisplay.classList.add('hidden');
        worldRecordDisplay.classList.add('hidden');
    }

    if (mode === 'DAILY') loadingMsg.innerText = "LOADING TODAY'S TWIST...";

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

// One line before each game says what to do, while a 3-2-1 runs over calibration.
const roundTip = document.getElementById('round-tip');
const countdownEl = document.getElementById('countdown');
const goFlash = document.getElementById('go-flash');
let goFlashTimer = null;
function roundTipFor(mode) {
    switch (mode) {
        case 'PUMP': return 'Blink to stop the pump at exactly $10.00. It speeds up after $8!';
        case 'PRECISION': return `Blink right at ${precisionTarget} seconds. The clock hides after ${PRECISION_CLOCK_SHOWN_S}, so count in your head.`;
        case 'ENDURANCE': return "Don't blink for 30 seconds.";
        case 'DAILY': return `Today's twist: ${dailyTwist().name}. Don't blink!`;
        case 'SURPRISE': return "Something may startle you. Don't blink!";
        case 'DISTRACT': return "Jokes are coming. Don't blink!";
        case 'BALLOON': return 'Blink when a balloon is in the zone and it turns green.';
        case 'FLASH': return 'Wait for green, then blink as fast as you can.';
        case 'BEAT': return 'Notes slide down to the line with the beat. Blink as each one hits it.';
        case 'VERSUS': return 'First to blink loses.';
        default: return 'Keep your eyes open as long as you can.';
    }
}
// Daily's twist changes each day and only starts with the round, not on the setup screens.
const DAILY_TWISTS = [
    { cls: 'chaos-invert', name: 'inverted colours' },
    { cls: 'chaos-glitch', name: 'glitchy screen' },
    { cls: 'chaos-blur', name: 'blurry screen' },
];
function dailyTwist(date = new Date()) {
    const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
    return DAILY_TWISTS[day % DAILY_TWISTS.length];
}
function showGo() {
    if (soundEnabled) audioManager.playGo?.();
    haptics.fire('heavy');
    clearTimeout(goFlashTimer);
    goFlash.classList.remove('hidden');
    goFlashTimer = setTimeout(() => goFlash.classList.add('hidden'), 700);
}

// Best score per mode, kept on this device without needing a name.
function bestKey(mode) { return `blink_best_${mode}`; }
function recordBest(mode, score) {
    let best = null;
    try { const stored = Number.parseFloat(localStorage.getItem(bestKey(mode))); if (Number.isFinite(stored)) best = stored; } catch { return { best: null, isNew: false }; }
    const better = best === null || (mode.startsWith('PRECISION') || LOWER_WINS.includes(mode) ? score < best : score > best);
    if (better) {
        try { localStorage.setItem(bestKey(mode), String(score)); } catch { /* storage unavailable */ }
    }
    return { best: better ? score : best, isNew: better && best !== null };
}

function showSkinPick(mode) {
    gameState = 'SKIN_PICK';
    loadingMsg.style.display = 'none';
    menuScreen.classList.add('hidden');
    menuScreen.classList.remove('active');
    gameOverScreen.classList.add('hidden');
    skinPickMode.textContent = MODE_NAMES[mode] || '';
    document.getElementById('skin-pick-tip').textContent = roundTipFor(mode);
    skinPickScreen.classList.remove('hidden');
    skinPickScreen.classList.add('active');
    document.getElementById('skin-pick-play').focus();
    updateHomeFab();
}
// Back goes one step: to Precision's target times, otherwise to the game list.
document.getElementById('skin-pick-back').addEventListener('click', () => {
    if (gameState !== 'SKIN_PICK') return;
    const mode = currentMode;
    showMenu();
    if (mode === 'PRECISION' || mode === 'PUMP') {
        modeSelection.classList.add('hidden');
        precisionOptions.classList.remove('hidden');
    }
    updateHomeFab();
});
document.getElementById('skin-pick-play').addEventListener('click', () => {
    if (gameState !== 'SKIN_PICK') return;
    skinPickScreen.classList.add('hidden');
    skinPickScreen.classList.remove('active');
    (currentMode === 'VERSUS' ? startVersusCalibration : startCalibration)();
});

function startCalibration() {
    cancelAnimationFrame(calibrationFrameId);
    gameState = 'CALIBRATING';
    loadingMsg.style.display = 'none';
    faceLoss.reset();
    resetBlinkState();
    calibration.reset();
    tracking.reset();
    calibrationStartTime = clock();
    calibrationLastFrame = null;
    calibrationFirstFrame = null;
    calibrationLastEye = null;
    blinkTest.reset();
    blinkTestStart = null;
    blinkTestDoneAt = null;
    eyeLightClosedAt = -Infinity;
    setEyeLight('off', '👁️ Looking for your eyes');
    calibrationStatus.innerText = 'FINDING YOUR EYES';
    calibrationHint.innerText = calibrationHintText;
    resetLightTip();
    calibrationLoader.style.width = '0%';
    roundTip.textContent = roundTipFor(currentMode);
    countdownEl.textContent = '3';

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
        const now = clock();
        const elapsed = now - calibrationStartTime;
        const progress = calibration.progress(now);
        calibrationLoader.style.width = `${progress * 100}%`;
        // No countdown until the eyes are found, so it never sits frozen on 1.
        const count = progress > 0 ? String(Math.max(1, Math.ceil((3000 - elapsed) / 1000))) : '';
        if (countdownEl.textContent !== count) {
            countdownEl.textContent = count;
            if (count) { if (soundEnabled) audioManager.playTick?.(); haptics.fire('tick'); }
        }

        if (blinkTestStart !== null) {
            updateBlinkTest(now);
            return;
        }
        if (elapsed >= 3000 && calibration.ready(now)) {
            if (wantsBlinkTest() && measureBaseline()) startBlinkTest(now);
            else finishCalibration();
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
            } else if (loading && elapsed >= 2000) message = eyeTrackingReady ? 'LOADING EYE TRACKING...' : `DOWNLOADING EYE TRACKER (ONE TIME) ${Math.round(elapsed / 1000)}s`;
            else if (elapsed >= 4000) message = 'WAITING FOR EYE TRACKING';
            if (calibrationStatus.innerText !== message) calibrationStatus.innerText = message;
            const hint = loading && elapsed >= 6000 ? 'Slow connection? This only happens the first time. Hang on a moment.' : calibrationHintText;
            if (calibrationHint.innerText !== hint) calibrationHint.innerText = hint;
            updateLightTip(now);
            const seen = calibrationLastFrame !== null && now - calibrationLastFrame < 1000 && calibrationLastEye !== null;
            setEyeLight(seen ? 'open' : 'off', seen ? '👁️ Eyes found' : '👁️ Looking for your eyes');
            // Keep valid samples across the three-second warm-up. Slower cameras
            // must be able to reach the required sample count without restarting.
            calibrationFrameId = requestAnimationFrame(updateCalibrationLoop);
        }
    }
}

// Too-dark tip: twice a second, average the brightness of a tiny copy of the camera
// picture. Dim rooms are the usual reason eyes are not found (Thanksgiving dinner light).
const LIGHT_DARK_LUMA = 45;   // 0 to 255; a lit face is usually well above 80
const LIGHT_CHECK_MS = 500;
const lightTip = document.getElementById('calibration-light-tip');
const lightCanvas = document.createElement('canvas');
lightCanvas.width = 32; lightCanvas.height = 24;
const lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });
let lightCheckedAt = -Infinity;
let darkChecks = 0;
function resetLightTip() {
    lightCheckedAt = -Infinity;
    darkChecks = 0;
    lightTip?.classList.add('hidden');
}
function videoLuma() {
    if (!lightCtx || !videoElement.videoWidth) return null;
    try {
        lightCtx.drawImage(videoElement, 0, 0, lightCanvas.width, lightCanvas.height);
        const { data } = lightCtx.getImageData(0, 0, lightCanvas.width, lightCanvas.height);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        return sum / (data.length / 4);
    } catch { return null; }
}
function updateLightTip(now) {
    if (!lightTip || now - lightCheckedAt < LIGHT_CHECK_MS) return;
    lightCheckedAt = now;
    const luma = videoLuma();
    if (luma === null) return;
    // Two dark checks in a row to show it, one bright check to hide it.
    darkChecks = luma < LIGHT_DARK_LUMA ? darkChecks + 1 : 0;
    lightTip.classList.toggle('hidden', darkChecks < 2);
}

function startBlinkTest(now) {
    blinkTestStart = now;
    blinkTest.reset();
    countdownEl.textContent = '';
    calibrationLoader.style.width = '100%';
    calibrationStatus.innerText = 'NOW BLINK ONCE';
    calibrationHint.innerText = 'Just a normal blink, so the game learns your eyes.';
    setEyeLight('open', '👁️ Watching for your blink');
    calibrationFrameId = requestAnimationFrame(updateCalibrationLoop);
}
function updateBlinkTest(now) {
    const eye = calibrationLastEye;
    const fresh = calibrationLastFrame !== null && now - calibrationLastFrame < 1000;
    if (blinkTestDoneAt === null) {
        if (fresh && eye !== null && eye < getBlinkThreshold()) eyeLightClosedAt = now;
        if (fresh && eye !== null && blinkTest.observe(eye, baselineEAR)) {
            const line = blinkLineFor(baselineEAR, blinkTest.low);
            learnedLine = line / baselineEAR;
            try { localStorage.setItem(LINE_KEY, learnedLine.toFixed(3)); } catch { /* storage unavailable */ }
            setBlinkThreshold(Math.min(line, 0.35));
            blinkTestDoneAt = now;
            calibrationStatus.innerText = 'GOT IT ✓';
            calibrationHint.innerText = 'Your blinks come through clearly.';
            setEyeLight('seen', '✅ Blink seen');
            if (soundEnabled) audioManager.playTick?.();
            haptics.fire('pop');
        } else if (now - blinkTestStart >= BLINK_TEST_MS) {
            // No clear blink seen: start anyway with the usual line, and ask again next round.
            blinkTestStart = null;
            finishCalibration();
            return;
        } else {
            const closed = now - eyeLightClosedAt < 300;
            setEyeLight(closed ? 'closed' : 'open', closed ? '😌 Eyes closed' : '👁️ Watching for your blink');
        }
    } else if (now - blinkTestDoneAt >= 700) {
        finishCalibration();
        blinkTestStart = null;
        return;
    }
    calibrationFrameId = requestAnimationFrame(updateCalibrationLoop);
}

function measureBaseline() {
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
        setBlinkThreshold(Math.min(avg * (learnedLine ?? DEFAULT_LINE), 0.35));
        return true;
    }
    return false;
}
// Only a player's first solo round asks for the test; party turns and challenges skip it.
function wantsBlinkTest() {
    return learnedLine === null && !party && currentMode !== 'VERSUS';
}

function finishCalibration() {
    if (blinkTestStart === null) measureBaseline();

    calibrationScreen.classList.add('hidden');
    calibrationScreen.classList.remove('active');
    // Flash and Blink Beat use green to mean "blink now", so no green GO there.
    if (currentMode !== 'FLASH' && currentMode !== 'BEAT') showGo();

    // Start Audio Drone
    if (soundEnabled) audioManager.startDrone();

    if (currentMode === 'DAILY') container.classList.add(dailyTwist().cls);
    resetGlance();

    // Reset blink detection state before starting game
    resetBlinkState();
    tracking.reset(clock());

    if (currentMode === 'BALLOON') {
        startBalloonRound();
    } else if (currentMode === 'FLASH' || currentMode === 'BEAT') {
        startQuickRound(currentMode);
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

const enduranceLeft = document.getElementById('endurance-left');
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
        if (glanceAwayOver(clock())) {
            endGame('DISQUALIFIED');
            return;
        }
        if (awaySince !== null) { animationFrameId = requestAnimationFrame(updateEnduranceLoop); return; }
        const elapsed = (Date.now() - startTime) / 1000;
        const duration = 30; // 30 seconds
        const progress = Math.min((elapsed / duration) * 100, 100);

        uploadProgress.style.width = `${progress}%`;
        if (enduranceLeft) enduranceLeft.textContent = String(Math.max(0, Math.ceil(duration - elapsed)));

        // Update Eye Openness Meter and add tension effects
        const threshold = getBlinkLine();
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
    closeShareSheet();
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
    restartBtn.innerText = 'PLAY AGAIN';
    gameOverCameraStop.cancel();
    gameState = 'MENU';
    cancelAnimationFrame(animationFrameId);
    cancelAnimationFrame(calibrationFrameId);
    stopCameraAndDetection({ keepWarm: true });
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
    reloadForUpdate();
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    // Mid-party, backgrounding releases the camera but keeps the party and its scores.
    if (party) { if (videoElement.srcObject || gameState !== 'PARTY' || loadingMsg.style.display === 'block') returnToParty(); }
    else if (videoElement.srcObject || gameState !== 'MENU' || loadingMsg.style.display === 'block') showMenu();
    releaseWarmCamera();
});

function onResults(results, session) {
    // A retired instance cannot borrow the current send's identity, even after its send settles.
    if (session !== resultSession || session !== cameraSession || !videoElement.srcObject) return;
    const now = clock();
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
    if (gameState === 'FLASH' || gameState === 'BEAT') {
        handleQuickEye(eye, now);
        canvasCtx.restore();
        return;
    }
    if (gameState === 'CALIBRATING') {
        calibrationLastFrame = now;
        calibrationLastEye = eye && Number.isFinite(eye.minEar) && eye.minEar > 0 ? eye.minEar : null;
        calibration.observe(calibrationLastEye ?? NaN, now);
    }
    if (eye && Number.isFinite(eye.minEar) && eye.minEar > 0 && eye.minEar <= 1) {
        if ((gameState === 'PLAYING' || gameState === 'ENDURANCE') && awaySince !== null) tracking.reset(now);
        if ((gameState === 'PLAYING' || gameState === 'ENDURANCE') && !tracking.observe(now)) {
            endGame('DISQUALIFIED');
            canvasCtx.restore();
            return;
        }
        faceLoss.observe(true, now);

        // Update face tracking status
        if (gameState === 'PLAYING' || gameState === 'ENDURANCE') {
            faceStatus.classList.remove('hidden', 'not-detected');
            faceStatusText.innerText = gameState === 'PLAYING' && currentMode === 'PRECISION' && (Date.now() - startTime) / 1000 >= PRECISION_CLOCK_SHOWN_S ? 'Clock hidden. Count it in your head' : party && partyTurn ? `${party.current()}'s turn. Don't blink!` : 'Tracking eyes...';
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

        // Timed rounds: the frame loop's "come back" countdown decides (glanceAwayOver).
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
        if (glanceAwayOver(clock())) {
            endGame('DISQUALIFIED');
            return;
        }
        if (awaySince !== null) { animationFrameId = requestAnimationFrame(updateGameLoop); return; }
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
        // Precision: the clock shows for the first seconds, then you count in your head.
        if (currentMode === 'PUMP') {
            const shown = formatDollars(pumpDollars(elapsed));
            if (scoreDisplay.innerText !== shown) scoreDisplay.innerText = shown;
        } else if (currentMode === 'PRECISION' && elapsed >= PRECISION_CLOCK_SHOWN_S) {
            if (scoreDisplay.innerText !== '?.??s') scoreDisplay.innerText = '?.??s';
            if (faceStatusText.innerText !== 'Clock hidden. Count it in your head') faceStatusText.innerText = 'Clock hidden. Count it in your head';
        } else scoreDisplay.innerText = `${elapsed.toFixed(2)}s`;
        if (currentMode === 'DISTRACT') updateJokes(elapsed);

        // Update Eye Openness Meter and tension effect
        const threshold = getBlinkLine();
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
            
            // A heartbeat you can feel (a light tap each beat; none in Surprise).
            if (currentMode !== 'SURPRISE') haptics.fire('tick');
            
            window.lastBeat = now;
        }

        // Visual Stages (Classic Mode only)
        if (currentMode === 'CLASSIC') {
            updateClassicVisualStage(elapsed);
        } else if (!['DAILY', 'SURPRISE', 'DISTRACT', 'PUMP'].includes(currentMode)) {
            if (elapsed > 10) container.classList.add('chaos-shake');
            if (elapsed > 20) container.classList.add('chaos-glitch');
            if (elapsed > 30) container.classList.add('chaos-invert');
        }

        animationFrameId = requestAnimationFrame(updateGameLoop);
    }
}

// Results that get the fanfare and confetti (plus any new personal best).
const WIN_TITLES = ['PERFECT!', 'EXACTLY $10.00!', 'SO CLOSE!', 'THEME UNLOCKED', 'YOU MADE IT', 'BALLOON CHAMPION!', 'ROCK STAR EYES!'];
function endGame(reason = 'BLINK') {
    menuBtn.innerText = party ? '⌂ BACK TO PARTY' : '⌂ HOME';
    surpriseRound = null;
    surpriseOverlay.classList.add('hidden');
    hideJoke();
    gameOverScreen.classList.remove('versus-result', 'party-turn');
    dareBox.classList.add('hidden');
    partyNextBtn.classList.add('hidden');
    restartBtn.innerText = 'PLAY AGAIN';
    if (reason === 'MENU_EXIT') {
        showMenu();
        return;
    }
    clearSelfie();
    gameState = 'GAME_OVER';
    gameOverTitle.style.color = 'var(--neon-red)'; // each result below sets its own colour
    resetGlance();
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
        // Win fanfare or losing buzzer is decided once the result is known (below).

        // Reset Chaos and Tension
        container.className = 'container';
        container.classList.remove('tension-active');


        const elapsed = (Date.now() - startTime) / 1000;
        let finalScoreText = '';
        let scoreToSave = 0;
        let noResult = false;

        // Reset Sub-details
        finalScoreSub.classList.add('hidden');
        gameOverWorldRecord.classList.add('hidden');

        if (reason === 'QUICK_OVER' && quickEnd) {
            scoreToSave = quickEnd.score;
            gameOverTitle.style.color = 'var(--neon-cyan)';
            finalScoreSub.classList.remove('hidden');
            if (quickEnd.mode === 'FLASH' && quickEnd.score >= FLASH_TIMEOUT_MS) {
                // Every try timed out: there is no reaction time to save as a best.
                noResult = true;
                finalScoreText = '--';
                finalScoreLabel.innerText = 'NO BLINK IN TIME';
                gameOverTitle.innerText = 'TOO SLOW';
                gameOverTitle.style.color = 'var(--neon-pink)';
                finalScoreSub.innerText = quickEnd.faceLost ? 'Your face left the frame' : 'Blink as soon as the screen turns green';
            } else if (quickEnd.mode === 'FLASH') {
                finalScoreText = formatScore('FLASH', quickEnd.score);
                finalScoreLabel.innerText = 'FASTEST BLINK';
                // Times include the camera's own delay (about a tenth of a second).
                gameOverTitle.innerText = quickEnd.score < 380 ? 'LIGHTNING EYES!' : quickEnd.score < 520 ? 'QUICK!' : 'NICE TRY';
                finalScoreSub.innerText = quickEnd.faceLost ? 'Your face left the frame' : `Your tries: ${quickEnd.times.map(ms => `${ms} ms`).join(' · ')}`;
            } else {
                finalScoreText = String(quickEnd.score);
                finalScoreLabel.innerText = quickEnd.score === 1 ? 'NOTE HIT' : 'NOTES HIT';
                gameOverTitle.innerText = quickEnd.score >= 40 ? 'ROCK STAR EYES!' : quickEnd.score >= 15 ? 'NICE BEAT!' : 'GAME OVER';
                finalScoreSub.innerText = quickEnd.faceLost ? 'Your face left the frame' : `Best streak: ${quickEnd.bestCombo} · Perfect: ${quickEnd.perfect}`;
            }
        } else if (reason === 'BALLOON_OVER' && balloonEnd) {
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
        } else if (reason === 'WIN_ENDURANCE') {
            scoreToSave = 30;
            finalScoreText = "30.00s";
            finalScoreLabel.innerText = "EYES OF STEEL";
            gameOverTitle.innerText = "THEME UNLOCKED";
            gameOverTitle.style.color = "var(--neon-pink)";

            // Unlock Theme
            document.body.classList.add('theme-purple');
            try {
                localStorage.setItem('blink_theme_purple', 'true');
            } catch (err) {
                console.warn('Theme preference not saved:', err);
            }
        } else if (reason === 'DISQUALIFIED' && TIMED_MODES.includes(currentMode) && elapsed > 0) {
            // Show how far you got; a run that ended away from the camera isn't saved as a best.
            scoreToSave = 0;
            finalScoreText = `${Math.min(elapsed, ['ENDURANCE', 'SURPRISE'].includes(currentMode) ? 30 : Infinity).toFixed(2)}s`;
            finalScoreLabel.innerText = "THEN YOUR FACE LEFT THE CAMERA";
            gameOverTitle.innerText = "ROUND OVER";
            gameOverTitle.style.color = "var(--neon-red)";
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

            gameOverTitle.style.color = "var(--neon-red)";
            // The automatic best-score line below replaces the old saved-score line.
            gameOverWorldRecord.classList.add('hidden');

        } else if (currentMode === 'PRECISION') {
            const diff = Math.abs(precisionTarget - elapsed);
            scoreToSave = diff;

            // NEW: Show Actual Time as Primary Score
            // The score is how far off you were; the blink time is the detail.
            finalScoreText = `${diff.toFixed(2)}s`;
            finalScoreLabel.innerText = "OFF THE TARGET BY";
            finalScoreSub.classList.remove('hidden');
            finalScoreSub.innerText = `You blinked at ${elapsed.toFixed(2)}s · target ${precisionTarget.toFixed(0)}s`;

            if (diff < 0.1) {
                gameOverTitle.innerText = "PERFECT!";
                gameOverTitle.style.color = "var(--neon-cyan)";
            } else {
                gameOverTitle.innerText = elapsed < precisionTarget ? "TOO EARLY" : "TOO LATE";
                gameOverTitle.style.color = "var(--neon-red)";
            }
        } else if (currentMode === 'PUMP') {
            const pumped = pumpDollars(elapsed);
            const miss = pumpMiss(elapsed);
            scoreToSave = miss;
            finalScoreText = `${formatDollars(miss)}`;
            finalScoreLabel.innerText = "OFF $10.00 BY";
            finalScoreSub.classList.remove('hidden');
            finalScoreSub.innerText = `You stopped the pump at ${formatDollars(pumped)}`;
            if (miss === 0) {
                gameOverTitle.innerText = "EXACTLY $10.00!";
                gameOverTitle.style.color = "var(--neon-cyan)";
            } else if (miss <= 0.1) {
                gameOverTitle.innerText = "SO CLOSE!";
                gameOverTitle.style.color = "var(--neon-cyan)";
            } else {
                gameOverTitle.innerText = pumped < PUMP_TARGET ? "STOPPED SHORT" : "OVERFILLED";
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

        lastScore = reason === 'DISQUALIFIED' || noResult ? null : scoreToSave;
        if (lastScore !== null && ['ENDURANCE', 'SURPRISE'].includes(currentMode)) lastScore = Math.min(30, lastScore);
        lastResult = lastScore === null ? null : { mode: currentMode, score: lastScore, elapsed, target: precisionTarget };
        // Your best in this mode, saved on this device; Precision's best is the smallest miss.
        const bestScoreEl = document.getElementById('best-score');
        let newBest = false;
        if (lastResult) {
            const bestKeyMode = currentMode === 'PRECISION' ? `PRECISION_${precisionTarget}` : currentMode;
            const { best, isNew } = recordBest(bestKeyMode, lastScore);
            newBest = isNew;
            bestScoreEl.innerText = isNew ? 'NEW BEST!' : best !== null && best !== lastScore ? `Your best: ${formatScore(currentMode, best)}` : '';
            bestScoreEl.classList.toggle('new-best', isNew);
            bestScoreEl.classList.toggle('hidden', !bestScoreEl.innerText);
        } else bestScoreEl.classList.add('hidden');
        social.render(lastResult, activeChallenge, currentSkin);
        finalScoreVal.innerText = finalScoreText;
        // Whole-number scores count up on the results screen.
        if (lastResult && (currentMode === 'BALLOON' || currentMode === 'BEAT') && Number.isInteger(lastScore)) countUp(finalScoreVal, lastScore);
        // One sound and feeling for the result: a fanfare and confetti for a win or a new best,
        // a buzzer for a loss, the old glitch for a lost face.
        const won = WIN_TITLES.includes(gameOverTitle.innerText) || newBest;
        if (won) { if (soundEnabled) audioManager.playWin(); celebrate(); }
        else if (reason === 'DISQUALIFIED' || noResult) { if (soundEnabled) audioManager.playGlitch(); haptics.fire('warn'); }
        else { if (soundEnabled) audioManager.playBuzzer?.(); haptics.fire('fail'); }

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
