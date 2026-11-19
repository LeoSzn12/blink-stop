import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

import { createCalibrationTracker, createTrackingFreshness, createFaceLossTracker } from '../src/gameRules.mjs';
import { createSerializedInference } from '../src/inference.mjs';
import { createSurpriseRound, createRewardedDemo } from '../src/surprise.mjs';
import * as skins from '../src/skins.mjs';
import * as versus from '../src/versus.mjs';
import * as party from '../src/party.mjs';
import * as reel from '../src/reel.mjs';
import * as balloons from '../src/balloons.mjs';
import { formatScore, inviteLine, challengeUrl, challengeHeadline, PUBLIC_PLAY_URL } from '../src/share.mjs';
import * as clipModule from '../src/clip.mjs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
function harness(storage = { getItem: () => null, setItem() {} }, clipboard, { win = {}, extra = {} } = {}) {
  const els = new Map(), raf = new Map(), timers = new Map(), intervals = new Map(), listeners = new Map();
  let clock = 0, id = 0, lastDelivered, jpegCount = 0, eyeValue = .3, threshold = .22, blinking = false;
  const pending = [], tracks = [], meshes = [], documentEvents = new Map();
  let permission;
  function stream() {
    const track = { stops: 0, listeners: new Map(), stop() { this.stops++; }, addEventListener(type, fn) { this.listeners.set(type, fn); }, end() { this.listeners.get('ended')?.(); } };
    tracks.push(track);
    return { getTracks: () => [track] };
  }
  function el(key) {
    if (!els.has(key)) {
      const classes = new Set();
      els.set(key, { style: {}, dataset: {}, value: '', innerText: '', textContent: '', src: '', readyState: 1, paused: false, ended: false, videoWidth: 640, videoHeight: 480,
        classList: { add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); }, contains(x) { return classes.has(x); }, toggle(x, force = !classes.has(x)) { if (force) classes.add(x); else classes.delete(x); return force; } },
        addEventListener(type, fn) { listeners.set(`${key}:${type}`, fn); }, appendChild() {}, append() {}, setAttribute() {}, remove() {}, captureStream: () => ({ getTracks: () => [{ stop() {} }] }), removeAttribute(name) { if (name === 'src') this.src = ''; }, focus() {}, querySelector: () => el('digital-text-sm'), getContext: () => canvas,
        play: async () => {}, getTracks: () => [{ stop() {} }], toDataURL: () => { jpegCount++; return 'data:image/jpeg;base64,abc'; },
      });
    }
    return els.get(key);
  }
  // Any 2D context call is a no-op that returns the context (gradients included).
  const canvas = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => canvas, set: (target, key, value) => { target[key] = value; return true; } });
  const document = { hidden: false, body: el('body'), getElementsByClassName: cls => [el(cls)], getElementById: el,
    querySelector: el, querySelectorAll: () => [], addEventListener(type, fn) { documentEvents.set(type, fn); }, createElement: el };
  class FaceMesh { constructor() { this.closes = 0; meshes.push(this); } onResults(fn) { this.resultHandler = fn; } setOptions() {} send() { return new Promise(resolve => { const emit = () => this.resultHandler({ image: {}, multiFaceLandmarks: [{}] }); pending.push(() => { lastDelivered = emit; emit(); resolve(); }); }); } close() { this.closes++; } }
  const context = { document, window: { innerWidth: 500, addEventListener() {}, ...win }, navigator: { clipboard, mediaDevices: { getUserMedia: () => permission || Promise.resolve(stream()) } },
    FaceMesh, console: { log() {}, warn: (...a) => process.env.HARNESS_LOG && process.stderr.write(a.join(' ') + '\n'), error() {} }, performance: { now: () => clock }, Date,
    createCalibrationTracker, createTrackingFreshness, createFaceLossTracker, createSerializedInference, createSurpriseRound, createRewardedDemo, ...skins, ...versus, ...party, ...reel, ...balloons, ...clipModule, formatScore, inviteLine, challengeUrl, challengeHeadline, PUBLIC_PLAY_URL,
    checkBlink: () => eyeValue === null ? null : ({ minEar: eyeValue, ear: eyeValue, blinking }), setBlinkThreshold(value) { threshold = value; }, resetBlinkState() {}, getBlinkThreshold: () => threshold,
    audioManager: { startDrone() {}, stopDrone() {}, playGlitch() {}, playWin() {}, playHeartbeat() {}, playSurprise() {} },
    appendScore() {}, cameraErrorMessage: () => '', createGameOverCameraStop: fn => ({ cancel() {}, schedule() {} }), sharePayload() {}, shareClipboardText() {}, createSocialUI: () => ({ reset() {}, render() {} }),
    localStorage: storage,
    setInterval: fn => { const n = ++id; intervals.set(n, fn); return n; }, clearInterval: n => intervals.delete(n), setTimeout: fn => { const n = ++id; timers.set(n, fn); return n; }, clearTimeout: n => timers.delete(n),
    Image: class { set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } },
    requestAnimationFrame: fn => { const n = ++id; raf.set(n, fn); return n; }, cancelAnimationFrame: n => raf.delete(n), confirm: () => true, ...extra };
  vm.runInNewContext(source + '\n globalThis.debug = { startGame, showMenu, startCalibration, endGame, startDemoAd, finishDemoAd, updateDemoAd, calibration, inference, Leaderboard, getState: () => gameState };', context);
  return { debug: context.debug, el, setEye: value => { eyeValue = value; }, setBlinking: value => { blinking = value; }, threshold: () => threshold, click: key => listeners.get(`${key}:click`)(), jpegCount: () => jpegCount, tracks, meshes, document, visibility: () => documentEvents.get('visibilitychange')(), deferPermission() { let resolve; permission = new Promise(r => { resolve = r; }); return () => resolve(stream()); }, setClock: n => { clock = n; }, deliver: () => pending.shift()(), lateCallback: () => lastDelivered(), pendingSend: () => pending.length, tickInference() { for (const fn of intervals.values()) fn(); }, async settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }, async timers() { for (const [n,fn] of [...timers]) { timers.delete(n); fn(); } await this.settle(); }, raf() { for (const [n,fn] of [...raf]) { raf.delete(n); fn(); } }, pendingRaf: () => raf.size };
}

