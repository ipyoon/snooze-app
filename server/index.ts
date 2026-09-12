import { createPlanServer } from './http';
import { recommend } from './recommend';
const apiKey = process.env.OPENAI_API_KEY ?? '';
const appToken = process.env.SNOOZE_SIGNING_SECRET ?? '';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);
if (!apiKey) throw new Error('Set OPENAI_API_KEY in server/.env. Never put it in the mobile app.');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const server = createPlanServer({ appToken, allowedOrigin: process.env.SNOOZE_ALLOWED_ORIGIN,
  generate: input => recommend(input, { apiKey, model: process.env.OPENAI_MODEL ?? 'gpt-5-mini' }) });
server.requestTimeout = 40000; server.headersTimeout = 10000;
server.listen(port, host, () => console.log(`Snooze plan API listening on ${host}:${port}. No user payloads are logged.`));
