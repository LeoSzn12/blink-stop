import { checkBlink, setBlinkThreshold, resetBlinkState, getBlinkThreshold } from './blinkDetection.js';
import { audioManager } from './audioManager.js';

import { createFaceLossTracker, createCalibrationTracker, createTrackingFreshness } from './gameRules.mjs';
import { createSerializedInference } from './inference.mjs';
import { appendScore } from './leaderboard.mjs';
import { cameraErrorMessage } from './cameraHelp.mjs';
import { createGameOverCameraStop } from './roundLifecycle.mjs';
import { sharePayload, shareClipboardText } from './share.mjs';
import { createSurpriseRound, createRewardedDemo } from './surprise.mjs';

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

// UI Elements (New - World Record & Precision)
const worldRecordDisplay = document.getElementById('world-record-display');
const wrValue = document.getElementById('wr-value');
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
let calibrationStartTime = 0;
let lastScore = null;
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

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed: ', err));
    });
}

// Initialize Audio on user interaction
document.addEventListener('click', () => {
    audioManager.resume();
});

// MediaPipe Setup
function createSessionFaceMesh(session) {
    const mesh = new FaceMesh({ locateFile: file => `vendor/face_mesh/${file}` });
    mesh.setOptions({
        maxNumFaces: 1,
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
            cameraError.textContent = 'Camera disconnected. Check your camera and try again.';
            cameraError.classList.remove('hidden');
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

        // 2. Start Detection Loop (Decoupled)
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

        if (mode === 'CLASSIC') {
            startGame('CLASSIC');
        } else if (mode === 'ENDURANCE') {
            startGame('ENDURANCE');
        } else if (mode === 'DAILY') {
            startGame('DAILY');
        } else if (mode === 'SURPRISE') {
            container.classList.add('surprise-mode');
            modeSelection.classList.add('hidden');
            surpriseOptions.classList.remove('hidden');
            document.getElementById('surprise-start-btn').focus();
        } else {
            // Show options
            modeSelection.classList.add('hidden');
            precisionOptions.classList.remove('hidden');
            optionBtns[0].focus();
        }
    });
});

document.getElementById('surprise-start-btn').addEventListener('click', () => startGame('SURPRISE'));
document.getElementById('surprise-back-btn').addEventListener('click', () => {
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
    precisionOptions.classList.add('hidden');
    modeSelection.classList.remove('hidden');
    document.querySelector('[data-mode="PRECISION"]').focus();
});

optionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Set target
        precisionTarget = parseFloat(e.target.dataset.time);

        // Update active state
        optionBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Start Game
        startGame('PRECISION');
    });
});

restartBtn.addEventListener('click', () => startGame(currentMode));
menuBtn.addEventListener('click', showMenu);

// Home button in HUD (MENU button)
const homeBtn = document.getElementById('home-btn');
if (homeBtn) {
    homeBtn.addEventListener('click', () => {
        if (gameState === 'PLAYING' || gameState === 'ENDURANCE') {
            if (confirm('Return to menu? Your current game will end.')) {
                endGame('MENU_EXIT');
            }
        } else {
            showMenu();
        }
    });
}

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
    if (lastScore === null) return;

    if (window.Capacitor?.isNativePlatform?.()) {
        try {
            const { shareNativeScore } = await import('./deviceActions.mjs');
            await shareNativeScore(sharePayload(lastScore));
        } catch (error) {
            console.log('Native share cancelled or unavailable:', error);
        }
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share(sharePayload(lastScore));
        } catch (err) {
            console.log('Share failed:', err);
        }
    } else {
        // Fallback to clipboard; keep Share retryable when unavailable or denied.
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(shareClipboardText(lastScore));
            const originalText = shareBtn.innerText;
            shareBtn.innerText = "COPIED!";
            setTimeout(() => shareBtn.innerText = originalText, 2000);
        } catch (err) {
            shareBtn.innerText = 'CLIPBOARD UNAVAILABLE — COPY SCORE MANUALLY';
        }
    }
});

