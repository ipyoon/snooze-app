import test from 'node:test';
import assert from 'node:assert/strict';
import { completionSeconds, dailyRankings, GroupResult, initialGroupState, localDay, parseGroupState, points, sessionResult, upsertResult, yesterday } from './groupspace';
const firstRingAt = new Date(2026, 8, 12, 7).getTime();
const day = localDay(firstRingAt);
const base: GroupResult = { sessionId: 'first', userId: 'you', day, mode: 'real', firstRingAt, snoozes: 0, timeouts: 0 };
const completed = (seconds: number, snoozes = 0): GroupResult => ({ ...base, snoozes, completedAt: firstRingAt + seconds * 1000 });

test('completed scores apply full-minute and snooze penalties, with a floor of zero', () => {
  assert.equal(points(completed(0)), 100);
  assert.equal(points(completed(59)), 100);
  assert.equal(points(completed(60)), 98);
  assert.equal(points(completed(390, 1)), 78);
  assert.equal(points(completed(10000, 10)), 0);
});
test('pending, ended, and timed-out sessions never receive a completion score', () => {
  assert.equal(points(base), undefined);
  assert.equal(points({ ...base, endedAt: firstRingAt + 30000 }), undefined);
  assert.equal(points({ ...base, timeouts: 3 }), undefined);
});
test('elapsed time remains anchored to the first alarm across retries', () => {
  const snapshot = sessionResult({ id: 'first', mode: 'real', competition: { firstRingAt, snoozes: 2, timeouts: 1, completedAt: firstRingAt + 600000 } }, firstRingAt + 600000)!;
  assert.equal(completionSeconds(snapshot), 600);
  assert.equal(points(snapshot), 60);
});
test('future alarms and legacy v8 sessions are not scored', () => {
  assert.equal(sessionResult({ id: 'old', mode: 'real' }, firstRingAt), null);
  assert.equal(sessionResult({ id: 'future', mode: 'real', competition: base }, firstRingAt - 1), null);
  assert.equal(sessionResult({ id: 'cancelled', mode: 'real', competition: { ...base, endedAt: firstRingAt - 1 } }, firstRingAt + 1), null);
});
test('first ring creates an entry at the scheduled time, not foreground resume time', () => {
  const row = sessionResult({ id: 'first', mode: 'real', competition: base }, firstRingAt + 300000)!;
  assert.equal(row.firstRingAt, firstRingAt);
  assert.equal(row.day, day);
});
test('completion after midnight belongs to the first alarm day', () => {
  const ring = new Date(2026, 8, 12, 23, 59).getTime();
  const row = sessionResult({ id: 'night', mode: 'real', competition: { firstRingAt: ring, snoozes: 0, timeouts: 0, completedAt: ring + 180000 } }, ring + 180000)!;
  assert.equal(row.day, '2026-09-12');
});
test('real and demo sessions cannot affect each other', () => {
  const results = [completed(300, 1), { ...completed(0), sessionId: 'demo', mode: 'demo' as const }];
  assert.equal(dailyRankings(results, day, 'real', 'Irene', false)[0].score, 80);
  assert.equal(dailyRankings(results, day, 'demo', 'Irene', false)[0].score, 100);
});
test('sample members appear only in the sample board', () => {
  assert.equal(dailyRankings([], day, 'real', 'Irene', false).length, 1);
  const rows = dailyRankings([], day, 'demo', 'Irene', true);
  assert.equal(rows.length, 5);
  assert.equal(rows.find(r => r.userId === 'you')?.rank, undefined);
  assert.equal(rows.find(r => r.userId === 'mina')?.score, 96);
});
test('each day is isolated', () => {
  assert.equal(dailyRankings([completed(10)], '2026-09-13', 'real', 'Irene', false)[0].score, undefined);
});
test('first session owns the day; restarting cannot replace an abandoned result', () => {
  const abandoned = { ...base, endedAt: firstRingAt + 30000 };
  const restart = { ...completed(0), sessionId: 'second', firstRingAt: firstRingAt + 60000, completedAt: firstRingAt + 60000 };
  const row = dailyRankings([restart, abandoned], day, 'real', 'Irene', false)[0];
  assert.equal(row.result?.sessionId, 'first');
  assert.equal(row.rank, undefined);
});
test('duplicate snapshots do not create duplicate entries or inflate snoozes', () => {
  const once = upsertResult([], { ...base, snoozes: 1 });
  const twice = upsertResult(once, { ...base, snoozes: 1 });
  assert.equal(twice, once);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].snoozes, 1);
});
test('stale snapshots cannot lower counts or change the original alarm', () => {
  const rows = upsertResult([{ ...base, snoozes: 2, timeouts: 1 }], { ...base, firstRingAt: firstRingAt + 200000 });
  assert.equal(rows[0].snoozes, 2);
  assert.equal(rows[0].timeouts, 1);
  assert.equal(rows[0].firstRingAt, firstRingAt);
});
test('finished and abandoned results are immutable under retries', () => {
  for (const row of [completed(390, 1), { ...base, endedAt: firstRingAt + 10000 }]) {
    const rows = [row];
    assert.equal(upsertResult(rows, completed(0)), rows);
    assert.equal(upsertResult(rows, base), rows);
  }
});
test('exact ties share rank, and faster elapsed seconds break otherwise equal scores', () => {
  const mine = { ...completed(125), mode: 'demo' as const };
  const rows = dailyRankings([mine], day, 'demo', 'Irene', true);
  assert.equal(rows.find(r => r.userId === 'you')?.rank, 1);
  assert.equal(rows.find(r => r.userId === 'mina')?.rank, 1);
  assert.equal(rows.find(r => r.userId === 'jules')?.rank, 3);
  const faster = dailyRankings([{ ...mine, completedAt: firstRingAt + 121000 }], day, 'demo', 'Irene', true);
  assert.equal(faster[0].userId, 'you');
  assert.equal(faster[1].rank, 2);
});
test('score ties favor fewer snoozes before completion speed', () => {
  const mine = { ...completed(780, 0), mode: 'demo' as const }; // 74 points: same score as Kai, fewer snoozes.
  const rows = dailyRankings([mine], day, 'demo', 'Irene', true);
  const you = rows.find(r => r.userId === 'you')!;
  const kai = rows.find(r => r.userId === 'kai')!;
  assert.equal(you.score, kai.score);
  assert.ok(you.rank! < kai.rank!);
});
test('storage round-trip retains groups, daily history and mode', () => {
  const state = { ...initialGroupState(), results: [completed(390, 1)] };
  assert.deepEqual(parseGroupState(JSON.stringify(state)), state);
  assert.deepEqual(parseGroupState(null), initialGroupState());
});
test('corrupt storage is rejected rather than silently overwritten', () => {
  assert.throws(() => parseGroupState('broken'));
  assert.throws(() => parseGroupState('{}'));
  assert.throws(() => parseGroupState(JSON.stringify({ ...initialGroupState(), results: [{ ...base, snoozes: -1 }] })));
  assert.throws(() => parseGroupState(JSON.stringify({ ...initialGroupState(), results: [{ ...base, completedAt: firstRingAt - 1 }] })));
});
test('yesterday handles month and year rollover', () => {
  assert.equal(localDay(yesterday(new Date(2026, 0, 1, 12).getTime())), '2025-12-31');
});
