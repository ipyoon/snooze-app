import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from './planService';
import { createLocalPlan } from './localPlan';
import { buildAIRequest, validateAIPlan } from './aiPlan';
import { failurePath } from './optimizer';
import { issueGuestSession, validGuestSession } from '../server/guestSession';
const request = buildAIRequest({ age: 25, bedtime: '23:00', wakeTime: '07:00', maxWindowMinutes: 20, missionOrder: ['math'], riskMode: 'balanced' }, []);
test('Generate works with no service configuration and clearly identifies local output', async () => {
  const result = await generatePlan(request, { endpoint: '', allowCloud: true });
  assert.equal(result.plan.source, 'local');
  assert.match(result.notice, /not available/);
  assert.match(result.plan.tradeoff, /not AI-generated/);
  assert.equal(validateAIPlan(result.plan, request.profile).source, 'local');
});
test('cloud opt-out never sends a request', async () => {
  let called = false;
  const fetcher = (async () => { called = true; throw new Error(); }) as typeof fetch;
  await generatePlan(request, { endpoint: 'https://example.invalid', allowCloud: false, fetcher });
  assert.equal(called, false);
});
test('automatic session creation requires no user-entered token', async () => {
  const paths: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    paths.push(String(url));
    if (String(url).endsWith('/v1/session')) return new Response(JSON.stringify({ token: 'server-issued-guest' }));
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer server-issued-guest');
    return new Response(JSON.stringify({ ...createLocalPlan(request), source: 'openai', model: 'test-provider' }));
  }) as typeof fetch;
  const result = await generatePlan(request, { endpoint: 'https://example.invalid', allowCloud: true, fetcher });
  assert.equal(result.plan.source, 'openai'); assert.equal(paths.length, 2);
});
test('unavailable or invalid cloud output yields a usable local plan, not a setup form', async () => {
  const fetcher = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  const result = await generatePlan(request, { endpoint: 'https://example.invalid', allowCloud: true, fetcher });
  const { plan } = result.plan;
  const path = failurePath({ remainingMinutes: plan.windowMinutes, attempt: 0, enabledMissions: ['math'], logs: [], riskMode: 'balanced', retryWaitMinutes: plan.retryWaitMinutes });
  assert.equal(result.plan.source, 'local');
  assert.deepEqual(path.map(p => p.waitMinutes), [0, ...plan.retryWaitMinutes]);
});
test('sleep opportunity and preferences affect the local heuristic without making AI claims', () => {
  const normal = createLocalPlan(request);
  const shorter = createLocalPlan({ ...request, profile: { ...request.profile, bedtime: '02:00' } });
  const strict = createLocalPlan({ ...request, profile: { ...request.profile, riskMode: 'strict' } });
  assert.equal(shorter.plan.windowMinutes, 5);
  assert.ok(normal.plan.windowMinutes > shorter.plan.windowMinutes);
  assert.ok(strict.plan.windowMinutes > normal.plan.windowMinutes);
});
test('signed guest sessions expire and cannot be forged or replaced with the signing secret', () => {
  const secret = 'a-developer-only-random-signing-secret'; const now = Date.now();
  const token = issueGuestSession(secret, now);
  assert.equal(validGuestSession(token, secret, now), true);
  assert.equal(validGuestSession(token, secret, now + 16 * 60000), false);
  assert.equal(validGuestSession(token + 'x', secret, now), false);
  assert.equal(validGuestSession(secret, secret, now), false);
});