function clearSelfie() {
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
            selfieBtn.innerText = 'SAVE SELFIE';
        } catch (error) {
            selfieBtn.innerText = 'SAVE CANCELLED — TRY AGAIN';
        } finally {
            selfieBtn.disabled = false;
        }
        return;
    }
    const link = document.createElement('a');
    link.download = `blink-stop-selfie-${Date.now()}.jpg`;
    link.href = selfiePreview.src;
    link.click();
});

function startGame(mode) {
    if (gameState === 'AD_DEMO') return;
    container.className = 'container';
    if (mode === 'SURPRISE') container.classList.add('surprise-mode');
    surpriseOverlay.classList.add('hidden');
    surpriseRound = null;
    soundEnabled = mode !== 'SURPRISE' || surpriseSound.checked;
    clearSelfie();
    gameOverCameraStop.cancel();
    cancelAnimationFrame(calibrationFrameId);
    // Abandon any previous camera permission prompt or pending startup.
    stopCameraAndDetection();
    const session = cameraSession;
    faceMesh = createSessionFaceMesh(session);
    cameraError.classList.add('hidden');
    currentMode = mode;
    loadingMsg.style.display = 'block';
    loadingMsg.innerText = 'INITIALIZING BLINK DETECTION...';

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
        // Endurance
        hudLabel.innerText = "TIME";
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
            setTimeout(() => {
                if (session === cameraSession && !document.hidden) startCalibration();
            }, 500);
        })
        .catch(err => {
            if (session !== cameraSession) return;
            console.error("Camera error:", err);
            loadingMsg.style.display = 'none';

            showMenu();
            cameraError.textContent = cameraErrorMessage(err);
            cameraError.classList.remove('hidden');
        });
}

function startCalibration() {
    cancelAnimationFrame(calibrationFrameId);
    gameState = 'CALIBRATING';
    faceLoss.reset();
    resetBlinkState();
    calibration.reset();
    tracking.reset();
    calibrationStartTime = performance.now();

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
        const elapsed = (now - calibrationStartTime) / 1000;
        const progress = Math.min((elapsed / 3) * 100, 100);
        const remaining = Math.max(3 - elapsed, 0);

        calibrationLoader.style.width = `${progress}%`;
        calibrationStatus.innerText = `${remaining.toFixed(2)}s`;

        if (elapsed >= 3 && calibration.ready(now)) {
            finishCalibration();
        } else {
            if (elapsed >= 3) {
                calibration.reset();
                calibrationStartTime = now;
                calibrationStatus.innerText = 'LOOK AT CAMERA WITH EYES OPEN';
            }
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
        // More sensitive threshold! (0.85 of baseline instead of 0.8)
        const newThreshold = Math.max(0.18, Math.min(avg * 0.85, 0.35));
        setBlinkThreshold(newThreshold);
    }

    calibrationScreen.classList.add('hidden');
    calibrationScreen.classList.remove('active');

    // Start Audio Drone
    if (soundEnabled) audioManager.startDrone();

    // Reset blink detection state before starting game
    resetBlinkState();
    tracking.reset(performance.now());

    if (currentMode === 'ENDURANCE') {
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
    demoRound?.cancel();
    demoRound = null;
    cancelAnimationFrame(demoFrameId);
    demoScreen.classList.add('hidden');
    surpriseRound = null;
    surpriseOverlay.classList.add('hidden');
    audioManager.stopDrone();
    clearSelfie();
    gameOverCameraStop.cancel();
    gameState = 'MENU';
    cancelAnimationFrame(animationFrameId);
    cancelAnimationFrame(calibrationFrameId);
    stopCameraAndDetection();
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
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && (videoElement.srcObject || gameState !== 'MENU' || loadingMsg.style.display === 'block')) showMenu();
});

