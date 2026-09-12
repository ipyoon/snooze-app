import { Mission } from './optimizer';
export function toggleOrdered(current: Mission[], mission: Mission): Mission[] {
  return current.includes(mission) ? current.filter(m => m !== mission) : [...current, mission];
}
export function advanceMission(order: Mission[], index: number) {
  if (!order.length || !Number.isInteger(index) || index < 0 || index >= order.length) throw new Error('Invalid mission progress');
  return { complete: index === order.length-1, nextIndex: Math.min(index+1,order.length-1) };
}
