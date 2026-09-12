import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Circle, Text as Label } from 'react-native-svg';
export function AgeWindowChart({ maximum, effective }: { maximum: number; effective: number }) {
  const x = 300 - effective / maximum * 270;
  return <View><Svg width="100%" height={105} viewBox="0 0 330 105"><Line x1="30" y1="40" x2="300" y2="40" stroke="#c8b6df" strokeWidth="3" /><Line x1={x} y1="40" x2="300" y2="40" stroke="#725193" strokeWidth="7" /><Circle cx={x} cy="40" r="7" fill="#d57862" /><Label x="30" y="75" fontSize="11" fill="#625174">−{maximum} min</Label><Label x="300" y="75" textAnchor="end" fontSize="11" fill="#625174">Wake deadline</Label><Label x={Math.max(65,Math.min(250,x))} y="20" textAnchor="middle" fontSize="12" fill="#725193">Start: −{effective} min</Label></Svg><Text style={{color:'#7b6d87',fontSize:12}}>Pale: maximum window. Purple: age/rest-adjusted window.</Text></View>;
}
