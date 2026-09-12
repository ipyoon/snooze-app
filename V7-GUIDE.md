# Snooze v7

Open this folder in VS Code → Terminal → New Terminal:

```sh
npm install
npx expo start --clear
```

Room to wake up now controls the first alarm directly: **first alarm = next wake-up time minus selected minutes**. The goal stays fixed. With a 07:00 goal, selecting 10, 20 or 30 minutes shows 06:50, 06:40 or 06:30. Retry timestamps and gaps are recalculated within that window. The final check reserves two minutes before the goal.

Age and bedtime still update rest guidance, but no longer override the selected window. This supersedes the age-window scheduling descriptions in older guides. If the first scheduled time is already past when starting a session, the app starts immediately and replans the remaining retries; the goal does not move. The custom demo delay remains separate.

Both Apply buttons now have a 10-point gap below their text boxes.

Keep the app open during demos and use a system alarm as backup. Physical-device testing is needed for camera, vibration and sound.
