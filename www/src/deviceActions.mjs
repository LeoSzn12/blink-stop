const loadNative = () => import('../vendor/native.js');

export async function shareNativeScore(payload, load = loadNative) {
    const { Share } = await load();
    await Share.share({ ...payload, dialogTitle: 'Share your Blink Stop score' });
}

export async function exportNativeSelfie(dataUrl, load = loadNative) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('Selfie unavailable');
    const { Filesystem, Directory, Share } = await load();
    // Reuse one private cache file: no accumulating gallery or broad storage permission.
    const file = { path: 'blink-stop-selfie.jpg', directory: Directory.Cache };
    const { uri } = await Filesystem.writeFile({ ...file, data: dataUrl.split(',')[1] });
    try {
        await Share.share({ title: 'Blink Stop selfie', files: [uri], dialogTitle: 'Save or share your selfie' });
    } catch (error) {
        await Filesystem.deleteFile(file).catch(() => {});
        throw error;
    }
    // The selected recipient may read after the share sheet closes. Keep this single
    // cache file until the next explicit export or OS/app-data cleanup.
}
