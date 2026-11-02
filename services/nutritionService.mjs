// Adapted from DecentBusking 6be300e agent-service/server.mjs (Apache-2.0):
// invited-wallet challenges, short-lived hashed sessions and durable usage caps.
import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getAddress, verifyMessage } from 'ethers';
import { pathToFileURL } from 'node:url';
import { lookupNutrition, validateLookup, nutritionKey } from './nutritionModel.mjs';
import { validateNutrition, portionBaseAmount, NUTRITION_UNITS } from '../js/nutritionDefaults.mjs';
import { chatWithPrivateGenie, validateGenieInput } from './genieModel.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const problem = (status, message) => Object.assign(new Error(message), { status });
const random = () => randomBytes(32).toString('hex');
export function nutritionSettings(env = process.env) {
  const origins = new Set(String(env.BIGNUTEN_NUTRITION_ALLOWED_ORIGINS || '').split(',').filter(Boolean).map(raw => {
    const url = new URL(raw.trim());
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
      throw new Error('Nutrition allowed origins must be exact HTTPS origins (HTTP only on loopback).');
    }
    return url.origin;
  }));
  const wallets = new Set(String(env.BIGNUTEN_NUTRITION_WALLETS || '').split(',').filter(Boolean).map(value => getAddress(value.trim()).toLowerCase()));
  const maxCalls = Number(env.BIGNUTEN_NUTRITION_MAX_CALLS || 100);
  if (!origins.size || !wallets.size || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 10000) throw new Error('Configure nutrition origins, invited wallets and a 1-10000 call cap.');
  return { origins, wallets, maxCalls, apiKey: env.OPENAI_API_KEY || '',
    accessMode: env.BIGNUTEN_GENIE_ACCESS_MODE || 'signed',
    enabled: env.BIGNUTEN_NUTRITION_ENABLED === 'true',
    model: env.BIGNUTEN_NUTRITION_MODEL || 'gpt-4.1',
    stateFile: env.BIGNUTEN_NUTRITION_STATE_FILE || './nutrition-state.sqlite' };
}

