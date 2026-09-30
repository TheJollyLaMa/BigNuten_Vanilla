'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildAuthorizationMessage,
  lastJsonLine,
  loadMetadataFiles,
  resolveMetadataAssets,
  validateMetadataFile,
  validateStreakRules,
} = require('../scripts/publishDecentMetadata');

test('validates collection and numbered token metadata files', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'decent-metadata-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'collection.json'), '{"name":"Fresh Base Collection"}');
  await fs.writeFile(path.join(directory, '0.json'), '{"name":"Token Zero","imageFile":"badge.gif","animationFile":"demo.mp4"}');
  await fs.writeFile(path.join(directory, 'badge.gif'), Buffer.from([0x47, 0x49, 0x46, 0x38]));
  await fs.writeFile(path.join(directory, 'demo.mp4'), Buffer.from([0, 0, 0, 0]));
  await fs.writeFile(path.join(directory, 'streak-rules.json'), JSON.stringify({
    schema: 'bignuten-streak-rules/v1',
    requiredActivityDays: 28,
    metrics: [
      { id: 'water', type: 'hydration', cadence: 'daily', target: 8 },
      { id: 'weigh-in', type: 'weight', cadence: 'weekly', target: 1 },
      { id: 'situps', type: 'exercise', exerciseType: 'Sit-ups', cadence: 'daily', target: 20 },
    ],
  }));

  const files = await loadMetadataFiles(directory);
  assert.deepEqual(files.map(file => file.name), ['badge.gif', 'demo.mp4', '0.json', 'collection.json', 'streak-rules.json']);
  assert.equal(files[0].mimeType, 'image/gif');
  const metadataBytes = resolveMetadataAssets(files[2], new Map([['badge.gif', 'bafyimage'], ['demo.mp4', 'bafyanimation']]));
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  assert.equal(metadata.image, 'ipfs://bafyimage');
  assert.equal(metadata.animation_url, 'ipfs://bafyanimation');
  assert.equal('imageFile' in metadata, false);
  assert.throws(() => resolveMetadataAssets(files[2], new Map()), /was not pinned/);

  await fs.writeFile(path.join(directory, 'notes.json'), '{"private":true}');
  await assert.rejects(loadMetadataFiles(directory), /Unexpected metadata filename/);
});

test('rejects placeholders, invalid filenames, and oversized metadata', () => {
  assert.throws(() => validateMetadataFile('0.json', Buffer.from('{"image":"ipfs://<image-cid>"}')), /template placeholder/);
  assert.throws(() => validateMetadataFile('../0.json', Buffer.from('{}')), /Invalid metadata filename/);
  assert.throws(() => validateMetadataFile('0.json', Buffer.alloc(128 * 1024 + 1, 32)), /must be 1-/);
  assert.throws(() => validateStreakRules({ schema: 'bad', metrics: [] }), /bignuten-streak-rules/);
  assert.throws(() => validateStreakRules({ schema: 'bignuten-streak-rules/v1', metrics: [
    { id: 'water', type: 'hydration', cadence: 'daily', target: 8 },
    { id: 'water', type: 'exercise', exerciseType: 'Sit-ups', cadence: 'daily', target: 20 },
  ] }), /unique short slugs/);
});

test('parses the last Kubo JSON response and builds the relay signature message', () => {
  assert.equal(lastJsonLine('{"progress":1}\n{"Name":"0.json","Hash":"bafy-test"}\n').Hash, 'bafy-test');
  const message = buildAuthorizationMessage({
    wallet: '0x0000000000000000000000000000000000000001',
    origin: 'https://thejollylama.github.io',
    nonce: 'nonce',
    expiresAt: 0,
  });
  assert.match(message, /Wallet: 0x0000000000000000000000000000000000000001/);
  assert.match(message, /Purpose: request a short-lived Pinata upload URL/);
});
