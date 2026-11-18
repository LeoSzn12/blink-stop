const modes = { CLASSIC: 'Endurance', PRECISION: 'Precision', ENDURANCE: '30 Seconds', DAILY: 'Daily', SURPRISE: 'Surprise', DISTRACT: 'Distraction', BALLOON: 'Balloon Pop' };
const codes = { C: 'CLASSIC', P: 'PRECISION', E: 'ENDURANCE', S: 'SURPRISE', J: 'DISTRACT', B: 'BALLOON' };
export const PUBLIC_PLAY_URL = 'https://www.playblinkstop.com/';

export function resultDetails(result) {
    if (typeof result === 'number') result = { mode: 'CLASSIC', score: result, elapsed: result };
    if (!result || !modes[result.mode] || !Number.isFinite(result.score) || result.score < 0 || result.score > 86400) throw new Error('Invalid result');
    const precision = result.mode === 'PRECISION';
    if (precision && ![5, 10, 15].includes(result.target)) throw new Error('Invalid target');
    if (precision && !Number.isFinite(result.elapsed)) throw new Error('Invalid elapsed time');
    const score = Math.round(result.score * 1000) / 1000;
    if (['ENDURANCE', 'SURPRISE'].includes(result.mode) && score > 30) throw new Error('Invalid survival result');
    if (result.mode === 'BALLOON') {
        if (!Number.isInteger(score) || score > 9999) throw new Error('Invalid balloon count');
        return { ...result, score, label: modes.BALLOON, metric: formatScore('BALLOON', score), detail: 'Popped just by blinking', invitation: 'Can you pop more?' };
    }
    return { ...result, score, label: modes[result.mode],
        metric: formatScore(result.mode, score),
        detail: precision ? `Target ${result.target}s · blinked at ${result.elapsed.toFixed(2)}s` : 'Without blinking',
        invitation: precision ? `Can you get closer to ${result.target}s?` : score >= 30 && ['ENDURANCE', 'SURPRISE'].includes(result.mode) ? 'Can you make it to 30 seconds too?' : 'Can you beat my time?' };
}

// Reported friend results, not authenticated records. No names, images or tracking.
export function challengeCode(result) {
    const r = resultDetails(result);
    const key = Object.keys(codes).find(key => codes[key] === r.mode);
    if (!key) return null; // Daily modifiers depend on local date; no cross-device comparison.
    return `BS1-${key}-${r.mode === 'PRECISION' ? r.target : 0}-${Math.round(r.score * 1000)}`;
}

export function parseChallenge(text) {
    if (typeof text !== 'string' || text.length > 1000) throw new Error('Paste a Blink Stop challenge code.');
    const found = [...text.toUpperCase().matchAll(/\bBS1-([CPESJB])-(0|5|10|15)-(\d{1,8})\b/g)];
    const matches = [...new Map(found.map(match => [match[0], match])).values()];
    if (matches.length !== 1) throw new Error('Paste one valid Blink Stop challenge code.');
    const [, key, target, value] = matches[0];
    const mode = codes[key], score = Number(value) / 1000;
    if ((mode === 'PRECISION') !== (Number(target) !== 0)) throw new Error('Invalid challenge target.');
    const r = resultDetails({ mode, score, target: Number(target), elapsed: Number(target) + score });
    return { mode: r.mode, score: r.score, target: r.target };
}

export function challengeOutcome(result, challenge) {
    if (!challenge || result.mode !== challenge.mode || (result.mode === 'PRECISION' && result.target !== challenge.target)) return '';
    const difference = Math.round(result.score * 1000) - Math.round(challenge.score * 1000);
    if (difference === 0) return 'TIE! Rematch?';
    const won = result.mode === 'PRECISION' ? difference < 0 : difference > 0;
    return won ? 'CHALLENGE BEATEN! Your friend is up next.' : 'FRIEND TAKES THIS ROUND. Rematch when ready?';
}

export function sharePayload(result) {
    const r = resultDetails(result), code = challengeCode(r);
    const url = code ? `${PUBLIC_PLAY_URL}#challenge=${code}` : PUBLIC_PLAY_URL;
    return { title: 'Blink Stop', url, text: `👁️ Blink Stop · ${r.label}: ${r.metric}. ${r.mode === 'PRECISION' ? r.detail + '. ' : ''}${r.invitation}\n${code ? `Challenge code: ${code}\nTap the link, then Accept challenge. Or paste this code under Got a challenge?\n` : 'Try the Daily modifier on your device.\n'}${url}\n#BlinkStop` };
}

export function shareClipboardText(result) { return sharePayload(result).text; }

// How a score reads everywhere: seconds, seconds off target, or balloons.
export function formatScore(mode, score) {
    if (mode === 'BALLOON') return `${score} balloon${score === 1 ? '' : 's'} popped`;
    if (mode === 'PRECISION') return `${score.toFixed(3)}s off`;
    return `${score.toFixed(2)}s`;
}

// One friendly line that travels with a shared photo, ahead of the play link.
export function inviteLine(result) {
    try {
        const r = resultDetails(result);
        if (r.mode === 'BALLOON') return `I popped ${r.metric.replace(' popped', '')} just by blinking 🎈 Can you beat me?`;
        if (r.mode === 'PRECISION') return `I blinked ${r.metric} the ${r.target}-second mark 🎯 Can you get closer?`;
        return `I kept my eyes open for ${r.metric} 👀 Can you beat me?`;
    } catch {
        return 'Think you can beat me? 👀';
    }
}
