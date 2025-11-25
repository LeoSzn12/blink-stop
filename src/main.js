import { checkBlink, setBlinkThreshold } from './blinkDetection.js';
import { audioManager } from './audioManager.js';
import { GlobalLeaderboard } from './firebase.js';

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
const adVideo = document.getElementById('ad-video');
const uploadProgress = document.getElementById('upload-progress');
const calibrationLoader = document.querySelector('.loader-bar');
const calibrationStatus = document.getElementById('calibration-status');

// UI Elements
const modeBtns = document.querySelectorAll('.mode-btn');
const optionBtns = document.querySelectorAll('.option-btn');
const precisionOptions = document.getElementById('precision-options');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');
const loadingMsg = document.getElementById('loading-msg');
const scoreDisplay = document.getElementById('score');
const targetDisplay = document.getElementById('target-display');
const hudLabel = document.getElementById('hud-label');
const eyeStatusDisplay = document.getElementById('eye-status');
const gameOverTitle = document.getElementById('game-over-title');
const finalScoreLabel = document.getElementById('final-score-label');
const finalScoreVal = document.getElementById('final-score-val');
const leaderboardList = document.getElementById('leaderboard-list');
const globalLeaderboardList = document.getElementById('global-leaderboard-list');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const shareBtn = document.getElementById('share-btn');

// Modals
const privacyModal = document.getElementById('privacy-modal');
const privacyLink = document.getElementById('privacy-link');
const closePrivacy = document.getElementById('close-privacy');

const tosModal = document.getElementById('tos-modal');
const tosLink = document.getElementById('tos-link');
const closeTos = document.getElementById('close-tos');

// Game State
let gameState = 'MENU'; // MENU, PLAYING, GAME_OVER, CALIBRATING, ENDURANCE
let currentMode = 'CLASSIC'; // CLASSIC, PRECISION, ENDURANCE
let startTime = 0;
let animationFrameId;
let precisionTarget = 10.00; // Seconds
let calibrationData = [];
let calibrationStartTime = 0;
let lastScore = null;

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
}, { once: true });

// Privacy Modal Event Listeners

privacyLink.addEventListener('click', () => {
    privacyModal.classList.remove('hidden');
});

closePrivacy.addEventListener('click', () => {
    privacyModal.classList.add('hidden');
});

// Close modal on outside click
privacyModal.addEventListener('click', (e) => {
    if (e.target === privacyModal) {
        privacyModal.classList.add('hidden');
    }
});

// Terms of Service Modal
tosLink.addEventListener('click', () => {
    tosModal.classList.remove('hidden');
});

closeTos.addEventListener('click', () => {
    tosModal.classList.add('hidden');
});

tosModal.addEventListener('click', (e) => {
    if (e.target === tosModal) {
        tosModal.classList.add('hidden');
    }
});

// MediaPipe Setup
const faceMesh = new FaceMesh({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true, // Re-enable for accurate eye tracking
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// Custom Camera Loop with Decoupled Detection
let isProcessing = false;
let detectionInterval = null;

async function startCameraLoop() {
    // 1. Start Video Stream First (Independent of FaceMesh)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: window.innerWidth < 768 ? 480 : 640 },
                height: { ideal: window.innerWidth < 768 ? 360 : 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;

        // Wait for video to actually play
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play().then(resolve);
            };
        });

        // 2. Start Detection Loop (Decoupled)
        startDetectionLoop();

    } catch (err) {
        console.error("Camera init error:", err);
        throw err; // Propagate to caller
    }
}

function startDetectionLoop() {
    if (detectionInterval) clearInterval(detectionInterval);

    // Run detection at 10 FPS (sufficient for blinking)
    // Using setInterval ensures it doesn't block the UI thread like requestAnimationFrame can
    detectionInterval = setInterval(async () => {
        if (videoElement.paused || videoElement.ended || isProcessing) return;

        isProcessing = true;
        try {
            // Race condition protection: Timeout after 100ms if FaceMesh hangs
            await Promise.race([
                faceMesh.send({ image: videoElement }),
                new Promise((_, reject) => setTimeout(() => reject("Timeout"), 100))
            ]);
        } catch (error) {
            // Ignore timeouts, just skip frame
            if (error !== "Timeout") console.warn("FaceMesh skipped:", error);
        } finally {
            isProcessing = false;
        }
    }, 100); // 100ms = 10 FPS
}

