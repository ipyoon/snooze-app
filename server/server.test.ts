import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { issueGuestSession } from './guestSession';
import { createPlanHandler, createPlanServer } from './http';
import { recommend } from './recommend';
import { buildAIRequest, planOptions, SleepProfile } from '../src/aiPlan';
const profile: SleepProfile = { age: 25, bedtime: '23:00', wakeTime: '07:00', maxWindowMinutes: 20, missionOrder: ['math'], riskMode: 'balanced' };
const input = buildAIRequest(profile, []);
const token = 'test-token-which-is-at-least-24-characters';
function provider(body: unknown, status = 200): typeof fetch { return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch; }
const goodBody = () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ choiceId: planOptions(20)[0].id, summary: 'A starting recommendation.', tradeoff: 'A shorter window leaves fewer retries.' }) }] }] });
test('OpenAI request uses Responses, strict structured output, and disables response storage', async () => {
  let captured: any;
  const fetcher: typeof fetch = (async (url, init) => { assert.equal(url, 'https://api.openai.com/v1/responses'); captured = JSON.parse(init!.body as string); return new Response(JSON.stringify(goodBody())); }) as typeof fetch;
  const plan = await recommend(input, { apiKey: 'unit-test-not-a-real-key', model: 'gpt-5-mini', fetcher });
  assert.equal(captured.store, false);
  assert.equal(captured.text.format.strict, true);
  assert.equal(captured.text.format.type, 'json_schema');
  assert.equal(plan.source, 'openai');
  assert.equal(plan.observations, 0);
});
test('provider failures, refusals, incomplete output and invalid choices are rejected', async () => {
  for (const body of [{ status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ choiceId: 'invented' }) }] }] }]) {
    await assert.rejects(recommend(input, { apiKey: 'test', model: 'gpt-5-mini', fetcher: provider(body) }));
  }
  await assert.rejects(recommend(input, { apiKey: 'test', model: 'gpt-5-mini', fetcher: provider({}, 429) }), /rate-limited/);
});
test('HTTP handler authenticates and validates before provider calls; rate limits apply', async () => {
  let called = 0;
  const handler = createPlanHandler({ appToken: token, requestsPerHour: 1, generate: async request => { called++; return recommend(request, { apiKey: 'test', model: 'gpt-5-mini', fetcher: provider(goodBody()) }); } });
  const send = async (body: unknown, authorized = true) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
    req.method = 'POST'; req.url = '/v1/snooze-plan'; req.headers = { 'content-type': 'application/json', ...(authorized ? { authorization: `Bearer ${issueGuestSession(token)}` } : {}) };
    let status = 0; let raw = '';
    const res = { setHeader() {}, writeHead(code: number) { status = code; }, end(text = '') { raw = text; }, writableEnded: false } as unknown as ServerResponse;
    await handler(req, res);
    return { status, body: raw ? JSON.parse(raw) : null };
  };
  assert.equal((await send(input, false)).status, 401);
  assert.equal((await send({ ...input, consent: false })).status, 400);
  assert.equal(called, 0);
  const response = await send(input); assert.equal(response.status, 200); assert.equal(response.body.source, 'openai');
  assert.equal((await send(input)).status, 429); assert.equal(called, 1);
});
test('weak backend connection tokens are rejected', () => assert.throws(() => createPlanServer({ appToken: 'short', generate: async () => { throw new Error(); } })));
