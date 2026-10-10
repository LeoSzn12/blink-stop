export function cameraErrorMessage(error) {
    switch (error?.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return 'Camera permission is off. Enable it in your device or site settings, then try again.';
        case 'NotFoundError':
            return 'No camera found. Connect or enable a front-facing camera, then try again.';
        case 'NotReadableError':
            return 'Camera is in use by another app. Close the other app and try again.';
        default:
            return 'Could not start the camera. Check permissions and try again.';
    }
}
