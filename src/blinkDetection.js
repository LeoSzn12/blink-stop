// Blink Detection Logic using Eye Aspect Ratio (EAR)
import { createBlinkDetector, measureEyeOpenness } from './gameRules.mjs';

// The initial threshold is replaced by each player's open-eye calibration.
let blinkThreshold = 0.22;

// Blink state tracking
const detector = createBlinkDetector(blinkThreshold);

// Allow dynamic threshold adjustment
export function setBlinkThreshold(value) {
    blinkThreshold = value;
    detector.setThreshold(value);
    console.log(`Blink threshold set to: ${blinkThreshold}`);
}

export function getBlinkThreshold() {
    return blinkThreshold;
}

// Reset blink detection state
export function resetBlinkState() {
    detector.reset();
}

/**
 * Check if user is blinking with debouncing
 * Requires sustained eye closure for multiple frames to avoid false positives
 * @param {Array} landmarks - Array of 468 face landmarks
 * @returns {Object} - { blinking: boolean, ear: number }
 */
export function checkBlink(landmarks, now = performance.now(), width = 1, height = 1) {
    const measurement = measureEyeOpenness(landmarks, width, height);
    if (!measurement) {
        detector.reset();
        return { blinking: false, ear: 0, minEar: 0 };
    }

    const { ear: avgEAR, minEar: minEAR } = measurement;

    const isBlinking = detector.observe(minEAR, now);

    return {
        blinking: isBlinking,
        ear: avgEAR,
        minEar: minEAR
    };
}
