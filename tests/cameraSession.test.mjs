import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

import { createCalibrationTracker, createTrackingFreshness, createFaceLossTracker } from '../src/gameRules.mjs';
import { createSerializedInference } from '../src/inference.mjs';
import { createSurpriseRound, createRewardedDemo } from '../src/surprise.mjs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
function harness(storage = { getItem: () => null, setItem() {} }, clipboard) {
  const els = new Map(), raf = new Map(), timers = new Map(), intervals = new Map(), listeners = new Map();
  let clock = 0, id = 0, lastDelivered, jpegCount = 0;
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
        classList: { add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); }, contains(x) { return classes.has(x); } },
        addEventListener(type, fn) { listeners.set(`${key}:${type}`, fn); }, removeAttribute(name) { if (name === 'src') this.src = ''; }, focus() {}, querySelector: () => el('digital-text-sm'), getContext: () => canvas,
        play: async () => {}, getTracks: () => [{ stop() {} }], toDataURL: () => { jpegCount++; return 'data:image/jpeg;base64,abc'; },
      });
    }
    return els.get(key);
  }
  const canvas = Object.fromEntries(['save','restore','clearRect','drawImage','fillRect','fillText'].map(x => [x, () => {}]));
  const document = { hidden: false, body: el('body'), getElementsByClassName: cls => [el(cls)], getElementById: el,
    querySelector: el, querySelectorAll: () => [], addEventListener(type, fn) { documentEvents.set(type, fn); }, createElement: el };
  class FaceMesh { constructor() { this.closes = 0; meshes.push(this); } onResults(fn) { this.resultHandler = fn; } setOptions() {} send() { return new Promise(resolve => { const emit = () => this.resultHandler({ image: {}, multiFaceLandmarks: [{}] }); pending.push(() => { lastDelivered = emit; emit(); resolve(); }); }); } close() { this.closes++; } }
  const context = { document, window: { innerWidth: 500, addEventListener() {} }, navigator: { clipboard, mediaDevices: { getUserMedia: () => permission || Promise.resolve(stream()) } },
    FaceMesh, console: { log() {}, warn() {}, error() {} }, performance: { now: () => clock }, Date,
    createCalibrationTracker, createTrackingFreshness, createFaceLossTracker, createSerializedInference, createSurpriseRound, createRewardedDemo,
    checkBlink: () => ({ minEar: .3, ear: .3, blinking: false }), setBlinkThreshold() {}, resetBlinkState() {}, getBlinkThreshold: () => .22,
    audioManager: { startDrone() {}, stopDrone() {}, playGlitch() {}, playWin() {}, playHeartbeat() {}, playSurprise() {} },
    appendScore() {}, cameraErrorMessage: () => '', createGameOverCameraStop: fn => ({ cancel() {}, schedule() {} }), sharePayload() {}, shareClipboardText() {},
    localStorage: storage,
    setInterval: fn => { const n = ++id; intervals.set(n, fn); return n; }, clearInterval: n => intervals.delete(n), setTimeout: fn => { const n = ++id; timers.set(n, fn); return n; }, clearTimeout: n => timers.delete(n),
    requestAnimationFrame: fn => { const n = ++id; raf.set(n, fn); return n; }, cancelAnimationFrame: n => raf.delete(n), confirm: () => true };
  vm.runInNewContext(source + '\n globalThis.debug = { startGame, showMenu, startCalibration, endGame, startDemoAd, finishDemoAd, updateDemoAd, calibration, inference, Leaderboard, getState: () => gameState };', context);
  return { debug: context.debug, el, click: key => listeners.get(`${key}:click`)(), jpegCount: () => jpegCount, tracks, meshes, document, visibility: () => documentEvents.get('visibilitychange')(), deferPermission() { let resolve; permission = new Promise(r => { resolve = r; }); return () => resolve(stream()); }, setClock: n => { clock = n; }, deliver: () => pending.shift()(), lateCallback: () => lastDelivered(), pendingSend: () => pending.length, tickInference() { for (const fn of intervals.values()) fn(); }, async settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }, async timers() { for (const [n,fn] of [...timers]) { timers.delete(n); fn(); } await this.settle(); }, raf() { for (const [n,fn] of [...raf]) { raf.delete(n); fn(); } }, pendingRaf: () => raf.size };
}
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
