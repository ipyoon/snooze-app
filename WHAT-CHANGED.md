# Sound, vibration and personalization update

Open this folder in VS Code, then run `npm install` and `npx expo start --clear`. There is a new dependency (`expo-audio`), so installing before restarting is necessary. Stop your old Expo server first.

## Sound and vibration

- A bundled original chime loops while ringing and while completing a challenge.
- Repeating phone vibration is enabled by default, with a visible switch.
- Soft/Clear/Strong controls the app player's volume. It does not change the phone's system volume.
- Test sound + vibration plays for five seconds and can be stopped early.
- Snooze, timeout, completion, cancellation and unmount stop the alarm output. The next attempt starts it again.
- iOS in-app playback requests playback in silent mode. Media volume, output routing and phone settings still matter; test on your physical phone.
- In Expo Go, scheduled notifications use the system's default sound. In a newly built native app the bundled chime is configured as the notification sound. Notification audio is short, not an indefinite loop. The in-app player supplies the loop after opening the app.
- Adaptive scheduling remains a foreground prototype. These changes do not make a terminated app run JavaScript or guarantee background alarm delivery.

## Personalization

Age is optional and stored locally with the settings when a session starts. Each session snapshots it. The optimizer groups context-specific observed outcomes into coarse age groups while sharing this device's mission-wide personal history as a prior. Those groups are engineering categories, not medically validated boundaries.

There is deliberately no formula mapping age to a fixed sleep-cycle length. With no observed outcomes, a 21-year-old and a 70-year-old receive the same priors. Actual completed checks, timeouts and snoozes update probabilities and can change the next interval. An age label does not establish causal predictive value. This prototype has one local profile; it is not a multi-user account system.

The NIH describes cycles around 80–100 minutes and sleep-stage classification using physiological measurements: https://www.nhlbi.nih.gov/health/sleep/stages-of-sleep . Age and a bedtime timestamp cannot observe tonight's stage. A future sleep-stage forecast needs data, calibration and held-out validation before affecting real alarms.

## Test on your phone

1. Tap Test sound + vibration. Check all three levels and vibration off/on.
2. Start a practice session and confirm the chime repeats through the math screen.
3. Snooze: sound/vibration should stop and return on the next attempt.
4. Complete all questions or cancel: output should stop.
5. Compare histories in Insights. Age alone should not produce a falsely precise sleep-cycle prediction.

TypeScript, optimizer tests and native JS bundling can be checked on a computer. Physical sound/vibration behavior still requires device testing.
