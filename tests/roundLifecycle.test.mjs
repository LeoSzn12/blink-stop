import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameOverCameraStop } from '../src/roundLifecycle.mjs';

function harness() {
    const timers = new Map();
    let nextId = 0;
    let stops = 0;
    const controller = createGameOverCameraStop(() => stops++, fn => {
        const id = ++nextId;
        timers.set(id, fn);
        return id;
    }, id => timers.delete(id));
    return { controller, timers, get stops() { return stops; }, fire(id) { const fn = timers.get(id); timers.delete(id); fn?.(); } };
}

test('a previous Game Over timeout cannot stop a new round, even if its callback was queued', () => {
    const h = harness();
    h.controller.schedule();
    const stale = [...h.timers.values()][0];
    h.controller.cancel(); // startGame invalidates the old round
    stale(); // cancellation cannot retract an already queued callback
    assert.equal(h.stops, 0);
    assert.equal(h.timers.size, 0);
});

test('leaving Game Over for the menu cancels the pending camera stop', () => {
    const h = harness();
    h.controller.schedule();
    h.controller.cancel(); // showMenu
    assert.equal(h.timers.size, 0);
    assert.equal(h.stops, 0);
});

test('only the current Game Over deadline stops the camera once', () => {
    const h = harness();
    h.controller.schedule();
    const first = [...h.timers.values()][0];
    h.controller.schedule();
    first();
    assert.equal(h.stops, 0);
    h.fire([...h.timers.keys()][0]);
    assert.equal(h.stops, 1);
    assert.equal(h.timers.size, 0);
});
