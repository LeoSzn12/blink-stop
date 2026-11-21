// Audio Manager using Web Audio API

class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.5; // Default volume

        this.droneOsc = null;
        this.isMuted = false;
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
    tone(frequency, start, length, { type = 'triangle', volume = 0.2, slideTo = null } = {}) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + length + 0.02);
    }

    // Win fanfare: a bright four-note run up, then a held chord.
    playWin() {
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.09, 0.16, { volume: 0.18 }));
        [523.25, 659.25, 783.99, 1046.5].forEach(f => this.tone(f, t + 0.3, 0.7, { volume: 0.1 }));
    }

    // Balloon pop: a deep thump (felt more than heard) plus a short burst of noise.
    playPop(pitch = 1) {
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
