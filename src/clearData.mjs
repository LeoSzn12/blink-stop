import { clearStoredGameData } from './localData.mjs';

const button = document.getElementById('clear-local-data');
const status = document.getElementById('clear-status');
button.addEventListener('click', async () => {
    if (!confirm('Delete your Blink Stop scores and theme preference on this installation? This cannot be undone. Copies saved in other apps are not deleted.')) return;
    button.disabled = true;
    try {
        clearStoredGameData(localStorage);
        document.body.classList.remove('theme-purple');
        status.textContent = 'Local scores and theme preference cleared.';
        if (window.Capacitor?.isNativePlatform?.()) {
            const { Filesystem, Directory } = await import('../vendor/native.js');
            try {
                await Filesystem.deleteFile({ path: 'blink-stop-selfie.jpg', directory: Directory.Cache });
            } catch (error) {
                // Absence is normal; let users know cache removal is not guaranteed.
                status.textContent += ' To remove any remaining cached export, clear the app data in device settings.';
            }
        }
    } catch (error) {
        status.textContent = 'Could not clear all local data. Clear this site or app data in your device settings.';
    } finally {
        button.disabled = false;
    }
});
