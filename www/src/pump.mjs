// Gas Pump: a Precision challenge. The pump counts up in dollars and you blink to stop it
// as close to $10.00 as you can. It runs at a steady pace to $8, then speeds up toward $10,
// so the last two dollars need nerve, not just counting.
export const PUMP_TARGET = 10;
const BASE_RATE = 1.25;   // dollars per second up to $8
const RAMP_FROM = 8;
const RAMP_START_S = RAMP_FROM / BASE_RATE;  // 6.4 s
const RAMP = 0.6;         // extra dollars per second, each second after $8 (about $2/s at $10)

// Dollars on the pump after `seconds`, cut to whole cents like a real pump.
export function pumpDollars(seconds) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const over = t - RAMP_START_S;
    const raw = over <= 0 ? t * BASE_RATE : RAMP_FROM + BASE_RATE * over + (RAMP / 2) * over * over;
    return Math.floor(raw * 100 + 1e-6) / 100;
}

// How far off $10.00, in dollars (0 is a perfect stop).
export function pumpMiss(seconds) {
    return Math.round(Math.abs(pumpDollars(seconds) - PUMP_TARGET) * 100) / 100;
}

export function formatDollars(value) {
    return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}
