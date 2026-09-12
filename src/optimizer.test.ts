import assert from 'node:assert/strict';
import test from 'node:test';
import {
  failurePath,
  makeContextKey,
  makeSeedLogs,
  optimizeWakeAction,
  WakeLog,
} from './optimizer';

test('context keys use coarse, stable feature buckets', () => {
  assert.equal(makeContextKey(20, 0, 5, 'math'), 'math|buffer|first|medium');
  assert.equal(makeContextKey(7, 2, 2, 'shake'), 'shake|near|later|short');
});

test('optimizer returns finite, sorted candidates inside the deadline', () => {
  const candidates = optimizeWakeAction({
    remainingMinutes: 20,
    attempt: 0,
    enabledMissions: ['math', 'shake'],
    logs: [],
    riskMode: 'balanced',
  });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((row) => row.waitMinutes <= 18));
  assert.ok(candidates.every((row) => Number.isFinite(row.expectedCost)));
  assert.ok(candidates.every((row, index) => index === 0 || row.expectedCost >= candidates[index - 1].expectedCost));
});

test('successful personal observations increase the matching posterior', () => {
  const base = optimizeWakeAction({
    remainingMinutes: 12,
    attempt: 0,
    enabledMissions: ['math'],
    logs: [],
    riskMode: 'balanced',
  }).find((row) => row.waitMinutes === 5)!;

  const key = makeContextKey(12, 0, 5, 'math');
  const logs: WakeLog[] = Array.from({ length: 8 }, (_, index) => ({
    id: `${index}`,
    at: index,
    mode: 'real',
    mission: 'math',
    contextKey: key,
    outcome: 'verified',
    responseSeconds: 20,
    waitMinutes: 5,
    attempt: 0,
  }));
  const learned = optimizeWakeAction({
    remainingMinutes: 12,
    attempt: 0,
    enabledMissions: ['math'],
    logs,
    riskMode: 'balanced',
  }).find((row) => row.waitMinutes === 5)!;

  assert.ok(learned.predictedAttemptSuccess > base.predictedAttemptSuccess);
  assert.equal(learned.observations, 8);
});

test('failure path is bounded and consumes available time', () => {
  const path = failurePath({
    remainingMinutes: 20,
    attempt: 0,
    enabledMissions: ['math', 'shake', 'checkpoint'],
    logs: makeSeedLogs(),
    riskMode: 'strict',
  });
  assert.ok(path.length > 0 && path.length <= 4);
  assert.ok(path.reduce((used, row) => used + row.waitMinutes + 2, 0) <= 20);
});

test('invalid inputs fail closed', () => {
  assert.throws(() => optimizeWakeAction({
    remainingMinutes: 20,
    attempt: 0,
    enabledMissions: [],
    logs: [],
    riskMode: 'balanced',
  }));
});

test('age labels do not invent age-specific success probabilities at cold start', () => {
  const input = { remainingMinutes: 20, attempt: 0, enabledMissions: ['math'] as const, logs: [], riskMode: 'balanced' as const };
  const younger = optimizeWakeAction({ ...input, enabledMissions: ['math'], age: 21 });
  const older = optimizeWakeAction({ ...input, enabledMissions: ['math'], age: 70 });
  assert.equal(younger[0].waitMinutes, older[0].waitMinutes);
  assert.equal(younger[0].predictedAttemptSuccess, older[0].predictedAttemptSuccess);
  assert.ok(younger[0].contextKey.endsWith('|age:18to39'));
  assert.ok(older[0].contextKey.endsWith('|age:65plus'));
  assert.throws(() => optimizeWakeAction({ ...input, enabledMissions: ['math'], age: -1 }));
});
