import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, Linking, View } from 'react-native';
import { createLocalPlan } from './localPlan';
import { generatePlan } from './planService';
import { SLEEP_EVIDENCE } from './sleepEvidence';
import type { WakeLog } from './optimizer';
import { AIPlan, buildAIRequest, plannedTimeInBed, SleepProfile, usableAIPlan, validateAIPlan } from './aiPlan';

type Props = {
  profile: SleepProfile; logs: WakeLog[]; appliedPlan: AIPlan | null;
  onApply: (plan: AIPlan | null) => Promise<void>; onEditSchedule: () => void;
};
export function InsightsPlanner({ profile, logs, appliedPlan, onApply, onEditSchedule }: Props) {
  const [candidate, setCandidate] = useState<AIPlan | null>(null);
  const [consent, setConsent] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  let data: ReturnType<typeof buildAIRequest> | null = null;
  let validationError = '';
  try { data = buildAIRequest(profile, logs); } catch (reason) { validationError = reason instanceof Error ? reason.message : 'Check your schedule.'; }
  const applied = usableAIPlan(appliedPlan, profile, Date.now());
  const recommendation = usableAIPlan(candidate, profile, Date.now()) ?? applied;
  const active = !!recommendation && recommendation.id === applied?.id;
  const historyCount = data?.history.attempts ?? 0;

  const generate = async () => {
    if (inFlight.current || !data) return;
    setError(''); setNotice('');
    inFlight.current = true; setLoading(true);
    const controller = new AbortController(); abortRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    try {
      const result = await generatePlan(data, { endpoint: process.env.EXPO_PUBLIC_SNOOZE_API_URL ?? '', allowCloud: consent, signal: controller.signal });
      setCandidate(result.plan); setNotice(result.notice);
    } catch (reason) {
      if (timedOut) { setCandidate(createLocalPlan(data)); setNotice('AI took too long to respond. An on-device plan is ready instead; it is not AI-generated.'); }
      else setError(reason instanceof Error && reason.name === 'AbortError' ? 'The request was cancelled or timed out. Your existing plan is unchanged.'
        : reason instanceof Error ? reason.message : 'Could not create a plan. Please try again.');
    } finally { clearTimeout(timer); inFlight.current = false; setLoading(false); abortRef.current = null; }
  };
  const apply = async (plan: AIPlan | null) => {
    if (saving) return;
    setSaving(true); setError('');
    try { await onApply(plan); if (!plan) setCandidate(null); setNotice(plan ? 'Plan saved for your next alarm. It works offline.' : 'Using the original on-device plan.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the plan.'); }
    finally { setSaving(false); }
  };
  return <>
    <View style={s.card}>
      <Text style={s.eyebrow}>PERSONALIZED SNOOZE PLAN</Text><Text style={s.title}>A plan you can actually use.</Text>
      <Text style={s.copy}>Build a plan from your schedule and wake-up history. When available, AI reviews it using the research below.</Text>
      <View style={s.details}><Text style={s.detail}>Age: {profile.age ?? 'not set'}</Text><Text style={s.detail}>Bedtime: {profile.bedtime} · Wake-up goal: {profile.wakeTime}</Text><Text style={s.detail}>Maximum early-alarm window: {profile.maxWindowMinutes} minutes</Text>
        {data && <Text style={s.detail}>Planned time in bed: {Math.floor(plannedTimeInBed(data.profile) / 60)}h {plannedTimeInBed(data.profile) % 60}m</Text>}
      </View>
      <Action label="Edit age & sleep schedule in Alarm →" onPress={onEditSchedule} />
      <Text style={s.copy}>{historyCount === 0 ? 'No real attempts yet. Your first recommendation will be a starting suggestion.' : `${historyCount} real attempts from the last 60 days. This is observational history, not proof of an optimal interval.`}</Text>
      <View style={s.consent}><Text style={[s.copy, { flex: 1 }]}>Use cloud AI when available. This shares your age, schedule, and summarized alarm history with OpenAI.</Text><Switch accessibilityLabel="Allow sending schedule and summarized history to OpenAI" value={consent} onValueChange={setConsent} disabled={loading} /></View>
      <Text style={s.small}>With cloud AI off, your plan is created on this phone. Names, photos, groups, and demo history are never sent.</Text>
      {!!validationError && <Text style={s.error}>{validationError}</Text>}
      <Action primary label={loading ? 'Creating your plan…' : 'Generate my snooze plan'} disabled={loading || !!validationError || saving} onPress={generate} />
      {loading && <><ActivityIndicator color="#6b5187" /><Action label="Cancel request" onPress={() => abortRef.current?.abort()} /></>}
    </View>
    <View style={s.card}><Action label={showEvidence ? 'Hide research' : 'Research behind the recommendations'} onPress={() => setShowEvidence(!showEvidence)} />
      {showEvidence && SLEEP_EVIDENCE.map(study => <View key={study.id} style={s.details}><Text style={s.label}>{study.title}</Text><Text style={s.copy}>{study.finding}</Text><Action label="Read study ↗" onPress={() => { void Linking.openURL(study.url).catch(() => setError('Could not open the study.')); }} /></View>)}
    </View>
    {appliedPlan && !applied && <View style={s.card}><Text style={s.copy}>Your saved recommendation has expired or your schedule has changed. The original on-device planner is active until you generate and apply a matching plan.</Text></View>}
    {recommendation && <View style={s.card}>
      <Text style={s.eyebrow}>{recommendation.source === 'local' ? 'ON-DEVICE PLAN · NOT AI-GENERATED' : 'AI RECOMMENDATION'}{active ? ' · ACTIVE' : ''}</Text>
      <Text style={s.title}>First alarm: {recommendation.plan.windowMinutes} min before your goal</Text>
      {recommendation.plan.retryWaitMinutes.map((minutes, index) => <View key={index} style={s.interval}><Text style={s.intervalIndex}>{index + 1}</Text><View style={{ flex: 1 }}><Text style={s.label}>Retry wait: {minutes} minutes</Text><Text style={s.small}>After {index === 0 ? 'the first' : `retry ${index}`} snooze or timeout</Text></View></View>)}
      <Text style={s.copy}>{recommendation.summary}</Text><Text style={s.copy}>Tradeoff: {recommendation.tradeoff}</Text>
      <Text style={s.small}>Based on {recommendation.observations} real attempts · Expires {new Date(recommendation.expiresAt).toLocaleDateString()}</Text>
      <Text style={s.small}>Intervals may be shortened as the goal approaches. Active challenge sequences still continue until finished.</Text>
      {!active && <Action primary label={saving ? 'Saving…' : 'Use this plan'} disabled={saving || loading} onPress={() => apply(recommendation)} />}
      {active && <Action label="Use original on-device planner" disabled={saving} onPress={() => apply(null)} />}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.copy}>{notice}</Text>}
    <Text style={s.small}>Age and a sleep schedule cannot establish the best snooze interval or identify sleep stages. This is a recommendation to evaluate using real outcomes.</Text>
  </>;
}
function Action({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, primary && s.primary, (pressed || disabled) && { opacity: 0.55 }]}><Text style={[s.buttonText, primary && { color: '#fffaf1' }]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  card: { backgroundColor: '#fffdf9', padding: 22, borderRadius: 24, gap: 15 }, eyebrow: { color: '#6b5187', fontWeight: '700', letterSpacing: 1, fontSize: 10 }, title: { color: '#302742', fontWeight: '700', fontSize: 23, lineHeight: 30 },
  copy: { color: '#74677e', fontSize: 13, lineHeight: 21 }, details: { backgroundColor: '#f1ebf6', borderRadius: 14, padding: 16, gap: 10 }, detail: { color: '#514262', fontSize: 13, lineHeight: 21 },
  label: { color: '#302742', fontSize: 13, fontWeight: '600', lineHeight: 20 }, small: { color: '#81768c', fontSize: 11, lineHeight: 18 }, consent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { borderWidth: 1, borderColor: '#c5b7d1', color: '#302742', backgroundColor: '#fffdf9', borderRadius: 12, padding: 12, fontSize: 16 }, error: { color: '#a33131', fontSize: 13, lineHeight: 21 },
  button: { backgroundColor: '#ece5f5', padding: 15, minHeight: 44, borderRadius: 15, alignItems: 'center' }, primary: { backgroundColor: '#302742' }, buttonText: { color: '#514262', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  interval: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 7 }, intervalIndex: { width: 32, height: 32, borderRadius: 16, textAlign: 'center', paddingTop: 7, backgroundColor: '#ece5f5', color: '#6b5187', fontWeight: '700' },
});
