const { Howl, Howler } = window;

function toneData(frequency = 440, duration = 0.12, type = 'sine') {
  const rate = 22050;
  const count = Math.floor(rate * duration);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i += 1) {
    const x = i / rate;
    const wave = type === 'square' ? Math.sign(Math.sin(Math.PI * 2 * frequency * x)) : Math.sin(Math.PI * 2 * frequency * x);
    const env = Math.pow(1 - i / count, 2);
    view.setInt16(44 + i * 2, wave * env * 16000, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function musicData() {
  const rate = 22050;
  const duration = 4;
  const count = rate * duration;
  const notes = [220, 277, 330, 415, 330, 277, 247, 330];
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i += 1) {
    const t = i / rate;
    const step = Math.floor(t * 2) % notes.length;
    const local = (t * 2) % 1;
    const melody = Math.sin(Math.PI * 2 * notes[step] * t) * Math.pow(1 - local, 1.5);
    const bass = Math.sin(Math.PI * 2 * (step % 4 === 0 ? 82.4 : 110) * t) * .35;
    const beat = Math.sin(Math.PI * 2 * 62 * t) * Math.pow(1 - ((t * 4) % 1), 8) * .55;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, melody * .3 + bass + beat)) * 12000, true);
  }
  const bytes = new Uint8Array(buffer); let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.unlocked = false;
    this.sounds = {
      ui: new Howl({ src: [toneData(620, 0.08)], volume: 0.3 }),
      count: new Howl({ src: [toneData(390, 0.15, 'square')], volume: 0.35 }),
      go: new Howl({ src: [toneData(780, 0.35)], volume: 0.45 }),
      jump: new Howl({ src: [toneData(520, 0.18)], volume: 0.3 }),
      land: new Howl({ src: [toneData(150, 0.12, 'square')], volume: 0.26 }),
      hit: new Howl({ src: [toneData(105, 0.22, 'square')], volume: 0.35 }),
      finish: new Howl({ src: [toneData(880, 0.65)], volume: 0.5 }),
    };
    this.music = new Howl({ src: [musicData()], loop: true, volume: settings.music });
    this.applyVolumes();
    window.addEventListener('pointerdown', () => this.unlock(), { once: true });
    window.addEventListener('keydown', () => this.unlock(), { once: true });
  }
  unlock() { this.unlocked = true; Howler.ctx?.resume(); }
  applyVolumes() { Howler.volume(this.settings.master); this.music?.volume(this.settings.music); }
  play(name) { if (this.unlocked) { this.sounds[name]?.volume(this.settings.sfx); this.sounds[name]?.play(); } }
  startMusic() { if (this.unlocked && !this.music.playing()) this.music.play(); }
  pauseMusic() { this.music.pause(); }
  stopMusic() { this.music.stop(); }
}