export function createNutritionServer(settings, { modelCall = lookupNutrition, genieCall = chatWithPrivateGenie, now = Date.now, logger = console } = {}) {
  const db = new DatabaseSync(settings.stateFile);
  if (settings.stateFile !== ':memory:') chmodSync(settings.stateFile, 0o600);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS usage(wallet TEXT PRIMARY KEY, calls INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS budget(id INTEGER PRIMARY KEY CHECK(id=1), calls INTEGER NOT NULL);
    INSERT OR IGNORE INTO budget VALUES(1,0);`);
  if (!['signed', 'address-only'].includes(settings.accessMode || 'signed')) throw new Error('Genie access mode must be signed or address-only.');
  db.exec('CREATE TABLE IF NOT EXISTS foods(identity TEXT PRIMARY KEY, card TEXT NOT NULL);');
  const foodLookups = new Set();
  function sharedFood(input) {
    const stored = db.prepare('SELECT card FROM foods WHERE identity=?').get(nutritionKey(input));
    return stored ? validateNutrition(JSON.parse(stored.card)) : null;
  }
  const challenges = new Map(), sessions = new Map(), rates = new Map(), active = new Map();
  const usage = wallet => db.prepare('SELECT calls, input_tokens AS inputTokens, output_tokens AS outputTokens FROM usage WHERE wallet=?').get(wallet) || { calls: 0, inputTokens: 0, outputTokens: 0 };
  function limit(key, cap) {
    for (const [id, entry] of rates) if (entry.expires <= now()) rates.delete(id);
    const entry = rates.get(key) || { count: 0, expires: now() + 60000 };
    if (rates.size >= 10000 && !rates.has(key)) throw problem(503, 'Sign-in capacity reached.');
    rates.set(key, entry);
    if (++entry.count > cap) throw problem(429, 'Please wait a minute before trying again.');
  }
  function ready() {
    if (!settings.enabled || !settings.apiKey)     throw problem(503, 'Genie service is not enabled/configured yet. Manual health tracking remains available.');
  }
  function authorized(request) {
    const header = request.headers.authorization || '';
    if (!/^Bearer [a-f0-9]{64}$/.test(header)) throw problem(401, 'Sign in to Genie with an invited wallet.');
    const key = hash(header.slice(7)), session = sessions.get(key);
    if (!session || session.expiresAt <= now()) throw problem(401, 'Genie sign-in expired. Sign in again.');
    if (!settings.wallets.has(session.wallet)) throw problem(403, 'This wallet is not invited.');
    return { key, session };
  }
  async function body(request) {
    if (request.headers['content-type'] !== 'application/json') throw problem(415, 'Expected application/json.');
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > (request.url === '/assistant' ? 262144 : 16000)) throw problem(413, 'Genie request is too large. Reduce the shared data/time range.');
      chunks.push(chunk);
    }
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw problem(400, 'Invalid JSON request.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem(400, 'Expected a JSON object.');
    return value;
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { if (!response.destroyed && !response.writableEnded) {
      response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value));
    } };
    try {
      if (request.method === 'GET' && request.url === '/health') return send(200, { service: 'bignuten-nutrition', enabled: settings.enabled && Boolean(settings.apiKey) });
      const origin = request.headers.origin;
      if (!settings.origins.has(origin)) throw problem(403, 'App origin is not allowed.');
      response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.writeHead(204); response.end(); return;
      }
      if (request.method === 'DELETE' && request.url === '/session') {
        const { key, session } = authorized(request);
        if (session.origin !== origin) throw problem(403, 'Session origin changed.');
        active.get(key)?.abort(problem(401, 'Signed out.'));
        sessions.delete(key); return send(200, { cleared: true });
      }
      if (request.method === 'POST' && request.url === '/foods') {
        limit(`foods:${request.socket.remoteAddress}`, 60);
        const payload = await body(request);
        if (Object.keys(payload).some(key => key !== 'input')) throw problem(400, 'Only food identity may be searched.');
        let input;
        try { input = validateLookup(payload.input); } catch (error) { throw problem(400, error.message); }
        const card = sharedFood(input);
        return send(200, { found: Boolean(card), ...(card ? { card } : {}), cached: Boolean(card) });
      }
      ready();
      if (request.method === 'POST' && request.url === '/challenge') {
        limit(`ip:${request.socket.remoteAddress}`, 15);
        const payload = await body(request);
        let wallet;
        try { wallet = getAddress(payload.address); } catch { throw problem(400, 'Invalid wallet address.'); }
        if (!settings.wallets.has(wallet.toLowerCase())) throw problem(403, 'Genie access is not enabled for this wallet. Manual tracking remains available.');
        const chainId = Number(payload.chainId);
        if (!Number.isSafeInteger(chainId) || chainId < 1) throw problem(400, 'Invalid wallet chain ID.');
        for (const [key, value] of challenges) if (value.expiresAt <= now()) challenges.delete(key);
        for (const [key, value] of sessions) if (value.expiresAt <= now()) sessions.delete(key);
        if (challenges.size >= 1000 || sessions.size >= 1000) throw problem(503, 'Sign-in capacity reached.');
        const nonce = random(), expiresAt = now() + 300000;
        // Exact server-issued message verification avoids trusting client-supplied SIWE fields.
        const message = `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to BigNuten Genie access only. No transaction, payment or token approval.\n\nURI: ${origin}/\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date(now()).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}`;
        challenges.set(nonce, { wallet: wallet.toLowerCase(), origin, message, expiresAt });
        return send(200, { nonce, message, accessMode: settings.accessMode || 'signed' });
      }
      if (request.method === 'POST' && request.url === '/session') {
        limit(`ip:${request.socket.remoteAddress}`, 15);
        const payload = await body(request), challenge = challenges.get(payload.nonce);
        challenges.delete(payload.nonce);
        if (!challenge || challenge.expiresAt <= now() || challenge.origin !== origin || payload.message !== challenge.message) throw problem(401, 'Sign-in challenge expired, changed or already used.');
        let recovered = challenge.wallet;
        if (settings.accessMode !== 'address-only') {
          try { recovered = verifyMessage(challenge.message, payload.signature).toLowerCase(); } catch { throw problem(401, 'Wallet signature could not be verified.'); }
          if (recovered !== challenge.wallet) throw problem(401, 'Wallet signature does not match.');
        }
        if (!settings.wallets.has(recovered)) throw problem(403, 'This wallet is not invited.');
        const credential = random(), expiresAt = now() + 900000;
        sessions.set(hash(credential), { wallet: recovered, origin, expiresAt });
        return send(200, { token: credential, wallet: recovered, expiresAt, usage: usage(recovered) });
      }
      if (request.method === 'GET' && request.url === '/usage') {
        const { session } = authorized(request);
        if (session.origin !== origin) throw problem(403, 'Session origin changed.');
        return send(200, usage(session.wallet));
      }
      if (request.method === 'POST' && ['/lookup', '/assistant'].includes(request.url)) {
        const nutrition = request.url === '/lookup';
        const { key, session } = authorized(request);
        if (session.origin !== origin) throw problem(403, 'Session origin changed.');
        limit(`wallet:${session.wallet}`, 6);
        if (active.has(key) || active.size >= 3) throw problem(429, 'Genie service is busy. Please wait.');
        const payload = await body(request);
        if (nutrition && (payload.consent !== true || Object.keys(payload).some(key => !['input', 'consent', 'portionUnit'].includes(key)))) throw problem(400, 'Explicit food-only lookup consent is required.');
        if (nutrition && payload.portionUnit !== undefined && !NUTRITION_UNITS.includes(payload.portionUnit)) throw problem(400, 'Choose a supported portion unit.');
        let input;
        try { input = nutrition ? validateLookup(payload.input) : validateGenieInput(payload); } catch (error) { throw problem(400, error.message); }
        const foodKey = nutrition ? nutritionKey(input) : null;
        if (nutrition) {
          const cached = !input.label && sharedFood(input);
          if (cached && (!payload.portionUnit || portionBaseAmount(cached, payload.portionUnit) !== null)) return send(200, { found: true, card: cached, cached: true, reason: 'Using shared community food facts. No provider call.', usage: usage(session.wallet) });
          if (foodLookups.has(foodKey)) throw problem(429, 'This food is already being fetched for the community. Try again shortly to reuse its facts.');
        }
        if (active.has(key) || active.size >= 3) throw problem(429, 'Genie service is busy. Please wait.');
        function reserveCall() {
          ready(); authorized(request);
          db.exec('BEGIN IMMEDIATE');
          try {
            if (db.prepare('SELECT calls FROM budget WHERE id=1').get().calls >= settings.maxCalls) throw problem(429, 'Shared Genie pilot budget exhausted. Contact the steward.');
            db.prepare('UPDATE budget SET calls=calls+1 WHERE id=1').run();
            db.prepare('INSERT INTO usage VALUES(?,1,0,0) ON CONFLICT(wallet) DO UPDATE SET calls=calls+1').run(session.wallet);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        reserveCall();
        if (nutrition) foodLookups.add(foodKey);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(problem(504, nutrition
          ? 'Nutrition lookup timed out; no card was applied.'
          : 'Genie request timed out; no answer was accepted.')), nutrition ? 90000 : 60000);
        const disconnect = () => { if (!response.writableEnded) controller.abort(problem(499, 'Genie request canceled.')); };
        response.on('close', disconnect); active.set(key, controller);
        let reportedUsage = false;
        function recordUsage(value) {
          reportedUsage = true;
          if (Number.isSafeInteger(value?.input_tokens) && value.input_tokens >= 0 &&
              Number.isSafeInteger(value?.output_tokens) && value.output_tokens >= 0) {
            db.prepare('UPDATE usage SET input_tokens=input_tokens+?, output_tokens=output_tokens+? WHERE wallet=?')
              .run(value.input_tokens, value.output_tokens, session.wallet);
          }
        }
        try {
          const result = await (nutrition ? modelCall : genieCall)({ apiKey: settings.apiKey, model: settings.model, input, signal: controller.signal,
            ...(nutrition ? { portionUnit: payload.portionUnit, recordUsage } : {}) });
          if (!reportedUsage) recordUsage(result.usage);
          controller.signal.throwIfAborted(); ready(); authorized(request);
          if (nutrition && result.found) {
            result.card = validateNutrition(result.card);
            if (nutritionKey(result.card) !== foodKey) throw problem(502, 'The returned food identity changed. No nutrition was applied.');
            if (['source-backed', 'estimate'].includes(result.card.quality) && !input.label) {
              const existing = sharedFood(input);
              // A new estimate may add a missing portion, but never replaces a source-backed reference.
              if (payload.portionUnit && portionBaseAmount(result.card, payload.portionUnit) !== null &&
                  !(existing?.quality === 'source-backed' && result.card.quality !== 'source-backed')) {
                db.prepare('INSERT INTO foods VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET card=excluded.card').run(foodKey, JSON.stringify(result.card));
              } else db.prepare('INSERT OR IGNORE INTO foods VALUES(?,?)').run(foodKey, JSON.stringify(result.card));
            }
          }
          return send(200, { ...(nutrition ? { found: result.found, card: result.card, reason: result.reason, cached: false } : { answer: result.answer }), usage: usage(session.wallet) });
        } catch (error) {
          if (!reportedUsage && error.usage) recordUsage(error.usage);
          send(error.status || 503, { error: error.status ? error.message : nutrition
            ? 'Nutrition lookup failed validation or provider access. No card was applied. Try manual entry or contact the steward.'
            : 'Genie request failed validation or provider access. No answer was accepted. Contact the steward.', usage: usage(session.wallet) });
          logger.warn('[BigNuten Genie]', error.status || 503);
        } finally { clearTimeout(timer); response.off('close', disconnect); active.delete(key); if (nutrition) foodLookups.delete(foodKey); }
      }
      throw problem(404, 'Not found.');
    } catch (error) {
      // Log categories/status only: no food text, signatures, credentials or health history.
      logger.warn('[BigNuten Genie]', error.status || 503);
      send(error.status || 503, { error: error.status ? error.message : request.url === '/assistant'
        ? 'Genie request failed validation or provider access. No answer was accepted. Contact the steward.'
        : 'Nutrition lookup failed validation or provider access. No card was applied. Try manual entry or contact the steward.' });
    }
  });
  return { server, close: () => { for (const controller of active.values()) controller.abort(problem(503, 'Service shutting down.')); db.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = createNutritionServer(nutritionSettings());
  service.server.listen(Number(process.env.PORT || 8790), process.env.BIGNUTEN_NUTRITION_HOST || '127.0.0.1', () => console.log('BigNuten nutrition service listening.'));
}
