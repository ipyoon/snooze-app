import { AIPlan, AIPlanRequest, planOptions, plannedTimeInBed, profileKey, validateAIRequest } from './aiPlan';

/** Transparent product heuristic. This is not an LLM or a clinically validated policy. */
export function createLocalPlan(input: AIPlanRequest, now = Date.now()): AIPlan {
  const request = validateAIRequest(input);
  const { profile, history } = request;
  const lowerSleepReference = profile.age === null || profile.age < 14 ? null : profile.age < 18 ? 480 : 420;
  const limitedRest = lowerSleepReference !== null && plannedTimeInBed(profile) - profile.maxWindowMinutes < lowerSleepReference;
  const preferredWindow = limitedRest || profile.riskMode === 'gentle' ? 5 : profile.riskMode === 'strict' ? profile.maxWindowMinutes : Math.min(10, profile.maxWindowMinutes);
  const options = planOptions(profile.maxWindowMinutes);
  const cost = (option: typeof options[number]) => {
    let value = Math.abs(option.windowMinutes - preferredWindow) + option.retryWaitMinutes.length * 0.2;
    for (const wait of option.retryWaitMinutes) {
      const bucket = history.buckets.find(b => b.waitMinutes === wait && b.attempts >= 5);
      if (bucket) value -= 2 * ((bucket.verified + 1) / (bucket.attempts + 2));
    }
    return value;
  };
  const selected = [...options].sort((a, b) => cost(a) - cost(b) || a.id.localeCompare(b.id))[0];
  return {
    version: 1, id: `local-${now}`, source: 'local', model: 'on-device-heuristic-v1', createdAt: now, expiresAt: now + 7 * 86400000,
    profileKey: profileKey(profile), plan: selected, observations: history.attempts,
    summary: limitedRest ? 'Your reported rest window is short relative to general age-based sleep guidance. This plan limits early interruptions. Planned time in bed is not measured sleep.'
      : `This on-device plan uses your ${profile.riskMode} preference, schedule, and recorded responses where available. It is a starting plan to try.`,
    tradeoff: 'This is not AI-generated. The exact intervals are product defaults, not intervals proven best by research. Fewer early alarms preserve more uninterrupted time in bed but leave fewer retries.',
  };
}
