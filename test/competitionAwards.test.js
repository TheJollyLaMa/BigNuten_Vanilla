const assert = require('node:assert/strict');
const test = require('node:test');
const awardsPromise = import('../js/competitionAwards.mjs');

const OWNER = '0x1111111111111111111111111111111111111111';
const ESCROW = '0x2222222222222222222222222222222222222222';
const NFT = '0x3333333333333333333333333333333333333333';
const BNUT = '0x4444444444444444444444444444444444444444';

const rules = {
  schema: 'bignuten-streak-rules/v1',
  metrics: [
    { id: 'water', type: 'hydration', cadence: 'daily', target: 5 },
  ],
  requiredActivityDays: 24,
};

function awardInput(overrides = {}) {
  return {
    competition: {
      id: 7,
      name: 'Monthly Hydration Challenge',
      groupName: 'Northside Crew',
      creator: OWNER,
      stakeToken: { address: BNUT, symbol: 'BNUT', decimals: 18 },
      stakeAmount: '25',
      startTime: 1_798_000_000,
      endTime: 1_800_592_000,
      rules,
      rulesCID: 'ipfs://bafyexample',
    },
    deployment: { chainId: 8453, nftAddress: NFT, escrowAddress: ESCROW, stakeTokenAddress: BNUT },
    awardTokenIds: { completion: '40', first: '41', second: '42', third: '43' },
    ...overrides,
  };
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('builds unique, public-safe metadata for all configured completion and placement tokens', () => {
  return awardsPromise.then(({ buildCompetitionAwardMetadata }) => {
  const input = awardInput();
  const before = structuredClone(input);
  const files = buildCompetitionAwardMetadata(input);

  assert.deepEqual(input, before);
  assert.deepEqual(files.map(file => file.tokenId), ['40', '41', '42', '43']);
  assert.deepEqual(files.map(file => file.fileName), ['40.json', '41.json', '42.json', '43.json']);
  assert.equal(new Set(files.map(file => file.metadata.name)).size, 4);
  assert.equal(files[0].metadata.properties.schema, 'bignuten-competition-achievement/v1');
  assert.equal(files[0].metadata.properties.competition.id, '7');
  assert.equal(files[0].metadata.properties.competition.creator, OWNER);
  assert.equal(files[0].metadata.properties.competition.stakeToken.symbol, 'BNUT');
  assert.equal(files[0].metadata.properties.competition.groupName, 'Northside Crew');
  assert.equal(files[0].metadata.properties.competition.durationSeconds, 2_592_000);
  assert.equal(files[0].metadata.properties.competition.rules.metrics[0].target, 5);
  assert.equal(files[0].metadata.properties.links.escrow, `https://basescan.org/address/${ESCROW}`);
  assert.equal(files[0].metadata.properties.links.chainId, 8453);
  assert.equal(files[0].metadata.properties.links.achievementContractAddress, NFT);
  assert.equal(files[0].metadata.properties.links.rulesURI, 'ipfs://bafyexample');
  assert.equal(files[0].metadata.properties.award.amountPerAwardee, 1);
  assert.match(files[0].metadata.properties.payoutPolicy.principal, /third place, which receives half principal/);
  assert.match(files[0].metadata.properties.payoutPolicy.mintFailure, /entire settlement transaction/);
  assert.match(files[0].metadata.description, /not a health record/);
  assert.doesNotMatch(JSON.stringify(files), /privateNotes|participantProgress|dailyRows|rawHealthData/);
  });
});

test('rejects private or unrecognized data rather than silently copying it into metadata', () => {
  return awardsPromise.then(({ buildCompetitionAwardMetadata }) => {
  assert.throws(() => buildCompetitionAwardMetadata({
    ...awardInput(),
    participantNotes: 'private note',
  }), /unsupported field "participantNotes"/i);
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    competition: { ...awardInput().competition, privateNotes: 'private note' },
  })), /unsupported field "privateNotes"/i);
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    competition: {
      ...awardInput().competition,
      rules: { ...rules, notes: 'private health details' },
    },
  })), /unsupported field "notes"/i);
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    competition: {
      ...awardInput().competition,
      rules: {
        ...rules,
        metrics: [{ ...rules.metrics[0], dailyRows: [{ weight: 67 }] }],
      },
    },
  })), /unsupported field "dailyRows"/i);
  });
});

test('requires a distinct unused four-ID range and exact, valid competition inputs', () => {
  return awardsPromise.then(({ buildCompetitionAwardMetadata, createCompetitionAwardTokenIdRange }) => {
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    awardTokenIds: { completion: '40', first: '40', second: '42', third: '43' },
  })), /four different/i);
  assert.throws(() => buildCompetitionAwardMetadata({
    ...awardInput(),
    reservedTokenIds: ['42'],
  }), /must not reuse/i);
  assert.throws(() => createCompetitionAwardTokenIdRange('100', ['102']), /must not reuse/i);
  assert.deepEqual(createCompetitionAwardTokenIdRange('100', ['99']), {
    completion: '100', first: '101', second: '102', third: '103',
  });
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    competition: { ...awardInput().competition, stakeAmount: 25 },
  })), /exact decimal string/i);
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    competition: { ...awardInput().competition, rulesCID: 'https://example.com/rules' },
  })), /ipfs:\/\/<CID>/i);
  assert.throws(() => buildCompetitionAwardMetadata(awardInput({
    deployment: { ...awardInput().deployment, stakeTokenAddress: NFT },
  })), /must match the configured StreakBet stake token/i);
  });
});

