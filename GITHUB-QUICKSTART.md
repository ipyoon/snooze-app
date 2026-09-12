# Run the current Snooze demo

```sh
npm ci
cp .env.example .env.local
npx expo start
```

The public demo URL uses a temporary tunnel to the developer laptop. That laptop and tunnel must stay running; this is not permanent hosting. In Insights enable cloud AI, generate a plan, and select Use this plan.

For independent backend setup, follow V11-START-HERE.md. Keep OPENAI_API_KEY and SNOOZE_SIGNING_SECRET only in server/.env or your host secret settings. Those files are excluded from Git. Never put secrets into EXPO_PUBLIC variables.
