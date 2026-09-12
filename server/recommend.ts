import { SLEEP_EVIDENCE } from '../src/sleepEvidence';
import { randomUUID } from 'node:crypto';
import { AIPlan, AIPlanRequest, planOptions, plannedTimeInBed, profileKey, validateAIPlan, validateAIRequest } from '../src/aiPlan';

export type ProviderConfig = { apiKey: string; model: string; fetcher?: typeof fetch };
export async function recommend(input: unknown, config: ProviderConfig): Promise<AIPlan> {
  const request = validateAIRequest(input);
  if (!config.apiKey) throw new Error('The server needs OPENAI_API_KEY configured.');
  const options = planOptions(request.profile.maxWindowMinutes);
  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      choiceId: { type: 'string', enum: options.map(p => p.id) },
      summary: { type: 'string' }, tradeoff: { type: 'string' },
    }, required: ['choiceId', 'summary', 'tradeoff'],
  };
  const response = await (config.fetcher ?? fetch)('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model, store: false, reasoning: { effort: 'low' }, max_output_tokens: 1800,
      instructions: [
        'Use the supplied primary-study summaries as evidence. Their results are mixed and do not validate exact intervals. Do not imply stronger evidence than they report.',
        'You help a wake-up alarm app choose a tentative schedule from a supplied finite list.',
        'Pick exactly one choiceId. Never invent a candidate, probability of waking, sleep stage, sleep cycle length, or clinically optimal interval.',
        'Age and reported bedtime/wake time are context, not enough to predict sleep stages or an individual optimum. Do not diagnose or give medical treatment advice.',
        'The bedtime-to-wake interval is planned time in bed, not measured sleep. Do not claim that age alone establishes a particular snooze interval.',
        'Balance the user preference, fewer interruptions, preserving planned rest, and the limited observed alarm responses. Do not extend the maximum wake-up window or change the goal time.',
        'History buckets are observational, may mix prior schedules and challenge types, and are not randomized or calibrated success estimates. Counts are attempts, not independent mornings.',
        'With little or no history explicitly call this a starting recommendation, not a learned best schedule. Do not imply that an unseen interval has already worked.',
        'The first alarm rings windowMinutes before the wake-up goal. Each retryWaitMinutes value is the wait AFTER a snooze or timeout, not after the preceding ring.',
        'Two minutes per check are reserved only for planning; the existing app lets active challenge sequences finish without a cutoff.',
        'Return a short summary of why this is worth trying and a short tradeoff. Each string must be under 800 characters. Use plain language and no percent claims.',
      ].join(' '),
      input: JSON.stringify({ profile: request.profile, plannedTimeInBedMinutes: plannedTimeInBed(request.profile), history: request.history, evidence: SLEEP_EVIDENCE, options }),
      text: { format: { type: 'json_schema', name: 'snooze_plan_choice', strict: true, schema } },
    }),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'OpenAI rejected the server API key.' : response.status === 429 ? 'OpenAI is rate-limited or the project needs API billing.' : 'OpenAI could not generate a plan. Try again later.');
  const body = await response.json() as { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (body.status !== 'completed' || !Array.isArray(body.output)) throw new Error('The recommendation was incomplete. Try again.');
  const content = body.output.flatMap(item => item.type === 'message' ? item.content ?? [] : []);
  if (content.some(item => item.type === 'refusal')) throw new Error('A recommendation was not available for this request.');
  const text = content.filter(item => item.type === 'output_text').map(item => item.text ?? '').join('');
  let choice: { choiceId?: string; summary?: string; tradeoff?: string };
  try { choice = JSON.parse(text); } catch { throw new Error('OpenAI returned an unreadable recommendation.'); }
  if (!choice || typeof choice !== 'object') throw new Error('OpenAI returned an invalid recommendation.');
  const plan = options.find(p => p.id === choice.choiceId);
  if (!plan) throw new Error('OpenAI returned a schedule outside the allowed options.');
  const createdAt = Date.now();
  return validateAIPlan({ version: 1, id: randomUUID(), source: 'openai', model: config.model, createdAt, expiresAt: createdAt + 7 * 86400000,
    profileKey: profileKey(request.profile), plan, summary: choice.summary, tradeoff: choice.tradeoff, observations: request.history.attempts }, request.profile, createdAt);
}