test('slow iPhone calibration keeps progress past three seconds and fits the eye baseline', async () => {
  const h = harness();
  h.setEye(.16);
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  for(let i=0;i<10;i++) {
    h.setClock(i*400); h.tickInference(); h.deliver(); await h.settle(); h.raf();
  }
  assert.equal(h.debug.getState(),'PLAYING');
  assert.ok(h.threshold() < .16, 'blink threshold must stay below open-eye baseline');
});

test('missing face gives guidance, times out, and releases the camera instead of looping forever', async () => {
  const h = harness();
  h.setEye(null);
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.setClock(5000); h.tickInference(); h.deliver(); await h.settle(); h.raf();
  assert.match(h.el('calibration-status').innerText,/FACE NOT FOUND.*LIGHT/);
  h.setClock(15000); h.tickInference(); h.deliver(); await h.settle(); h.raf();
  assert.equal(h.debug.getState(),'MENU');
  assert.equal(h.tracks[0].stops,1);
  assert.equal(h.pendingRaf(),0);
  assert.match(h.el('camera-error').textContent,/light.*eye level/i);
  assert.equal(h.el('camera-problem').classList.contains('hidden'),false,'the problem shows at the top of home');
  assert.equal(h.el('camera-retry-btn').classList.contains('hidden'),false,'Try again is offered');
  assert.equal(h.el('restart-camera-btn').classList.contains('hidden'),true);
  h.click('camera-retry-btn'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(),'CALIBRATING','Try again starts the same mode');
  assert.equal(h.el('camera-problem').classList.contains('hidden'),true,'the old message clears');
});

test('a slow eye-tracking download does not eat the calibration time', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.setClock(15000); h.raf();
  assert.equal(h.debug.getState(),'CALIBRATING','no frames yet: still loading, not a failure');
  assert.match(h.el('calibration-status').innerText,/LOADING EYE TRACKING/);
  assert.match(h.el('calibration-hint').innerText,/slow connection/i);
  // The first frame arrives late; the player still gets their full time from there.
  h.setClock(30000); h.tickInference(); h.deliver(); await h.settle(); h.raf();
  assert.equal(h.debug.getState(),'CALIBRATING');
  for (let i = 1; i < 12 && h.debug.getState() === 'CALIBRATING'; i++) {
    h.setClock(30000 + i * 400); h.tickInference(); h.deliver(); await h.settle(); h.raf();
  }
  assert.equal(h.debug.getState(),'PLAYING');
});

