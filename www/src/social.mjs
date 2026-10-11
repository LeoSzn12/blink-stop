import { parseChallenge, challengeCode, challengeOutcome, sharePayload } from './share.mjs';
import { drawScoreCard } from './scoreCard.mjs';
import { exportNativeCard } from './deviceActions.mjs';

export function createSocialUI(startChallenge) {
    const el = id => document.getElementById(id);
    const panel = el('social-result'), card = el('score-card'), status = el('social-status');
    let result = null, cardUrl = '', cardFile = null, busy = false;
    // URL fragments stay out of the HTTP request. Never request a camera on arrival.
    function prepareLinkedChallenge() {
      if (window.location.hash.startsWith('#challenge=')) {
        try {
            const code = decodeURIComponent(window.location.hash.slice(11));
            const challenge = parseChallenge(code);
            el('challenge-input').value = code;
            document.querySelector('.challenge-entry').open = true;
            el('challenge-status').textContent = `${challenge.mode} friend challenge ready. Tap Accept challenge to play. Camera is off until then.`;
        } catch (error) { el('challenge-status').textContent = 'Invalid challenge link. Ask your friend for a new code.'; }
      }
    }
    prepareLinkedChallenge();
    window.addEventListener('hashchange', prepareLinkedChallenge);
    el('challenge-form').addEventListener('submit', event => {
        event.preventDefault();
        try {
            const challenge = parseChallenge(el('challenge-input').value.trim());
            el('challenge-status').textContent = '';
            startChallenge(challenge);
        } catch (error) { el('challenge-status').textContent = error.message; }
    });
    el('friend-turn-btn').addEventListener('click', () => {
        if (!result || busy) return;
        startChallenge(parseChallenge(challengeCode(result)));
    });
    el('share-card-btn').addEventListener('click', async () => {
        if (!result || busy) return;
        busy = true; el('share-card-btn').disabled = true;
        const payload = sharePayload(result), url = cardUrl, file = cardFile;
        try {
            if (window.Capacitor?.isNativePlatform?.()) await exportNativeCard(url, payload);
            else if (file && navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ ...payload, files: [file] });
            else { status.textContent = 'Use Save Card, then attach the image in your social app.'; return; }
            status.textContent = 'Share sheet closed. Your chosen app controls posting.';
        } catch (error) {
            status.textContent = error.name === 'AbortError' ? 'Sharing cancelled. Your card is still here.' : 'Sharing unavailable. Try Save Card and attach it yourself.';
        } finally { busy = false; el('share-card-btn').disabled = false; }
    });
    el('save-card-btn').addEventListener('click', async () => {
        if (!result || busy) return;
        if (window.Capacitor?.isNativePlatform?.()) { el('share-card-btn').click(); return; }
        const a = document.createElement('a'); a.href = cardUrl; a.download = 'blink-stop-challenge.png'; a.click();
        status.textContent = 'Download requested. Attach the card in your social app.';
    });
    return {
        reset() { result = null; cardUrl = ''; cardFile = null; panel.classList.add('hidden'); card.removeAttribute('src'); el('challenge-caption').value = ''; status.textContent = ''; },
        render(value, challenge) {
            this.reset();
            if (!value) return;
            result = value;
            cardUrl = drawScoreCard(document.createElement('canvas'), result);
            // Prepare bytes before the tap to preserve browser share activation.
            const bytes = Uint8Array.from(atob(cardUrl.split(',')[1]), c => c.charCodeAt(0));
            cardFile = typeof File === 'function' ? new File([bytes], 'blink-stop-challenge.png', { type: 'image/png' }) : null;
            card.src = cardUrl;
            el('challenge-caption').value = sharePayload(result).text;
            el('friend-turn-btn').disabled = !challengeCode(result);
            el('challenge-outcome').textContent = challengeOutcome(result, challenge);
            panel.classList.remove('hidden');
        }
    };
}