function stopDetectionLoop() {
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = null;
    isProcessing = false;
}


// Initialize
modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;

        if (mode === 'CLASSIC') {
            startGame('CLASSIC');
        } else if (mode === 'ENDURANCE') {
            startGame('ENDURANCE');
        } else {
            // Show options
            document.querySelector('.mode-selection').classList.add('hidden');
            precisionOptions.classList.remove('hidden');
        }
    });
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

// Help Logic
const helpLink = document.getElementById('help-link');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help');

// Help Modal
if (helpLink) {
    helpLink.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
        helpModal.classList.add('active');
    });
}

if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', () => {
        helpModal.classList.add('hidden');
        helpModal.classList.remove('active');
    });
}

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.add('hidden');
        helpModal.classList.remove('active');
    }
});

restartBtn.addEventListener('click', () => startGame(currentMode));
menuBtn.addEventListener('click', showMenu);

// Home button in HUD
const homeBtnHud = document.getElementById('home-btn-hud');
if (homeBtnHud) {
    homeBtnHud.addEventListener('click', () => {
        if (confirm('Return to menu? Your current game will end.')) {
            cancelAnimationFrame(animationFrameId);
            audioManager.stopDrone();
            showMenu();
        }
    });
}

// Leaderboard System
const Leaderboard = {
    get(mode) {
        const data = localStorage.getItem(`blink_lb_${mode}`);
        if (!data) return [];

        let parsed = JSON.parse(data);
        // Migration: Convert old number scores to objects
        return parsed.map(item => {
            if (typeof item === 'number') {
                return { name: 'ANONYMOUS', score: item };
            }
            return item;
        });
    },
    save(mode, score, name) {
        const scores = this.get(mode);
        scores.push({ name: name || 'ANONYMOUS', score: score });

        // Sort: Classic (Higher is better), Precision (Lower is better)
        if (mode === 'CLASSIC') {
            scores.sort((a, b) => b.score - a.score);
        } else {
            scores.sort((a, b) => a.score - b.score);
        }

        const top5 = scores.slice(0, 5);
        localStorage.setItem(`blink_lb_${mode}`, JSON.stringify(top5));
    },
    render(mode) {
        const scores = this.get(mode);
        leaderboardList.innerHTML = '';

        if (scores.length === 0) {
            leaderboardList.innerHTML = '<li>No scores yet</li>';
            return;
        }

        scores.forEach((entry, index) => {
            const li = document.createElement('li');
            const formattedScore = mode === 'CLASSIC' ? `${entry.score.toFixed(2)}s` : `${entry.score.toFixed(3)}s off`;
            li.innerHTML = `<span>#${index + 1} ${entry.name}</span><span>${formattedScore}</span>`;
            leaderboardList.appendChild(li);
        });
    }
};

// Global Leaderboard Render
async function renderGlobalLeaderboard(mode) {
    globalLeaderboardList.innerHTML = '<li>Loading...</li>';

    const scores = await GlobalLeaderboard.getTop(mode, 10);
    globalLeaderboardList.innerHTML = '';

    if (scores.length === 0) {
        globalLeaderboardList.innerHTML = '<li>No global scores yet</li>';
        return;
    }

    scores.forEach((entry, index) => {
        const li = document.createElement('li');
        const formattedScore = mode === 'CLASSIC' ? `${entry.score.toFixed(2)}s` : `${entry.score.toFixed(3)}s off`;
        li.innerHTML = `<span>#${index + 1} ${entry.name}</span><span>${formattedScore}</span>`;
        globalLeaderboardList.appendChild(li);
    });
}

// Save Score Event
saveScoreBtn.addEventListener('click', async () => {
    const name = playerNameInput.value.trim().toUpperCase();
    if (!name) return;

    if (lastScore === null) return;

    // Save to local leaderboard
    Leaderboard.save(currentMode, lastScore, name);
    Leaderboard.render(currentMode);

    // Save to global Firebase leaderboard
    saveScoreBtn.innerText = "SAVING...";
    const saved = await GlobalLeaderboard.save(currentMode, lastScore, name);

    if (saved) {
        saveScoreBtn.innerText = "SAVED ✓";
        // Refresh global leaderboard
        await renderGlobalLeaderboard(currentMode);
    } else {
        saveScoreBtn.innerText = "SAVED (LOCAL)";
    }

    saveScoreBtn.disabled = true;
    playerNameInput.disabled = true;
});

