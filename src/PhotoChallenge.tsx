import React, { useRef, useState, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { toByteArray } from 'base64-js';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { comparePhotos, fingerprint, photoQuality, ReferencePhoto } from './photoMatch';

export function PhotoChallenge({ reference, onSaved, onMatched, onCancel, matchLevel = 'relaxed' }: {
  matchLevel?: import('./photoMatch').MatchLevel;
  reference?: ReferencePhoto | null; onSaved?: (photo: ReferencePhoto) => Promise<void>;
  onMatched?: () => void; onCancel?: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Keep the object centered, at the same angle and distance.');
  const [shot, setShot] = useState<ReferencePhoto | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const capture = async () => {
    if (!ready || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: .7 });
      if (!photo) throw new Error('Could not take the photo. Try again.');
      const side = Math.min(photo.width, photo.height);
      const thumbnail = await manipulateAsync(photo.uri, [{ crop: { originX: (photo.width - side) / 2, originY: (photo.height - side) / 2, width: side, height: side } }, { resize: { width: 256, height: 256 } }], { base64: true, compress: .8, format: SaveFormat.JPEG });
      const small = await manipulateAsync(thumbnail.uri, [{ resize: { width: 64, height: 64 } }], { base64: true, compress: 1, format: SaveFormat.JPEG });
      const pixels = decode(toByteArray(small.base64!), { useTArray: true, formatAsRGBA: true });
      const descriptor = fingerprint(pixels.data, pixels.width, pixels.height);
      if (!alive.current) return;
      if (!photoQuality(descriptor)) throw new Error('Too dark or too little detail. Turn on a light and choose a distinctive object.');
      const captured = { uri: `data:image/jpeg;base64,${thumbnail.base64}`, fingerprint: descriptor, createdAt: Date.now() };
      if (onSaved) {
        setShot(captured); setMessage('Check your reference, then save it for this session.');
      } else if (reference) {
        const result = comparePhotos(reference.fingerprint, descriptor, matchLevel);
        if (result.match) { setMessage('Visual match found.'); onMatched?.(); }
        else setMessage(`Not a close enough match (${Math.round(result.score * 100)}/100 similarity, not confidence). Match the reference framing and lighting, then retry.`);
      } else setMessage('No reference photo is available. End this session and set a reference first.');
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : 'Photo capture failed.'); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  return <View style={s.card}>
    <Text style={s.title}>{onSaved ? 'Your morning destination' : 'Find your bedtime object'}</Text>
    <Text style={s.copy}>{onSaved ? 'Photograph a distinctive object away from bed. Tomorrow, return here and recreate the photo.' : 'Only a close visual match completes this camera check.'}</Text>
    {reference && !onSaved && <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Image source={{ uri: reference.uri }} style={{ width: 72, height: 72, borderRadius: 12 }} /><Text style={[s.copy, { flex: 1 }]}>Your saved reference. Fill the camera frame the same way.</Text></View>}
    {!permission ? <ActivityIndicator /> : !permission.granted ? <Pressable style={s.button} onPress={() => permission.canAskAgain ? requestPermission() : Linking.openSettings()}><Text>{permission.canAskAgain ? 'Allow camera' : 'Open camera settings'}</Text></Pressable> :
      <View style={s.camera}>
        {shot ? <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} /> : <CameraView ref={camera} facing="back" style={StyleSheet.absoluteFill} onCameraReady={() => setReady(true)} onMountError={() => { setReady(false); setMessage('Camera unavailable. Check permissions or try reopening the screen.'); }} />}
      </View>}
    <Text style={s.copy}>{message}</Text>
    {shot && onSaved ? <><Pressable disabled={busy} style={s.button} onPress={async () => {
      if (busyRef.current) return; busyRef.current = true; setBusy(true);
      try { await onSaved(shot); } catch { if (alive.current) setMessage('Could not save. Please retry.'); }
      finally { busyRef.current = false; if (alive.current) setBusy(false); }
    }}><Text>{busy ? 'Saving…' : 'Use this reference'}</Text></Pressable><Pressable onPress={() => { setShot(null); setReady(false); }}><Text>Retake photo</Text></Pressable></> :
    <Pressable disabled={!ready || busy} style={[s.button, (!ready || busy) && { opacity: .5 }]} onPress={capture}><Text>{busy ? 'Comparing…' : onSaved ? 'Take reference photo' : 'Take photo & compare'}</Text></Pressable>}
    {onCancel && <Pressable onPress={onCancel}><Text style={s.copy}>Back without saving</Text></Pressable>}
  </View>;
}
const s = StyleSheet.create({ card: { backgroundColor: '#f8f5ef', borderRadius: 24, padding: 18, gap: 12 }, title: { color: '#302742', fontSize: 23, fontWeight: '700' }, copy: { color: '#6d6379', fontSize: 12, lineHeight: 18 }, camera: { width: '100%', aspectRatio: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#302742' }, button: { backgroundColor: '#ddcef6', padding: 17, borderRadius: 18, alignItems: 'center' } });
