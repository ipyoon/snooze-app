# Snooze v4

Open this extracted folder in VS Code. Use Terminal → New Terminal:

```sh
npm install
npx expo start --clear
```

Scan the QR in Expo Go on your phone, on the same Wi-Fi. This is an Expo SDK 57 project; use a compatible Expo Go or development build.

## Try the changes

1. Set wake time and planned bedtime in 24-hour HH:MM. Enter age and tap **Apply age + bedtime** (Enter on age also applies).
2. Select your maximum early window. The purple line shows the adjusted available window; the list shows each conditional alarm and time. Times recompute after settings changes. Retries stop after mission success and are recalculated after snoozes/timeouts, maximum four attempts.
3. Choose from eight original synthesized sounds: chime, happy melody, three layered musical loops, EMS-style wail/yelp, and two-tone siren. Test at low volume first. Loudness also depends on your phone. These are imitations, not emergency-service recordings.
4. Select math difficulty (addition, larger addition, multiplication), 3/5/10 questions, or 10/20/30/40 movements. Hold your phone securely.
5. For camera missions, choose relaxed/balanced/strict. Each camera-enabled session asks for a fresh reference photo. Relaxed is the default. Keep the object centered with similar framing and lighting.
6. Enter **Demo delay** in whole seconds, from 1 to 3600. The first alarm rings after that delay; subsequent model minutes run at 4× speed, with 30 seconds per mission. Hard math with ten questions may time out in a demo.
7. Open Sleep to see the conditional alarm line and educational sleep-stage line. While waiting, you can also inspect the session timeline.

## Honest model boundaries

Age does not identify light sleep. The product uses approximate rest targets of 9 h for ages 13–17, 8 h for adults under 65, and 7.5 h for 65+. These are planning defaults informed by [CDC duration guidance](https://www.cdc.gov/sleep/about/index.html), not clinical recommendations for an individual. Under 13 or no age: no adjustment. The early window is `clamp(floor(deadline − planned bedtime − rest target), 2, maximum)` in minutes. Bedtime means the most recent entered clock time before the deadline. If the rest target cannot fit, the deadline wins and a warning is shown. Time in bed is not actual sleep duration. For an age demo, bedtime 23:00 / deadline 07:15 / max 30 minutes produces teen 2 min, adult 15 min, and 65+ 30 min. Ages may produce identical schedules when the maximum already fits.

The sleep-stage line is a generic educational sketch, not a personal prediction. See [NHLBI sleep stages](https://www.nhlbi.nih.gov/health/sleep/stages-of-sleep). Retry timing still uses the existing Bayesian response model and finite-horizon optimization. Current history is grouped by mission and age bucket, not question difficulty; changing difficulty can affect calibration. Demo observations are separate from real observations.

Photo comparison uses normalized grayscale structure, edge structure, and color histograms locally. Relaxed thresholds are lower; this is NOT semantic object detection and can falsely accept or reject an object. Scores are similarity, not confidence. No photos are uploaded. Cancel/end session remains available as an emergency escape.

## Prototype limitations

Keep the app open for continuous sounds, vibration, and adaptive retries. Expo Go/background operation is not a reliable replacement for a system alarm. Native notification sounds require a development build; Expo Go uses its default notification sound. Phone volume, permissions, silent/focus settings and OS restrictions can affect alerts. Set a system alarm as backup. Camera, audio, and vibration need physical-device testing.

Developer checks: `npm run check`. Export: `npx expo export --platform all`.
