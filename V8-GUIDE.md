# Snooze v8

Open this folder in VS Code → Terminal → New Terminal:

```sh
npm install
npx expo start --clear
```

Select missions in the order you want to perform them. Number badges show the order; deselecting and reselecting moves a mission to the end. The initially selected Math counts as first unless you deselect it.

Every alarm requires the whole saved sequence. Completing one step advances to the next without muting audio or enabled vibration. Only the final step verifies the alarm and cancels later retries. Single-selection works as before. New retries restart the sequence at step one; unfinished settings changes cannot change a running sequence.

Once you press Start wake-up check, activities do not automatically time out or stop sounding at the goal time. If the goal passes, the screen tells you. End session remains an emergency escape. Before activities begin, the existing snooze/timeout retry behavior remains available. Planned retry times assume you have not started a check; an active sequence takes precedence over those times. The two-minute planning allowance is not a promise that all chosen activities fit within it.

Sequence outcomes are kept separate from the single-mission response estimates; their joint success probability is not modeled. Audio/vibration is continuous in the foreground and subject to phone permissions/settings. Test the complete sequence on your physical phone, including camera permissions. Keep the app open and use a system alarm as backup.

Apply bedtime now has a small gap above and below its button. v7 timestamp behavior and saved reference-photo reuse remain unchanged.
