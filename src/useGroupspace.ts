import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CompetitionSession, GROUPSPACE_KEY, GroupState, initialGroupState, LocalGroup, parseGroupState, sessionResult, upsertResult } from './groupspace';

export function useGroupspace() {
  const [state, setState] = useState(initialGroupState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(state);
  const canWrite = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Groupspace could not be saved.';
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(GROUPSPACE_KEY).then(raw => {
      const loaded = parseGroupState(raw);
      if (!alive) return;
      current.current = loaded; setState(loaded); canWrite.current = true; setReady(true);
    }).catch(reason => { if (alive) setError(errorText(reason)); });
    return () => { alive = false; canWrite.current = false; };
  }, []);
  const update = useCallback((change: (previous: GroupState) => GroupState) => {
    // Serialize mutations so a group edit cannot overwrite a new alarm result.
    const pending = writes.current.catch(() => undefined).then(async () => {
      if (!canWrite.current) throw new Error('Groupspace is not ready. Reopen the app to reload saved data.');
      const next = change(current.current);
      if (next === current.current) return;
      await AsyncStorage.setItem(GROUPSPACE_KEY, JSON.stringify(next));
      current.current = next; setState(next); setError('');
    });
    writes.current = pending;
    return pending.catch(reason => { setError(errorText(reason)); throw reason; });
  }, []);
  const record = useCallback((session: CompetitionSession, at = Date.now()) => {
    const result = sessionResult(session, at);
    if (!result) return Promise.resolve();
    return update(previous => {
      const results = upsertResult(previous.results, result);
      return results === previous.results ? previous : { ...previous, results };
    });
  }, [update]);
  const addGroup = useCallback((group: LocalGroup) => update(previous => previous.groups.some(item => item.id === group.id)
    ? previous : { ...previous, groups: [...previous.groups, group] }), [update]);
  return { state, ready, error, record, addGroup };
}