test('stalled inference exits calibration with a camera restart action; cancel also releases the camera', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.setClock(60000); h.raf();
  assert.equal(h.debug.getState(),'MENU');
  assert.match(h.el('camera-error').textContent,/restart.*camera/i);
  assert.equal(h.el('restart-camera-btn').classList.contains('hidden'),false);
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  assert.equal(h.el('restart-camera-btn').classList.contains('hidden'),true);
  h.click('calibration-cancel-btn');
  assert.equal(h.debug.getState(),'MENU');
  assert.equal(h.tracks[1].stops,1);
});
test('privacy copy names the persisted theme preference and calibration guidance avoids intentional blinking', () => {
  const privacy = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  const howTo = readFileSync(new URL('../how-to-play.html', import.meta.url), 'utf8');
  assert.match(privacy, /theme preference/i);
  assert.doesNotMatch(howTo, /blink right before calibration ends/i);
});
test('blocked theme preference write does not suppress round result', () => {
  const h = harness({ getItem: () => null, setItem() { throw new Error('blocked'); } });
  h.debug.endGame('WIN_ENDURANCE');
  assert.equal(h.el('final-score-val').innerText, '30.00s');
  assert.equal(h.el('game-over-screen').classList.contains('active'), true);
});
test('Daily and Endurance rank longest survival first; Precision ranks smallest error first', () => {
  for (const mode of ['CLASSIC', 'DAILY', 'ENDURANCE', 'PRECISION']) {
    let saved;
    const h = harness({ getItem: () => JSON.stringify([{ name: 'A', score: 10 }, { name: 'B', score: 20 }]),
      setItem(key, value) { saved = JSON.parse(value); } });
    h.debug.Leaderboard.save(mode, 15, 'C');
    assert.deepEqual(saved.map(entry => entry.score), mode === 'PRECISION' ? [10, 15, 20] : [20, 15, 10]);
  }
});
test('disqualified round cannot save a zero as a perfect Precision score or share it', () => {
  let writes = 0;
  const h = harness({ getItem: () => null, setItem() { writes++; } });
  h.debug.startGame('PRECISION');
  h.debug.endGame('DISQUALIFIED');
  h.el('player-name-input').value = 'LEO';
  h.click('save-score-btn');
  assert.equal(writes, 0);
  assert.equal(h.el('save-score-btn').disabled, true);
  assert.equal(h.el('share-btn').disabled, true);
});
test('blocked storage reads do not prevent gameplay boot', () => {
  const h = harness({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  h.debug.endGame('BLINK');
  assert.equal(h.debug.getState(), 'GAME_OVER');
  assert.match(h.el('leaderboard-list').textContent, /unavailable/i);
});
test('Classic starts calibration with corrupt score data without overwriting it', async () => {
  const value = '{broken';
  let writes = 0;
  const h = harness({ getItem: key => key === 'blink_lb_CLASSIC' ? value : null, setItem() { writes++; } });
  h.debug.startGame('CLASSIC');
  await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'CALIBRATING');
  assert.equal(h.tracks.length, 1, 'camera startup must be reached');
  assert.equal(h.el('wr-value').innerText, 'Unavailable');
  assert.equal(writes, 0, 'do not replace corrupt stored scores');
});
test('Classic starts calibration when local score reads throw', async () => {
  let writes = 0;
  const h = harness({ getItem() { throw new Error('blocked'); }, setItem() { writes++; } });
  h.debug.startGame('CLASSIC');
  await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'CALIBRATING');
  assert.equal(h.tracks.length, 1, 'camera startup must be reached');
  assert.equal(h.el('wr-value').innerText, 'Unavailable');
  assert.equal(writes, 0);
});
test('corrupt score data remains untouched and cannot be reported saved', () => {
  let writes = 0;
  const h = harness({ getItem: key => key.startsWith('blink_lb_') ? '{broken' : null, setItem() { writes++; } });
  h.debug.endGame('BLINK');
  assert.match(h.el('leaderboard-list').textContent, /unavailable/i);
  h.el('player-name-input').value = 'LEO';
  h.click('save-score-btn');
  assert.equal(writes, 0);
  assert.equal(h.el('save-score-btn').disabled, false);
  assert.match(h.el('save-score-btn').innerText, /^NOT SAVED/);
});
test('storage write failure keeps score retryable and never claims saved', () => {
  const h = harness({ getItem: () => null, setItem() { throw new Error('quota'); } });
  h.debug.endGame('BLINK');
  h.el('player-name-input').value = 'LEO';
  h.click('save-score-btn');
  assert.equal(h.el('save-score-btn').disabled, false);
  assert.match(h.el('save-score-btn').innerText, /NOT SAVED/);
});
test('share fallback explains when clipboard API is absent', async () => {
  const h = harness();
  h.debug.endGame('BLINK');
  await h.click('share-btn');
  assert.match(h.el('share-btn').innerText, /copy.*manually|clipboard unavailable/i);
});
test('share fallback explains rejected clipboard permission and remains retryable', async () => {
  let attempts = 0;
  const h = harness(undefined, { writeText: async () => { attempts++; throw new Error('denied'); } });
  h.debug.endGame('BLINK');
  await h.click('share-btn');
  assert.match(h.el('share-btn').innerText, /copy.*manually|clipboard unavailable/i);
  await h.click('share-btn');
  assert.equal(attempts, 2);
});
test('menu exit never serializes a selfie frame', () => {
  const h = harness();
  h.debug.endGame('MENU_EXIT');
  assert.equal(h.jpegCount(), 0);
  assert.equal(h.el('selfie-preview').src, '');
});
test('menu and new round discard the previous transient selfie', () => {
  const h = harness();
  h.debug.endGame('BLINK');
  assert.equal(h.jpegCount(), 1);
  assert.match(h.el('selfie-preview').src, /^data:image\/jpeg/);
  h.debug.showMenu();
  assert.equal(h.el('selfie-preview').src, '');
  assert.equal(h.el('selfie-container').classList.contains('hidden'), true);
  h.debug.endGame('BLINK');
  h.debug.startGame('CLASSIC');
  assert.equal(h.el('selfie-preview').src, '');
});
test('late previous-session FaceMesh result must not enter retry calibration', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'CALIBRATING');
  h.tickInference();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  assert.equal(h.debug.calibration.values().length, 0);
  h.tickInference();
  assert.equal(h.pendingSend(), 1, 'retry must wait for the old FaceMesh send');
  h.deliver();
  assert.equal(h.debug.calibration.values().length, 0);
  await h.settle();
  assert.equal(h.pendingSend(), 0);
  h.setClock(2000);
  h.tickInference();
  assert.equal(h.pendingSend(), 1, 'old settled send must release the serialized lock');
  h.lateCallback();
  assert.equal(h.debug.calibration.values().length, 0, 'old callback must not borrow a newer in-flight send identity');
  h.deliver();
  assert.equal(h.debug.calibration.values().length, 1, 'fresh frame must enter retry calibration');
  await h.settle();
  h.lateCallback();
  assert.equal(h.debug.calibration.values().length, 1, 'callback outside a send must not duplicate a sample');
  for (let i = 1; i < 10; i++) {
    h.setClock(2000 + i * 120);
    h.tickInference();
    h.deliver();
    await h.settle();
  }
  assert.equal(h.debug.calibration.values().length, 10);
  h.setClock(3200);
  h.raf();
  assert.equal(h.debug.getState(), 'PLAYING', 'fresh calibration samples permit reentry into gameplay');
});
test('abandoned calibration loop must not run during a new calibration', async () => {
  const h = harness();
  h.debug.startCalibration();
  assert.equal(h.pendingRaf(), 1);
  h.debug.showMenu();
  h.debug.startCalibration();
  assert.equal(h.pendingRaf(), 1);
});
test('menu stop closes idle FaceMesh exactly once', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.debug.showMenu(); await h.settle();
  assert.equal(h.meshes[0].closes, 1);
  h.debug.showMenu(); await h.settle();
  assert.equal(h.meshes[0].closes, 1);
});
test('menu stop defers closing an active FaceMesh until send settles', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.tickInference();
  h.debug.showMenu(); await h.settle();
  assert.equal(h.meshes[0].closes, 0);
  h.deliver(); await h.settle();
  assert.equal(h.meshes[0].closes, 1);
});
test('background during pending permission clears loading and retires late stream', async () => {
  const h = harness(), grant = h.deferPermission();
  h.debug.startGame('CLASSIC');
  assert.equal(h.el('loading-msg').style.display, 'block');
  h.document.hidden = true; h.visibility();
  assert.equal(h.el('loading-msg').style.display, 'none');
  grant(); await h.settle();
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.debug.getState(), 'MENU');
});
test('ended camera track during calibration returns to actionable camera error', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'CALIBRATING');
  h.tracks[0].end(); await h.settle();
  assert.equal(h.debug.getState(), 'MENU');
  assert.equal(h.pendingRaf(), 0);
  assert.equal(h.el('camera-error').classList.contains('hidden'), false);
  assert.match(h.el('camera-error').textContent, /camera/i);
});

