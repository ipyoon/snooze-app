const fs = require('node:fs');
const path = require('node:path');
const rate = 22050, seconds = 8;
function save(name, sample) {
  const wav = Buffer.alloc(44 + rate * seconds * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < rate * seconds; i++) {
    const t = i / rate, fade = Math.min(1, t / .025, (seconds - t) / .025);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(t) * fade)) * 26000), 44 + i * 2);
  }
  fs.writeFileSync(path.join(__dirname, '../assets/' + name + '.wav'), wav);
}
// Original frequency-modulated siren, bounded to avoid clipping.
save('siren', t => .8 * Math.sin(2*Math.PI*760*t + 160*Math.sin(2*Math.PI*t)));
const melody = [523.25,659.25,783.99,659.25,698.46,880,783.99,659.25,587.33,698.46,880,698.46,659.25,783.99,1046.5,783.99];
save('cheerful', t => {
  const local = t % .5, note = melody[Math.floor(t/.5) % melody.length];
  const env = Math.min(1, local/.015) * Math.exp(-local*3.5) * Math.min(1,(.5-local)/.025);
  return env * (.64*Math.sin(2*Math.PI*note*t) + .12*Math.sin(4*Math.PI*note*t)) + .07*Math.sin(2*Math.PI*130.81*t);
});
