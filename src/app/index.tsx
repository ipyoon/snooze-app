import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, TextInput, View } from 'react-native';
import { getProfile, saveProfile } from '../lib/storage';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    getProfile()
      .then((profile) => {
        if (!mounted) return;
        if (profile?.onboarded) {
          router.replace('/alarms');
          return;
        }
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : 'Could not load your profile.');
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleContinue = async () => {
    setError('');
    try {
      await saveProfile({ name, onboarded: true });
      router.replace('/alarms');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not save your profile.');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>Loading your profile…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 22, marginBottom: 16 }}>What's your name?</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
        style={{ borderWidth: 1, padding: 12, borderRadius: 8, marginBottom: 16 }}
      />
      {!!error && <Text style={{ color: '#b42318', marginBottom: 12 }}>{error}</Text>}
      <Button title="Continue" onPress={handleContinue} disabled={!name} />
    </View>
  );

}
