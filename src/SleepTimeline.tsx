import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlarmPoint } from './timeline';
import Svg, { Path, Circle, Line, Text as Label } from 'react-native-svg';
export function SleepTimeline({ bedtime, deadline, points, demo = false }: { bedtime: number | null; deadline: number; points: AlarmPoint[]; demo?: boolean }) {
  const start = bedtime && bedtime < deadline ? bedtime : (points[0]?.at ?? deadline) - 3600000;
  const span = Math.max(1, deadline - start);
  const clock = (n: number) => new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(demo ? { second: '2-digit' } : {}) });
  const percent = (n: number) => Math.max(0, Math.min(98, (n-start)/span*100));
  return <View style={s.card}>
    <Text style={s.title}>{demo ? 'Practice timeline' : 'Your night, at a glance'}</Text>
    <Text style={s.copy}>{bedtime ? 'Bedtime is self-reported; time in bed is not measured sleep.' : 'Tap “Going to bed” to record a bedtime. Sleep stages are not measured.'}</Text>
    <Text style={s.copy}>Conditional alarm attempts · line height is attempt number, not sleep depth.</Text>
    <Svg width="100%" height={165} viewBox="0 0 320 165"><Line x1="10" y1="145" x2="310" y2="145" stroke="#bba4d9"/><Path d={points.map((p,i)=>`${i?'L':'M'} ${10+percent(p.at)*3} ${125-i*28}`).join(' ')} fill="none" stroke="#725193" strokeWidth="3"/>{points.map((p,i)=><React.Fragment key={p.number}><Circle cx={10+percent(p.at)*3} cy={125-i*28} r="5" fill="#d57862"/><Label x={10+percent(p.at)*3} y={112-i*28} textAnchor="middle" fontSize="12" fill="#725193">#{p.number}</Label></React.Fragment>)}</Svg>
    <View style={s.axis}><Text style={s.copy}>{clock(start)}</Text><Text style={s.copy}>{clock(deadline)} · deadline</Text></View>
    <Text style={s.copy}>Alarm markers cluster near the end of the night. Each row below is a conditional alarm: later ones stop after successful verification.</Text>
    {points.map(p => <View key={p.number} style={s.row}><Text style={s.label}>Alarm {p.number}</Text><Text style={s.label}>{clock(p.at)}</Text></View>)}
    <Text style={[s.title, { fontSize: 18, marginTop: 12 }]}>About sleep cycles</Text>
    <Text style={s.copy}>Illustrative hypnogram · NOT your sleep data</Text>
    <Svg width="100%" height={165} viewBox="0 0 330 165">{['Wake','REM','Light','Deep'].map((label,i)=><React.Fragment key={label}><Line x1="45" y1={25+i*32} x2="300" y2={25+i*32} stroke="#eee6f6"/><Label x="0" y={29+i*32} fontSize="10" fill="#625174">{label}</Label></React.Fragment>)}<Path d={[0,2,3,2,1,2,3,2,1,2,3,2,1,2,2,1,2,1,0].map((v,i)=>i?`H ${45+i*14} V ${25+v*32}`:`M 45 ${25+v*32}`).join(' ')} stroke="#725193" strokeWidth="3" fill="none"/><Label x="45" y="150" fontSize="10" fill="#625174">Earlier in night</Label><Label x="300" y="150" textAnchor="end" fontSize="10" fill="#625174">Later</Label></Svg>
    <Text style={s.copy}>Educational sketch only—not your measured sequence. Sleep cycles vary, commonly around 80–100 minutes. Age and bedtime cannot locate your light-sleep moments; the alarm markers come from your response model.</Text>
  </View>;
}
const s = StyleSheet.create({ card: { backgroundColor: '#fffdf9', borderRadius: 24, padding: 20, gap: 12 }, title: { fontSize: 23, fontWeight: '700', color: '#302742' }, copy: { fontSize: 12, lineHeight: 19, color: '#7b6d87' }, chart: { height: 150, borderBottomWidth: 1, borderColor: '#bba4d9', marginTop: 8 }, band: { position: 'absolute', top: 70, height: 60, width: '100%', borderRadius: 12, backgroundColor: '#e8dff2' }, bandLabel: { position: 'absolute', left: 12, top: 92, fontSize: 11, color: '#625174' }, marker: { position: 'absolute', bottom: 0, width: 2, backgroundColor: '#725193' }, number: { position: 'absolute', top: -25, left: -6, color: '#725193', fontSize: 12, fontWeight: '800' }, axis: { flexDirection: 'row', justifyContent: 'space-between' }, row: { borderTopWidth: 1, borderColor: '#eee6f6', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 }, label: { color: '#302742', fontSize: 14 } });
