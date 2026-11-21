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

// The line the round actually uses right now (it follows the eyes' open level a little).
export function getBlinkLine() {
    return detector.line();
}

export function getBlinkThreshold() {
    return blinkThreshold;
}

// Reset blink detection state
export function resetBlinkState() {
    detector.reset();
}

/**
 * Check if the user is blinking: two frames under the line in a row, or one frame well
 * under it (see createBlinkDetector)
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

    const isBlinking = detector.observe(minEAR);

    return {
        blinking: isBlinking,
        ear: avgEAR,
        minEar: minEAR
    };
}
