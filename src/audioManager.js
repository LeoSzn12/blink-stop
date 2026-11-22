// Audio Manager using Web Audio API

const MUSIC_BPM = 120;
const MUSIC_VOLUME = 0.32;
// C, A minor, F, G: root, then three notes to arpeggiate (Hz).
const MUSIC_CHORDS = [
    [130.81, 261.63, 329.63, 392.0],
    [110.0, 220.0, 261.63, 329.63],
    [87.31, 174.61, 220.0, 261.63],
    [98.0, 196.0, 246.94, 293.66],
];

class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.5; // Default volume

        this.droneOsc = null;
        this.isMuted = false;

        // Party music runs on its own volume so pops can duck it.
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = MUSIC_VOLUME;
        this.musicGain.connect(this.masterGain);
        this.musicTimer = null;
        this.musicStep = 0;
        this.musicNext = 0;
    }

    // iPhone mutes web sound under the silent switch unless the page says it is playing on purpose
    // (Safari 16.4 and later). Only asked while a game runs with Sound on.
    playThroughSilentSwitch(on) {
        try {
            if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto';
        } catch { /* not supported */ }
    }

    // Upbeat party loop, all made in code: kick, clap, hi-hat, bass and a plucky arpeggio at 120 bpm
    // over four chords. Scheduled a little ahead so it keeps time even if a frame is slow.
    startMusic() {
        if (this.musicTimer) return;
        this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.musicGain.gain.setValueAtTime(MUSIC_VOLUME, this.ctx.currentTime);
        this.musicStep = 0;
        this.musicNext = this.ctx.currentTime + 0.08;
        this.musicTimer = setInterval(() => this.scheduleMusic(), 50);
        this.scheduleMusic();
    }

    stopMusic() {
        if (!this.musicTimer) return;
        clearInterval(this.musicTimer);
        this.musicTimer = null;
        const t = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(t);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, t + 0.15);
    }

    get musicPlaying() { return !!this.musicTimer; }

    scheduleMusic() {
        const sixteenth = 60 / MUSIC_BPM / 4;
        // If the phone stalled (tab hidden, slow frame), jump ahead rather than play a burst.
        if (this.musicNext < this.ctx.currentTime - 0.2) this.musicNext = this.ctx.currentTime + 0.05;
        while (this.musicNext < this.ctx.currentTime + 0.2) {
            this.musicNote(this.musicStep, this.musicNext);
            this.musicNext += sixteenth;
            this.musicStep = (this.musicStep + 1) % (16 * MUSIC_CHORDS.length);
        }
    }

    musicNote(step, t) {
        const out = this.musicGain;
        const beat = step % 16;
        const chord = MUSIC_CHORDS[Math.floor(step / 16)];
        if (beat % 4 === 0) this.drum(t, 150, 0.5, out);
        if (beat === 4 || beat === 12) this.hiss(t, 1600, 0.16, 0.28, out);
        if (beat % 4 === 2) this.hiss(t, 8000, 0.04, 0.12, out);
        if (beat % 2 === 0) this.tone(chord[0] / 2, t, 0.16, { type: 'triangle', volume: beat % 4 === 0 ? 0.28 : 0.18, out });
        const arp = [0, 1, 2, 1, 3, 2, 1, 2];
        if (beat % 2 === 1 || beat === 0) this.tone(chord[1 + (arp[beat % 8] % 3)] * 2, t, 0.11, { type: 'square', volume: 0.035, out });
    }

    drum(t, from, volume, out = this.masterGain) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    hiss(t, frequency, length, volume, out = this.masterGain) {
        if (!this.hissBuffer) {
            const n = Math.floor(this.ctx.sampleRate * 0.2);
            this.hissBuffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
            const data = this.hissBuffer.getChannelData(0);
            for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = this.hissBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = frequency > 4000 ? 'highpass' : 'bandpass';
        filter.frequency.value = frequency;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + length);
        src.connect(filter); filter.connect(gain); gain.connect(out);
        src.start(t);
        src.stop(t + length + 0.02);
    }

    // Pops and wins cut through: the music dips for a moment, then comes back.
    duckMusic() {
        if (!this.musicTimer) return;
        const t = this.ctx.currentTime;
        const g = this.musicGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(MUSIC_VOLUME * 0.35, t + 0.02);
        g.linearRampToValueAtTime(MUSIC_VOLUME, t + 0.35);
    }

    resume() {
        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
            this.ctx.resume();
        }
    }

    startDrone() {
        if (this.droneOsc) return;

        // Low frequency drone
        this.droneOsc = this.ctx.createOscillator();
        this.droneOsc.type = 'sine';
        this.droneOsc.frequency.setValueAtTime(55, this.ctx.currentTime); // A1

        const gain = this.ctx.createGain();
        gain.gain.value = 0.1;

        this.droneOsc.connect(gain);
        gain.connect(this.masterGain);
        this.droneOsc.start();
    }

    stopDrone() {
        if (this.droneOsc) {
            this.droneOsc.stop();
            this.droneOsc = null;
        }
    }

    playHeartbeat(tempoMultiplier = 1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(60, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playGlitch() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        // Random frequency jumps
        for (let i = 0; i < 5; i++) {
            osc.frequency.setValueAtTime(Math.random() * 1000 + 100, this.ctx.currentTime + (i * 0.05));
        }

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    // A short note with a quick attack and a fade (all sounds here are made in code).
    tone(frequency, start, length, { type = 'triangle', volume = 0.2, slideTo = null, out = this.masterGain } = {}) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain);
        gain.connect(out);
        osc.start(start);
        osc.stop(start + length + 0.02);
    }

    // Win fanfare: a bright four-note run up, then a held chord.
    playWin() {
        this.duckMusic();
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.09, 0.16, { volume: 0.18 }));
        [523.25, 659.25, 783.99, 1046.5].forEach(f => this.tone(f, t + 0.3, 0.7, { volume: 0.1 }));
    }

    // Balloon pop: a deep thump (felt more than heard) plus a short burst of noise.
    playPop(pitch = 1) {
        this.duckMusic();
        const t = this.ctx.currentTime;
        this.tone(150 * pitch, t, 0.12, { type: 'sine', volume: 0.55, slideTo: 45 });
        if (!this.noise) {
            const length = Math.floor(this.ctx.sampleRate * 0.12);
            this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
            const data = this.noise.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800 * pitch;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.5;
        src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        src.start(t);
    }

    // 3-2-1 countdown ticks, then a higher GO.
    playTick() { this.tone(660, this.ctx.currentTime, 0.1, { type: 'square', volume: 0.08 }); }
    playGo() {
        const t = this.ctx.currentTime;
        this.tone(988, t, 0.25, { type: 'square', volume: 0.09 });
        this.tone(1318.5, t + 0.04, 0.25, { volume: 0.08 });
    }

    // Losing buzzer: two low notes stepping down.
    playBuzzer() {
        const t = this.ctx.currentTime;
        this.tone(220, t, 0.22, { type: 'sawtooth', volume: 0.1, slideTo: 196 });
        this.tone(165, t + 0.24, 0.4, { type: 'sawtooth', volume: 0.1, slideTo: 110 });
    }

    // Level up and a life back: a quick sparkle up.
    // Golden balloon: a bright run of five notes, like coins.
    playGold() {
        this.duckMusic();
        const t = this.ctx.currentTime;
        [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => this.tone(f, t + 0.04 + i * 0.045, 0.14, { type: 'square', volume: 0.06 }));
    }

    playLevelUp() {
        const t = this.ctx.currentTime;
        [784, 988, 1175].forEach((f, i) => this.tone(f, t + i * 0.06, 0.12, { volume: 0.1 }));
    }

    playSurprise() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.25);
    }

    // Blink Beat's backing beat: a soft kick drum, louder on the first beat of a bar.
    playKick(accent = false) {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(accent ? 160 : 130, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        gain.gain.setValueAtTime(accent ? 0.5 : 0.32, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.23);
    }

    // Short, soft beep for Flash and Blink Beat.
    playBeep(frequency = 660) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }
}

export const audioManager = new AudioManager();
