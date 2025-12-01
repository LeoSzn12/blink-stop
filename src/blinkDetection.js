// Blink Detection Logic using Eye Aspect Ratio (EAR)

// MediaPipe Face Mesh eye landmarks
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

// Blink Detection Configuration
// Threshold: lower = more sensitive (0.20-0.25 is typical range)
let blinkThreshold = 0.22; // Lowered for better detection

// Blink state tracking
let blinkFrameCount = 0;
const BLINK_FRAMES_REQUIRED = 2; // Must detect blink for 2+ consecutive frames (~66ms at 30fps)

// Allow dynamic threshold adjustment
export function setBlinkThreshold(value) {
    blinkThreshold = value;
    console.log(`Blink threshold set to: ${blinkThreshold}`);
}

export function getBlinkThreshold() {
    return blinkThreshold;
}

// Reset blink detection state
export function resetBlinkState() {
    blinkFrameCount = 0;
}

/**
 * Calculate Euclidean distance between two 3D points
 */
function getDistance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
}

/**
 * Calculate Eye Aspect Ratio (EAR)
 * EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 */
function getEAR(landmarks, indices) {
    const p1 = landmarks[indices[0]];
    const p2 = landmarks[indices[1]];
    const p3 = landmarks[indices[2]];
    const p4 = landmarks[indices[3]];
    const p5 = landmarks[indices[4]];
    const p6 = landmarks[indices[5]];

    const dist_vertical_1 = getDistance(p2, p6);
    const dist_vertical_2 = getDistance(p3, p5);
    const dist_horizontal = getDistance(p1, p4);

    return (dist_vertical_1 + dist_vertical_2) / (2.0 * dist_horizontal);
}

/**
 * Check if user is blinking with debouncing
 * Requires sustained eye closure for multiple frames to avoid false positives
 * @param {Array} landmarks - Array of 468 face landmarks
 * @returns {Object} - { blinking: boolean, ear: number }
 */
export function checkBlink(landmarks) {
    if (!landmarks || landmarks.length === 0) {
        blinkFrameCount = 0;
        return { blinking: false, ear: 0 };
    }

    const leftEAR = getEAR(landmarks, LEFT_EYE);
    const rightEAR = getEAR(landmarks, RIGHT_EYE);

    // Average EAR of both eyes
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // Check if eyes are closed
    const eyesClosed = avgEAR < blinkThreshold;

    if (eyesClosed) {
        blinkFrameCount++;
    } else {
        blinkFrameCount = 0; // Reset if eyes open
    }

    // Only register as blink if sustained for required frames
    const isBlinking = blinkFrameCount >= BLINK_FRAMES_REQUIRED;

    return {
        blinking: isBlinking,
        ear: avgEAR
    };
}
