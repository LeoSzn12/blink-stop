// Party tournament, loser forfeits and distraction jokes. Pure logic and content;
// nothing here is stored or sent anywhere. Names live only in memory for the party.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_NAME = 12;

// One name per line or comma. Trimmed, de-duplicated, capped at eight players.
export function parseNames(text) {
    if (typeof text !== 'string') return [];
    const seen = new Set(), names = [];
    for (const raw of text.split(/[\n,]+/)) {
        const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
        if (names.length === MAX_PLAYERS) break;
    }
    return names;
}

// Everyone takes a solo turn; the top two meet in a head-to-head final.
export function createParty(names) {
    if (!Array.isArray(names) || names.length < MIN_PLAYERS) throw new Error(`Add at least ${MIN_PLAYERS} players.`);
    if (names.length > MAX_PLAYERS) throw new Error(`Up to ${MAX_PLAYERS} players.`);
    const turns = names.map((name, order) => ({ name, order, score: null }));
    let index = 0, champion = null, final = null;
    const standings = () => turns.filter(t => t.score !== null)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map(({ name, score }) => ({ name, score }));
    return {
        players: [...names],
        current: () => (index < turns.length ? turns[index].name : null),
        turnNumber: () => Math.min(index + 1, turns.length),
        record(score) {
            if (index >= turns.length) throw new Error('All turns are done.');
            turns[index].score = Number.isFinite(score) && score > 0 ? Math.round(score * 100) / 100 : 0;
            index++;
        },
        turnsDone: () => index >= turns.length,
        standings,
        finalists() {
            const top = standings();
            return top.length >= 2 ? [top[0].name, top[1].name] : null;
        },
        // Winner of the final is champion; a tie or lost face can be replayed or skipped.
        recordFinal(winnerName) {
            final = winnerName || null;
            if (winnerName) champion = winnerName;
            return champion;
        },
        skipFinal() { champion = standings()[0]?.name ?? null; return champion; },
        champion: () => champion,
        finalPlayed: () => final !== null,
        lastPlace: () => standings().at(-1)?.name ?? null,
    };
}

// Shuffled deck that never repeats until every card has been seen.
export function createDeck(cards, random = Math.random) {
    let pile = [];
    let last = null;
    return {
        next() {
            if (!pile.length) {
                pile = [...cards];
                for (let i = pile.length - 1; i > 0; i--) {
                    const j = Math.floor(random() * (i + 1));
                    [pile[i], pile[j]] = [pile[j], pile[i]];
                }
                if (pile.length > 1 && pile.at(-1) === last) pile.unshift(pile.pop());
            }
            last = pile.pop();
            return last;
        },
    };
}

// Kind, quick dares that work at a table, a party or in a line. No food or drink dares.
const DARES = {
    ANY: [
        'Do your best slow-motion replay of that blink.',
        'Give every player a sincere compliment.',
        'Talk like a pirate until the next round.',
        'Do your best impression of the winner.',
        'Strike a dramatic pose for 5 seconds.',
        'Sing the chorus of a song the winner picks.',
        'Tell your best joke. Groans count.',
        'Narrate the next round like a sports announcer.',
        'Do a victory dance for the winner.',
        'Speak only in questions until the next round.',
    ],
    THANKSGIVING: [
        'Do your best turkey gobble.',
        'Say what you are thankful for in a robot voice.',
        'Name three Thanksgiving foods in your best movie-trailer voice.',
        'Waddle like a turkey to the nearest wall and back.',
    ],
    CHRISTMAS: [
        'Sing one line of a holiday song.',
        'Do your best reindeer impression.',
        'Give a 10-second speech as Santa.',
        'Jingle like a bell until someone laughs.',
    ],
    PARTY: [
        'Dance for 10 seconds, no music needed.',
        'Lead the group in a cheer for the winner.',
        'Do your best theme-park character voice.',
        'Give the winner a royal bow.',
    ],
};
export function forfeitCards(skinId = 'CLASSIC') {
    return [...(DARES[skinId] || []), ...DARES.ANY];
}

// Distraction round: puns and prompts shown while you try not to blink.
const JOKES = {
    ANY: [
        'Why did the scarecrow win an award? He was outstanding in his field.',
        'I only know 25 letters of the alphabet. I don\'t know y.',
        'What do you call a fake noodle? An impasta.',
        'Why don\'t eggs tell jokes? They\'d crack each other up.',
        'What do you call a sleeping dinosaur? A dino-snore.',
        'Why did the bicycle fall over? It was two tired.',
        'What has hands but can\'t clap? A clock.',
        'Don\'t think about blinking. Don\'t think about it at all.',
        'Your eyes feel a little dry, don\'t they?',
        'Someone behind you is making a funny face.',
        'How do you make a tissue dance? Put a little boogie in it.',
        'What do you call cheese that isn\'t yours? Nacho cheese.',
        'Why can\'t you trust stairs? They\'re always up to something.',
        'Wink. Wink. Just kidding, don\'t.',
    ],
    THANKSGIVING: [
        'Why did the turkey join the band? It had the drumsticks.',
        'What sound does a turkey\'s phone make? Wing wing.',
        'Why did the cranberries turn red? They saw the turkey dressing.',
        'What did the turkey say to the computer? Google google google.',
    ],
    CHRISTMAS: [
        'What do snowmen eat for breakfast? Frosted flakes.',
        'Why is Santa so good at karate? He has a black belt.',
        'What do elves learn in school? The elf-abet.',
        'What do you call a broke Santa? Saint Nickel-less.',
    ],
    PARTY: [
        'Why did the balloon go to the party? It was invited to pop in.',
        'What do you call a line that never moves? A very patient line.',
        'Why don\'t skeletons ride roller coasters? No guts.',
        'Why did the ghost skip the party? It had no body to go with.',
    ],
};
export function jokeCards(skinId = 'CLASSIC') {
    return [...(JOKES[skinId] || []), ...JOKES.ANY];
}
