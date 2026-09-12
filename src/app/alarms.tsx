import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Platform, SafeAreaView, StyleSheet, Switch, Text, View } from 'react-native';
import { cancelAlarm, requestPermissions, scheduleAlarm } from '../lib/notifications';
import { Alarm, getAlarms, saveAlarms } from '../lib/storage';

export default function Alarms() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [pickerTime, setPickerTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([requestPermissions(), getAlarms()])
      .then(([permissionGranted, savedAlarms]) => {
        if (!mounted) return;
        setAlarms(savedAlarms);
        if (!permissionGranted) {
          setError('Notifications are disabled. You can create alarms, but they cannot alert you until permission is enabled.');
        }
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : 'Could not load alarms.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const addAlarm = async () => {
    try {
      setError('');
      const hour = pickerTime.getHours();
      const minute = pickerTime.getMinutes();
      const notifId = await scheduleAlarm(hour, minute, 'Wake up');
      const newAlarm: Alarm = { id: notifId, hour, minute, label: 'Wake up', enabled: true };
      const updated = [...alarms, newAlarm];
      setAlarms(updated);
      await saveAlarms(updated);
      setShowPicker(false);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Could not schedule the alarm.';
      setError(message);
      Alert.alert('Alarm not scheduled', message);
    }
  };

  const toggleAlarm = async (alarm: Alarm) => {
    try {
      setError('');
      let replacementId = alarm.id;
      if (alarm.enabled) await cancelAlarm(alarm.id);
      else replacementId = await scheduleAlarm(alarm.hour, alarm.minute, alarm.label);
      const updated = alarms.map((item) => item.id === alarm.id
        ? { ...item, id: replacementId, enabled: !item.enabled }
        : item);
      setAlarms(updated);
      await saveAlarms(updated);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Could not update the alarm.';
      setError(message);
      Alert.alert('Alarm not updated', message);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Alarms</Text>
        <Text style={styles.subtitle}>Choose a daily wake-up time.</Text>
      </View>
      {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
      <Button title="Add Alarm" onPress={() => setShowPicker(true)} />
      {showPicker && (
        <View style={styles.pickerPanel}>
          <DateTimePicker
            value={pickerTime}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => {
              if (Platform.OS === 'android') setShowPicker(false);
              if (date) setPickerTime(date);
            }}
          />
          <Button title="Save" onPress={addAlarm} />
        </View>
      )}
      {loading ? (
        <View style={styles.center}><ActivityIndicator /><Text style={styles.loadingText}>Loading alarms…</Text></View>
      ) : (
        <FlatList
          style={styles.list}
          data={alarms}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No alarms yet. Tap Add Alarm to create one.</Text>}
          renderItem={({ item }) => (
            <View style={styles.alarmRow}>
              <View>
                <Text style={styles.alarmTime}>{String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}</Text>
                <Text style={styles.alarmLabel}>{item.label}</Text>
              </View>
              <Switch value={item.enabled} onValueChange={() => toggleAlarm(item)} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f6', paddingHorizontal: 24 },
  header: { paddingTop: 24, paddingBottom: 20 },
  title: { fontSize: 34, fontWeight: '800', color: '#17231d' },
  subtitle: { fontSize: 15, color: '#667169', marginTop: 4 },
  errorBox: { backgroundColor: '#fef0ec', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { color: '#9f2d20', lineHeight: 19 },
  pickerPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginTop: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#667169' },
  list: { marginTop: 18 },
  empty: { textAlign: 'center', color: '#778079', marginTop: 48, lineHeight: 20 },
  alarmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 10 },
  alarmTime: { fontSize: 30, fontWeight: '700', color: '#17231d' },
  alarmLabel: { color: '#667169', marginTop: 2 },
});