test('demo from results immediately releases the camera and preserves the unsaved result', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.debug.endGame('BLINK');
  const score = h.el('final-score-val').innerText;
  h.debug.startDemoAd();
  assert.equal(h.debug.getState(), 'AD_DEMO');
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.el('input_video').srcObject, null);
  assert.equal(h.el('demo-claim-btn').disabled, true);
  h.debug.finishDemoAd(true);
  assert.equal(h.debug.getState(), 'AD_DEMO', 'early claim must not dismiss the demo');
  h.debug.finishDemoAd(false);
  assert.equal(h.debug.getState(), 'GAME_OVER');
  assert.equal(h.el('final-score-val').innerText, score);
  assert.equal(h.el('body').classList.contains('theme-demo'), false);
});
test('completion awards a session-only demo theme without writing storage', () => {
  let writes = 0;
  const h = harness({ getItem: () => null, setItem() { writes++; } });
  h.debug.startDemoAd();
  h.setClock(5000); h.debug.updateDemoAd(); h.debug.finishDemoAd(true);
  assert.equal(h.debug.getState(), 'MENU');
  assert.equal(h.el('body').classList.contains('theme-demo'), true);
  assert.equal(writes, 0);
});
test('backgrounding a demo abandons it and leaves no reward or scheduled update', () => {
  const h = harness();
  h.debug.startDemoAd();
  h.document.hidden = true; h.visibility();
  h.setClock(10000); h.debug.finishDemoAd(true);
  assert.equal(h.debug.getState(), 'MENU');
  assert.equal(h.el('body').classList.contains('theme-demo'), false);
  assert.equal(h.pendingRaf(), 0);
});
test('pending camera startup is retired before demo, and a late permission grant is stopped', async () => {
  const h = harness(), grant = h.deferPermission();
  h.debug.startGame('CLASSIC'); h.debug.startDemoAd();
  grant(); await h.settle(); await h.timers();
  assert.equal(h.tracks[0].stops, 1);
  assert.equal(h.debug.getState(), 'AD_DEMO');
});
test('demo cannot interrupt calibration or disqualified results', async () => {
  const h = harness();
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.debug.startDemoAd();
  assert.equal(h.debug.getState(), 'CALIBRATING');
  h.debug.endGame('DISQUALIFIED'); h.debug.startDemoAd();
  assert.equal(h.debug.getState(), 'GAME_OVER');
});

