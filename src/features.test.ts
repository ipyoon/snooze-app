import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, comparePhotos } from './photoMatch';
import { alarmPoints, demoTiming } from './timeline';
import { failurePath } from './optimizer';
import { restWindow } from './restWindow';
import { toggleOrdered, advanceMission } from './missionSequence';
test('mission selection preserves tap order and reselection moves to end', () => {
  const order=toggleOrdered(toggleOrdered(toggleOrdered([], 'shake'),'math'),'checkpoint');
  assert.deepEqual(order,['shake','math','checkpoint']);
  assert.deepEqual(toggleOrdered(toggleOrdered(order,'math'),'math'),['shake','checkpoint','math']);
});
test('only the last selected mission completes a sequence', () => {
  assert.deepEqual(advanceMission(['shake','math','checkpoint'],0),{complete:false,nextIndex:1});
  assert.deepEqual(advanceMission(['shake','math','checkpoint'],1),{complete:false,nextIndex:2});
  assert.deepEqual(advanceMission(['shake','math','checkpoint'],2),{complete:true,nextIndex:2});
  assert.equal(advanceMission(['math'],0).complete,true);
  assert.throws(()=>advanceMission([],0));
});
test('selected windows change first timestamps and retry spacing', () => {
  const schedules=[10,20,30].map(remainingMinutes=>{
    const path=failurePath({paced:true,remainingMinutes,attempt:0,enabledMissions:['math'],logs:[],riskMode:'balanced'});
    assert.equal(path[0].waitMinutes,0);
    const points=alarmPoints(path,(60-remainingMinutes)*60000,60000);
    assert.ok(points.length > 1 && points.length <= 4);
    assert.equal(points[points.length-1].at+120000,3600000);
    return points;
  });
  assert.equal(new Set(schedules.map(p=>p[0].at)).size,3);
  assert.equal(new Set(schedules.map(p=>p[1].at-p[0].at)).size,3);
});
test('custom demo delays are exact and invalid values rejected', () => {
  for (const delay of [1,45,120,3600]) assert.equal(demoTiming(1000,20,5,15000,delay).ringAt,1000+delay*1000);
  for (const delay of [0,-1,1.5,3601,NaN]) assert.throws(()=>demoTiming(0,20,5,15000,delay));
});
test('age rest targets constrain the window without inventing sleep stages', () => {
  const end=new Date(2026,8,12,7,15).getTime();
  assert.equal(restWindow(16,'23:00',end,30).minutes,2);
  assert.equal(restWindow(25,'23:00',end,30).minutes,15);
  assert.equal(restWindow(70,'23:00',end,30).minutes,30);
  assert.equal(restWindow(undefined,'23:00',end,30).minutes,30);
  assert.equal(restWindow(25,'22:00',end,30).minutes,30);
});
test('relaxed threshold accepts moderate variation rejected by strict', () => {
  const ref=pixels();
  const changed={...ref, gray:ref.gray.map((v,i)=>.65*v+Math.sin(i)*1.1)};
  assert.equal(comparePhotos(ref,changed,'relaxed').match,true);
  assert.equal(comparePhotos(ref,changed,'strict').match,false);
});
function pixels(invert = false, lift = 0) {
  const data = new Uint8Array(64*64*4);
  for (let y=0; y<64; y++) for (let x=0; x<64; x++) {
    const i=(y*64+x)*4;
    const value = (x>y ? 190 : 45);
    const n = (invert ? 235-value : value) + lift;
    data[i]=n; data[i+1]=n; data[i+2]=n; data[i+3]=255;
  }
  return fingerprint(data,64,64);
}
test('matching detailed image passes, modest brightness shift tolerated', () => {
  assert.ok(comparePhotos(pixels(),pixels()).match);
  assert.ok(comparePhotos(pixels(),pixels(false,10)).match);
});
test('different structure and uniform frames fail photo check', () => {
  assert.equal(comparePhotos(pixels(),pixels(true)).match,false);
  const blank=fingerprint(new Uint8Array(64*64*4).fill(150),64,64);
  assert.equal(comparePhotos(blank,blank).match,false);
});
test('demo begins exactly in 30 seconds; predicted attempts fit the deadline', () => {
  const path=failurePath({remainingMinutes:20,attempt:0,enabledMissions:['math'],logs:[],riskMode:'balanced'});
  const timing=demoTiming(100000,20,path[0].waitMinutes);
  assert.equal(timing.ringAt,130000);
  const points=alarmPoints(path,timing.ringAt,15000);
  assert.equal(points.length,path.length);
  assert.ok(points.every(p=>p.at+30000<=timing.deadline));
  assert.ok(points.slice(1).every((p,i)=>p.at>points[i].at));
});
