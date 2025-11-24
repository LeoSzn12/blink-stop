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
        if (this.ctx.state === 'suspended') {
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

    playWin() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 1);
    }
}

export const audioManager = new AudioManager();