function onResults(results, session) {
    // A retired instance cannot borrow the current send's identity, even after its send settles.
    if (session !== resultSession || session !== cameraSession || !videoElement.srcObject) return;
    const now = performance.now();
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    const landmarks = results.multiFaceLandmarks?.[0];
    const eye = landmarks ? checkBlink(landmarks, now) : null;
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

        if (gameState === 'CALIBRATING') {
            calibration.observe(minEar, now); // Only plausible open-eye observations count
        } else if (gameState === 'PLAYING' || gameState === 'ENDURANCE') {
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
        } else if (currentMode !== 'DAILY' && currentMode !== 'SURPRISE') {
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

        // Draw Game Over Overlay on Canvas for Selfie
        try {
            canvasCtx.save();
            canvasCtx.fillStyle = "rgba(255, 0, 0, 0.4)";
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.fillStyle = "#fff";
            canvasCtx.font = "bold 60px system-ui";
            canvasCtx.textAlign = "center";
            canvasCtx.textBaseline = "middle";
            canvasCtx.shadowColor = "#f00";
            canvasCtx.shadowBlur = 20;
            const won = reason === 'WIN_SURPRISE' || reason === 'WIN_ENDURANCE';
            canvasCtx.fillText(won ? 'SURVIVED!' : reason === 'DISQUALIFIED' ? 'FACE LOST' : 'BLINK DETECTED!', canvasElement.width/2, canvasElement.height/2 - 40);
            canvasCtx.font = "bold 40px monospace";
            canvasCtx.fillText(`TIME: ${won ? '30.00' : ((Date.now() - startTime) / 1000).toFixed(2)}s`, canvasElement.width/2, canvasElement.height/2 + 40);
            canvasCtx.restore();
            
            // Output to Selfie Preview
            const dataUrl = canvasElement.toDataURL('image/jpeg', 0.8);
            selfiePreview.src = dataUrl;
            selfieContainer.classList.remove('hidden');
        } catch(e) {
            console.error("Selfie capture failed", e);
            selfieContainer.classList.add('hidden');
        }

        const elapsed = (Date.now() - startTime) / 1000;
        let finalScoreText = '';
        let scoreToSave = 0;

        // Reset Sub-details
        finalScoreSub.classList.add('hidden');
        gameOverWorldRecord.classList.add('hidden');

        if (reason === 'WIN_SURPRISE') {
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
            finalScoreText = "DQ";
            finalScoreLabel.innerText = "FACE LOST";
            gameOverTitle.innerText = "DISQUALIFIED";
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
                gameOverTitle.innerText = "TOO EARLY/LATE";
                gameOverTitle.style.color = "var(--neon-red)";
            }
        } else if (currentMode === 'ENDURANCE') {
            scoreToSave = elapsed;
            finalScoreText = `${elapsed.toFixed(2)}s`;
            finalScoreLabel.innerText = "YOUR EYES GAVE UP AT";
            gameOverTitle.innerText = "BLINK DETECTED";
            gameOverTitle.style.color = "var(--neon-red)";
        } else if (currentMode === 'DAILY' || currentMode === 'SURPRISE') {
            scoreToSave = elapsed;
            finalScoreText = `${elapsed.toFixed(2)}s`;
            finalScoreLabel.innerText = currentMode === 'SURPRISE' ? 'SURPRISE SURVIVAL' : 'DAILY SURVIVAL';
            gameOverTitle.innerText = "BLINK DETECTED";
            gameOverTitle.style.color = "var(--neon-pink)";
        }

        lastScore = reason === 'DISQUALIFIED' ? null : scoreToSave;
        finalScoreVal.innerText = finalScoreText;

        playerNameInput.value = '';
        playerNameInput.disabled = false;
        saveScoreBtn.disabled = lastScore === null;
        shareBtn.disabled = lastScore === null;
        demoBonusBtn.disabled = lastScore === null;
        selfieBtn.innerText = 'SAVE SELFIE';
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
