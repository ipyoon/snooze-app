> Historical v10 guide. For this build use V11-START-HERE.md; users no longer enter connection information.

# Snooze v10 — personalized Insights and OpenAI backend

The supplied v8 project did not have a backend: there were no server routes, API calls, or account-authentication integrations. v9 added local Groupspace only. This version includes a small Node.js backend for generating snooze-plan recommendations.

## What you can do now

In **Insights**, review the applied age, bedtime, wake-up goal, alarm window, and count of real attempts. Choose **Generate my snooze plan**, review the proposed first-alarm window and retry intervals, then tap **Use this plan**. The next alarm uses that plan. The Alarm screen and its graph show the active timing.

The first alarm may move closer to the goal within your selected maximum window. Retries use the recommended waits after snoozing or timing out. An active challenge sequence still runs until all selected tasks are finished. The app never calls the API while an alarm is ringing.

This is a working integration to configure and test, not a claim that ChatGPT can discover a biologically optimal snooze interval from age and a schedule. It generates tentative recommendations, using observed behavior when available. No wake-success percentages or sleep-stage predictions come from the API.

## 1. Install the project

Use Node.js 22 or newer; validation here used Node 24. Open a terminal in the extracted `SnoozeMobile-v10` folder:

```sh
npm ci
cp server/.env.example server/.env
```

The backend uses Node's built-in HTTP server and fetch. Its TypeScript entry point runs using the project's existing `tsx` dependency; install development dependencies as well as runtime dependencies.

## 2. Configure the backend key

