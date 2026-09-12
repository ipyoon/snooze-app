import { issueGuestSession, validGuestSession } from './guestSession';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AIPlan, AIPlanRequest, validateAIRequest } from '../src/aiPlan';
export type ServerConfig = {
  appToken: string;
  allowedOrigin?: string;
  generate: (input: AIPlanRequest) => Promise<AIPlan>;
  requestsPerHour?: number;
};
export function createPlanHandler(config: ServerConfig) {
  if (config.appToken.length < 24) throw new Error('Set SNOOZE_SIGNING_SECRET to a random value at least 24 characters long.');
  // This server has a global hourly provider budget.
  // Guest sessions are automatic, not verified user identity. Add attestation and per-user limits before launch.
  let windowStarts = Date.now(); let requests = 0; let running = 0;
  let sessionWindow = Date.now(); let sessionsIssued = 0;
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && origin !== config.allowedOrigin) { res.writeHead(403); res.end(); return; }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
    const send = (status: number, body: object) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url === '/health' && req.method === 'GET') { send(200, { ok: true }); return; }
    if (req.url === '/v1/session' && req.method === 'POST') {
      if (Date.now() - sessionWindow > 60000) { sessionWindow = Date.now(); sessionsIssued = 0; }
      if (sessionsIssued >= 30) { send(429, { error: 'Please try again later.' }); return; }
      sessionsIssued++;
      send(200, { token: issueGuestSession(config.appToken), expiresIn: 900 }); return;
    }
    if (req.url !== '/v1/snooze-plan' || req.method !== 'POST') { send(404, { error: 'Not found.' }); return; }
    const token = req.headers.authorization ?? '';
    if (!token.startsWith('Bearer ') || !validGuestSession(token.slice(7), config.appToken)) { send(401, { error: 'Session expired. Please try again.' }); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'Send application/json.' }); return; }
    if (Date.now() - windowStarts > 3600000) { windowStarts = Date.now(); requests = 0; }
    if (requests >= (config.requestsPerHour ?? 10) || running >= 2) { send(429, { error: 'Recommendation limit reached. Try again later.' }); return; }
    let raw = ''; let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 24576) { send(413, { error: 'Request is too large.' }); return; }
        raw += chunk.toString();
      }
    } catch { if (!res.writableEnded) send(400, { error: 'Could not read the request.' }); return; }
    let input: AIPlanRequest;
    try { input = validateAIRequest(JSON.parse(raw)); }
    catch (error) { send(400, { error: error instanceof Error ? error.message : 'Invalid request.' }); return; }
    // Recheck after reading the request to prevent simultaneous bodies from
    // bypassing the concurrency and spend limits.
    if (requests >= (config.requestsPerHour ?? 10) || running >= 2) { send(429, { error: 'Recommendation limit reached. Try again later.' }); return; }
    requests++; running++;
    try { send(200, await config.generate(input)); }
    catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError' ? 'The recommendation timed out. Your saved alarms are unchanged.'
        : error instanceof Error && /^(OpenAI|The recommendation|A recommendation)/.test(error.message) ? error.message : 'Could not generate a recommendation. Check the server configuration.';
      send(502, { error: message });
    } finally { running--; }
  };
}

export function createPlanServer(config: ServerConfig) { return createServer(createPlanHandler(config)); }

