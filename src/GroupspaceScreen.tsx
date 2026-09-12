import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { completionSeconds, dailyRankings, GroupState, LocalGroup, localDay, prettySeconds, SAMPLE_GROUP, yesterday } from './groupspace';

type Props = {
  initialPractice?: boolean; profile: string; state: GroupState; ready: boolean; error: string; now: number;
  onAddGroup: (group: LocalGroup) => Promise<void>; onOpenAlarm: () => void;
};
export function GroupspaceScreen({ profile, state, ready, error, now, onAddGroup, onOpenAlarm, initialPractice = false }: Props) {
  const [selectedId, setSelectedId] = useState('my-crew');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [practice, setPractice] = useState(initialPractice);
  const [dialog, setDialog] = useState<'create' | 'join' | 'invite' | 'rules' | null>(null);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const group = state.groups.find(g => g.id === selectedId) ?? state.groups[0];
  const mode = group.sample || practice ? 'demo' : 'real';
  const date = localDay(day === 'today' ? now : yesterday(now));
  const rankings = useMemo(() => dailyRankings(state.results, date, mode, profile, group.sample), [state.results, date, mode, profile, group.sample]);
  const own = rankings.find(r => r.userId === 'you');
  const finished = rankings.filter(r => r.score !== undefined).length;
  const open = (kind: typeof dialog) => { setInput(''); setMessage(''); setDialog(kind); };
  const save = async () => {
    if (busy) return;
    const value = input.trim();
    if (!value) { setMessage(dialog === 'create' ? 'Enter a group name.' : 'Enter the sample code DEMO26.'); return; }
    if (dialog === 'join' && value.toUpperCase() !== SAMPLE_GROUP.code) { setMessage('Live joining is not connected yet. Use DEMO26 to explore the sample group.'); return; }
    setBusy(true);
    try {
      const next: LocalGroup = dialog === 'join' ? SAMPLE_GROUP
        : { id: `local-${Date.now()}`, name: value, code: 'LOCAL', sample: false };
      await onAddGroup(next); setSelectedId(next.id); setPractice(false); setDialog(null);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save this group.'); }
    finally { setBusy(false); }
  };

  if (!ready) return <View style={s.card}>{error ? <Text accessibilityRole="alert" style={s.error}>{error} Reopen the app to retry; existing group data has not been overwritten.</Text>
    : <><ActivityIndicator color="#6b5187" /><Text style={s.copy}>Loading your groupspace…</Text></>}</View>;

  return <>
    <View style={s.row}><Text style={s.badge}>{group.sample ? 'SAMPLE GROUP' : 'ON THIS DEVICE'}</Text><Text style={s.meta}>{mode === 'demo' ? 'Practice results' : 'Real alarm results'}</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.groupList}>
      {state.groups.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === group.id }}
        onPress={() => { setSelectedId(item.id); setPractice(false); }} style={[s.pill, item.id === group.id && s.activePill]}>
        <Text style={[s.pillText, item.id === group.id && s.activeText]}>{item.name}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={s.actions}><Button label="+ Create group" onPress={() => open('create')} /><Button label="Join with code" onPress={() => open('join')} /><Button label="Invite" onPress={() => open('invite')} /></View>
    {!group.sample && <View style={s.segment}>
      <Segment label="Real alarms" selected={!practice} onPress={() => setPractice(false)} />
      <Segment label="Practice" selected={practice} onPress={() => setPractice(true)} />
    </View>}
    <View style={s.segment}><Segment label="Today" selected={day === 'today'} onPress={() => setDay('today')} /><Segment label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} /></View>
    <View style={s.hero}>
      <Text style={s.eyebrow}>{day === 'today' ? 'YOUR MORNING, SO FAR' : 'YOUR LAST MORNING'}</Text>
      <View style={s.stats}>
        <Stat value={own?.rank ? `#${own.rank}` : '—'} label="Group rank" />
        <Stat value={own?.score?.toString() ?? '—'} label="Points / 100" />
        <Stat value={own?.result?.snoozes.toString() ?? '—'} label="Snoozes" />
      </View>
      <Text style={s.heroCopy}>{own?.score !== undefined ? 'Every good morning counts.' : own?.result?.endedAt !== undefined
        ? 'This morning ended without completing every challenge.' : 'Finish your full wake-up check to earn your place.'}</Text>
    </View>
    <View style={s.row}><Text style={s.heading}>Daily leaderboard</Text><Text style={s.meta}>{finished}/{rankings.length} finished · {date.slice(5)}</Text></View>
    <View style={s.board}>
      {rankings.map(row => <View key={row.userId} style={[s.member, row.userId === 'you' && s.you]}>
        <Text accessibilityLabel={row.rank ? `Rank ${row.rank}` : 'Unranked'} style={s.rank}>{row.rank ?? '—'}</Text>
        <View style={s.avatar}><Text style={s.initial}>{row.name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}><Text style={s.memberName}>{row.name}{row.userId === 'you' ? ' · you' : ''}</Text>
          <Text style={s.detail}>{row.score !== undefined ? `${row.result!.snoozes} snoozes · ${prettySeconds(completionSeconds(row.result!))}`
            : row.result?.endedAt !== undefined ? 'Ended without completion' : row.result ? 'Not completed' : 'No result yet'}</Text>
        </View>
        <View style={s.scoreBlock}><Text style={s.score}>{row.score ?? '—'}</Text><Text style={s.meta}>pts</Text></View>
      </View>)}
    </View>
    <Pressable accessibilityRole="button" onPress={() => open('rules')} style={s.textButton}><Text style={s.link}>How scoring works ↗</Text></Pressable>
    <View style={s.card}>
      <Text style={s.heading}>Your alarm. Your actual effort.</Text>
      <Text style={s.copy}>Snoozes are counted automatically. Your result is recorded after every selected math, movement, and photo challenge is finished.</Text>
      <Button primary label={mode === 'demo' ? 'Open Alarm to run a demo →' : 'Set up your next alarm →'} onPress={onOpenAlarm} />
      <Text style={s.meta}>{mode === 'demo' ? 'Practice uses real seconds. It never changes the real board.' : 'Your first alarm session each day sets your daily entry.'}</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Text style={s.footnote}>{group.sample ? 'Mina, Jules, Kai, and Sora are sample members. Your row uses your own completed demo sessions.'
      : 'Your groups and results save on this device. Cross-phone invitations and live member rankings need a shared backend.'}</Text>

    <Modal transparent visible={dialog !== null} animationType="slide" onRequestClose={() => { if (!busy) setDialog(null); }}>
      <View style={s.scrim}><View accessibilityViewIsModal style={s.modal}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.modalBody}>
        <Text style={s.heading}>{dialog === 'create' ? 'Create your groupspace' : dialog === 'join' ? 'Join your people' : dialog === 'invite' ? 'Bring your people along' : 'Small wins. Fair scores.'}</Text>
        {(dialog === 'create' || dialog === 'join') && <>
          <Text style={s.copy}>{dialog === 'create' ? 'Give your local group a name. Only your own real results appear until live multiplayer is connected.' : 'Use DEMO26 to join a group of sample members. Real group invitations are not connected yet.'}</Text>
          <TextInput accessibilityLabel={dialog === 'create' ? 'Group name' : 'Group code'} value={input} onChangeText={setInput}
            autoCapitalize={dialog === 'join' ? 'characters' : 'sentences'} maxLength={40} editable={!busy}
            placeholder={dialog === 'create' ? 'The morning crew' : 'DEMO26'} placeholderTextColor="#81768c" style={s.input} />
          {!!message && <Text accessibilityRole="alert" style={s.error}>{message}</Text>}
          <Button primary disabled={busy} label={busy ? 'Saving…' : dialog === 'create' ? 'Create group' : 'Join sample group'} onPress={save} />
        </>}
        {dialog === 'invite' && <><Text style={s.copy}>{group.name}</Text>
          {group.sample ? <><Text selectable style={s.code}>DEMO26</Text><Text style={s.copy}>This code opens the same sample group on another installation. It does not sync anyone’s results.</Text></>
            : <Text style={s.copy}>Your group is saved locally. A connected account service is needed to generate an invitation that friends can use across phones.</Text>}</>}
        {dialog === 'rules' && <>
          <Text style={s.rule}>100 starting points</Text><Text style={s.rule}>−10 per snooze</Text><Text style={s.rule}>−2 per full minute from the first alarm to final challenge completion</Text>
          <Text style={s.copy}>Minimum 0. Snooze intervals and timeouts stay in elapsed time. Timeouts are not counted as snooze taps. All selected missions must finish; ending a session earns no rank.</Text>
          <Text style={s.copy}>Your first session to reach its initial alarm owns that calendar day. A restarted session cannot replace it. Each day and mode has its own board. Local groups display the same personal daily result.</Text>
          <Text style={s.copy}>Ties favor fewer snoozes, then a faster finish. Exact ties share rank. Days use this device’s local date at the original alarm, even if completion is after midnight.</Text>
        </>}
        <Button disabled={busy} label="Close" onPress={() => setDialog(null)} />
      </ScrollView></View></View>
    </Modal>
  </>;
}
function Button({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, primary && s.primary, (disabled || pressed) && { opacity: 0.6 }]}><Text style={[s.buttonText, primary && s.activeText]}>{label}</Text></Pressable>;
}
function Segment({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.segmentButton, selected && s.segmentSelected]}><Text style={s.pillText}>{label}</Text></Pressable>;
}
function Stat({ value, label }: { value: string; label: string }) { return <View style={{ flex: 1 }}><Text style={s.stat}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>; }
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  badge: { backgroundColor: '#ece5f5', color: '#6b5187', fontSize: 10, letterSpacing: 1, fontWeight: '700', padding: 8, borderRadius: 8 },
  meta: { color: '#81768c', fontSize: 11, lineHeight: 18 }, groupList: { gap: 8 },
  pill: { backgroundColor: '#ece5f5', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24 }, activePill: { backgroundColor: '#302742' },
  pillText: { color: '#514262', fontWeight: '600', fontSize: 13 }, activeText: { color: '#fffaf1' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { backgroundColor: '#ece5f5', paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, minHeight: 44, alignItems: 'center' },
  buttonText: { color: '#514262', fontSize: 12, fontWeight: '700' }, primary: { backgroundColor: '#302742' },
  segment: { flexDirection: 'row', backgroundColor: '#ece5f5', borderRadius: 14, padding: 4 }, segmentButton: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 11 }, segmentSelected: { backgroundColor: '#fffdf9' },
  hero: { backgroundColor: '#302742', borderRadius: 26, padding: 24, gap: 18 }, eyebrow: { color: '#ddcef6', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 8 }, stat: { color: '#fffaf1', fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }, statLabel: { color: '#ddcef6', fontSize: 11, marginTop: 5 }, heroCopy: { color: '#ddcef6', fontSize: 12, lineHeight: 19 },
  heading: { color: '#302742', fontSize: 18, fontWeight: '700' }, board: { backgroundColor: '#fffdf9', borderRadius: 20, overflow: 'hidden' },
  member: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e3dcea' }, you: { backgroundColor: '#ece5f5' },
  rank: { width: 18, textAlign: 'center', color: '#81768c', fontSize: 13 }, avatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#e0d4ef', alignItems: 'center', justifyContent: 'center' }, initial: { color: '#6b5187', fontWeight: '700' },
  memberName: { color: '#302742', fontSize: 14, fontWeight: '600' }, detail: { color: '#74677e', fontSize: 11, lineHeight: 17, marginTop: 4 }, scoreBlock: { alignItems: 'flex-end', minWidth: 30 }, score: { color: '#302742', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  textButton: { minHeight: 44, justifyContent: 'center' }, link: { color: '#6b5187', fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: '#fffdf9', borderRadius: 24, padding: 22, gap: 14 }, copy: { color: '#74677e', fontSize: 13, lineHeight: 21 }, footnote: { color: '#81768c', fontSize: 11, lineHeight: 18, textAlign: 'center' }, error: { color: '#ad3939', fontSize: 13, lineHeight: 21 },
  scrim: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 24 }, modal: { backgroundColor: '#f8f5ef', maxHeight: '85%', borderRadius: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }, modalBody: { padding: 24, gap: 18 },
  input: { color: '#302742', backgroundColor: '#fffdf9', borderWidth: 1, borderColor: '#c5b7d1', padding: 14, fontSize: 16, borderRadius: 14 }, code: { color: '#6b5187', fontSize: 30, fontWeight: '800', letterSpacing: 3 }, rule: { color: '#302742', fontSize: 15, lineHeight: 22 },
});