Create a key in your [OpenAI API project](https://platform.openai.com/api-keys) and configure API billing for that project. Edit **server/.env** locally:

```dotenv
OPENAI_API_KEY=your-key-goes-here
OPENAI_MODEL=gpt-5-mini
SNOOZE_APP_TOKEN=your-random-app-connection-token
HOST=0.0.0.0
PORT=8787
```

Generate a random connection token with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy that result into `SNOOZE_APP_TOKEN`. This is a separate token for the phone-to-backend connection. **Never put OPENAI_API_KEY in the phone, EXPO_PUBLIC variables, source code, screenshots, or chat.** The included `.gitignore` excludes `server/.env`.

The backend defaults to listening on localhost. `HOST=0.0.0.0` lets a phone on your private Wi-Fi reach it during development. Do not expose this development server publicly as-is.

## 3. Start the backend and app

In the first terminal:

```sh
npm run api
```

In a second terminal, from the same project folder:

```sh
npx expo start --clear
```

Open the app on your phone. Both the phone and computer should be on the same private Wi-Fi network.

Under **Insights → Connection settings**, enter:

- **Backend URL:** your computer's private Wi-Fi address and port, for example `http://192.168.1.10:8787`. Use your actual address. `localhost` on a physical phone means the phone itself, not your computer.
- **App connection token:** the value of `SNOOZE_APP_TOKEN`. Do not enter your OpenAI key.

For an iOS simulator running on the backend computer, `http://127.0.0.1:8787` can be used. Android's standard emulator can reach the host at `http://10.0.2.2:8787`. Native phone networking still requires on-device verification.

The app permits private-network HTTP only in development; production uses HTTPS. The backend has no browser origins enabled by default. For a browser client, set `SNOOZE_ALLOWED_ORIGIN` to its exact origin. Connection values are kept in memory, not written to phone storage. You can optionally preconfigure only the nonsecret backend URL with `EXPO_PUBLIC_SNOOZE_API_URL`.

## 4. Generate and use a plan

1. On **Alarm**, set the wake-up goal, choose challenges, apply your age, and apply your bedtime. Pick the maximum early-alarm window and wake-up preference.
2. Open **Insights**. Its schedule summary reflects the applied values; an unapplied age or bedtime draft is not sent.
3. Turn on the data-sharing switch, then tap **Generate my snooze plan**. The switch alone does not send anything.
4. Review the first-alarm window, each retry wait, and the short explanation and tradeoff.
5. Tap **Use this plan**. Return to **Alarm** and start a new demo or save your real alarm.

Demo sessions use the existing accelerated clock; the displayed minute values are model minutes in that mode. Real alarms use actual minutes. An API plan is not automatically armed merely because it was generated or applied; the existing Save my morning action starts the session.

A plan remains valid for up to seven days and works offline after it is saved. Changing age, bedtime, goal time, maximum window, challenge order, or preference invalidates it for new sessions. The app then uses its original on-device planner until you apply a matching recommendation. An already-running session keeps its own snapshot.

## How recommendation and scheduling work

The app sends a validated profile and aggregated counts from up to 200 real attempts in the last 60 days. The summary groups outcomes by prior wait duration and includes mean response time. It does not send names, images, group membership, exact event timestamps, or demo/seed logs.

The backend produces finite candidate schedules within the user's maximum early-alarm window. Each has one to three retry waits, from one to ten whole minutes. Every candidate reserves the existing two-minute planning allowance per attempt. For example, a 20-minute window can offer waits of **2, 4, 6 minutes** after failures; its conditional alarm offsets are **0, 4, 10, 18 minutes** if each prior attempt times out after two minutes.

OpenAI chooses a candidate ID and supplies a short explanation and tradeoff. It cannot create arbitrary intervals. The backend and phone both validate the selected schedule, profile match, and expiry. Unsupported choices, malformed responses, refusals, timeouts, and upstream errors leave the existing applied plan unchanged.

`optimizer.ts` now accepts optional `retryWaitMinutes`. Those values replace the old evenly paced waits for the selected plan. If an actual attempt leaves less time than expected, the next wait is shortened to fit the remaining goal window. If there is not enough room for another attempt, no extra retry is scheduled.

## API contract

```text
POST /v1/snooze-plan
Authorization: Bearer <SNOOZE_APP_TOKEN>
Content-Type: application/json
```

Request and response types, candidate generation, and both-side validation live in `src/aiPlan.ts`. `server/recommend.ts` calls the OpenAI Responses API using strict Structured Outputs and `store: false`. `server/http.ts` handles authentication, validation, body limits, origin checks, and a small hourly request budget.

The default model is configurable; `gpt-5-mini` is used here as a supported structured-output model, not as a claim that it is the newest model or best choice for every deployment.

## What remains before a public launch

This development backend uses one manually configured shared connection token. A public app needs actual account authentication, per-user authorization and rate limits, HTTPS hosting, and managed server secrets. The existing name-only profile and Groupspace remain local; adding this recommendation endpoint does not make group rankings live.

To measure whether recommendations improve waking, evaluate completed-by-goal sessions, completion delay, snooze count, and interruption count against the original planner. Track the plan and schedule context associated with each session. Use prospective comparisons with adequate data; prior wait/outcome correlations can be confounded by challenge difficulty, earlier failed attempts, and different sleep schedules. Current history buckets are not calibrated probabilities, and several attempts can come from one morning.

Age and schedule personalize the context supplied to the model. A generated plan is not a medical prescription, a sleep-stage estimate, or demonstrated optimal control. Avoid marketing it as the interval “most likely” to wake someone until outcome testing supports that claim.

## Verification

- TypeScript checking and all 49 tests pass.
- Tests cover input minimization, consent, stale plans, schedule bounds, actual retry timing, API refusal/error handling, authentication, and request limits.
- OpenAI responses are mocked. No live API request was made because an API key was not configured.
- HTTP handlers were tested in memory because the execution sandbox does not allow opening a local listening port.
- iOS and Android bundle exports are checked separately from phone behavior. Physical-device alarm, camera, motion, and networking tests are still needed.

## Official OpenAI references

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): the JSON-schema response format used by the backend.
- [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices): server-side key handling and deployment practices.
- [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini): supported model capabilities.