// Share Logic
shareBtn.addEventListener('click', async () => {
    if (lastScore === null) return;

    const text = `👁️ I survived ${lastScore.toFixed(2)}s in the Void! My eyes are made of steel. \n\nCan you beat my high score? Play Blink Stop now! #BlinkStop`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Blink Stop',
                text: text,
                url: window.location.href
            });
        } catch (err) {
            console.log('Share failed:', err);
        }
    } else {
        // Fallback to clipboard
        navigator.clipboard.writeText(text).then(() => {
            const originalText = shareBtn.innerText;
            shareBtn.innerText = "COPIED!";
            setTimeout(() => shareBtn.innerText = originalText, 2000);
        });
    }
});

function startGame(mode) {
    currentMode = mode;
    loadingMsg.style.display = 'block';
    loadingMsg.innerText = 'INITIALIZING BLINK DETECTION...';

    // UI Setup based on mode
    if (mode === 'PRECISION') {
        hudLabel.innerText = "TIME";
        targetDisplay.classList.remove('hidden');
        targetDisplay.querySelector('.digital-text-sm').innerText = `${precisionTarget.toFixed(2)}s`;
    } else {
        hudLabel.innerText = "TIME";
        targetDisplay.classList.add('hidden');
    }

    startCameraLoop()
        .then(() => {
            loadingMsg.innerText = 'CAMERA READY...';
            setTimeout(() => {
                startCalibration();
            }, 500);
        })
        .catch(err => {
            console.error("Camera error:", err);
            loadingMsg.style.display = 'none';

            // User-friendly error messages
            let errorMsg = "Camera access denied.";
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMsg = "📷 Camera permission denied!\n\nPlease:\n1. Tap the 'AA' or settings icon in Safari\n2. Select 'Website Settings'\n3. Enable Camera access\n4. Refresh the page";
            } else if (err.name === 'NotFoundError') {
                errorMsg = "No camera found on this device.";
            } else if (err.name === 'NotReadableError') {
                errorMsg = "Camera is being used by another app.\n\nPlease close other apps and try again.";
            }

            alert(errorMsg);
            showMenu();
        });
}

function startCalibration() {
    gameState = 'CALIBRATING';
    calibrationData = [];
    calibrationStartTime = Date.now();

    menuScreen.classList.add('hidden');
    menuScreen.classList.remove('active');
    precisionOptions.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');

    calibrationScreen.classList.remove('hidden');
    calibrationScreen.classList.add('active');

    updateCalibrationLoop();
}

function updateCalibrationLoop() {
    if (gameState === 'CALIBRATING') {
        const elapsed = (Date.now() - calibrationStartTime) / 1000;
        const progress = Math.min((elapsed / 3) * 100, 100);
        const remaining = Math.max(3 - elapsed, 0);

        calibrationLoader.style.width = `${progress}%`;
        calibrationStatus.innerText = `${remaining.toFixed(2)}s`;

        if (elapsed >= 3) {
            finishCalibration();
        } else {
            requestAnimationFrame(updateCalibrationLoop);
        }
    }
}

function finishCalibration() {
    if (calibrationData.length > 0) {
        const sum = calibrationData.reduce((a, b) => a + b, 0);
        const avg = sum / calibrationData.length;
        const newThreshold = Math.max(0.15, Math.min(avg * 0.8, 0.35));
        setBlinkThreshold(newThreshold);
    }

    calibrationScreen.classList.add('hidden');
    calibrationScreen.classList.remove('active');

    // Start Audio Drone
    audioManager.startDrone();

    if (currentMode === 'ENDURANCE') {
        startEnduranceMode();
    } else {
        gameState = 'PLAYING';
        startTime = Date.now();

        gameHud.classList.remove('hidden');
        gameHud.classList.add('active');

        updateGameLoop();
    }
}

function startEnduranceMode() {
    gameState = 'ENDURANCE';
    startTime = Date.now();

    enduranceScreen.classList.remove('hidden');
    enduranceScreen.classList.add('active');

    adVideo.currentTime = 0;
    adVideo.play();
    uploadProgress.style.width = '0%';

    updateEnduranceLoop();
}

