# Snooze v9 — Groupspace integration

Groupspace is now part of SnoozeMobile, with a **Groups** tab beside Alarm, Insights, Sleep, and History. It follows the existing purple theme and uses the actual alarm session and challenge sequence.

## Start the app

Unzip the project and open the `SnoozeMobile-v9` folder in your editor. In a terminal inside that folder:

```sh
npm ci
npx expo start --clear
```

Dependencies are unchanged from v8. The download includes the lockfile and assets; `node_modules` and machine-specific Expo state are intentionally excluded. This is an Expo source project, not an APK or installed iOS app.

## Try Groupspace

1. Open **Groups**. Your default local group is **My morning crew**.
2. Use **Create group** to save another group name on this device.
3. Choose **Join with code** and enter **DEMO26** to view **Early birds · sample**. Mina, Jules, Kai, and Sora are labeled sample members.
4. Open **Alarm**, select the challenges you want, and run the existing demo. Finish the entire sequence. Snoozing before starting the check is recorded automatically.
5. After the final challenge, the app opens **Groups → Practice**, showing your score. You can select the sample group to compare your demo result against sample members.
6. A real overnight session appears under **Real alarms**. Real and practice results never mix.
7. Use **Today** and **Yesterday** to inspect separate daily boards. Groups and your result history persist across restarts.

Your first session that reaches its original alarm owns that calendar day within its mode. Starting a second session does not replace that entry, even if the first was abandoned. An alarm cancelled before its first ring does not consume the day. Demo sessions are also limited to the first entry per day so they follow the same rules.

## Scoring

`points = max(0, 100 − 10 × snoozes − 2 × floor(elapsedSeconds / 60))`

Elapsed time starts at the original first alarm and finishes when the last selected challenge is verified. It includes retry intervals and time spent on all earlier challenges. It uses actual seconds, including in practice mode, rather than the optimizer's accelerated demo minutes.

- A snooze tap costs 10 points.
- Each complete minute costs 2 points.
- A timeout contributes elapsed time, but is not counted as a snooze tap.
- Partial mission completion, running out of retries, and End session do not award a rank.
- Higher scores rank first. Ties favor fewer snoozes, then shorter completion time. Exact ties share a rank, for example 1, 1, 3.
- A cross-midnight result stays with the device-local date of its original alarm. The date key is preserved once recorded.

Example: one snooze and a completed sequence 6 minutes 30 seconds after the first alarm earns **78 points**.

## What is connected

- The new screen is in the existing app navigation; it does not require Expo Router.
- The user's existing saved name appears in their leaderboard row.
- Each newly scheduled session stores its original first-alarm time, cumulative snoozes, timeouts, and final outcome.
- Only the existing final-step verification path records successful completion. There is no extra unverified Task complete button.
- The record uses a session ID to prevent repeated snapshots from double-counting snoozes or replacing a terminal outcome.
- Group changes and results are saved through a serialized AsyncStorage queue under a separate key. Existing optimizer logs, reference photos, and settings keep their existing keys.
- Sessions restored from v8 without competition metadata are not backfilled into rankings because their original snooze counts cannot be reliably recovered. Start a new session for scoring.

## Multiplayer status

This integration provides persistent local Groupspace behavior. It does **not** yet synchronize users or invitations across phones. Local groups show your own daily result; different local groups share that same result. DEMO26 opens a sample board, not a live room. No fake live invitation code is generated for a real group.

Live multiplayer still needs authenticated accounts, server-side group membership and invitation codes, trusted event timestamps, shared daily results, and live updates. A server must own scoring and the group's chosen time zone before the rankings can be authoritative across devices. The current name-only profile and device clock remain local.

## Validation and phone testing

- `npm run check`: TypeScript checking and all 33 tests pass, including 18 new Groupspace tests.
- Expo successfully exports both iOS and Android JavaScript/Hermes bundles.
- Bundling is not an on-device test. Confirm audio, notifications, camera, movement, background/resume, and the complete challenge sequence on a physical phone as described in the v8 guide.

The original Desktop `SnoozeMobile-v8` project is unchanged. This folder is the integrated v9 copy.
