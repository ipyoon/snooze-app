import type { Mission, RiskMode, WakeLog } from './optimizer';

export const AI_PLAN_STORAGE_KEY = 'snooze-ai-plan-v1';
export type SleepProfile = {
  age: number | null;
  bedtime: string;
  wakeTime: string;
  maxWindowMinutes: number;
  missionOrder: Mission[];
  riskMode: RiskMode;
};
export type HistoryBucket = {
  waitMinutes: number;
  attempts: number;
  verified: number;
  snoozed: number;
  timedOut: number;
  meanResponseSeconds: number;
};
export type AIPlanRequest = {
  version: 1;
  consent: true;
  profile: SleepProfile;
  history: { lookbackDays: 60; attempts: number; buckets: HistoryBucket[] };
};
export type PlanOption = { id: string; windowMinutes: number; retryWaitMinutes: number[] };
export type AIPlan = {
  version: 1;
  id: string;
  source: 'openai' | 'local';
  model: string;
  createdAt: number;
  expiresAt: number;
  profileKey: string;
  plan: PlanOption;
  summary: string;
  tradeoff: string;
  observations: number;
};
const missions: Mission[] = ['math', 'shake', 'checkpoint'];
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function normalizeClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match || +match[1] > 23 || +match[2] > 59) throw new Error('Use a time in 24-hour HH:MM format.');
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}
export function validateProfile(value: unknown): SleepProfile {
  if (!record(value)) throw new Error('A sleep schedule is required.');
  if (value.age !== null && (!Number.isInteger(value.age) || (value.age as number) < 1 || (value.age as number) > 120)) throw new Error('Age must be a whole number from 1 to 120, or left blank.');
  if (typeof value.bedtime !== 'string' || typeof value.wakeTime !== 'string') throw new Error('Bedtime and wake-up time are required.');
  if (!Number.isInteger(value.maxWindowMinutes) || (value.maxWindowMinutes as number) < 5 || (value.maxWindowMinutes as number) > 30) throw new Error('Choose an alarm window from 5 to 30 minutes.');
  if (!Array.isArray(value.missionOrder) || value.missionOrder.length < 1 || value.missionOrder.length > 3 || !value.missionOrder.every(m => missions.includes(m)) || new Set(value.missionOrder).size !== value.missionOrder.length) throw new Error('Choose an ordered set of wake-up challenges.');
  if (!['gentle', 'balanced', 'strict'].includes(value.riskMode as string)) throw new Error('Choose a valid wake-up preference.');
  return { age: value.age as number | null, bedtime: normalizeClock(value.bedtime), wakeTime: normalizeClock(value.wakeTime),
    maxWindowMinutes: value.maxWindowMinutes as number, missionOrder: value.missionOrder as Mission[], riskMode: value.riskMode as RiskMode };
}
export function profileKey(profile: SleepProfile): string { return JSON.stringify(validateProfile(profile)); }
export function plannedTimeInBed(profile: SleepProfile): number {
  const minutes = (text: string) => { const [h, m] = normalizeClock(text).split(':').map(Number); return h * 60 + m; };
  return (minutes(profile.wakeTime) - minutes(profile.bedtime) + 1440) % 1440;
}

// Generate a finite set of valid schedules. The model chooses one; it cannot
// invent timestamps, alter the chosen tasks, or expand the user's alarm window.
// Two minutes per attempt are a planning allowance, not a challenge time limit.
export function planOptions(maxWindowMinutes: number): PlanOption[] {
  if (!Number.isInteger(maxWindowMinutes) || maxWindowMinutes < 5 || maxWindowMinutes > 30) throw new Error('Invalid alarm window.');
  const windows = [...new Set([5, 10, 20, maxWindowMinutes].filter(n => n <= maxWindowMinutes))];
  const result: PlanOption[] = [];
  for (const windowMinutes of windows) {
    const retries = Math.min(3, Math.floor((windowMinutes + 1) / 3) - 1);
    for (const shape of ['even', 'short-first', 'long-first'] as const) {
      const weights = Array.from({ length: retries }, (_, index) => shape === 'even' ? 1 : shape === 'short-first' ? index + 1 : retries - index);
      const budget = windowMinutes - 2 * (retries + 1);
      const weightTotal = weights.reduce((sum, n) => sum + n, 0);
      const waits = weights.map(weight => Math.min(10, 1 + Math.floor((budget - retries) * weight / weightTotal)));
      let remaining = budget - waits.reduce((sum, n) => sum + n, 0);
      const order = Array.from({ length: retries }, (_, index) => index).sort((a, b) => weights[b] - weights[a] || a - b);
      for (let step = 0; remaining > 0 && step < 100; step++) {
        const index = order[step % retries];
        if (waits[index] < 10) { waits[index]++; remaining--; }
        if (waits.every(n => n === 10)) break;
      }
      if (!result.some(p => p.windowMinutes === windowMinutes && p.retryWaitMinutes.join(',') === waits.join(','))) result.push({ id: `w${windowMinutes}-${shape}`, windowMinutes, retryWaitMinutes: waits });
    }
  }
  return result;
}

