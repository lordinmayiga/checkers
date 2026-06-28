class SoundManager {
  private muted: boolean = false;
  private audioCtx: AudioContext | null = null;

  constructor() {
    // Read user setting from localStorage if it exists
    if (typeof window !== "undefined") {
      this.muted = localStorage.getItem("checkers_sound_muted") === "true";
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== "undefined") {
      localStorage.setItem("checkers_sound_muted", String(muted));
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    
    // Resume context if suspended (browser security policy requires user interaction)
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch((err) => {
        console.warn("Failed to resume AudioContext:", err);
      });
    }
    
    return this.audioCtx;
  }

  playMove() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playCapture() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // A two-pulse woody thump
    const playPulse = (delay: number, startFreq: number, endFreq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + delay + 0.1);

      gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.1);
    };

    playPulse(0, 200, 100);
    playPulse(0.06, 150, 75);
  }

  playKing() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Rapid ascending retro arpeggio: C4, E4, G4, C5
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.15);
    });
  }

  playError() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Muffled sawtooth buzz
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 0.18);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(350, ctx.currentTime);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  playGameStart() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Short swell
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  playWin() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Triumphant major scale melody
    const notes = [
      { freq: 523.25, dur: 0.1, delay: 0 },    // C5
      { freq: 659.25, dur: 0.1, delay: 0.08 }, // E5
      { freq: 783.99, dur: 0.1, delay: 0.16 }, // G5
      { freq: 1046.50, dur: 0.3, delay: 0.24 } // C6
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.delay);

      gain.gain.setValueAtTime(0.12, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.delay + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.dur);
    });
  }

  playLoss() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Sad descending minor/chromatic melody
    const notes = [
      { freq: 392.00, dur: 0.15, delay: 0 },    // G4
      { freq: 369.99, dur: 0.15, delay: 0.12 }, // F#4
      { freq: 349.23, dur: 0.15, delay: 0.24 }, // F4
      { freq: 329.63, dur: 0.4, delay: 0.36 }   // E4
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(note.freq, now + note.delay);

      gain.gain.setValueAtTime(0.15, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.delay + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.dur);
    });
  }

  playMessage() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Play two quick high-pitched sweet bleeps (E5 and A5)
    playTone(659.25, now, 0.08);
    playTone(880.00, now + 0.05, 0.12);
  }

  playCardDeal() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  playCardPlay() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(250, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playCardAttack() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playTone = (freq: number, delay: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.linearRampToValueAtTime(freq * 0.7, now + delay + dur);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(800, now + delay);

      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + dur);
    };

    // Staggered aggressive arpeggio
    playTone(330, 0, 0.15); // E4
    playTone(392, 0.06, 0.15); // G4
    playTone(523.25, 0.12, 0.25); // C5
  }

  playCardCut() {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }
}

export const soundManager = new SoundManager();
