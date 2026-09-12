const fs = require('node:fs');
const path = require('node:path');
const rate = 22050, seconds = 16, tau = Math.PI * 2;
function save(name, sample) {
  const b = Buffer.alloc(44 + rate * seconds * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(rate,24); b.writeUInt32LE(rate*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(b.length-44,40);
  for(let i=0;i<rate*seconds;i++){ const t=i/rate; b.writeInt16LE(Math.round(Math.tanh(sample(t))*29000*Math.min(1,t/.02,(seconds-t)/.02)),44+i*2); }
  fs.writeFileSync(path.join(__dirname,'../assets',name+'.wav'),b);
}
const note = n => 440*2**((n-69)/12);
for(const [name,style] of [['sunrise',0]]) save(name,t=>{
  const roots=[60,57,65,67], root=roots[Math.floor(t/4)%4], step=Math.floor(t/.25), local=t%.25;
  const pitch=note(root+[0,4,7,12,7,4,14,12][step%8]+12);
  const envelope=Math.min(1,local/.008)*Math.exp(-local*(style===2?14:7));
  let lead=Math.sin(tau*pitch*t)+.3*Math.sin(tau*pitch*2*t)+.12*Math.sin(tau*pitch*3*t);
  if(style===1) lead+=.18*Math.sin(tau*pitch*5*t);
  const chord=[0,4,7].reduce((v,n)=>v+Math.sin(tau*note(root+n)*t),0)*.09;
  const beat=t%.5, kick=Math.sin(tau*(55*beat+3*(1-Math.exp(-beat*30))))*Math.exp(-beat*22)*.3;
  return .48*envelope*lead+chord+.14*Math.sin(tau*note(root-12)*t)+kick;
});
save('yelp',t=>Math.sin(tau*900*t+50*Math.sin(tau*4*t)));
save('twotone',t=>.9*Math.sin(tau*(Math.floor(t*2)%2?960:720)*t));
// Original rock riff with distorted power chords, bass and percussion.
save('rock', t => {
  const eighth=t%.25, beat=t%.5, root=[40,40,43,40,45,43,47,43][Math.floor(t/.5)%8];
  const gate=Math.min(1,eighth/.006)*Math.exp(-eighth*9);
  const guitar=[0,7,12].reduce((sum,n)=>sum+Math.sin(tau*note(root+n)*t),0);
  const noise=Math.sin(t*134123.7)*Math.sin(t*97331.3);
  const kick=Math.sin(tau*(48*beat+4*(1-Math.exp(-beat*35))))*Math.exp(-beat*25)*.55;
  const snare=Math.floor(t/.5)%2 ? noise*Math.exp(-beat*25)*.65 : 0;
  return Math.tanh(guitar*2.8)*gate*.48+Math.sin(tau*note(root-12)*t)*gate*.2+kick+snare+noise*Math.exp(-eighth*75)*.13;
});
