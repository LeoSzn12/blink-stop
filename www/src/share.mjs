const modes = { CLASSIC: 'Endurance', PRECISION: 'Precision', ENDURANCE: '30 Seconds', DAILY: 'Daily', SURPRISE: 'Surprise', DISTRACT: 'Distraction', BALLOON: 'Balloon Pop', FLASH: 'Flash', BEAT: 'Copy the Beat' };
const codes = { C: 'CLASSIC', P: 'PRECISION', E: 'ENDURANCE', S: 'SURPRISE', J: 'DISTRACT', B: 'BALLOON', F: 'FLASH', R: 'BEAT' };
// Modes where a smaller score wins.
export const LOWER_WINS = ['PRECISION', 'FLASH'];
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
    if (result.mode === 'FLASH') {
        if (!Number.isInteger(score) || score > 2000) throw new Error('Invalid reaction time');
        return { ...result, score, label: modes.FLASH, metric: formatScore('FLASH', score), detail: 'Fastest blink after the flash', invitation: 'Can you blink faster?' };
    }
    if (result.mode === 'BEAT') {
        if (!Number.isInteger(score) || score > 999) throw new Error('Invalid round count');
        return { ...result, score, label: modes.BEAT, metric: formatScore('BEAT', score), detail: 'Rhythms copied just by blinking', invitation: 'Can you copy more?' };
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
    const found = [...text.toUpperCase().matchAll(/\bBS1-([CPESJBFR])-(0|5|10|15)-(\d{1,8})\b/g)];
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
    const won = LOWER_WINS.includes(result.mode) ? difference < 0 : difference > 0;
    return won ? 'CHALLENGE BEATEN! Your friend is up next.' : 'FRIEND TAKES THIS ROUND. Rematch when ready?';
}

// Skins that change how the brag reads ("as a turkey"). Classic adds nothing.
const personas = { THANKSGIVING: 'as a turkey 🦃', CHRISTMAS: 'in a Santa hat 🎅', PARTY: 'in a party hat 🎉' };
const linkSkins = ['CLASSIC', 'THANKSGIVING', 'CHRISTMAS', 'PARTY'];
export function skinPersona(skinId) { return personas[skinId] || ''; }

// The link a friend taps: opens straight onto this challenge, wearing the same skin.
export function challengeUrl(result, skinId) {
    let code = null;
    try { code = challengeCode(result); } catch { code = null; }
    if (!code) return PUBLIC_PLAY_URL;
    return `${PUBLIC_PLAY_URL}#challenge=${code}${personas[skinId] ? `&skin=${skinId.toLowerCase()}` : ''}`;
}

// Reads "#challenge=BS1-C-0-14000&skin=thanksgiving". Returns null when the hash has no challenge.
export function parseChallengeLink(hash) {
    if (typeof hash !== 'string' || !hash.startsWith('#challenge=')) return null;
    const parts = hash.slice(1).split('&');
    let code = '', skin = null;
    for (const part of parts) {
        const [key, value = ''] = part.split('=');
        let decoded = value;
        try { decoded = decodeURIComponent(value); } catch { decoded = value; }
        if (key === 'challenge') code = decoded;
        if (key === 'skin' && linkSkins.includes(decoded.toUpperCase())) skin = decoded.toUpperCase();
    }
    return { code, skin, challenge: parseChallenge(code) };
}

// What the person opening the link sees: the number to beat, in one line.
export function challengeHeadline(challenge, skinId) {
    const persona = skinPersona(skinId);
    const as = persona ? ` ${persona}` : '';
    if (challenge.mode === 'PRECISION') return { title: `Beat ${challenge.score.toFixed(3)}s off ${challenge.target}s`, line: `Your friend blinked ${challenge.score.toFixed(3)}s off the ${challenge.target}-second mark${as}. Your turn.` };
    if (challenge.mode === 'FLASH') return { title: `Blink faster than ${challenge.score} ms`, line: `Your friend blinked ${challenge.score} ms after the flash${as}. Your turn.` };
    if (challenge.mode === 'BEAT') return { title: `Copy more than ${formatScore('BEAT', challenge.score)}`, line: `Your friend copied ${formatScore('BEAT', challenge.score)} of rhythm just by blinking${as}. Your turn.` };
    if (challenge.mode === 'BALLOON') return { title: `Pop more than ${challenge.score}`, line: `Your friend popped ${formatScore('BALLOON', challenge.score).replace(' popped', '')} just by blinking${as}. Your turn.` };
    return { title: `Beat ${formatScore(challenge.mode, challenge.score)}`, line: `Your friend kept their eyes open for ${formatScore(challenge.mode, challenge.score)} in ${modes[challenge.mode]}${as}. Your turn.` };
}

export function sharePayload(result, skinId) {
    const r = resultDetails(result), code = challengeCode(r);
    const url = challengeUrl(r, skinId);
    return { title: 'Blink Stop', url, text: `${inviteLine(r, skinId)}\n👁️ Blink Stop · ${r.label}: ${r.metric}. ${r.mode === 'PRECISION' ? r.detail + '. ' : ''}${r.invitation}\n${code ? `Challenge code: ${code}\nTap the link to take the challenge. Or paste this code under Got a challenge?\n` : 'Try the Daily modifier on your device.\n'}${url}\n#BlinkStop` };
}

export function shareClipboardText(result) { return sharePayload(result).text; }

// How a score reads everywhere: seconds, seconds off target, or balloons.
export function formatScore(mode, score) {
    if (mode === 'BALLOON') return `${score} balloon${score === 1 ? '' : 's'} popped`;
    if (mode === 'FLASH') return `${Math.round(score)} ms`;
    if (mode === 'BEAT') return `${score} round${score === 1 ? '' : 's'}`;
    if (mode === 'PRECISION') return `${score.toFixed(3)}s off`;
    return `${score.toFixed(2)}s`;
}

// One friendly line that travels with a shared photo, ahead of the play link.
export function inviteLine(result, skinId) {
    try {
        const r = resultDetails(result);
        const persona = skinPersona(skinId);
        if (r.mode === 'BALLOON') return `I popped ${r.metric.replace(' popped', '')} just by blinking${persona ? `, ${persona}` : ' 🎈'} Can you beat me?`;
        if (r.mode === 'FLASH') return `I blinked ${r.metric} after the flash ${persona || '⚡'} Can you beat me?`;
        if (r.mode === 'BEAT') return `I copied ${r.metric} of rhythm just by blinking ${persona || '🎵'} Can you beat me?`;
        if (r.mode === 'PRECISION') return `I blinked ${r.metric} the ${r.target}-second mark ${persona || '🎯'} Can you get closer?`;
        return `I kept my eyes open for ${r.metric} ${persona || '👀'} Can you beat me?`;
    } catch {
        return 'Think you can beat me? 👀';
    }
}
