const modes = { CLASSIC: 'Classic', PRECISION: 'Precision', ENDURANCE: 'Endurance', DAILY: 'Daily', SURPRISE: 'Surprise' };
const codes = { C: 'CLASSIC', P: 'PRECISION', E: 'ENDURANCE', S: 'SURPRISE' };

export function resultDetails(result) {
    if (typeof result === 'number') result = { mode: 'CLASSIC', score: result, elapsed: result };
    if (!result || !modes[result.mode] || !Number.isFinite(result.score) || result.score < 0 || result.score > 86400) throw new Error('Invalid result');
    const precision = result.mode === 'PRECISION';
    if (precision && ![5, 10, 15].includes(result.target)) throw new Error('Invalid target');
    if (precision && !Number.isFinite(result.elapsed)) throw new Error('Invalid elapsed time');
    const score = Math.round(result.score * 1000) / 1000;
    if (['ENDURANCE', 'SURPRISE'].includes(result.mode) && score > 30) throw new Error('Invalid survival result');
    return { ...result, score, label: modes[result.mode],
        metric: precision ? `${score.toFixed(3)}s off` : `${score.toFixed(2)}s`,
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
    const matches = [...text.toUpperCase().matchAll(/\bBS1-([CPES])-(0|5|10|15)-(\d{1,8})\b/g)];
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
    return { title: 'Blink Stop', text: `👁️ Blink Stop · ${r.label}: ${r.metric}. ${r.mode === 'PRECISION' ? r.detail + '. ' : ''}${r.invitation}\n${code ? `Challenge code: ${code}\nOpen Blink Stop → Got a challenge? → paste this code.\n` : 'Try the Daily modifier on your device.\n'}#BlinkStop` };
    // Add a verified public play URL only after the matching candidate is launched.
}

export function shareClipboardText(result) { return sharePayload(result).text; }
