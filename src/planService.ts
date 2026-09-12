import { AIPlan, AIPlanRequest, validateAIPlan } from './aiPlan';
import { createLocalPlan } from './localPlan';

// This nonsecret URL is set by the developer when building the app.
// No backend URLs, API keys, or connection-token forms are shown to users.
export async function generatePlan(input: AIPlanRequest, options: {
  endpoint: string; allowCloud: boolean; signal?: AbortSignal; fetcher?: typeof fetch;
}): Promise<{ plan: AIPlan; notice: string }> {
  const local = (notice: string) => ({ plan: createLocalPlan(input), notice });
  if (!options.allowCloud) return local('Created on this phone. No data was sent to an AI service.');
  const base = options.endpoint.trim().replace(/\/+$/, '');
  if (!base) return local('AI recommendations are not available in this build. Here is an on-device plan you can use now.');
  const http = options.fetcher ?? fetch;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return local('AI recommendations are temporarily unavailable. An on-device plan is ready instead.');
    const sessionResponse = await http(`${base}/v1/session`, { method: 'POST', signal: options.signal });
    if (!sessionResponse.ok) throw new Error('Session unavailable');
    const session = await sessionResponse.json();
    if (typeof session.token !== 'string' || session.token.length > 2000) throw new Error('Invalid session');
    const response = await http(`${base}/v1/snooze-plan`, { method: 'POST', signal: options.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error('Recommendation unavailable');
    const body = await response.json();
    if (body.source !== 'openai') throw new Error('Unexpected plan source');
    return { plan: validateAIPlan(body, input.profile), notice: 'AI recommendation ready. Review the plan, then apply it to your next alarm.' };
  } catch (reason) {
    if (options.signal?.aborted) throw reason;
    return local('The AI service could not respond. An on-device plan is ready instead; it is not AI-generated.');
  }
}
