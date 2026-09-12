import { Candidate } from './optimizer';
export type AlarmPoint = { at: number; mission: string; number: number };
export function alarmPoints(path: Candidate[], firstRing: number, unitMs: number, offset = 0): AlarmPoint[] {
  let at = firstRing;
  return path.map((candidate, i) => {
    if (i > 0) at += (2 + candidate.waitMinutes) * unitMs;
    return { at, mission: candidate.mission, number: offset + i + 1 };
  });
}
export function demoTiming(now: number, remaining: number, firstWait: number, unitMs = 15000, delaySeconds = 30) {
  if (!Number.isInteger(delaySeconds) || delaySeconds < 1 || delaySeconds > 3600) throw new Error('Demo delay must be 1–3600 whole seconds.');
  return { ringAt: now + delaySeconds * 1000, deadline: now + delaySeconds * 1000 + (remaining - firstWait) * unitMs };
}
