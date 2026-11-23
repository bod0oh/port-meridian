// Procedural WebAudio for PORT MERIDIAN — no audio files, no network.
// Every sound is synthesized with oscillators and filtered noise. All methods are safe
// to call before init() (they no-op until the first user gesture creates the context).
// Standalone: imports nothing.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  // Engine: one persistent sawtooth through a lowpass, pitch follows speed.
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  // Siren: one triangle oscillator whose frequency flips 700/950 Hz on a timer.
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;
  let sirenOn = false;

  // Music: a small synthwave loop — bassline + pad + hat — driven by a setInterval
  // scheduler stepping 8th notes in A minor.
  let musicTimer = null;
  let musicStep = 0;
  let musicNodes = [];

  function ensureNoise() {
    if (noiseBuf || !ctx) return;
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx) return;
    const t0 = when || ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ctx) return;
    ensureNoise();
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  return {
    /** Create the AudioContext. Call from the first user gesture (key/click). */
    init() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return;
      }
      const AC = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      ensureNoise();

      // Engine voice, built once and driven by engine().
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      // Siren voice, silent until siren(true).
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    },

    /** Continuous engine hum. speed01 is 0 (idle) to 1 (top speed). */
    engine(speed01) {
      if (!ctx || !engineOsc) return;
      const s = Math.max(0, Math.min(1, speed01 || 0));
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + s * 165, t, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + s * 1400, t, 0.08);
      engineGain.gain.setTargetAtTime(s < 0.02 ? 0 : 0.035 + s * 0.05, t, 0.1);
    },

    /** Police siren: two alternating tones while any patrol is close. */
    siren(on) {
      if (!ctx || !sirenOsc) return;
      if (on && !sirenOn) {
        sirenOn = true;
        sirenGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.1);
        sirenTimer = setInterval(() => {
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setValueAtTime(sirenHigh ? 950 : 700, ctx.currentTime);
        }, 420);
      } else if (!on && sirenOn) {
        sirenOn = false;
        if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    },

    /** Gunshot: short noise burst with a low thump. */
    shot() {
      noise(0.09, 0.5, 2800, 'bandpass');
      tone(140, 0.08, 'square', 0.25, 0, 60);
    },

    /** Crash: low filtered noise, a little longer. */
    crash() {
      noise(0.3, 0.6, 420, 'lowpass');
      tone(90, 0.25, 'sine', 0.3, 0, 45);
    },

    /** Pickup: bright two-note ding. */
    pickup() {
      tone(880, 0.12, 'sine', 0.25);
      if (!ctx) return;
      tone(1318, 0.18, 'sine', 0.25, ctx.currentTime + 0.09);
    },

    /** UI click: tiny square blip. */
    uiClick() {
      tone(620, 0.05, 'square', 0.12);
    },

    /** Car horn: two-tone honk. */
    horn() {
      tone(370, 0.28, 'square', 0.16);
      tone(466, 0.28, 'square', 0.12);
    },

    /** Mission complete: three-note fanfare. */
    missionDone() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      tone(523, 0.16, 'triangle', 0.3, t0);
      tone(659, 0.16, 'triangle', 0.3, t0 + 0.14);
      tone(784, 0.34, 'triangle', 0.32, t0 + 0.28);
    },

    /**
     * Synthwave loop (A minor, ~112 BPM, 8th notes): a driving bassline, a soft pad
     * changing chord each bar, and a hat tick. start() is idempotent; stop() silences it.
     */
    music(start) {
      if (start) {
        if (!ctx || musicTimer) return;
        // A minor: bass roots per bar, pad chords per bar (Am, F, C, G).
        const bassRoots = [55, 43.65, 65.41, 49];
        const pads = [
          [220, 261.63, 329.63],
          [174.61, 220, 261.63],
          [130.81, 164.81, 196],
          [196, 246.94, 293.66],
        ];
        const bassLine = [0, 0, 7, 0, 12, 0, 7, 10]; // semitone offsets, 8 steps per bar
        const eighth = 60 / 112 / 2;
        musicStep = 0;
        musicTimer = setInterval(() => {
          if (!ctx) return;
          const step = musicStep;
          const bar = Math.floor(step / 8) % 4;
          const beat = step % 8;
          const root = bassRoots[bar];
          const semi = bassLine[beat];
          const bassFreq = root * Math.pow(2, semi / 12);
          tone(bassFreq, eighth * 0.9, 'sawtooth', 0.16);
          // Hat on every off-beat.
          if (beat % 2 === 1) noise(0.03, 0.07, 7000, 'highpass');
          // Pad at the top of each bar.
          if (beat === 0) {
            const t0 = ctx.currentTime;
            for (const f of pads[bar]) {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.value = f;
              osc.detune.value = 4;
              gain.gain.setValueAtTime(0, t0);
              gain.gain.linearRampToValueAtTime(0.035, t0 + 0.4);
              gain.gain.setValueAtTime(0.035, t0 + eighth * 8 - 0.4);
              gain.gain.linearRampToValueAtTime(0, t0 + eighth * 8);
              osc.connect(gain);
              gain.connect(master);
              osc.start(t0);
              osc.stop(t0 + eighth * 8 + 0.1);
              musicNodes.push(osc);
            }
          }
          musicStep += 1;
        }, eighth * 1000);
      } else if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
        for (const osc of musicNodes) {
          try { osc.stop(); } catch { /* already stopped */ }
        }
        musicNodes = [];
      }
    },

    /** Mute or unmute everything (master gain). */
    setMuted(m) {
      muted = !!m;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
    },
  };
}