test('reuses a local template while requiring fresh competition identity and award IDs', () => {
  return awardsPromise.then(({
    applyCompetitionAwardTemplate,
    buildCompetitionAwardMetadata,
    COMPETITION_AWARD_TEMPLATES_KEY,
    createCompetitionAwardTemplate,
    listCompetitionAwardTemplates,
    saveCompetitionAwardTemplate,
  }) => {
  const storage = new MemoryStorage();
  const firstTemplate = createCompetitionAwardTemplate(awardInput(), 'Hydration Cohort');
  const saved = saveCompetitionAwardTemplate(storage, firstTemplate);

  assert.equal(storage.getItem(COMPETITION_AWARD_TEMPLATES_KEY) != null, true);
  assert.deepEqual(listCompetitionAwardTemplates(storage), [saved]);
  assert.equal(Object.hasOwn(saved, 'creator'), false);
  assert.equal(Object.hasOwn(saved, 'id'), true);
  assert.equal(Object.hasOwn(saved, 'competitionId'), false);
  assert.equal(Object.hasOwn(saved, 'awardTokenIds'), false);
  assert.equal(JSON.stringify(saved).includes(OWNER), false);

  const deployment = awardInput().deployment;
  const firstRepeat = applyCompetitionAwardTemplate(storage, saved.id, {
    competition: { id: 8, creator: OWNER, startTime: 1_810_000_000 },
    deployment,
    awardTokenIds: { completion: '50', first: '51', second: '52', third: '53' },
  });
  const secondRepeat = applyCompetitionAwardTemplate(storage, saved.id, {
    competition: { id: 9, creator: ESCROW, startTime: 1_820_000_000 },
    deployment,
    awardTokenIds: { completion: '54', first: '55', second: '56', third: '57' },
  });
  const firstFiles = buildCompetitionAwardMetadata(firstRepeat);
  const secondFiles = buildCompetitionAwardMetadata(secondRepeat);

  assert.equal(firstRepeat.competition.name, 'Hydration Cohort');
  assert.equal(firstRepeat.competition.endTime - firstRepeat.competition.startTime, 2_592_000);
  assert.equal(firstFiles[0].metadata.properties.competition.id, '8');
  assert.equal(secondFiles[0].metadata.properties.competition.id, '9');
  assert.equal(firstFiles[0].tokenId, '50');
  assert.equal(secondFiles[0].tokenId, '54');
  assert.notEqual(firstFiles[0].metadata.name, secondFiles[0].metadata.name);
  assert.throws(() => applyCompetitionAwardTemplate(storage, saved.id, {
    competition: { id: 10, creator: OWNER, startTime: 1_830_000_000 },
    deployment,
    awardTokenIds: { completion: '50', first: '51', second: '52', third: '53' },
    reservedTokenIds: ['51'],
  }), /must not reuse/i);
  });
});

test('persists and looks up a per-competition metadata record locally without reusing token IDs', () => {
  return awardsPromise.then(({
    COMPETITION_AWARD_METADATA_KEY,
    getCompetitionAwardMetadata,
    listCompetitionAwardMetadata,
    saveCompetitionAwardMetadata,
  }) => {
    const storage = new MemoryStorage();
    const input = awardInput();
    const saved = saveCompetitionAwardMetadata(storage, input);
    const restartedStorage = new MemoryStorage();
    restartedStorage.values = new Map(storage.values);

    assert.equal(storage.getItem(COMPETITION_AWARD_METADATA_KEY) != null, true);
    assert.equal(saved.schema, 'bignuten-competition-award-record/v1');
    assert.equal(saved.competitionId, '7');
    assert.deepEqual(saved.awardTokenIds, input.awardTokenIds);
    assert.deepEqual(saved.records.map(record => record.role), ['completion', 'first', 'second', 'third']);
    assert.deepEqual(
      getCompetitionAwardMetadata(restartedStorage, {
        competitionId: 7,
        chainId: 8453,
        escrowAddress: ESCROW,
      }),
      saved,
    );
    assert.deepEqual(listCompetitionAwardMetadata(restartedStorage), [saved]);
    assert.deepEqual(saveCompetitionAwardMetadata(restartedStorage, input), saved);

    assert.throws(() => saveCompetitionAwardMetadata(restartedStorage, {
      ...awardInput({
        competition: { ...input.competition, id: 8 },
      }),
    }), /already assigned/i);
    assert.throws(() => saveCompetitionAwardMetadata(restartedStorage, {
      ...input,
      competition: { ...input.competition, groupName: 'Changed group' },
    }), /cannot be replaced/i);
    assert.equal(getCompetitionAwardMetadata(restartedStorage, {
      competitionId: 99,
      chainId: 8453,
      escrowAddress: ESCROW,
    }), null);
  });
});

test('does not overwrite duplicate template names or recover silently from corrupt local storage', () => {
  return awardsPromise.then(({
    COMPETITION_AWARD_TEMPLATES_KEY,
    createCompetitionAwardTemplate,
    listCompetitionAwardTemplates,
    saveCompetitionAwardTemplate,
  }) => {
  const storage = new MemoryStorage();
  const template = createCompetitionAwardTemplate(awardInput(), 'Same Template');
  saveCompetitionAwardTemplate(storage, template);
  assert.throws(() => saveCompetitionAwardTemplate(storage, template), /already exists/i);
  assert.equal(listCompetitionAwardTemplates(storage).length, 1);

  storage.setItem(COMPETITION_AWARD_TEMPLATES_KEY, '{broken');
  assert.throws(() => listCompetitionAwardTemplates(storage), /invalid JSON/i);
  });
});
