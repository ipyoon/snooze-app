import AsyncStorage from '@react-native-async-storage/async-storage';
import { InsightsPlanner } from './src/InsightsPlanner';
import { AIPlan, AI_PLAN_STORAGE_KEY, SleepProfile, usableAIPlan, validateAIPlan } from './src/aiPlan';
import { GroupspaceScreen } from './src/GroupspaceScreen';
import { CompetitionProgress } from './src/groupspace';
import { useGroupspace } from './src/useGroupspace';
import { PhotoChallenge } from './src/PhotoChallenge';
import { toggleOrdered, advanceMission } from './src/missionSequence';
import { restWindow } from './src/restWindow';
import { ReferencePhoto, MatchLevel } from './src/photoMatch';
import { SleepTimeline } from './src/SleepTimeline';
import { alarmPoints, AlarmPoint, demoTiming } from './src/timeline';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { Accelerometer } from 'expo-sensors';
import { SoundName, soundLabels, useAlarmSignal } from './src/useAlarmSignal';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  Image,
  View,
} from 'react-native';
import {
  Candidate,
  failurePath,
  MISSION_LABEL,
  Mission,
  optimizeWakeAction,
  RiskMode,
  WakeLog,
} from './src/optimizer';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const STORAGE_KEY = 'snooze-mobile-personal-model-v1';
const SESSION_STORAGE_KEY = 'snooze-mobile-active-session-v1';

type Session = {
  aiPlan?: AIPlan;
  competition?: CompetitionProgress;
  missionOrder?: Mission[];
  missionIndex?: number;
  demoDelay?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  mathCount?: number;
  movementCount?: number;
  matchLevel?: MatchLevel;
  plannedAlarms?: AlarmPoint[];
  originalCount?: number;
  reference?: ReferencePhoto | null;
  sound?: SoundName;
  age?: number;
  id: string;
  mode: 'demo' | 'real';
  deadline: number;
  unitMs: number;
  attempt: number;
  phase: 'waiting' | 'ringing' | 'challenge' | 'done';
  decision: Candidate;
  ringAt: number;
  attemptStartedAt: number;
};

const missionOptions: Mission[] = ['math', 'shake', 'checkpoint'];

function nextTimeToday(text: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date.getTime();
}

function initialClockValue() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function clock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ChoicePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected && styles.pillSelected]}>
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, tone = 'lime' }: { label: string; onPress: () => void; tone?: 'lime' | 'dark' }) {
  return (
    <Pressable onPress={onPress} style={[styles.primaryButton, tone === 'dark' && styles.darkButton]}>
      <Text style={[styles.primaryButtonText, tone === 'dark' && styles.darkButtonText]}>{label}</Text>
    </Pressable>
  );
}

