# Snooze v11 — no connection setup for app users

## What changed

The backend URL and app-token fields have been removed from Insights. A user now sets their age and schedule, taps **Generate my snooze plan**, reviews the plan, and taps **Use this plan**. The existing Save my morning action arms the alarm. Both AI and local plans control the original alarm window and subsequent retry waits.

Generate also works without a service connection. In that case it creates a plan on the phone and labels it **ON-DEVICE PLAN · NOT AI-GENERATED**. This is a transparent product heuristic, not an LLM. It considers the user's preference, age-based sleep-duration context, planned time in bed, and recorded responses where available. Exact intervals are not established by the cited research.

Cloud AI is optional and requires the data-sharing switch. The model receives the same schedule/history summary plus curated primary-study summaries. Names, photos, and group data are not sent. Research links are available inside Insights.

## Run the app immediately

```sh
npm ci
npx expo start --clear
```

The on-device route needs no account, key, backend URL, or token. Generate a plan, apply it, then start a demo to test it with the real challenge sequence. The hosted-AI route is **not live in this download** because no provider credentials or hosting account were available.

## Developer-only steps to activate hosted AI

These are one-time tasks for the app owner. End users do not perform them.

1. Sign in at [OpenAI Platform](https://platform.openai.com/). Complete account setup and configure API billing yourself. Do not send payment details or API keys through chat.
2. Create a project for Snooze and an API key for its backend. Save it in your hosting provider's secret/environment settings as `OPENAI_API_KEY`.
3. Set `OPENAI_MODEL=gpt-5-mini`, `HOST=0.0.0.0`, and a host-provided `PORT`.
4. Set `SNOOZE_SIGNING_SECRET` to a random secret at least 24 characters long. This signing secret is never sent to the phone. Generate one locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
5. Deploy the Node service over HTTPS. Its start command is `node --import tsx server/index.ts`. It uses the existing project's dependencies, including `tsx`; install with `npm ci`, not `npm ci --omit=dev`. A container recipe is included.
6. Set the nonsecret **developer build setting** `EXPO_PUBLIC_SNOOZE_API_URL` to the deployed HTTPS origin and rebuild/restart Expo. Do not put any API key or signing secret in EXPO_PUBLIC settings.
7. Test Generate with cloud AI enabled on a physical phone. Confirm that the result is labeled **AI RECOMMENDATION**, then apply it and verify the alarm timing.

For a local developer server, copy `server/.env.example` to `server/.env`, fill the secrets locally, and run `npm run api`. The phone integration expects HTTPS, so use a properly hosted HTTPS service for the client test. The local on-device planner works while the developer service is being configured.

## Automatic session flow

The app requests `/v1/session` automatically. The server returns a signed guest token valid for 15 minutes. The app immediately uses it for `/v1/snooze-plan`; there is no token input, embedded provider key, or shared signing secret in the mobile build.

Guest sessions are not verified account identity or proof that a request came from an authentic app installation. The included server caps provider requests globally at 10 per hour and 2 concurrently, and caps session issuance at 30 per minute. These limits protect prototype spend but can be exhausted by another caller. Before a public launch, add app attestation/account identity, per-user controls, and durable limits at the hosting layer. The in-memory counters are per server process and reset on restart; do not scale this prototype without replacing them.

Network failures, provider errors, and model validation failures fall back to a local plan. A request taking over 20 seconds also falls back. Manual cancellation does not silently apply or arm a plan. All plans still require Use this plan and the normal alarm-start action.

## Research basis and limits

- [Sundelin et al., published online 2023](https://pubmed.ncbi.nlm.nih.gov/37849039/): the laboratory portion involved 31 habitual snoozers and found improved or unchanged immediate cognitive test performance after a 30-minute snoozing period. It does not identify a best age-specific retry interval.
- [Ogawa et al., 2022](https://pubmed.ncbi.nlm.nih.gov/36587230/): a separate laboratory study in 10 university students found evidence of longer sleep inertia with repeated alarms. Together, these small studies warrant uncertainty rather than a universal prescription.
- [Sleep-duration consensus, 2015](https://pubmed.ncbi.nlm.nih.gov/29073398/): age-group recommendations concern sleep duration, not alarm spacing. Planned time in bed is not measured sleep.

The local fallback prioritizes a shorter early-alarm window when reported time in bed is limited relative to general age-group guidance. It does not diagnose sleep insufficiency or ensure that enough sleep was obtained. For younger children it makes no age-based sleep-duration inference. None of the exact waits or scoring weights in this app have been clinically validated.

The model is supplied these curated summaries, not a live literature search. The app does not claim to know current sleep stages or to generate scientifically proven optimal intervals. Evaluate actual waking outcomes before making effectiveness claims.

## Validation

TypeScript and 55 tests pass, covering the no-configuration path, cloud opt-out, automatic guest sessions, cloud failure fallback, signed-token expiry, and application of local plans to real scheduler logic. Native iOS and Android bundle exports were checked. A live OpenAI request was verified on September 12, 2026 with a fictional adult profile: the provider returned a valid plan through the included recommendation code. The API key remains only in the private working copy, outside this download. Hosted deployment and physical-device behavior remain unverified.

The v10 setup guide is historical; its user-entered backend URL and token workflow no longer applies. v9 Groupspace remains local. The v11 service handles recommendations only, not multiplayer synchronization.