test('party: every player takes a turn, photos go to the reel, and the champion gets crowned', async () => {
  const h = harness();
  h.el('party-names').value = 'Ana\nBen';
  h.click('party-start-btn');
  assert.equal(h.debug.getState(), 'PARTY');
  assert.match(h.el('party-message').textContent, /Ana, you're up/);
  h.click('party-go-btn'); await h.settle();
  h.debug.endGame('BLINK');
  assert.equal(h.el('party-next-btn').classList.contains('hidden'), false);
  assert.match(h.el('party-next-btn').textContent, /BEN/);
  assert.equal(h.el('player-name-input').value, 'ANA');
  assert.equal(h.el('game-over-screen').classList.contains('party-turn'), true);
  h.click('party-next-btn');
  assert.equal(h.debug.getState(), 'PARTY');
  h.click('party-go-btn'); await h.settle();
  h.debug.endGame('BLINK');
  assert.match(h.el('party-next-btn').textContent, /FINAL/);
  h.click('party-next-btn');
  assert.equal(h.el('party-title').textContent, 'THE FINAL');
  h.click('party-skip-btn');
  await h.settle();
  assert.match(h.el('party-title').textContent, /WINS!/);
  assert.equal(h.el('party-reel-btn').classList.contains('hidden'), false);
  assert.match(h.el('party-reel-status').textContent, /2 caught-blinking photos/);
  h.click('party-end-btn');
  assert.equal(h.debug.getState(), 'MENU');
  assert.equal(h.el('party-screen').classList.contains('hidden'), true);
});

test('party needs two names, and backgrounding mid-turn keeps the party', async () => {
  const h = harness();
  h.el('party-names').value = 'Solo';
  h.click('party-start-btn');
  assert.match(h.el('party-setup-status').textContent, /at least 2/);
  h.el('party-names').value = 'Ana, Ben';
  h.click('party-start-btn');
  h.click('party-go-btn'); await h.settle(); await h.timers();
  h.document.hidden = true; h.visibility(); h.document.hidden = false;
  assert.equal(h.debug.getState(), 'PARTY');
  assert.match(h.el('party-message').textContent, /Turn 1 of 2: Ana/);
  assert.equal(h.tracks[0].stops, 1);
});

test('head-to-head asks for both faces, then times out to the menu with guidance', async () => {
  const h = harness();
  h.debug.startGame('VERSUS'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'VERSUS_CALIBRATING');
  h.setClock(1000); h.tickInference(); h.deliver(); await h.settle(); h.raf();
  assert.match(h.el('calibration-status').innerText, /BOTH OF YOU IN VIEW/);
  h.setClock(20000); h.raf();
  assert.equal(h.debug.getState(), 'MENU');
  assert.match(h.el('camera-error').textContent, /both faces/i);
  assert.equal(h.tracks[0].stops, 1);
});

test('distraction round shows jokes while playing and hides them at the end', () => {
  const h = harness();
  h.debug.startGame('DISTRACT');
  h.debug.endGame('BLINK');
  assert.equal(h.el('joke-card').classList.contains('hidden'), true);
  assert.equal(h.el('final-score-label').innerText, 'JOKES SURVIVED FOR');
});

test('Blink Olympics: Balloon Pop counts blinks as pops, ends on misses and shares a count', async () => {
  const h = harness();
  h.debug.startGame('BALLOON'); await h.settle(); await h.timers();
  for (let i = 0; i < 10; i++) { h.setClock(i * 400); h.tickInference(); h.deliver(); await h.settle(); h.raf(); }
  assert.equal(h.debug.getState(), 'BALLOON');
  assert.equal(h.el('balloon-layer').classList.contains('hidden'), false);
  assert.equal(h.el('hud-label').innerText, 'POPPED');
  assert.equal(h.el('lives-display').classList.contains('hidden'), false);
  // Blink while nothing is in the zone: three times is out.
  for (let i = 0; i < 3; i++) {
    h.setBlinking(true); h.setClock(4000 + i * 600); h.tickInference(); h.deliver(); await h.settle();
    h.setBlinking(false); h.setClock(4300 + i * 600); h.tickInference(); h.deliver(); await h.settle();
  }
  assert.equal(h.debug.getState(), 'GAME_OVER');
  assert.equal(h.el('final-score-val').innerText, '0');
  assert.equal(h.el('final-score-label').innerText, 'BALLOONS POPPED');
  assert.equal(h.el('final-score-sub').innerText, 'Out of lives');
  assert.equal(h.el('balloon-layer').classList.contains('hidden'), true);
  assert.equal(h.el('lives-display').classList.contains('hidden'), true);
  assert.equal(h.jpegCount(), 1);
});

test('blink clip: a Classic blink becomes a shareable clip made on the phone; Balloon Pop and DQs make none', async () => {
  class FakeRecorder {
    static isTypeSupported(type) { return type === 'video/mp4'; }
    constructor(stream, options) { this.options = options; FakeRecorder.made.push(this); }
    start() {}
    stop() { queueMicrotask(() => { this.ondataavailable({ data: new Blob(['clip'], { type: 'video/mp4' }) }); this.onstop(); }); }
  }
  FakeRecorder.made = [];
  function HTMLCanvasElement() {}
  HTMLCanvasElement.prototype.captureStream = () => ({});
  const urls = [];
  const h = harness(undefined, undefined, { win: { MediaRecorder: FakeRecorder, HTMLCanvasElement }, extra: { URL: { createObjectURL: () => { urls.push('blob:clip'); return 'blob:clip'; }, revokeObjectURL() {} } } });
  Object.assign(h.el('output_canvas'), { width: 640, height: 480 });
  assert.equal(h.el('clip-btn').classList.contains('hidden'), false, 'starts as authored; hidden by the page markup');
  h.setEye(.3);
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  assert.equal(h.el('clip-btn').classList.contains('hidden'), true);
  for (let i = 0; i < 10; i++) { h.setClock(i * 400); h.tickInference(); h.deliver(); await h.settle(); h.raf(); }
  assert.equal(h.debug.getState(), 'PLAYING');
  for (let t = 4000; t <= 6000; t += 100) { h.setClock(t); h.tickInference(); h.deliver(); await h.settle(); }
  h.setBlinking(true); h.setClock(6100); h.tickInference(); h.deliver(); await h.settle();
  assert.equal(h.debug.getState(), 'GAME_OVER');
  assert.equal(h.el('clip-btn').classList.contains('hidden'), false);
  assert.equal(h.el('clip-btn').disabled, true);
  assert.equal(h.el('clip-btn').innerText, 'MAKING YOUR CLIP...');
  h.setBlinking(false);
  for (let t = 6200; t <= 7000; t += 100) { h.setClock(t); h.tickInference(); h.deliver(); await h.settle(); }
  assert.equal(FakeRecorder.made.length, 1);
  assert.equal(FakeRecorder.made[0].options.mimeType, 'video/mp4');
  await new Promise(resolve => setTimeout(resolve, 5000));
  await h.settle();
  assert.equal(h.el('clip-btn').disabled, false);
  assert.equal(h.el('clip-btn').innerText, 'SHARE CLIP');
  assert.equal(h.el('clip-preview').src, 'blob:clip');
  assert.equal(h.el('clip-preview').classList.contains('hidden'), false);
  // Back to the menu drops the clip.
  h.debug.showMenu();
  assert.equal(h.el('clip-btn').classList.contains('hidden'), true);
  assert.equal(h.el('clip-preview').src, '');

  // Balloon Pop ends on misses, not a stare: no clip.
  h.debug.startGame('BALLOON'); await h.settle(); await h.timers();
  h.debug.endGame('BALLOON_OVER');
  assert.equal(h.el('clip-btn').classList.contains('hidden'), true);
  // A lost face is not a blink: no clip.
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  h.debug.endGame('DISQUALIFIED');
  assert.equal(h.el('clip-btn').classList.contains('hidden'), true);
  assert.equal(FakeRecorder.made.length, 1);
});

test('a game started from the menu shows the live camera to pick a look, then calibrates; Home goes back', async () => {
  const h = harness();
  h.el('game-hud').classList.add('hidden'); // as in index.html
  h.click('surprise-start-btn'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'SKIN_PICK');
  assert.equal(h.el('skin-pick-screen').classList.contains('hidden'), false);
  assert.equal(h.el('menu-screen').classList.contains('hidden'), true);
  assert.equal(h.el('skin-pick-mode').textContent, 'Surprise');
  assert.equal(h.el('home-fab').classList.contains('hidden'), false);
  h.click('skin-pick-play');
  assert.equal(h.debug.getState(), 'CALIBRATING');
  assert.equal(h.el('skin-pick-screen').classList.contains('hidden'), true);

  // Home from the pick screen stops the camera and lands on the main menu.
  h.click('surprise-start-btn'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'SKIN_PICK');
  h.click('home-fab');
  assert.equal(h.debug.getState(), 'MENU');
  assert.equal(h.el('skin-pick-screen').classList.contains('hidden'), true);
  assert.equal(h.el('home-fab').classList.contains('hidden'), true);

  // Retry and direct starts skip the pick.
  h.debug.startGame('CLASSIC'); await h.settle(); await h.timers();
  assert.equal(h.debug.getState(), 'CALIBRATING');
});
