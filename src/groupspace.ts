export type CompetitionProgress = {
  firstRingAt: number;
  snoozes: number;
  timeouts: number;
  completedAt?: number;
  endedAt?: number;
};
export type CompetitionSession = { id: string; mode: 'real' | 'demo'; competition?: CompetitionProgress };
export type GroupResult = CompetitionProgress & {
  sessionId: string;
  userId: string;
  day: string;
  mode: 'real' | 'demo';
};
export type LocalGroup = { id: string; name: string; code: string; sample: boolean };
export type GroupState = { version: 1; groups: LocalGroup[]; results: GroupResult[] };
export type Ranking = { userId: string; name: string; result?: GroupResult; score?: number; rank?: number };
export const GROUPSPACE_KEY = 'snooze-groupspace-v1';
export const SAMPLE_GROUP: LocalGroup = { id: 'sample', name: 'Early birds · sample', code: 'DEMO26', sample: true };
export function initialGroupState(): GroupState {
  return { version: 1, groups: [{ id: 'my-crew', name: 'My morning crew', code: 'LOCAL', sample: false }], results: [] };
}
export function localDay(stamp: number): string {
  const d = new Date(stamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function yesterday(stamp: number): number {
  const d = new Date(stamp); d.setDate(d.getDate() - 1); return d.getTime();
}
export function completionSeconds(result: GroupResult): number {
  return Math.max(0, Math.floor(((result.completedAt ?? result.firstRingAt) - result.firstRingAt) / 1000));
}
export function points(result: GroupResult): number | undefined {
  return result.completedAt === undefined ? undefined
    : Math.max(0, 100 - result.snoozes * 10 - Math.floor(completionSeconds(result) / 60) * 2);
}
export function prettySeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
export function sessionResult(session: CompetitionSession, at: number): GroupResult | null {
  const progress = session.competition;
  // A cancelled future alarm does not consume the day's entry. Restored v8
  // sessions have no competition metadata and are intentionally not backfilled.
  if (!progress || at < progress.firstRingAt || (progress.endedAt !== undefined && progress.endedAt < progress.firstRingAt)) return null;
  return { ...progress, sessionId: session.id, userId: 'you', day: localDay(progress.firstRingAt), mode: session.mode };
}
export function upsertResult(results: GroupResult[], result: GroupResult): GroupResult[] {
  const previous = results.find(item => item.sessionId === result.sessionId);
  if (previous?.completedAt !== undefined || previous?.endedAt !== undefined) return results;
  const next = previous ? { ...result, firstRingAt: previous.firstRingAt, day: previous.day,
    snoozes: Math.max(previous.snoozes, result.snoozes), timeouts: Math.max(previous.timeouts, result.timeouts) } : result;
  if (previous && JSON.stringify(previous) === JSON.stringify(next)) return results;
  return [...results.filter(item => item.sessionId !== result.sessionId), next];
}
export function dailyRankings(results: GroupResult[], day: string, mode: 'real' | 'demo', profile: string, sample: boolean): Ranking[] {
  const members = sample ? [{ userId: 'you', name: profile }, { userId: 'mina', name: 'Mina' },
    { userId: 'jules', name: 'Jules' }, { userId: 'kai', name: 'Kai' }, { userId: 'sora', name: 'Sora' }] : [{ userId: 'you', name: profile }];
  const combined = sample && mode === 'demo' ? [...results, ...sampleResults(day)] : results;
  const rows: Ranking[] = members.map(member => {
    // The first alarm session that reaches its first ring owns the day. Restarting
    // a session cannot erase snoozes or replace an abandoned competition entry.
    const result = combined.filter(r => r.userId === member.userId && r.day === day && r.mode === mode)
      .sort((a, b) => a.firstRingAt - b.firstRingAt || a.sessionId.localeCompare(b.sessionId))[0];
    return { ...member, result, score: result ? points(result) : undefined };
  });
  const compare = (a: Ranking, b: Ranking) => a.score === undefined ? (b.score === undefined ? 0 : 1) : b.score === undefined ? -1
    : b.score - a.score || a.result!.snoozes - b.result!.snoozes || completionSeconds(a.result!) - completionSeconds(b.result!);
  rows.sort((a, b) => compare(a, b) || a.userId.localeCompare(b.userId));
  rows.forEach((row, index) => {
    if (row.score !== undefined) row.rank = index > 0 && compare(rows[index - 1], row) === 0 ? rows[index - 1].rank : index + 1;
  });
  return rows;
}
function sampleResults(day: string): GroupResult[] {
  const firstRingAt = new Date(`${day}T07:00:00`).getTime();
  return ([['mina', 0, 125], ['jules', 0, 280], ['kai', 1, 490], ['sora', 2, 740]] as const).map(([userId, snoozes, seconds]) => ({
    sessionId: `sample-${day}-${userId}`, userId, day, mode: 'demo', firstRingAt, snoozes, timeouts: 0, completedAt: firstRingAt + seconds * 1000,
  }));
}
export function parseGroupState(raw: string | null): GroupState {
  if (!raw) return initialGroupState();
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || !Array.isArray(value.groups) || !value.groups.length || !Array.isArray(value.results)) throw new Error('Groupspace data could not be read.');
  const string = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  for (const group of value.groups) if (!group || !string(group.id) || !string(group.name) || !string(group.code) || typeof group.sample !== 'boolean') throw new Error('Invalid saved group.');
  for (const result of value.results) {
    if (!result || !string(result.sessionId) || !string(result.userId) || !/^\d{4}-\d{2}-\d{2}$/.test(result.day)
      || !['real', 'demo'].includes(result.mode) || !Number.isFinite(result.firstRingAt)
      || !Number.isInteger(result.snoozes) || result.snoozes < 0 || !Number.isInteger(result.timeouts) || result.timeouts < 0
      || (result.completedAt !== undefined && (!Number.isFinite(result.completedAt) || result.completedAt < result.firstRingAt))
      || (result.endedAt !== undefined && (!Number.isFinite(result.endedAt) || result.endedAt < result.firstRingAt))) throw new Error('Invalid saved group result.');
  }
  return value as GroupState;
}
