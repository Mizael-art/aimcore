/** Sons sintetizados via WebAudio (sem assets externos). */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.6;

  private ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.master!.gain.value = this.volume;
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    const ctx = this.ensure();
    if (!ctx || this.volume <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, hp = 1200) {
    const ctx = this.ensure();
    if (!ctx || this.volume <= 0) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
  }

  unlock() {
    this.ensure();
  }
  shot() {
    this.noise(0.05, 0.18, 2500);
  }
  hit() {
    this.tone(1250, 0.07, 'triangle', 0.35, 300);
  }
  headshot() {
    this.tone(1650, 0.09, 'triangle', 0.4, 500);
    this.tone(2450, 0.06, 'sine', 0.2);
  }
  body() {
    this.tone(700, 0.06, 'triangle', 0.3);
  }
  miss() {
    this.tone(220, 0.06, 'square', 0.06, -60);
  }
  tick() {
    this.tone(900, 0.03, 'sine', 0.08);
  }
  countdown(final = false) {
    this.tone(final ? 1320 : 660, final ? 0.18 : 0.1, 'sine', 0.25);
  }
  end() {
    this.tone(880, 0.12, 'sine', 0.25);
    setTimeout(() => this.tone(1320, 0.2, 'sine', 0.25), 110);
  }
  /** disparo de arma: estalo + corpo grave (rifle) ou mais seco (pistola) */
  gun(kind: 'rifle' | 'pistol' | 'knife' | 'none') {
    if (kind === 'none' || kind === 'knife') return this.shot();
    this.noise(kind === 'rifle' ? 0.09 : 0.12, 0.32, kind === 'rifle' ? 900 : 600);
    this.tone(kind === 'rifle' ? 110 : 80, kind === 'rifle' ? 0.08 : 0.12, 'triangle', 0.35, -40);
  }
  step() {
    this.noise(0.07, 0.12, 300);
    this.tone(70, 0.06, 'sine', 0.12);
  }
  jump() {
    this.noise(0.05, 0.06, 500);
  }
  land() {
    this.noise(0.1, 0.16, 200);
    this.tone(60, 0.08, 'sine', 0.15);
  }
  slash() {
    this.noise(0.14, 0.14, 2200);
  }
  stab() {
    this.noise(0.08, 0.16, 1400);
    this.tone(420, 0.08, 'triangle', 0.18, -150);
  }
  equip(kind: string) {
    if (kind === 'knife') this.tone(2400, 0.12, 'sine', 0.08, 900);
    else {
      this.tone(320, 0.04, 'square', 0.06);
      setTimeout(() => this.tone(520, 0.04, 'square', 0.06), 120);
    }
  }
  death() {
    this.tone(180, 0.35, 'sawtooth', 0.18, -120);
    this.noise(0.25, 0.2, 400);
  }
  reload() {
    this.tone(500, 0.05, 'square', 0.06);
    setTimeout(() => this.tone(380, 0.05, 'square', 0.06), 260);
  }
  streak(n: number) {
    for (let i = 0; i < Math.min(5, n); i++) setTimeout(() => this.tone(900 + i * 220, 0.08, 'sine', 0.2), i * 55);
  }
  falseStart() {
    this.tone(160, 0.25, 'sawtooth', 0.12, -40);
  }
}

export const sfx = new Sfx();
