// Generates an original 4-second PCM chime. No external sound download needed.
const fs = require('node:fs');
const path = require('node:path');
const rate = 22050;
const count = rate * 4;
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
const notes = [659.25, 830.61, 987.77, 830.61];
for (let i = 0; i < count; i++) {
  const t = i / rate;
  const beat = Math.floor(t / 0.5);
  const local = t % 0.5;
  const envelope = Math.min(1, local / 0.02) * Math.exp(-local * 5) * Math.min(1, (0.5 - local) / 0.04);
  const frequency = notes[beat % notes.length];
  const value = envelope * (Math.sin(2 * Math.PI * frequency * t) * 0.65 + Math.sin(4 * Math.PI * frequency * t) * 0.12);
  wav.writeInt16LE(Math.round(value * 24000), 44 + i * 2);
}
fs.writeFileSync(path.join(__dirname, '../assets/alarm.wav'), wav);
