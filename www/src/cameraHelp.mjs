export function cameraErrorMessage(error) {
    switch (error?.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return 'Camera permission is off. Enable it in your device or site settings, then try again.';
        case 'NotFoundError':
            return 'No camera found. Connect or enable a front-facing camera, then try again.';
        case 'NotReadableError':
            return 'Camera is in use by another app. Close the other app and try again.';
        case 'NoGraphicsError':
            return NO_GRAPHICS_MESSAGE;
        default:
            return 'Could not start the camera. Check permissions and try again.';
    }
}

// The eye tracker draws each camera frame with WebGL. Without it, MediaPipe shows a raw
// browser alert on every frame, so check first and explain it in plain words instead.
export const NO_GRAPHICS_MESSAGE = "This browser has its graphics turned off, so it can't track your eyes. Try Safari or Chrome, or turn on hardware acceleration.";
export function graphicsAvailable(doc = globalThis.document) {
    try {
        const canvas = doc.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}
export function noGraphicsError() {
    const error = new Error(NO_GRAPHICS_MESSAGE);
    error.name = 'NoGraphicsError';
    return error;
}
