import test from 'node:test';
import assert from 'node:assert/strict';
import { AIPlan, buildAIRequest, planOptions, plannedTimeInBed, profileKey, SleepProfile, usableAIPlan, validateAIPlan, validateAIRequest, validateProfile } from './aiPlan';
import { failurePath, optimizeWakeAction, WakeLog } from './optimizer';
import { alarmPoints } from './timeline';
export const testProfile: SleepProfile = { age: 25, bedtime: '23:00', wakeTime: '07:00', maxWindowMinutes: 20, missionOrder: ['math'], riskMode: 'balanced' };
const now = Date.now();
const log = (changes: Partial<WakeLog> = {}): WakeLog => ({ id: 'private-id', at: now, mode: 'real', mission: 'math', contextKey: 'math|buffer|first|medium', outcome: 'verified', responseSeconds: 30, waitMinutes: 5, attempt: 0, ...changes });
function plan(profile = testProfile): AIPlan {
  return { version: 1, id: 'test-plan', source: 'openai', model: 'gpt-5-mini', createdAt: now, expiresAt: now + 86400000,
    profileKey: profileKey(profile), plan: planOptions(profile.maxWindowMinutes).find(p => p.id === 'w20-short-first')!, summary: 'A starting plan to try.', tradeoff: 'More interruptions than one alarm.', observations: 0 };
}
test('schedule input validation normalizes clocks and rejects impossible data', () => {
  assert.equal(validateProfile({ ...testProfile, wakeTime: '7:00' }).wakeTime, '07:00');
  for (const patch of [{ age: 0 }, { age: 1.5 }, { bedtime: '24:00' }, { maxWindowMinutes: 100 }, { missionOrder: [] }, { missionOrder: ['math', 'math'] }]) assert.throws(() => validateProfile({ ...testProfile, ...patch }));
});
test('planned time in bed handles overnight and day-sleep schedules', () => {
  assert.equal(plannedTimeInBed(testProfile), 480);
  assert.equal(plannedTimeInBed({ ...testProfile, bedtime: '09:00', wakeTime: '17:00' }), 480);
});
test('all available recommendations fit every allowed maximum window', () => {
  for (let maximum = 5; maximum <= 30; maximum++) {
    const options = planOptions(maximum);
    assert.ok(options.length > 0);
    for (const option of options) {
      assert.ok(option.windowMinutes <= maximum);
      assert.ok(option.retryWaitMinutes.length >= 1 && option.retryWaitMinutes.length <= 3);
      assert.ok(option.retryWaitMinutes.every(n => Number.isInteger(n) && n >= 1 && n <= 10));
      assert.ok(option.retryWaitMinutes.reduce((s, n) => s + n, 0) + 2 * (option.retryWaitMinutes.length + 1) <= option.windowMinutes);
    }
  }
});
test('same window offers different retry patterns, not just cosmetic explanations', () => {
  const options = planOptions(20).filter(p => p.windowMinutes === 20);
  assert.ok(new Set(options.map(p => p.retryWaitMinutes.join(','))).size >= 3);
  assert.deepEqual(options.find(p => p.id === 'w20-short-first')?.retryWaitMinutes, [2, 4, 6]);
});
test('request contains aggregate real attempts without identifiers or seed/demo data', () => {
  const request = buildAIRequest(testProfile, [log(), log({ mode: 'demo' }), log({ at: now - 61 * 86400000 }), log({ at: now + 10000 }), log({ outcome: 'snoozed', responseSeconds: 10 })], now);
  assert.equal(request.history.attempts, 2);
  assert.equal(request.history.buckets[0].meanResponseSeconds, 20);
  assert.equal(request.history.buckets[0].verified, 1);
  assert.ok(!JSON.stringify(request).includes('private-id'));
  assert.deepEqual(validateAIRequest(request), request);
});
test('server rejects missing consent and inconsistent history counts', () => {
  const request = buildAIRequest(testProfile, [log()], now);
  assert.throws(() => validateAIRequest({ ...request, consent: false }));
  assert.throws(() => validateAIRequest({ ...request, history: { ...request.history, attempts: 20 } }));
});
test('invalid or expired model plans cannot be applied', () => {
  assert.equal(validateAIPlan(plan(), testProfile, now).id, 'test-plan');
  assert.throws(() => validateAIPlan({ ...plan(), plan: { ...plan().plan, retryWaitMinutes: [99] } }, testProfile, now));
  assert.throws(() => validateAIPlan({ ...plan(), expiresAt: now - 1 }, testProfile, now));
  assert.throws(() => validateAIPlan({ ...plan(), expiresAt: now + 8 * 86400000 }, testProfile, now));
});
test('age, schedule, task order, window, or preference changes invalidate a saved plan', () => {
  for (const change of [{ age: 26 }, { bedtime: '00:00' }, { wakeTime: '08:00' }, { maxWindowMinutes: 10 }, { missionOrder: ['shake'] }, { riskMode: 'gentle' }]) {
    assert.equal(usableAIPlan(plan(), { ...testProfile, ...change } as SleepProfile, now), null);
  }
});
test('a persisted recommendation can be validated offline and re-used', () => {
  const restored = JSON.parse(JSON.stringify(plan()));
  assert.equal(usableAIPlan(restored, testProfile, now + 1000)?.id, 'test-plan');
  assert.equal(usableAIPlan(restored, testProfile, now + 2 * 86400000), null);
});
test('applied recommendation drives actual retry decisions and timeline', () => {
  const selected = plan().plan;
  const path = failurePath({ remainingMinutes: selected.windowMinutes, attempt: 0, enabledMissions: ['math'], logs: [], riskMode: 'balanced', paced: true, retryWaitMinutes: selected.retryWaitMinutes });
  assert.deepEqual(path.map(p => p.waitMinutes), [0, 2, 4, 6]);
  const points = alarmPoints(path, 0, 60000);
  assert.deepEqual(points.map(p => p.at / 60000), [0, 4, 10, 18]);
  assert.ok(points.at(-1)!.at / 60000 + 2 <= selected.windowMinutes);
});
test('late retries clamp to the remaining deadline and cannot add extra attempts', () => {
  const common = { enabledMissions: ['math'] as const, logs: [], riskMode: 'balanced' as const, retryWaitMinutes: [2, 4, 6] };
  assert.equal(optimizeWakeAction({ ...common, enabledMissions: ['math'], remainingMinutes: 4, attempt: 3 })[0].waitMinutes, 2);
  assert.deepEqual(optimizeWakeAction({ ...common, enabledMissions: ['math'], remainingMinutes: 2, attempt: 3 }), []);
  assert.throws(() => optimizeWakeAction({ ...common, enabledMissions: ['math'], remainingMinutes: 20, attempt: 4 }));
});
test('recommended waits cannot be zero, fractional, negative, or too large', () => {
  for (const waits of [[], [0], [-1], [1.5], [11], [1, 1, 1, 1]]) assert.throws(() => failurePath({ remainingMinutes: 20, attempt: 0, enabledMissions: ['math'], logs: [], riskMode: 'balanced', retryWaitMinutes: waits }));
});
