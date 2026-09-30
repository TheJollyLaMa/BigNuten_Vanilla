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
  DEFAULT_FAVICON_FILENAME,
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
  assert.deepEqual(files.map(file => file.name), ['__bignuten_favicon.png', 'badge.gif', 'demo.mp4', '0.json', 'collection.json', 'streak-rules.json']);
  assert.equal(files.find(file => file.name === 'badge.gif').mimeType, 'image/gif');
  const tokenMetadata = files.find(file => file.name === '0.json');
  assert.equal(files.find(file => file.name === 'streak-rules.json').document.imageFile, DEFAULT_FAVICON_FILENAME);
  const metadataBytes = resolveMetadataAssets(tokenMetadata, new Map([['badge.gif', 'bafyimage'], ['demo.mp4', 'bafyanimation']]));
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  assert.equal(metadata.image, 'ipfs://bafyimage');
  assert.equal(metadata.animation_url, 'ipfs://bafyanimation');
  assert.equal('imageFile' in metadata, false);
  assert.throws(() => resolveMetadataAssets(tokenMetadata, new Map()), /was not pinned/);

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

test('defaults image-less award and competition metadata to the BigNuten favicon', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'decent-metadata-default-image-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'collection.json'), '{"name":"BigNuten Achievements"}');
  await fs.writeFile(path.join(directory, '0.json'), '{"name":"Completion Award"}');
  await fs.writeFile(path.join(directory, 'competition-monthly.json'), '{"name":"Monthly Challenge"}');

  const files = await loadMetadataFiles(directory);
  const award = files.find(file => file.name === '0.json');
  const competition = files.find(file => file.name === 'competition-monthly.json');
  const collection = files.find(file => file.name === 'collection.json');
  const favicon = files.find(file => file.name === DEFAULT_FAVICON_FILENAME);
  assert.equal(award.document.imageFile, DEFAULT_FAVICON_FILENAME);
  assert.equal(competition.document.imageFile, DEFAULT_FAVICON_FILENAME);
  assert.equal(collection.document.imageFile, DEFAULT_FAVICON_FILENAME);
  assert.ok(favicon.bytes.equals(await fs.readFile(path.resolve(__dirname, '../img/BigNuten.png'))));

  const metadata = JSON.parse(resolveMetadataAssets(award, new Map([[DEFAULT_FAVICON_FILENAME, 'bafy-default-icon']])).toString('utf8'));
  assert.equal(metadata.image, 'ipfs://bafy-default-icon');
  assert.equal('imageFile' in metadata, false);
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
