import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRefreshPayload, editDiscordMessage } from '../scripts/refresh-supporter-discord.mjs';

const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789';

test('refresh payload uses the release image and exact purchase and release links', () => {
  const payload = buildRefreshPayload({
    repo: 'TheJollyLaMa/BigNuten_Vanilla',
    version: 'v3.3.0',
    releaseDate: '2026-11-03T11:49:16.000Z',
    summary: 'A decent way to track your biological progress.',
    purchaseUrl: 'https://thejollylama.github.io/DecentHead/supporter/buy.html?chainId=8453&escrow=0x31b07b83e99A9bdF379bf40225b8A80d3804C89d&listingId=6',
    frontUrl: 'https://github.com/TheJollyLaMa/BigNuten_Vanilla/releases/download/v3.3.0/supporter-front.png',
  });
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.match(payload.embeds[0].image.url, /supporter-front\.png$/);
  assert.match(payload.embeds[0].url, /listingId=6$/);
  assert.match(payload.embeds[0].description, /Release notes/);
});

test('Discord editor patches only the identified existing webhook message', async () => {
  let request;
  const id = await editDiscordMessage({
    webhook,
    messageId: '1567147461917544581',
    payload: { content: 'updated' },
    fetcher: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: '1567147461917544581' }) };
    },
  });
  assert.equal(id, '1567147461917544581');
  assert.equal(request.options.method, 'PATCH');
  assert.equal(request.url, `${webhook}/messages/1567147461917544581`);
  assert.equal(JSON.parse(request.options.body).content, 'updated');
});

test('Discord editor reports a failed update without leaking webhook details', async () => {
  await assert.rejects(editDiscordMessage({
    webhook,
    messageId: '1567147461917544581',
    payload: {},
    fetcher: async () => ({ ok: false, status: 404 }),
  }), /HTTP 404/);
});
