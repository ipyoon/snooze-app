import AsyncStorage from '@react-native-async-storage/async-storage';

export type Alarm = {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
};

export type Profile = {
  name: string;
  onboarded: boolean;
};

const ALARMS_KEY = 'alarms';
const PROFILE_KEY = 'profile';

export async function getAlarms(): Promise<Alarm[]> {
  const raw = await AsyncStorage.getItem(ALARMS_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveAlarms(alarms: Alarm[]) {
  await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
}

export async function getProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const profile = parsed as Partial<Profile>;
  return typeof profile.name === 'string' && typeof profile.onboarded === 'boolean'
    ? { name: profile.name, onboarded: profile.onboarded }
    : null;
}

export async function saveProfile(profile: Profile) {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
