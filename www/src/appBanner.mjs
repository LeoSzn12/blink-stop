// "Get the iPhone app" strip for web visitors on an iPhone or iPad.
// iPhone Safari already shows Apple's own Smart App Banner (the apple-itunes-app meta tag in
// index.html), so this strip only appears where that one can't: Chrome, Firefox, Edge and
// in-app browsers on iOS, and the home-screen web app. Never inside the Blink Stop app itself.

export const APP_STORE_URL = 'https://apps.apple.com/app/blink-stop/id6822026817';
export const APP_BANNER_KEY = 'blink_app_banner_dismissed';

export function isAppleTouchDevice({ userAgent = '', maxTouchPoints = 0 } = {}) {
    if (/iPhone|iPad|iPod/.test(userAgent)) return true;
    // iPadOS asks for desktop pages by default and calls itself a Mac; only the iPad has touch.
    return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

// Plain Safari on iOS: Apple's Smart App Banner covers it. Every other iOS browser and
// in-app browser adds its own token (CriOS, FxiOS, EdgiOS, GSA, Instagram, FBAN, …).
export function isPlainIosSafari(userAgent = '') {
    return /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|YaBrowser|Brave|Instagram|FBAN|FBAV|Twitter|Snapchat|TikTok|musical_ly|Line\/|LinkedInApp|Pinterest/.test(userAgent);
}

export function shouldShowAppBanner({ userAgent = '', maxTouchPoints = 0, standalone = false, isNative = false, dismissed = false } = {}) {
    if (isNative || dismissed) return false;
    if (!isAppleTouchDevice({ userAgent, maxTouchPoints })) return false;
    // The home-screen web app looks like Safari but gets no Smart App Banner.
    return standalone || !isPlainIosSafari(userAgent);
}

export function setupAppBanner(doc, win) {
    const banner = doc.getElementById('app-banner');
    if (!banner) return false;
    let dismissed = false;
    try { dismissed = win.localStorage.getItem(APP_BANNER_KEY) === '1'; } catch { /* storage unavailable */ }
    const show = shouldShowAppBanner({
        userAgent: win.navigator?.userAgent || '',
        maxTouchPoints: win.navigator?.maxTouchPoints || 0,
        standalone: win.navigator?.standalone === true || !!win.matchMedia?.('(display-mode: standalone)')?.matches,
        isNative: !!win.Capacitor?.isNativePlatform?.(),
        dismissed,
    });
    banner.classList.toggle('hidden', !show);
    doc.getElementById('app-banner-close')?.addEventListener('click', () => {
        banner.classList.add('hidden');
        try { win.localStorage.setItem(APP_BANNER_KEY, '1'); } catch { /* storage unavailable */ }
    });
    return show;
}