function MathChallenge({ onComplete, difficulty = 'easy', total = 5 }: { onComplete: () => void; difficulty?: 'easy' | 'medium' | 'hard'; total?: number }) {
  const questions = useMemo(() => Array.from({ length: total }, (_, index) => {
    const left = 8 + ((Date.now() + index * 7) % 18);
    const right = 3 + ((Date.now() + index * 11) % 12);
    return { left: difficulty === 'medium' ? left * 3 : left, right, operator: difficulty === 'hard' ? '×' : '+', answer: difficulty === 'hard' ? left * right : (difficulty === 'medium' ? left * 3 : left) + right };
  }), [difficulty, total]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const question = questions[index];

  const submit = () => {
    if (!answer.trim() || Number(answer) !== question.answer) {
      setMessage('Not quite. Try again.');
      setAnswer('');
      return;
    }
    if (index === questions.length - 1) return onComplete();
    setIndex((value) => value + 1);
    setAnswer('');
    setMessage('Correct. Keep going.');
  };

  return (
    <View style={styles.challengeCard}>
      <Text style={styles.eyebrow}>QUESTION {index + 1} OF {total} · {difficulty}</Text>
      <Text style={styles.mathQuestion}>{question.left} {question.operator} {question.right} = ?</Text>
      <TextInput autoFocus keyboardType="number-pad" value={answer} onChangeText={setAnswer} onSubmitEditing={submit} placeholder="Answer" placeholderTextColor="#77817a" style={styles.answerInput} />
      <Text style={styles.helperText}>{message || `Complete all ${total} to dismiss the alarm.`}</Text>
      <PrimaryButton label="Check answer" onPress={submit} />
    </View>
  );
}

function ShakeChallenge({ onComplete, total = 20 }: { onComplete: () => void; total?: number }) {
  const [count, setCount] = useState(0);
  const lastShake = useRef(0);
  const completed = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const force = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (force > 1.75 && now - lastShake.current > 250) {
        lastShake.current = now;
        setCount((value) => {
          const next = value + 1;
          if (next >= total && !completed.current) {
            completed.current = true;
            setTimeout(() => completeRef.current(), 0);
          }
          return next;
        });
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.challengeCard}>
      <Text style={styles.eyebrow}>MOVEMENT CHECK</Text>
      <Text style={styles.bigMetric}>{Math.min(count, total)} / {total}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, count / total * 100)}%` }]} /></View>
      <Text style={styles.helperText}>Shake the phone with a deliberate back-and-forth motion.</Text>
    </View>
  );
}


export default function App() {
  const [demoDelay, setDemoDelay] = useState('30');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [mathCount, setMathCount] = useState(5);
  const [movementCount, setMovementCount] = useState(20);
  const [matchLevel, setMatchLevel] = useState<MatchLevel>('relaxed');
  const [appliedAge, setAppliedAge] = useState<number | undefined>();
  const [bedtimeText, setBedtimeText] = useState('23:00');
  const [appliedBedtime, setAppliedBedtime] = useState('23:00');
  const applyBedtime = () => { if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(bedtimeText)) return Alert.alert('Check bedtime', 'Use HH:MM, such as 23:00.'); setAppliedBedtime(bedtimeText); Alert.alert('Bedtime applied', `Planned bedtime: ${bedtimeText}. Rest guidance has been recalculated; the selected alarm window stays unchanged.`); };
  const applyAge = () => { const n = Number(ageInput); if (ageInput.trim() && (!Number.isInteger(n) || n < 1 || n > 120)) return Alert.alert('Check age', 'Use a whole number from 1 to 120.'); const end = nextTimeToday(deadlineText); if (!end) return; const next = ageInput.trim() ? n : undefined; const before = restWindow(appliedAge, appliedBedtime, end, earlyWindow); const after = restWindow(next, appliedBedtime, end, earlyWindow); setAppliedAge(next); Alert.alert('Age applied', `Rest target: ${before.hours ?? 'off'} → ${after.hours ?? 'off'} hours. Suggested rest-preserving window: ${before.minutes} → ${after.minutes} minutes. Your selected ${earlyWindow}-minute alarm window is unchanged. ${before.minutes === after.minutes ? 'The window is unchanged because the maximum or minimum limit applies.' : 'Rest guidance has been recalculated.'}`); };
  const [sound, setSound] = useState<SoundName>('chime');
  const [reference, setReference] = useState<ReferencePhoto | null>(null);
  const [referenceSetup, setReferenceSetup] = useState(false);
  const [pendingMode, setPendingMode] = useState<'demo' | 'real' | null>(null);
  const [bedtime, setBedtime] = useState<number | null>(null);
  const [showSessionGraph, setShowSessionGraph] = useState(false);
  const [ageInput, setAgeInput] = useState('');
  const [volume, setVolume] = useState(0.8);
  const [vibrate, setVibrate] = useState(true);
  const [testingSound, setTestingSound] = useState(false);
  const [signalMuted, setSignalMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [tab, setTab] = useState<'plan' | 'model' | 'history' | 'sleep' | 'groups'>('plan');
  const [deadlineText, setDeadlineText] = useState(initialClockValue);
  const [earlyWindow, setEarlyWindow] = useState(20);
  const [riskMode, setRiskMode] = useState<RiskMode>('balanced');
  const [missions, setMissions] = useState<Mission[]>(['math']);
  const [logs, setLogs] = useState<WakeLog[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());
  const groupspace = useGroupspace();
  const [appliedAIPlan, setAppliedAIPlan] = useState<AIPlan | null>(null);
  const sleepProfile: SleepProfile = { age: appliedAge ?? null, bedtime: appliedBedtime, wakeTime: deadlineText, maxWindowMinutes: earlyWindow, missionOrder: missions, riskMode };
  const activeAIPlan = usableAIPlan(appliedAIPlan, sleepProfile, now);
  const plannedWindow = activeAIPlan?.plan.windowMinutes ?? earlyWindow;
  const eventBusy = useRef(false);
  const progressRef = useRef(0);
  const noticeIds = useRef<string[]>([]);

  const reportError = (reason: unknown) => Alert.alert('Something needs attention', reason instanceof Error ? reason.message : 'Please try again.');
  const alarmActive = !!session && ['ringing', 'challenge'].includes(session.phase) && !signalMuted;
  useAlarmSignal(alarmActive || testingSound, volume, vibrate, reportError, session && session.phase !== 'done' ? (session.sound ?? sound) : sound);
  useEffect(() => {
    AsyncStorage.getItem(AI_PLAN_STORAGE_KEY).then(raw => {
      if (raw) { try { setAppliedAIPlan(JSON.parse(raw)); } catch { /* Invalid recommendations fall back to the on-device plan. */ } }
    }).catch(reportError);
    AsyncStorage.getItem('snooze-bedtime').then(raw => { if (raw && Number.isFinite(Number(raw))) setBedtime(Number(raw)); }).catch(reportError);
    AsyncStorage.getItem('snooze-reference').then(raw => {
      if (!raw) return;
      try { const photo = JSON.parse(raw); if (photo.uri && photo.fingerprint?.gray?.length === 256) setReference(photo); } catch { /* Retake reference if storage is malformed. */ }
    }).catch(reportError);
  }, []);
  useEffect(() => {
    if (!testingSound) return;
    const timer = setTimeout(() => setTestingSound(false), 5000);
    return () => clearTimeout(timer);
  }, [testingSound]);

  const clearNotifications = async () => {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(notifications.filter(n => n.content.data?.session === 'snooze-mobile').map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    noticeIds.current = [];
  };

  useEffect(() => {
    AsyncStorage.getItem('snooze-mobile-profile').then(raw => setProfile(raw)).catch(reportError).finally(() => setReady(true));
    AsyncStorage.getItem('snooze-mobile-settings').then(raw => {
      if (!raw) return;
      try {
        const value = JSON.parse(raw);
        if (typeof value.time === 'string') setDeadlineText(value.time);
        if (value.sound in soundLabels) setSound(value.sound); else if (['arcade','piano'].includes(value.sound)) setSound('sunrise');
        if (typeof value.age === 'string') { setAgeInput(value.age); const n = Number(value.age); if (Number.isInteger(n) && n > 0 && n <= 120) setAppliedAge(n); }
        if (/^\d+$/.test(value.demoDelay) && +value.demoDelay >= 1 && +value.demoDelay <= 3600) setDemoDelay(value.demoDelay);
        if (['easy','medium','hard'].includes(value.difficulty)) setDifficulty(value.difficulty);
        if ([3,5,10].includes(value.mathCount)) setMathCount(value.mathCount);
        if ([10,20,30,40].includes(value.movementCount)) setMovementCount(value.movementCount);
        if (['relaxed','balanced','strict'].includes(value.matchLevel)) setMatchLevel(value.matchLevel);
        if (typeof value.bedtimeText === 'string') { setBedtimeText(value.bedtimeText); setAppliedBedtime(value.bedtimeText); }
        if ([0.4, 0.8, 1].includes(value.volume)) setVolume(value.volume);
        if (typeof value.vibrate === 'boolean') setVibrate(value.vibrate);
        if ([10, 20, 30].includes(value.window)) setEarlyWindow(value.window);
        if (['gentle', 'balanced', 'strict'].includes(value.mode)) setRiskMode(value.mode);
        if (Array.isArray(value.missions) && value.missions.length && value.missions.every((m: Mission) => missionOptions.includes(m))) setMissions(value.missions);
      } catch { /* Default settings remain usable. */ }
    }).catch(reportError);
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try { const rows = JSON.parse(raw); if (Array.isArray(rows)) setLogs(rows.filter(row => row && typeof row.contextKey === 'string' && missionOptions.includes(row.mission) && ['verified', 'snoozed', 'timeout'].includes(row.outcome))); } catch { /* Ignore corrupt local demo state. */ }
    }).catch(reportError);
    AsyncStorage.getItem(SESSION_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Session;
        if (saved.deadline > Date.now() || saved.phase === 'challenge') { progressRef.current = saved.missionIndex ?? 0; setSession({ ...saved, sound: saved.sound && saved.sound in soundLabels ? saved.sound : 'sunrise' }); }
        else {
          if (saved.competition) setSession({ ...saved, phase: 'done', competition: { ...saved.competition, endedAt: saved.competition.endedAt ?? Date.now() } });
          void AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(reportError);
        }
      } catch { AsyncStorage.removeItem(SESSION_STORAGE_KEY); }
    }).catch(reportError);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (session && session.phase !== 'done') activateKeepAwakeAsync('wakewise-alarm').catch(reportError);
    else deactivateKeepAwake('wakewise-alarm');
    return () => { deactivateKeepAwake('wakewise-alarm'); };
  }, [session?.phase]);
  useEffect(() => {
    if (!session || session.phase !== 'waiting' || now < session.ringAt) return;
    setSignalMuted(false);
    setShowSessionGraph(false);
    progressRef.current = 0;
    const ringing: Session = { ...session, missionIndex: 0, phase: 'ringing', attemptStartedAt: Date.now() };
    setSession(ringing);
    void AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ringing)).catch(reportError);
  }, [now, session]);

  useEffect(() => {
    if (!session || session.phase !== 'ringing') return;
    if (now >= Math.min(session.deadline, session.attemptStartedAt + 2 * session.unitMs)) void recordAndRetry('timeout');
  }, [now]);

  const competitionHasRung = !!session?.competition && now >= session.competition.firstRingAt;
  useEffect(() => {
    if (groupspace.ready && session && competitionHasRung) {
      void groupspace.record(session).catch(() => undefined);
    }
  }, [session, groupspace.ready, groupspace.record, competitionHasRung]);

  const applyAIPlan = async (plan: AIPlan | null) => {
    if (plan) {
      const checked = validateAIPlan(plan, sleepProfile);
      await AsyncStorage.setItem(AI_PLAN_STORAGE_KEY, JSON.stringify(checked));
      setAppliedAIPlan(checked);
    } else {
      await AsyncStorage.removeItem(AI_PLAN_STORAGE_KEY);
      setAppliedAIPlan(null);
    }
  };

  const persistLogs = async (next: WakeLog[]) => {
    setLogs(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const scheduleNotification = async (decision: Candidate, ringAt: number) => {
    // Expo Go cannot bundle our notification sound into its own native binary.
    const notificationSound = Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? 'default' : sound === 'chime' ? 'alarm.wav' : `${sound}.wav`;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(`snooze-v3-${sound}-${vibrate ? 'buzz' : 'quiet'}`, {
        name: 'WakeWise alarms',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        sound: notificationSound,
        enableVibrate: vibrate,
      });
    }
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Notifications are off', 'The schedule is saved, but WakeWise cannot alert you while it is in the background until notifications are enabled.');
      return;
    }
    const identifier = await Notifications.scheduleNotificationAsync({
      content: { title: 'Snooze · Your morning is ready', body: `${MISSION_LABEL[decision.mission]} is waiting. Open Snooze to finish your check.`, sound: notificationSound, data: { session: 'snooze-mobile' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Math.max(Date.now() + 1000, ringAt)),
        channelId: `snooze-v3-${sound}-${vibrate ? 'buzz' : 'quiet'}`,
      },
    });
    noticeIds.current.push(identifier);
  };

  const startSession = async (mode: 'demo' | 'real', newReference?: ReferencePhoto) => {
    if (eventBusy.current) return;
    if (missions.includes('checkpoint') && !newReference && (mode !== 'demo' || !reference)) {
      setPendingMode(mode); setReferenceSetup(true); return;
    }
    eventBusy.current = true;
    try {
    setTestingSound(false);
    const age = appliedAge;
    if (mode === 'demo' && (!/^\d+$/.test(demoDelay) || +demoDelay < 1 || +demoDelay > 3600)) return Alert.alert('Demo delay', 'Enter 1–3600 whole seconds.');
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(appliedBedtime)) return Alert.alert('Bedtime', 'Use HH:MM, for example 23:00.');
    if (age !== undefined && (!Number.isInteger(age) || age < 1 || age > 120)) return Alert.alert('Check your age', 'Enter a whole number from 1 to 120, or leave it blank.');
    if (!missions.length) return Alert.alert('Choose a challenge', 'Enable at least one wake-up challenge.');
    const selectedAI = usableAIPlan(appliedAIPlan, sleepProfile, Date.now());
    const effectiveWindow = selectedAI?.plan.windowMinutes ?? earlyWindow;
    const unitMs = mode === 'demo' ? 15000 : 60_000;
    let deadline = mode === 'demo' ? Date.now() + effectiveWindow * unitMs : nextTimeToday(deadlineText);
    if (!deadline) return Alert.alert('Invalid time', 'Use 24-hour HH:MM format, such as 07:30.');
    const windowStart = mode === 'demo' ? Date.now() : Math.max(Date.now(), deadline - effectiveWindow * unitMs);
    const remaining = mode === 'demo' ? effectiveWindow : Math.min(effectiveWindow, Math.floor((deadline - windowStart) / unitMs));
    if (remaining < 2) return Alert.alert('A little more time', 'Choose a deadline at least two minutes from now.');
    const decision = optimizeWakeAction({ retryWaitMinutes: selectedAI?.plan.retryWaitMinutes, paced: true, age, remainingMinutes: remaining, attempt: 0, enabledMissions: missions, logs: logs.filter((row) => row.mode === mode), riskMode })[0];
    if (!decision) return;
    let ringAt = windowStart + decision.waitMinutes * unitMs;
    if (mode === 'demo') { const timing = demoTiming(Date.now(), remaining, decision.waitMinutes, unitMs, Number(demoDelay)); ringAt = timing.ringAt; deadline = timing.deadline; }
    const path = failurePath({ retryWaitMinutes: selectedAI?.plan.retryWaitMinutes, paced: true, age, remainingMinutes: remaining, attempt: 0, enabledMissions: missions, logs: logs.filter(row => row.mode === mode), riskMode });
    const plannedAlarms = alarmPoints(path, ringAt, unitMs);
    const nextSession: Session = { aiPlan: selectedAI ?? undefined, competition: { firstRingAt: ringAt, snoozes: 0, timeouts: 0 }, missionOrder: [...missions], missionIndex: 0, difficulty, mathCount, movementCount, matchLevel, demoDelay: Number(demoDelay), reference: newReference ?? reference, sound, originalCount: plannedAlarms.length, plannedAlarms, age, id: id(), mode, deadline, unitMs, attempt: 0, phase: 'waiting', decision, ringAt, attemptStartedAt: 0 };
    setNow(Date.now()); setShowSessionGraph(false);
    setSession(nextSession);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setTab('plan');
    await AsyncStorage.setItem('snooze-mobile-settings', JSON.stringify({ time: deadlineText, window: earlyWindow, mode: riskMode, missions, age: appliedAge?.toString() ?? '', volume, vibrate, sound, demoDelay, difficulty, mathCount, movementCount, matchLevel, bedtimeText: appliedBedtime }));
    if (mode === 'real') await scheduleNotification(decision, ringAt);
    } catch (error) { reportError(error); } finally { eventBusy.current = false; }
  };

  const recordAndRetry = async (outcome: 'snoozed' | 'timeout') => {
    if (!session || eventBusy.current || !['ringing', 'challenge'].includes(session.phase)) return;
    eventBusy.current = true;
    try {
    setSignalMuted(true);
    const retried: Session = { ...session, competition: session.competition ? {
      ...session.competition,
      snoozes: session.competition.snoozes + (outcome === 'snoozed' ? 1 : 0),
      timeouts: session.competition.timeouts + (outcome === 'timeout' ? 1 : 0),
    } : undefined };
    setSession(retried);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(retried));
    if (groupspace.ready) await groupspace.record(retried).catch(reportError);
    const endUnverified = async () => {
      const ended: Session = { ...retried, phase: 'done', competition: retried.competition ? { ...retried.competition, endedAt: Date.now() } : undefined };
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ended));
      if (groupspace.ready) await groupspace.record(ended).catch(reportError);
      if (session.mode === 'real') await clearNotifications();
      setSession(ended);
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    };
    const log: WakeLog = {
      id: id(), at: Date.now(), mode: session.mode, mission: session.decision.mission,
      contextKey: session.decision.contextKey + ((session.missionOrder?.length ?? 1) > 1 ? `|sequence:${session.missionOrder!.join('>')}` : ''), outcome,
      responseSeconds: Math.max(0, Math.round((Date.now() - session.attemptStartedAt) / 1000)),
      waitMinutes: session.decision.waitMinutes, attempt: session.attempt,
    };
    const nextLogs = [...logs, log];
    await persistLogs(nextLogs);
    const nextAttempt = session.attempt + 1;
    const remaining = Math.floor((session.deadline - Date.now()) / session.unitMs);
    if (remaining < 2 || nextAttempt >= (session.aiPlan ? session.aiPlan.plan.retryWaitMinutes.length + 1 : 4)) {
      return await endUnverified();
    }
    const decision = optimizeWakeAction({ retryWaitMinutes: session.aiPlan?.plan.retryWaitMinutes, paced: true, age: session.age, remainingMinutes: remaining, attempt: nextAttempt, enabledMissions: session.missionOrder ?? missions, logs: nextLogs.filter((row) => row.mode === session.mode), riskMode })[0];
    if (!decision) {
      return await endUnverified();
    }
    const ringAt = Date.now() + decision.waitMinutes * session.unitMs;
    const path = failurePath({ retryWaitMinutes: session.aiPlan?.plan.retryWaitMinutes, paced: true, age: session.age, remainingMinutes: remaining, attempt: nextAttempt, enabledMissions: session.missionOrder ?? missions, logs: nextLogs.filter(row => row.mode === session.mode), riskMode });
    const plannedAlarms = [...(session.plannedAlarms ?? []).filter(p => p.number <= nextAttempt), ...alarmPoints(path, ringAt, session.unitMs, nextAttempt)];
    const nextSession: Session = { ...retried, missionIndex: 0, plannedAlarms, attempt: nextAttempt, phase: 'waiting', decision, ringAt, attemptStartedAt: 0 };
    setSession(nextSession);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    if (session.mode === 'real') await scheduleNotification(decision, ringAt);
    } catch (error) { reportError(error); } finally { eventBusy.current = false; }
  };

  const completeMission = async (expectedIndex: number) => {
    if (!session || eventBusy.current || session.phase !== 'challenge') return;
    if (expectedIndex !== (session.missionIndex ?? 0) || expectedIndex !== progressRef.current) return;
    eventBusy.current = true;
    try {
    const order = session.missionOrder ?? [session.decision.mission];
    const progress = advanceMission(order, expectedIndex);
    if (!progress.complete) {
      progressRef.current = progress.nextIndex;
      const next = { ...session, missionIndex: progress.nextIndex };
      setSession(next);
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      return;
    }
    progressRef.current = -1;
    setSignalMuted(true);
    const finishedAt = Date.now();
    const verified: Session = { ...session, phase: 'done', competition: session.competition ? { ...session.competition, completedAt: finishedAt } : undefined };
    setSession(verified);
    setTab('groups');
    if (session.mode === 'real') await clearNotifications().catch(reportError);
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(verified));
    if (groupspace.ready) await groupspace.record(verified).catch(reportError);
    const log: WakeLog = {
      id: id(), at: Date.now(), mode: session.mode, mission: session.decision.mission,
      contextKey: session.decision.contextKey + ((session.missionOrder?.length ?? 1) > 1 ? `|sequence:${session.missionOrder!.join('>')}` : ''), outcome: 'verified',
      responseSeconds: Math.max(0, Math.round((Date.now() - session.attemptStartedAt) / 1000)),
      waitMinutes: session.decision.waitMinutes, attempt: session.attempt,
    };
    await persistLogs([...logs, log]);
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) { reportError(error); } finally { eventBusy.current = false; }
  };

  const cancelSession = () => Alert.alert('End this morning?', 'Your remaining Snooze alerts will be cancelled. An unfinished check earns no group rank.', [
    { text: 'Keep going', style: 'cancel' },
    { text: 'End session', style: 'destructive', onPress: async () => {
      if (!session || eventBusy.current) return;
      eventBusy.current = true;
      setSignalMuted(true);
      setTestingSound(false);
      try {
        const ended: Session = { ...session, phase: 'done', competition: session.competition ? { ...session.competition, endedAt: Date.now() } : undefined };
        // Leave the alarm screen immediately, even if persistence fails.
        setSession(null);
        await clearNotifications().catch(reportError);
        // Ending before the first ring does not create a daily result.
        if (groupspace.ready) await groupspace.record(ended).catch(reportError);
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      } catch (error) { reportError(error); }
      finally { eventBusy.current = false; }
    } },
  ]);

  const toggleMission = (mission: Mission) => setMissions((current) => toggleOrdered(current, mission));

  const graphDeadline = nextTimeToday(deadlineText) ?? Date.now() + earlyWindow*60000;
  const rest = restWindow(appliedAge, appliedBedtime, graphDeadline, earlyWindow);
  const graphStart = graphDeadline - plannedWindow*60000;
  const graphRemaining = Math.max(0, Math.min(plannedWindow, Math.floor((graphDeadline-graphStart)/60000)));
  const graphAge = appliedAge;
  const graphPath = missions.length ? failurePath({ retryWaitMinutes: activeAIPlan?.plan.retryWaitMinutes, paced: true, age: graphAge, remainingMinutes: graphRemaining, attempt: 0, enabledMissions: missions, logs: logs.filter(row=>row.mode==='real'), riskMode }) : [];
  const graphFirst = graphStart + (graphPath[0]?.waitMinutes ?? 0)*60000;
  const graphPoints = alarmPoints(graphPath, graphFirst, 60000);

  if (referenceSetup) return <View style={styles.app}><ScrollView contentContainerStyle={styles.content}><PhotoChallenge onSaved={async photo => {
    await AsyncStorage.setItem('snooze-reference', JSON.stringify(photo));
    setReference(photo); setReferenceSetup(false);
    const mode = pendingMode; setPendingMode(null);
    if (mode) await startSession(mode, photo);
  }} onCancel={() => { setReferenceSetup(false); setPendingMode(null); }} /></ScrollView></View>;

  if (!ready) return <View style={[styles.app, styles.centered]}><ActivityIndicator color="#7062b5" /><Text>Preparing your morning…</Text></View>;
  if (profile === null) return (
    <KeyboardAvoidingView style={styles.welcome} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.welcomeContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.welcomeBrand}>snooze<Text style={{ color: '#cebafb' }}>.</Text></Text>
        <View style={styles.orbit}><View style={styles.moon}><View style={styles.moonCutout} /></View><Text style={styles.star}>✦</Text><Text style={styles.starSmall}>✧</Text></View>
        <Text style={styles.welcomeTitle}>A softer start.{'\n'}A brighter day.</Text>
        <Text style={styles.welcomeCopy}>One wake-up time. A morning that learns what works for you.</Text>
        <Text style={styles.eyebrowLight}>WHAT SHOULD WE CALL YOU?</Text>
        <TextInput accessibilityLabel="Your name" style={styles.nameInput} placeholder="Your first name" placeholderTextColor="#aaa1bd" value={nameInput} onChangeText={setNameInput} autoCapitalize="words" maxLength={40} />
        <PrimaryButton label="Make mornings mine  →" onPress={() => {
          const value = nameInput.trim();
          if (!value) return Alert.alert('Welcome', 'Enter your first name to get started.');
          AsyncStorage.setItem('snooze-mobile-profile', value).then(() => setProfile(value)).catch(reportError);
        }} />
        <Text style={styles.welcomeFoot}>Your profile stays on this device. No account needed.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (session && session.phase !== 'done') {
    const order = session.missionOrder ?? [session.decision.mission];
    const step = session.missionIndex ?? 0;
    const mission = order[step];
    return (
      <View style={styles.alarmScreen}>
        <StatusBar style="light" />
        <View style={styles.alarmHeader}>
          <Text style={styles.alarmBrand}>{session.mode === 'demo' ? 'DEMO · ' : ''}ALARM {session.attempt + 1} / {session.plannedAlarms?.length ?? '—'} PLANNED</Text>
          <Text style={styles.deadlineLabel}>Deadline {clock(session.deadline)}</Text>
        </View>
        {showSessionGraph ? <ScrollView style={{ marginTop: 24 }}><SleepTimeline bedtime={session.mode === 'demo' ? null : bedtime} deadline={session.deadline} points={session.plannedAlarms ?? []} demo={session.mode === 'demo'} /></ScrollView> : session.phase === 'waiting' ? (
          <View style={styles.centered}>
            <Text style={styles.waitLabel}>NEXT ADAPTIVE ALARM</Text>
            <Text style={styles.countdown}>{duration(session.ringAt - now)}</Text>
            <Text style={styles.alarmExplanation}>{session.mode === 'demo' && session.attempt === 0 ? `Demo starts after ${session.demoDelay ?? 30} seconds. Then the optimizer controls each retry.` : `${session.aiPlan ? 'Your saved plan' : 'The optimizer'} selected ${session.decision.waitMinutes} ${session.mode === 'demo' ? 'model ' : ''}minutes before your next check.`}</Text>
            <Text style={styles.probability}>{session.plannedAlarms?.length ?? session.originalCount ?? '—'} total alarms in the current plan</Text>
            <Text style={styles.alarmExplanation}>Later alarms happen only if you keep snoozing or miss a check.</Text>
            {order.length === 1 && !session.aiPlan && <Text style={styles.probability}>{Math.round(session.decision.predictedDeadlineSuccess * 100)}% modeled deadline success</Text>}
          </View>
        ) : session.phase === 'ringing' ? (
          <View style={styles.centered}>
            <Text style={styles.ringNow}>WAKE UP</Text>
            <Text style={styles.alarmExplanation}>{order.map(m => MISSION_LABEL[m]).join(' → ')} must all be completed, in order, to dismiss this alarm.</Text>
            <PrimaryButton label="Start wake-up check" onPress={() => { const next: Session = { ...session, phase: 'challenge' }; setSession(next); void AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next)).catch(reportError); }} />
            <Pressable onPress={() => recordAndRetry('snoozed')} style={styles.snoozeButton}><Text style={styles.snoozeText}>Ask optimizer for one more interval</Text></Pressable>
          </View>
        ) : (
          <View style={styles.challengeWrap}>
            <Text style={styles.alarmExplanation}>Step {step+1} of {order.length} · {MISSION_LABEL[mission]}</Text>
            <Text style={styles.alarmExplanation}>Sound and enabled vibration continue through every step. {now > session.deadline ? 'Goal time has passed—finish the sequence or use End session.' : ''}</Text>
            {mission === 'math' && <MathChallenge key={`${session.attempt}-${step}`} difficulty={session.difficulty} total={session.mathCount} onComplete={() => completeMission(step)} />}
            {mission === 'shake' && <ShakeChallenge key={`${session.attempt}-${step}`} total={session.movementCount} onComplete={() => completeMission(step)} />}
            {mission === 'checkpoint' && <ScrollView><PhotoChallenge key={`${session.attempt}-${step}`} matchLevel={session.matchLevel} reference={session.reference ?? reference} onMatched={() => completeMission(step)} /></ScrollView>}
          </View>
        )}
        {session.phase === 'waiting' && <Pressable onPress={() => setShowSessionGraph(value => !value)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: '#ddcef6' }}>{showSessionGraph ? 'Back to alarm' : 'View planned alarm graph'}</Text></Pressable>}
        <Pressable onPress={cancelSession} style={{ padding: 14, alignItems: 'center', marginBottom: 20 }}><Text style={{ color: '#cabddd' }}>End session</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View><Text style={styles.brand}>snooze.</Text><Text style={styles.tagline}>YOUR MORNING, REIMAGINED</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{profile.slice(0, 1).toUpperCase()}</Text></View>
        </View>
        <View><Text style={styles.greeting}>{tab === 'plan' ? `Rest easy, ${profile}.` : tab === 'model' ? 'A little more you.' : tab === 'groups' ? 'Rise together.' : 'Your morning story.'}</Text><Text style={styles.subGreeting}>{tab === 'plan' ? 'Let’s make tomorrow a good morning.' : tab === 'model' ? 'See how your wake-up plan comes together.' : tab === 'groups' ? 'Your people. A little accountability. A better morning.' : 'Small steps. Better starts.'}</Text></View>

        {session?.phase === 'done' && (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Wake-up session finished</Text>
            <Text style={styles.successText}>The outcome updated your personal model. Successful verification cancels remaining alarms.</Text>
            <Pressable onPress={() => setSession(null)}><Text style={styles.inlineLink}>Dismiss summary</Text></Pressable>
          </View>
        )}

        {tab === 'groups' && <GroupspaceScreen key={session?.id ?? 'groups'} profile={profile} state={groupspace.state} ready={groupspace.ready} error={groupspace.error} now={now} onAddGroup={groupspace.addGroup} onOpenAlarm={() => setTab('plan')} initialPractice={session?.mode === 'demo'} />}

        {tab === 'plan' && (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}><Text style={styles.eyebrowLight}>YOUR NEXT WAKE-UP</Text><Text style={{ color: '#dcc9fc', fontSize: 25 }}>☾</Text></View>
              <TextInput value={deadlineText} onChangeText={setDeadlineText} maxLength={5} keyboardType="numbers-and-punctuation" style={styles.timeInput} />
              <Text style={styles.heroCaption}>Tap to edit · 24-hour time</Text>
              {activeAIPlan && <Text style={styles.heroCaption}>Saved {activeAIPlan.source === 'openai' ? 'AI' : 'on-device'} plan · first alarm {plannedWindow} min before goal · retry waits {activeAIPlan.plan.retryWaitMinutes.join(' / ')} min</Text>}
              <View style={styles.heroRule} />
              <Text style={styles.heroCaption}>✦  Up to {earlyWindow} minutes of room to wake gently</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sound & vibration</Text>
              <View style={styles.pillRow}>{(Object.keys(soundLabels) as SoundName[]).map(value => <ChoicePill key={value} label={soundLabels[value]} selected={sound === value} onPress={() => { setTestingSound(false); setSound(value); }} />)}</View>
              <Text style={styles.cardCopy}>A repeating chime until you finish the check or snooze. Choose the in-app sound level.</Text>
              <View style={styles.pillRow}>{([0.4, 0.8, 1] as const).map((level, index) => <ChoicePill key={level} label={['Soft', 'Clear', 'Strong'][index]} selected={volume === level} onPress={() => setVolume(level)} />)}</View>
              <View style={[styles.missionRow, { justifyContent: 'space-between', marginVertical: 12 }]}><Text style={styles.missionTitle}>Vibration</Text><Switch accessibilityLabel="Alarm vibration" value={vibrate} onValueChange={setVibrate} trackColor={{ true: '#a489c9' }} /></View>
              <PrimaryButton label={testingSound ? 'Stop sound test' : 'Test sound + vibration · 5 sec'} onPress={() => setTestingSound(value => !value)} />
              <Text style={[styles.cardCopy, { marginTop: 12, marginBottom: 0 }]}>Turn up your phone’s media volume. Vibration depends on your phone’s settings.</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personalize my mornings</Text>
              <Text style={styles.cardCopy}>Your age (optional)</Text>
              <TextInput accessibilityLabel="Age in years" keyboardType="number-pad" placeholder="e.g. 21" value={ageInput} onChangeText={setAgeInput} onSubmitEditing={applyAge} returnKeyType="done" maxLength={3} style={styles.answerInput} />
              <View style={{ marginTop: 10 }}><PrimaryButton label="Apply age" onPress={applyAge} /></View>
              <Text style={[styles.cardCopy, { marginTop: 12, marginBottom: 0 }]}>Apply your age to update the rest target and suggested window. Your Room to wake up selection controls the actual alarm times. These are planning defaults, not detected sleep cycles. Adults: 8 h; teens: 9 h; 65+: 7.5 h. Under 13: no age adjustment.</Text>
            </View>
            <View style={styles.card}><Text style={styles.cardTitle}>Planned bedtime · HH:MM</Text><TextInput value={bedtimeText} onChangeText={setBedtimeText} style={styles.answerInput} placeholder="23:00" onSubmitEditing={applyBedtime} /><View style={{ marginTop: 10, marginBottom: 10 }}><PrimaryButton label="Apply bedtime" onPress={applyBedtime} /></View><Text style={styles.cardCopy}>Applied bedtime: {appliedBedtime} · Applied age: {appliedAge ?? 'not set'} · rest target: {rest.hours ?? 'off'} hours</Text><Text style={styles.cardCopy}>Calculation: {rest.bedtime ? Math.floor((graphDeadline-rest.bedtime)/60000) : '?'} min from bedtime to deadline − {rest.hours === null ? 'no age target' : `${rest.hours*60} min rest target`}. Suggested rest-preserving window: {rest.minutes} min (minimum 2, maximum {earlyWindow}). With no age target, your selected maximum is used.</Text><Text style={styles.cardCopy}>{rest.shortage ? 'Rest target does not fit before the deadline. Your selected alarm window is still honored; sufficient sleep is not guaranteed.' : 'Rest guidance does not override your selected alarm window.'}</Text></View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Room to wake up</Text><Text style={styles.cardCopy}>How early may your first alarm begin?</Text>
              <View style={styles.pillRow}>{[10, 20, 30].map((value) => <ChoicePill key={value} label={`${value} min`} selected={earlyWindow === value} onPress={() => setEarlyWindow(value)} />)}</View><Text style={styles.cardCopy}>Active window: {plannedWindow} min (maximum {earlyWindow}) · {graphPoints.length} modeled alarms</Text>{graphPoints.map((p, i) => <Text key={p.number} style={styles.cardCopy}>#{p.number} · {clock(p.at)} · {i === 0 ? `${Math.round((graphDeadline-p.at)/60000)} min before target` : `+${Math.round((p.at-graphPoints[i-1].at)/60000)} min since previous`} · {missions.map(m => MISSION_LABEL[m]).join(' → ')}</Text>)}<Text style={styles.cardCopy}>Goal · {clock(graphDeadline)} · {graphPoints.length ? `${Math.round((graphDeadline-graphPoints[graphPoints.length-1].at)/60000)} min after last alarm to complete the final check` : 'Choose a mission and valid future time'}</Text><Text style={styles.helperText}>The active window sets the first alarm; a saved plan may choose a shorter window within your maximum. The goal stays at your next wake-up time. If the first time has already passed when you start, the session starts immediately and recalculates remaining retries. Conditional times assuming each check times out. Success cancels retries; snoozing recalculates them.</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Find your rhythm</Text>
              <View style={styles.pillRow}>{(['gentle', 'balanced', 'strict'] as RiskMode[]).map((value) => <ChoicePill key={value} label={value[0].toUpperCase() + value.slice(1)} selected={riskMode === value} onPress={() => setRiskMode(value)} />)}</View>
              <Text style={[styles.cardCopy, { marginTop: 14, marginBottom: 0 }]}>{riskMode === 'gentle' ? 'Favor a quieter morning with fewer interruptions.' : riskMode === 'strict' ? 'Give being on time the highest priority.' : 'Balance a gentle start with getting up on time.'}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>A reason to get up</Text><Text style={styles.cardCopy}>Complete every selected challenge in tap order. Deselect and reselect to move one to the end.</Text>
              <View style={styles.missionList}>{missionOptions.map((mission) => (
                <Pressable key={mission} onPress={() => toggleMission(mission)} style={styles.missionRow}>
                  <View style={[styles.checkbox, missions.includes(mission) && styles.checkboxOn]}><Text style={styles.checkmark}>{missions.includes(mission) ? missions.indexOf(mission)+1 : ''}</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.missionTitle}>{MISSION_LABEL[mission]}</Text><Text style={styles.missionMeta}>{mission === 'checkpoint' ? 'Reference photo before bed · recreate it when waking' : mission === 'shake' ? `${movementCount} deliberate movements` : `${mathCount} ${difficulty} questions`}</Text></View>
                </Pressable>
              ))}</View>
              {missions.includes('math') && <><Text style={styles.cardCopy}>Math difficulty</Text><View style={styles.pillRow}>{(['easy','medium','hard'] as const).map(v => <ChoicePill key={v} label={v} selected={difficulty === v} onPress={() => setDifficulty(v)} />)}</View><Text style={styles.cardCopy}>Questions</Text><View style={styles.pillRow}>{[3,5,10].map(v => <ChoicePill key={v} label={`${v}`} selected={mathCount === v} onPress={() => setMathCount(v)} />)}</View></>}
              {missions.includes('shake') && <><Text style={styles.cardCopy}>Movement count</Text><View style={styles.pillRow}>{[10,20,30,40].map(v => <ChoicePill key={v} label={`${v}`} selected={movementCount === v} onPress={() => setMovementCount(v)} />)}</View></>}
              {missions.includes('checkpoint') && <><Text style={styles.cardCopy}>Photo tolerance · relaxed allows more variation, but may accept the wrong object. Visual similarity, not semantic object recognition.</Text><View style={styles.pillRow}>{(['relaxed','balanced','strict'] as const).map(v => <ChoicePill key={v} label={v} selected={matchLevel === v} onPress={() => setMatchLevel(v)} />)}</View></>}
            </View>
            {missions.includes('checkpoint') && <View style={styles.card}><Text style={styles.cardTitle}>My bedtime object</Text>{reference && <Image source={{ uri: reference.uri }} style={{ width: 110, height: 110, borderRadius: 18, marginBottom: 12 }} />}<Text style={styles.cardCopy}>Use a distinctive object in good lighting. Demos reuse this saved reference. Retake it here anytime. Overnight sessions still request a fresh reference.</Text><PrimaryButton label="Take reference photo" onPress={() => { setPendingMode(null); setReferenceSetup(true); }} /></View>}
            <View style={styles.buttonGap}>
              <PrimaryButton label={`Save my morning · ${deadlineText}  →`} onPress={() => startSession('real')} tone="dark" />
              <Text style={styles.cardTitle}>Demo delay · seconds (1–3600)</Text><TextInput accessibilityLabel="Demo delay in seconds" keyboardType="number-pad" value={demoDelay} onChangeText={setDemoDelay} style={styles.answerInput} /><PrimaryButton label={`Demo · first alarm in ${demoDelay || '?'} seconds`} onPress={() => startSession('demo')} />
            </View>
            <Text style={styles.disclaimer}>Demo uses your custom delay, then runs 4× faster with 30 seconds per challenge. Keep the app open for adaptive retries.</Text>
          </>
        )}

        {tab === 'model' && <InsightsPlanner profile={sleepProfile} logs={logs} appliedPlan={appliedAIPlan} onApply={applyAIPlan}
          onEditSchedule={() => setTab('plan')} />}

        {tab === 'history' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal response log</Text><Text style={styles.cardCopy}>{logs.length} total local observations. Real and demo histories remain separate.</Text>
            {logs.length === 0 ? <Text style={styles.empty}>No attempts recorded yet. Run the demo to create the first observation.</Text> : logs.slice().reverse().slice(0, 30).map((row) => (
              <View key={row.id} style={styles.historyRow}><View style={[styles.outcomeDot, row.outcome === 'verified' ? styles.goodDot : styles.badDot]} /><View style={{ flex: 1 }}><Text style={styles.historyTitle}>{MISSION_LABEL[row.mission]} · {row.outcome}</Text><Text style={styles.planMeta}>{row.mode.toUpperCase()} · {new Date(row.at).toLocaleDateString()} · response {row.responseSeconds}s</Text></View></View>
            ))}
            {logs.length > 0 && <Pressable onPress={() => { setLogs([]); AsyncStorage.removeItem(STORAGE_KEY); }}><Text style={styles.clearLink}>Clear local history</Text></Pressable>}
          </View>
        )}
        {tab === 'sleep' && <>
          <View style={styles.card}><Text style={styles.cardTitle}>Tonight’s sleep window</Text><Text style={styles.cardCopy}>{bedtime ? `Reported bedtime: ${new Date(bedtime).toLocaleString()}` : 'Record when you go to bed to start your timeline.'}</Text><PrimaryButton label="Going to bed now" onPress={() => { const at = Date.now(); setBedtime(at); AsyncStorage.setItem('snooze-bedtime', String(at)).catch(reportError); }} /></View>
          <SleepTimeline bedtime={bedtime} deadline={graphDeadline} points={graphPoints} />
        </>}
      </ScrollView>
      <View style={styles.bottomNav}>
        {(['plan', 'groups', 'model', 'sleep', 'history'] as const).map((item, index) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item }} key={item} onPress={() => setTab(item)} style={[styles.navItem, tab === item && styles.navActive]}>
            <Text style={[styles.navIcon, tab === item && styles.activeTabText]}>{['◷', '◎', '✦', '☾', '≡'][index]}</Text>
            <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{['Alarm', 'Groups', 'Insights', 'Sleep', 'History'][index]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const colors = { ink: '#302742', paper: '#f8f5ef', lime: '#ddcef6', mint: '#ece5f5', line: '#e3dcea', coral: '#d57862' };
const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: '#302742' },
  welcomeContent: { padding: 30, paddingTop: 70, paddingBottom: 45, flexGrow: 1, justifyContent: 'center', gap: 16 },
  welcomeBrand: { color: '#fffaf1', fontSize: 34, fontWeight: '800', letterSpacing: -2 },
  orbit: { height: 210, width: 240, alignSelf: 'center', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#5e5077', borderRadius: 120, marginVertical: 18 },
  moon: { backgroundColor: '#e0caf8', width: 116, height: 116, borderRadius: 58, overflow: 'hidden', transform: [{ rotate: '-20deg' }] },
  moonCutout: { backgroundColor: '#302742', width: 108, height: 108, borderRadius: 54, position: 'absolute', top: -15, right: -22 },
  star: { position: 'absolute', right: 8, top: 24, fontSize: 35, color: '#f0d4ac' },
  starSmall: { position: 'absolute', left: 14, bottom: 28, fontSize: 27, color: '#cbb7ed' },
  welcomeTitle: { color: '#fffaf1', fontSize: 41, fontWeight: '600', letterSpacing: -1.8, lineHeight: 47 },
  welcomeCopy: { color: '#c8bfd3', fontSize: 16, lineHeight: 25, marginBottom: 12 },
  nameInput: { borderWidth: 1, borderColor: '#776789', color: '#fff', borderRadius: 18, padding: 18, fontSize: 18 },
  welcomeFoot: { color: '#bdb0cd', textAlign: 'center', fontSize: 11, lineHeight: 17 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e6daf2', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#6b5187' },
  greeting: { fontSize: 31, fontWeight: '600', letterSpacing: -1, color: '#302742', marginTop: 20 },
  subGreeting: { color: '#81768c', fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroRule: { height: 1, backgroundColor: '#5d4e70', marginTop: 20 },
  bottomNav: { flexDirection: 'row', paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 18, paddingHorizontal: 8, backgroundColor: '#fffdf9', borderTopWidth: 1, borderColor: '#e8e0ed', gap: 2 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2, borderRadius: 20, gap: 4 },
  navActive: { backgroundColor: '#eee6f7' },
  navIcon: { color: '#8e809d', fontSize: 23 },
  app: { flex: 1, backgroundColor: colors.paper },
  content: { paddingTop: Platform.OS === 'ios' ? 62 : 42, paddingHorizontal: 20, paddingBottom: 64, gap: 16 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  brand: { fontSize: 32, fontWeight: '800', letterSpacing: -2, color: colors.ink },
  tagline: { color: '#8c8095', fontSize: 8, letterSpacing: 1.8, marginTop: 2 },
  modelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mint, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  modelBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.ink },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#29a36a' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, marginBottom: -1 },
  activeTab: { borderBottomWidth: 3, borderBottomColor: colors.ink },
  tabText: { fontSize: 10, letterSpacing: 0.1, fontWeight: '700', color: '#768079' },
  activeTabText: { color: colors.ink },
  heroCard: { backgroundColor: colors.ink, borderRadius: 30, padding: 26 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#59665f', marginBottom: 8 },
  eyebrowLight: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#b7c3bb', marginBottom: 8 },
  timeInput: { color: '#fffaf1', fontSize: 76, lineHeight: 88, fontWeight: '300', letterSpacing: -4, paddingVertical: 4 },
  heroCaption: { color: '#b7c3bb', fontSize: 12, lineHeight: 18, marginTop: 12 },
  card: { backgroundColor: '#fffdf9', borderWidth: 1, borderColor: '#ece6ed', borderRadius: 24, padding: 20 },
  cardTitle: { fontSize: 19, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  cardCopy: { color: '#657068', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: colors.line, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 10 },
  pillSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  pillTextSelected: { color: '#fff' },
  missionList: { gap: 6 },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: '#aab2ac', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.lime, borderColor: colors.ink },
  checkmark: { fontSize: 14, fontWeight: '900', color: colors.ink },
  missionTitle: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  missionMeta: { color: '#748078', fontSize: 11, marginTop: 3 },
  buttonGap: { gap: 10 },
  primaryButton: { minHeight: 58, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  darkButton: { backgroundColor: colors.ink }, darkButtonText: { color: '#fff' },
  disclaimer: { color: '#6f7973', fontSize: 11, lineHeight: 17, paddingHorizontal: 4 },
  planRow: { flexDirection: 'row', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#e7e9e6' },
  planIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  planIndexText: { fontWeight: '900', color: colors.ink, fontSize: 12 },
  planTitle: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  planMeta: { color: '#78827c', fontSize: 11, marginTop: 3 },
  formulaCard: { backgroundColor: colors.ink, borderRadius: 20, padding: 20 },
  formula: { color: colors.lime, fontSize: 17, lineHeight: 26, fontWeight: '700', marginBottom: 12 },
  formulaCopy: { color: '#bbc6bf', fontSize: 12, lineHeight: 19 },
  empty: { color: '#849088', paddingVertical: 24, textAlign: 'center', lineHeight: 20 },
  historyRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#e7e9e6' },
  outcomeDot: { width: 9, height: 9, borderRadius: 5 }, goodDot: { backgroundColor: '#2ead72' }, badDot: { backgroundColor: colors.coral },
  historyTitle: { fontSize: 13, color: colors.ink, fontWeight: '700' }, clearLink: { color: '#bc4c37', fontSize: 12, fontWeight: '700', marginTop: 14 },
  successCard: { backgroundColor: colors.mint, borderRadius: 18, padding: 17 }, successTitle: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  successText: { color: '#55635b', fontSize: 12, lineHeight: 18, marginTop: 5 }, inlineLink: { color: colors.ink, fontWeight: '800', fontSize: 12, marginTop: 10 },
  alarmScreen: { flex: 1, backgroundColor: colors.ink, paddingTop: Platform.OS === 'ios' ? 62 : 42, paddingHorizontal: 22 },
  alarmHeader: { flexDirection: 'row', justifyContent: 'space-between' }, alarmBrand: { color: colors.lime, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  deadlineLabel: { color: '#aebbb2', fontSize: 11 }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 },
  waitLabel: { color: '#aebbb2', letterSpacing: 1.8, fontSize: 11, fontWeight: '800' }, countdown: { color: '#fff', fontSize: 76, fontWeight: '200', letterSpacing: -4 },
  probability: { color: colors.lime, fontSize: 12, fontWeight: '800' }, alarmExplanation: { color: '#c3cdc6', maxWidth: 320, textAlign: 'center', fontSize: 15, lineHeight: 23 },
  ringNow: { color: '#fff', fontWeight: '900', fontSize: 56, letterSpacing: -2 }, snoozeButton: { padding: 12 }, snoozeText: { color: '#aebbb2', textDecorationLine: 'underline', fontSize: 12 },
  challengeWrap: { flex: 1, justifyContent: 'center' }, challengeCard: { backgroundColor: colors.paper, borderRadius: 24, padding: 22, gap: 14, overflow: 'hidden' },
  mathQuestion: { fontSize: 44, color: colors.ink, fontWeight: '800', letterSpacing: -1 }, answerInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 15, fontSize: 22, color: colors.ink, backgroundColor: '#fff' },
  helperText: { color: '#667169', fontSize: 12, lineHeight: 18 }, bigMetric: { fontSize: 48, fontWeight: '800', color: colors.ink },
  progressTrack: { height: 12, backgroundColor: '#d9ddd9', borderRadius: 6, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: '#5dc989' },
  cameraFrame: { height: 310, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
});