function updateEnduranceLoop() {
    if (gameState === 'ENDURANCE') {
        const elapsed = (Date.now() - startTime) / 1000;
        const duration = 30; // 30 seconds
        const progress = Math.min((elapsed / duration) * 100, 100);

        uploadProgress.style.width = `${progress}%`;

        if (elapsed >= duration) {
            endGame('WIN_ENDURANCE');
        } else {
            animationFrameId = requestAnimationFrame(updateEnduranceLoop);
        }
    }
}

function showMenu() {
    stopDetectionLoop(); // Stop face detection

    // Stop video stream to release camera
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }

    gameHud.classList.add('hidden');
    gameHud.classList.remove('active');

    gameOverScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');

    menuScreen.classList.remove('hidden');
    menuScreen.classList.add('active');

    // Reset state
    gameState = 'MENU'; // Keep existing gameState reset
    isPlaying = false;
    isCalibrating = false;

    // Reset UI state
    precisionOptions.classList.add('hidden');
    document.querySelector('.mode-selection').classList.remove('hidden');

    // Reset Chaos
    container.className = 'container';

    loadingMsg.style.display = 'none';
}

function onResults(results) {
    // Visual Debug: Show if face is detected
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        hudLabel.style.color = "var(--neon-cyan)"; // Cyan = Face Detected
        hudLabel.style.textShadow = "0 0 10px var(--neon-cyan)";
    } else {
        hudLabel.style.color = "#555"; // Dim = No Face
        hudLabel.style.textShadow = "none";
    }

    if (!isCalibrating && !isPlaying) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (window.faceMissingFrames > 30) { // ~1 second @ 30fps
        endGame('DISQUALIFIED');
    }
}
    }
canvasCtx.restore();
}

function updateGameLoop() {
    if (gameState === 'PLAYING') {
        const elapsed = (Date.now() - startTime) / 1000;
        scoreDisplay.innerText = `${elapsed.toFixed(2)}s`;

        // Heartbeat Audio
        const beatInterval = Math.max(0.3, 1.0 - (elapsed * 0.02));
        const now = Date.now() / 1000;
        if (!window.lastBeat || now - window.lastBeat > beatInterval) {
            audioManager.playHeartbeat();
            window.lastBeat = now;
        }

        // Chaos Visuals
        if (elapsed > 10) container.classList.add('chaos-shake');
        if (elapsed > 20) container.classList.add('chaos-glitch');
        if (elapsed > 30) container.classList.add('chaos-invert');

        animationFrameId = requestAnimationFrame(updateGameLoop);
    }
}

function endGame(reason = 'BLINK') {
    gameState = 'GAME_OVER';
    cancelAnimationFrame(animationFrameId);

    try {
        // Stop/Effect Audio
        audioManager.stopDrone();
        audioManager.playGlitch();

        // Reset Chaos
        container.className = 'container';

        const elapsed = (Date.now() - startTime) / 1000;
        let finalScoreText = '';
        let scoreToSave = 0;

        if (reason === 'WIN_ENDURANCE') {
            scoreToSave = 30;
            finalScoreText = "30.00s";
            finalScoreLabel.innerText = "EYES OF STEEL";
            gameOverTitle.innerText = "THEME UNLOCKED";
            gameOverTitle.style.color = "var(--neon-pink)";
            audioManager.playWin();

            // Unlock Theme
            document.body.classList.add('theme-purple');
            localStorage.setItem('blink_theme_purple', 'true');
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
        } else if (currentMode === 'PRECISION') {
            const diff = Math.abs(precisionTarget - elapsed);
            scoreToSave = diff;
            finalScoreText = `${diff.toFixed(3)}s`;
            finalScoreLabel.innerText = "OFF BY";

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
        }

        lastScore = scoreToSave;
        finalScoreVal.innerText = finalScoreText;

        playerNameInput.value = '';
        playerNameInput.disabled = false;
        saveScoreBtn.disabled = false;
        saveScoreBtn.innerText = "SAVE";

        Leaderboard.render(currentMode);
        renderGlobalLeaderboard(currentMode); // Load global leaderboard
    } catch (err) {
        console.error("Error in endGame:", err);
    }

    // Stop video if in endurance mode
    if (currentMode === 'ENDURANCE') {
        adVideo.pause();
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

// Check for unlocked theme on load
if (localStorage.getItem('blink_theme_purple') === 'true') {
    document.body.classList.add('theme-purple');
}
