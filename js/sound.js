/**
 * ============================================================================
 * RETRO RANKERS - SOUND MANAGER (js/sound.js)
 * Pure Web Audio API Synthesizer (Zero External Audio Files)
 * 8-Bit Chiptune / Arcade Style Oscillators & Envelopes
 * ============================================================================
 */

(function (window) {
  'use strict';

  class SoundManager {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this._lastShootTime = 0;

      // Unlock Web Audio Context on first user interaction
      const unlock = () => {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            try {
              this.ctx = new AudioCtx();
            } catch (e) {
              console.warn('[SoundManager] AudioContext init failed:', e);
            }
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };

      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
    }

    /**
     * Lazy getter to ensure an active AudioContext
     */
    _getCtx() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        try {
          this.ctx = new AudioCtx();
        } catch (e) {
          return null;
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    /**
     * Toggle sound mute status
     * @returns {boolean} new enabled state
     */
    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        this._getCtx();
        this.playMove(); // pleasant confirmation blip
      }
      return this.enabled;
    }

    /**
     * Short 8-bit square blip (menu, block move, cursor navigate)
     */
    playMove() {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(360, t + 0.045);

        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.05);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Crisp triangle wave tick (tetromino rotate)
     */
    playRotate() {
      this.playDialTick();
    }

    /**
     * Crisp triangle wave tick (initial dial scroll up/down)
     */
    playDialTick() {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(540, t);
        osc.frequency.exponentialRampToValueAtTime(780, t + 0.035);

        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.04);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Upbeat 8-bit arpeggio chime (tetris line clear / bonus points)
     */
    playScore() {
      this._playArpeggio([523.25, 659.25, 783.99, 1046.5], 0.042, 'square', 0.06);
    }

    /**
     * Upbeat 8-bit power-up chime (energy core / blue math gate)
     */
    playPowerUp() {
      this._playArpeggio([440.0, 554.37, 659.25, 880.0, 1108.7], 0.038, 'square', 0.06);
    }

    /**
     * Helper for quick arpeggios
     */
    _playArpeggio(notes, stepTime, type = 'square', vol = 0.06) {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const startT = ctx.currentTime;
        notes.forEach((freq, idx) => {
          const t = startT + idx * stepTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = type;
          osc.frequency.setValueAtTime(freq, t);

          gain.gain.setValueAtTime(vol, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + stepTime * 1.5);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(t);
          osc.stop(t + stepTime * 1.6);
        });
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Low sawtooth buzz (damage, collision)
     */
    playHit() {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.16);

        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.17);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Low penalty buzz (red math gate)
     */
    playPenalty() {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.linearRampToValueAtTime(70, t + 0.18);

        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.19);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Crunchy retro explosion (enemy destroy, core EMP)
     */
    playExplosion() {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.18);

        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.19);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Very soft, short high-pitched laser pew
     * Throttled to max ~16 fires/sec so rapid firing remains pleasant
     */
    playShoot() {
      const now = performance.now();
      if (now - this._lastShootTime < 60) return;
      this._lastShootTime = now;

      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(960, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.045);

        gain.gain.setValueAtTime(0.035, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.05);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Classic arcade coin/game start jingle (B5 -> E6 chime)
     */
    playStart() {
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const t = ctx.currentTime;

        // Tone 1: B5 (987.77 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(987.77, t);
        gain1.gain.setValueAtTime(0.08, t);
        gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(t);
        osc1.stop(t + 0.085);

        // Tone 2: E6 (1318.51 Hz)
        const t2 = t + 0.08;
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1318.51, t2);
        gain2.gain.setValueAtTime(0.1, t2);
        gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.28);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(t2);
        osc2.stop(t2 + 0.29);
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Descending retro game-over melody
     */
    playGameOver() {
      const notes = [440.0, 392.0, 349.23, 293.66, 261.63]; // A4, G4, F4, D4, C4
      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const startT = ctx.currentTime;
        const step = 0.12;

        notes.forEach((freq, idx) => {
          const t = startT + idx * step;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = idx === notes.length - 1 ? 'sawtooth' : 'square';
          osc.frequency.setValueAtTime(freq, t);

          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(t);
          osc.stop(t + step * 1.25);
        });
      } catch (err) {
        // Safe fail
      }
    }

    /**
     * Celebratory fanfare when initials are registered in Hall of Fame
     */
    playRecordSaved() {
      const melody = [
        { freq: 523.25, time: 0.00, dur: 0.09 }, // C5
        { freq: 659.25, time: 0.09, dur: 0.09 }, // E5
        { freq: 783.99, time: 0.18, dur: 0.09 }, // G5
        { freq: 1046.5, time: 0.27, dur: 0.14 }, // C6
        { freq: 783.99, time: 0.42, dur: 0.08 }, // G5
        { freq: 1046.5, time: 0.50, dur: 0.38 }  // C6 (sustain)
      ];

      const ctx = this._getCtx();
      if (!ctx) return;

      try {
        const startT = ctx.currentTime;
        melody.forEach(item => {
          const t = startT + item.time;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'square';
          osc.frequency.setValueAtTime(item.freq, t);

          gain.gain.setValueAtTime(0.09, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + item.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(t);
          osc.stop(t + item.dur + 0.02);
        });
      } catch (err) {
        // Safe fail
      }
    }
  }

  // Export to global window object
  window.SoundManager = SoundManager;
  window.sound = new SoundManager();

})(typeof window !== 'undefined' ? window : this);
