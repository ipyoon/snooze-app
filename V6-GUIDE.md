# Snooze v6

Open this folder in VS Code → Terminal → New Terminal:

```sh
npm install
npx expo start --clear
```

- **Personalize my mornings → Apply age** applies only the age.
- **Planned bedtime → Apply bedtime** applies the edited bedtime. Typing alone does not change the schedule.
- **Room to wake up** now uses window-paced scheduling: the first alarm starts at the opening of the available window, with retries spread across it. Each row shows a timestamp and minutes since the previous alarm. The goal timestamp is separate; the final check starts two minutes before it, not at the deadline. Changing 10/20/30 minutes changes the start and spacing when age/rest constraints allow that window.
- Age/rest constraints can shorten the selected maximum; an imminent deadline also limits the time available. These are approximate planning rules, not sleep-stage detection.
- The Bayesian optimizer still chooses missions under the pacing constraint. Pacing is a product rule, not a learned sleep-cycle estimate. Preview times assume timeouts; completing a mission cancels later alarms, while snoozing recalculates the remaining sequence.
- The switch label is simply **Vibration**.

Demo reference reuse, seven sounds, adjustable math/movement challenges and photo tolerance are retained. Keep the app open; use a system alarm as backup. Physical-phone testing is needed for camera, sound and vibration.
