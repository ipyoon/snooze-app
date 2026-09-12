/** Planning defaults, not predicted sleep stages or individualized medical advice. */
export function restWindow(age: number | undefined, bedtimeText: string, deadline: number, maximum: number) {
  const hours = age === undefined || age < 13 ? null : age < 18 ? 9 : age < 65 ? 8 : 7.5;
  const match = /^(\d{1,2}):(\d{2})$/.exec(bedtimeText);
  if (!match || +match[1] > 23 || +match[2] > 59) return { minutes: maximum, hours, bedtime: null, shortage: false };
  const bed = new Date(deadline); bed.setHours(+match[1], +match[2], 0, 0);
  if (bed.getTime() >= deadline) bed.setDate(bed.getDate() - 1);
  const available = hours === null ? maximum : Math.floor((deadline - bed.getTime()) / 60000 - hours * 60);
  return { minutes: Math.max(2, Math.min(maximum, available)), hours, bedtime: bed.getTime(), shortage: available < 2 };
}