export function buildAIRequest(profile: SleepProfile, logs: WakeLog[], now = Date.now()): AIPlanRequest {
  const buckets = new Map<number, HistoryBucket>();
  // Only actual overnight attempts are sent. Names, photos, timestamps, group
  // membership, and demonstration/seed records never leave the phone here.
  const eligible = logs.filter(row => row.mode === 'real' && Number.isFinite(row.at) && row.at <= now && row.at >= now - 60 * 86400000
    && Number.isInteger(row.waitMinutes) && row.waitMinutes >= 0 && row.waitMinutes <= 60
    && Number.isFinite(row.responseSeconds) && row.responseSeconds >= 0 && row.responseSeconds <= 86400
    && ['verified', 'snoozed', 'timeout'].includes(row.outcome)).slice(-200);
  for (const row of eligible) {
    const current = buckets.get(row.waitMinutes) ?? { waitMinutes: row.waitMinutes, attempts: 0, verified: 0, snoozed: 0, timedOut: 0, meanResponseSeconds: 0 };
    current.attempts++;
    current.verified += row.outcome === 'verified' ? 1 : 0;
    current.snoozed += row.outcome === 'snoozed' ? 1 : 0;
    current.timedOut += row.outcome === 'timeout' ? 1 : 0;
    current.meanResponseSeconds += row.responseSeconds;
    buckets.set(row.waitMinutes, current);
  }
  return { version: 1, consent: true, profile: validateProfile(profile), history: { lookbackDays: 60, attempts: eligible.length,
    buckets: [...buckets.values()].sort((a, b) => a.waitMinutes - b.waitMinutes).map(b => ({ ...b, meanResponseSeconds: Math.round(b.meanResponseSeconds / b.attempts) })) } };
}

export function validateAIRequest(value: unknown): AIPlanRequest {
  if (!record(value) || value.version !== 1 || value.consent !== true || !record(value.history)) throw new Error('A valid request and consent are required.');
  const profile = validateProfile(value.profile);
  const history = value.history;
  if (history.lookbackDays !== 60 || !Number.isInteger(history.attempts) || (history.attempts as number) < 0 || (history.attempts as number) > 200 || !Array.isArray(history.buckets) || history.buckets.length > 61) throw new Error('Invalid history summary.');
  const buckets: HistoryBucket[] = history.buckets.map(b => {
    if (!record(b) || !Number.isInteger(b.waitMinutes) || (b.waitMinutes as number) < 0 || (b.waitMinutes as number) > 60
      || !Number.isInteger(b.attempts) || (b.attempts as number) < 1 || (b.attempts as number) > 200
      || !['verified', 'snoozed', 'timedOut'].every(k => Number.isInteger(b[k]) && (b[k] as number) >= 0)
      || (b.verified as number) + (b.snoozed as number) + (b.timedOut as number) !== b.attempts
      || !Number.isFinite(b.meanResponseSeconds) || (b.meanResponseSeconds as number) < 0 || (b.meanResponseSeconds as number) > 86400) throw new Error('Invalid history bucket.');
    return { waitMinutes: b.waitMinutes as number, attempts: b.attempts as number, verified: b.verified as number, snoozed: b.snoozed as number, timedOut: b.timedOut as number, meanResponseSeconds: b.meanResponseSeconds as number };
  });
  if (buckets.reduce((sum, b) => sum + b.attempts, 0) !== history.attempts || new Set(buckets.map(b => b.waitMinutes)).size !== buckets.length) throw new Error('History totals do not match.');
  return { version: 1, consent: true, profile, history: { lookbackDays: 60, attempts: history.attempts as number, buckets } };
}

export function validateAIPlan(value: unknown, profile: SleepProfile, now = Date.now()): AIPlan {
  if (!record(value) || value.version !== 1 || !['openai', 'local'].includes(value.source as string) || !record(value.plan)) throw new Error('The server returned an invalid plan.');
  if (value.profileKey !== profileKey(profile)) throw new Error('Your schedule changed. Generate a new plan.');
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt) || (value.createdAt as number) > now + 60000
    || (value.expiresAt as number) <= now || (value.expiresAt as number) > (value.createdAt as number) + 7 * 86400000) throw new Error('This recommendation has expired. Generate a new plan.');
  const optionId = value.plan.id;
  const option = planOptions(profile.maxWindowMinutes).find(p => p.id === optionId);
  if (!option || option.windowMinutes !== value.plan.windowMinutes || JSON.stringify(option.retryWaitMinutes) !== JSON.stringify(value.plan.retryWaitMinutes)) throw new Error('The recommended intervals are outside the allowed schedule.');
  if (!['id', 'model', 'summary', 'tradeoff'].every(k => typeof value[k] === 'string' && (value[k] as string).trim().length > 0 && (value[k] as string).length <= 1500)
    || !Number.isInteger(value.observations) || (value.observations as number) < 0 || (value.observations as number) > 200) throw new Error('The plan is missing required details.');
  return { version: 1, id: value.id as string, source: value.source as 'openai' | 'local', model: value.model as string, createdAt: value.createdAt as number,
    expiresAt: value.expiresAt as number, profileKey: value.profileKey as string, plan: option, summary: value.summary as string,
    tradeoff: value.tradeoff as string, observations: value.observations as number };
}
export function usableAIPlan(value: AIPlan | null, profile: SleepProfile, now: number): AIPlan | null {
  if (!value) return null;
  try { return validateAIPlan(value, profile, now); } catch { return null; }
}
