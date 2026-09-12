import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

/** One owner for alarm output; every transition cleans up audio and vibration. */
export type SoundName = 'chime' | 'siren' | 'cheerful' | 'sunrise' | 'rock' | 'yelp' | 'twotone';
export const soundLabels: Record<SoundName, string> = { chime: 'Soft chime', siren: 'EMS-style wail', cheerful: 'Happy melody', sunrise: 'Sunrise pop', rock: 'Garage rock', yelp: 'EMS-style yelp', twotone: 'Two-tone siren' };
const sources = { chime: require('../assets/alarm.wav'), siren: require('../assets/siren.wav'), cheerful: require('../assets/cheerful.wav'), sunrise: require('../assets/sunrise.wav'), rock: require('../assets/rock.wav'), yelp: require('../assets/yelp.wav'), twotone: require('../assets/twotone.wav') };
export function useAlarmSignal(active: boolean, volume: number, vibrate: boolean, onError: (error: unknown) => void, sound: SoundName = 'chime') {
  const player = useAudioPlayer(sources[sound]);
  useEffect(() => {
    let disposed = false;
    if (!active) return;
    const startVibration = () => {
      if (!vibrate) return;
      // iOS entries are pauses between fixed-length vibrations; Android alternates wait/vibrate.
      Vibration.vibrate(Platform.OS === 'ios' ? [0, 700, 700] : [0, 600, 250, 600, 900], true);
    };
    startVibration();
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' })
      .then(() => {
        if (disposed) return;
        player.loop = true;
        player.volume = volume;
        player.play();
      }).catch(error => { if (!disposed) onError(error); });
    const listener = AppState.addEventListener('change', state => {
      if (disposed) return;
      if (state === 'active') {
        player.play();
        startVibration();
      } else Vibration.cancel();
    });
    return () => {
      disposed = true;
      listener.remove();
      player.pause();
      void player.seekTo(0).catch(() => {});
      Vibration.cancel();
    };
    // onError is an inline UI handler and should not restart output each clock tick.
  }, [active, player, volume, vibrate, sound]);
}
