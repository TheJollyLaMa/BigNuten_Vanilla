import { validateStreakRules } from './streakRules.mjs';

export const COMPETITION_AWARD_SCHEMA = 'bignuten-competition-achievement/v1';
export const COMPETITION_AWARD_TEMPLATE_SCHEMA = 'bignuten-competition-award-template/v1';
export const COMPETITION_AWARD_TEMPLATES_KEY = 'bignuten.competition-award-templates.v1';
export const COMPETITION_AWARD_METADATA_KEY = 'bignuten.competition-award-metadata.v1';
export const COMPETITION_AWARD_RECORD_SCHEMA = 'bignuten-competition-award-record/v1';

const BASE_DECENTNFT_IMAGE = 'https://thejollylama.github.io/BigNuten_Vanilla/img/BigNuten.png';
const APP_URL = 'https://thejollylama.github.io/BigNuten_Vanilla/';
const BASESCAN_ADDRESS = 'https://basescan.org/address/';
const UINT256_MAX = (1n << 256n) - 1n;
const MAX_DATE_SECONDS = 8_640_000_000_000;
const AWARD_ROLES = Object.freeze([
  { key: 'completion', label: 'Completion', description: 'Competition completion award.' },
  { key: 'first', label: 'First Place', description: 'First-place competition award.' },
  { key: 'second', label: 'Second Place', description: 'Second-place competition award.' },
  { key: 'third', label: 'Third Place', description: 'Third-place competition award.' },
]);

const PAYOUT_POLICY = Object.freeze({
  contract: 'StreakBetEscrow',
  policyVersion: 2,
  completion: 'Only entrants with Completed status receive the completion token, and only during owner-called settlement.',
  placements: 'The first, second, and third competition places receive their corresponding place token. Tied entrants share the award for their common place; later shared competition ranks skip occupied places. Other completed entrants receive no place token.',
  ranking: 'Completed entrants tie when verified qualifying activity days and submitted-report counts are both equal. Qualification time and join order do not break ties.',
  principal: 'Each tied group pools the starting principal refunds for its occupied slots. Occupied third place starts with half principal; that reduction is shared by the tied group.',
  bonusWeights: 'Each occupied slot contributes its existing bonus share, calculated from the global bonus pool using weights 3:2:1 for places one, two, and three, then 1 for every later slot. The group pools those slot payouts and splits them equally.',
  rounding: 'Each occupied-slot bonus is floored using the original global denominator; the group payout is floor(group pool / tied entrant count). Remaining integer dust goes to the configured treasury.',
  forfeits: 'Forfeits and entrants still incomplete at settlement do not receive awards; forfeited stakes remain in the pool.',
  cancellation: 'Cancellation refunds non-forfeited entrants and does not mint awards.',
  noCompleters: 'If nobody completes, the pot goes to the configured treasury and no awards are minted.',
  mintFailure: 'Award mint failure reverts the entire settlement transaction; payouts and status changes are rolled back.',
  policySource: 'This source metadata describes payout-policy capability version 2 only. The deployed StreakBetEscrow contract is authoritative; a missing capability getter is legacy strict ranking, and this metadata does not select or change deployed economic policy.',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value;
}

function assertAllowedKeys(value, label, allowedKeys, requiredKeys = []) {
  const object = assertObject(value, label);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field "${key}".`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(object, key) || object[key] == null) throw new Error(`${label} is missing required field "${key}".`);
  }
  return object;
}

function boundedText(value, label, maxLength) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`${label} must be 1-${maxLength} printable characters.`);
  }
  return text;
}

function normalizeAddress(value, label, { allowZero = false } = {}) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 20-byte EVM address.`);
  }
  if (!allowZero && /^0x0{40}$/i.test(value)) throw new Error(`${label} cannot be the zero address.`);
  return value;
}

function normalizeInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (
    typeof value !== 'number' && (
      typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)
    )
  ) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function normalizeCompId(value) {
  return normalizeInteger(value, 'Competition ID').toString();
}

function normalizeTokenId(value, label = 'Award token ID') {
  const text = typeof value === 'bigint' ? value.toString() : String(value);
  if (!/^(0|[1-9]\d{0,77})$/.test(text)) throw new Error(`${label} must be a uint256 decimal ID.`);
  const tokenId = BigInt(text);
  if (tokenId > UINT256_MAX) throw new Error(`${label} exceeds uint256.`);
  return tokenId.toString();
}

function normalizeTokenIds(input, reservedTokenIds = []) {
  const ids = assertAllowedKeys(input, 'awardTokenIds', AWARD_ROLES.map(role => role.key), AWARD_ROLES.map(role => role.key));
  const result = Object.fromEntries(AWARD_ROLES.map(({ key }) => [key, normalizeTokenId(ids[key], `awardTokenIds.${key}`)]));
  if (new Set(Object.values(result)).size !== AWARD_ROLES.length) {
    throw new Error('Each competition needs four different Achievement token IDs.');
  }
  if (!Array.isArray(reservedTokenIds)) throw new Error('reservedTokenIds must be an array.');
  const reserved = reservedTokenIds.map((id, index) => normalizeTokenId(id, `reservedTokenIds[${index}]`));
  if (new Set(reserved).size !== reserved.length) throw new Error('reservedTokenIds contains duplicate IDs.');
  if (Object.values(result).some(id => reserved.includes(id))) {
    throw new Error('Achievement token IDs must not reuse a previously registered ID.');
  }
  return result;
}

function normalizeRules(input) {
  const rules = assertAllowedKeys(
    input,
    'rules',
    ['schema', 'metrics', 'requiredActivityDays'],
    ['schema', 'metrics'],
  );
  if (!Array.isArray(rules.metrics) || rules.metrics.length < 1 || rules.metrics.length > 8) {
    throw new Error('rules.metrics must contain between one and eight public metrics.');
  }
  const metrics = rules.metrics.map((metric, index) => {
    const source = assertAllowedKeys(
      metric,
      `rules.metrics[${index}]`,
      ['id', 'type', 'cadence', 'target', 'exerciseType'],
      ['id', 'type', 'cadence', 'target'],
    );
    const normalized = {
      id: boundedText(source.id, `rules.metrics[${index}].id`, 32),
      type: boundedText(source.type, `rules.metrics[${index}].type`, 16),
      cadence: boundedText(source.cadence, `rules.metrics[${index}].cadence`, 8),
      target: Number(source.target),
    };
    if (source.exerciseType != null) {
      const exerciseType = boundedText(source.exerciseType, `rules.metrics[${index}].exerciseType`, 32);
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(exerciseType)) {
        throw new Error(`rules.metrics[${index}].exerciseType must be a public type slug.`);
      }
      normalized.exerciseType = exerciseType;
    }
    return normalized;
  });
  const normalized = { schema: rules.schema, metrics };
  if (rules.requiredActivityDays != null) {
    normalized.requiredActivityDays = normalizeInteger(rules.requiredActivityDays, 'rules.requiredActivityDays', { min: 1, max: 30 });
  }
  validateStreakRules(normalized);
  return normalized;
}

function normalizeStakeToken(input) {
  const token = assertAllowedKeys(input, 'competition.stakeToken', ['address', 'symbol', 'decimals'], ['address', 'symbol', 'decimals']);
  const symbol = boundedText(token.symbol, 'competition.stakeToken.symbol', 10);
  if (!/^[A-Za-z0-9$._-]+$/.test(symbol)) throw new Error('competition.stakeToken.symbol must be a public token symbol.');
  return {
    address: normalizeAddress(token.address, 'competition.stakeToken.address'),
    symbol,
    decimals: normalizeInteger(token.decimals, 'competition.stakeToken.decimals', { min: 0, max: 36 }),
  };
}

function normalizeStakeAmount(value, decimals) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    throw new Error('competition.stakeAmount must be an exact decimal string.');
  }
  const [, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('competition.stakeAmount has more decimals than its token supports.');
  if (!/[1-9]/.test(value)) throw new Error('competition.stakeAmount must be greater than zero.');
  return value;
}

function normalizeRulesCID(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^ipfs:\/\/[A-Za-z0-9]+$/.test(value)) {
    throw new Error('competition.rulesCID must be ipfs://<CID> when provided.');
  }
  return value;
}

function normalizeCompetition(input) {
  const competition = assertAllowedKeys(
    input,
    'competition',
    ['id', 'name', 'groupName', 'creator', 'stakeToken', 'stakeAmount', 'startTime', 'endTime', 'rules', 'rulesCID'],
    ['id', 'name', 'groupName', 'creator', 'stakeToken', 'stakeAmount', 'startTime', 'endTime', 'rules'],
  );
  const stakeToken = normalizeStakeToken(competition.stakeToken);
  const startTime = normalizeInteger(competition.startTime, 'competition.startTime', { min: 1, max: MAX_DATE_SECONDS });
  const endTime = normalizeInteger(competition.endTime, 'competition.endTime', { min: 1, max: MAX_DATE_SECONDS });
  if (endTime <= startTime) throw new Error('competition.endTime must be after startTime.');
  return {
    id: normalizeCompId(competition.id),
    name: boundedText(competition.name, 'competition.name', 80),
    groupName: boundedText(competition.groupName, 'competition.groupName', 64),
    creator: normalizeAddress(competition.creator, 'competition.creator'),
    stakeToken,
    stakeAmount: normalizeStakeAmount(competition.stakeAmount, stakeToken.decimals),
    startTime,
    endTime,
    durationSeconds: endTime - startTime,
    rules: normalizeRules(competition.rules),
    rulesCID: normalizeRulesCID(competition.rulesCID),
  };
}

function normalizeDeployment(input) {
  const deployment = assertAllowedKeys(
    input,
    'deployment',
    ['chainId', 'nftAddress', 'escrowAddress', 'stakeTokenAddress'],
    ['chainId', 'nftAddress', 'escrowAddress', 'stakeTokenAddress'],
  );
  return {
    chainId: normalizeInteger(deployment.chainId, 'deployment.chainId', { min: 1 }),
    nftAddress: normalizeAddress(deployment.nftAddress, 'deployment.nftAddress'),
    escrowAddress: normalizeAddress(deployment.escrowAddress, 'deployment.escrowAddress'),
    stakeTokenAddress: normalizeAddress(deployment.stakeTokenAddress, 'deployment.stakeTokenAddress'),
  };
}

function normalizeInput(input) {
  const source = assertAllowedKeys(input, 'award metadata input', ['competition', 'deployment', 'awardTokenIds', 'reservedTokenIds'], ['competition', 'deployment', 'awardTokenIds']);
  const competition = normalizeCompetition(source.competition);
  const deployment = normalizeDeployment(source.deployment);
  if (competition.stakeToken.address.toLowerCase() !== deployment.stakeTokenAddress.toLowerCase()) {
    throw new Error('competition.stakeToken.address must match the configured StreakBet stake token.');
  }
  return {
    competition,
    deployment,
    awardTokenIds: normalizeTokenIds(source.awardTokenIds, source.reservedTokenIds || []),
  };
}

function buildLinks(deployment, rulesCID) {
  const onchainAddressUrl = deployment.chainId === 8453
    ? `${BASESCAN_ADDRESS}${deployment.escrowAddress}`
    : null;
  const nftAddressUrl = deployment.chainId === 8453
    ? `${BASESCAN_ADDRESS}${deployment.nftAddress}`
    : null;
  const rulesGatewayUrl = rulesCID ? `https://dweb.link/ipfs/${rulesCID.slice('ipfs://'.length)}` : null;
  return {
    chainId: deployment.chainId,
    escrowAddress: deployment.escrowAddress,
    escrow: onchainAddressUrl,
    achievementContractAddress: deployment.nftAddress,
    achievementContract: nftAddressUrl,
    rulesURI: rulesCID,
    rules: rulesGatewayUrl,
  };
}

function metadataForRole(role, input) {
  const { competition, deployment, awardTokenIds } = input;
  const tokenId = awardTokenIds[role.key];
  const roleText = role.key === 'completion'
    ? 'completion'
    : `${role.label.toLowerCase()} placement`;
  const attributes = [
    { trait_type: 'Competition ID', value: competition.id },
    { trait_type: 'Competition', value: competition.name },
    { trait_type: 'Group', value: competition.groupName },
    { trait_type: 'Creator', value: competition.creator },
    { trait_type: 'Award', value: role.label },
    { trait_type: 'Token', value: competition.stakeToken.symbol },
    { trait_type: 'Stake amount', value: competition.stakeAmount },
    { trait_type: 'Duration days', value: competition.durationSeconds / 86400 },
    { trait_type: 'Start time', value: new Date(competition.startTime * 1000).toISOString() },
    { trait_type: 'End time', value: new Date(competition.endTime * 1000).toISOString() },
  ];
  return {
    tokenId,
    fileName: `${tokenId}.json`,
    role: role.key,
    metadata: {
      name: `${competition.name} — ${role.label} (Competition #${competition.id})`,
      description: `BigNuten ${roleText} award. This ERC-1155 Achievement token is issued by StreakBetEscrow only when the competition is settled; it is not a health record or proof of a medical outcome.`,
      image: BASE_DECENTNFT_IMAGE,
      external_url: APP_URL,
      attributes,
      properties: {
        schema: COMPETITION_AWARD_SCHEMA,
        competition: {
          id: competition.id,
          name: competition.name,
          groupName: competition.groupName,
          creator: competition.creator,
          stakeToken: competition.stakeToken,
          stakeAmount: competition.stakeAmount,
          startTime: new Date(competition.startTime * 1000).toISOString(),
          endTime: new Date(competition.endTime * 1000).toISOString(),
          durationSeconds: competition.durationSeconds,
          rules: competition.rules,
        },
        award: {
          role: role.key,
          label: role.label,
          tokenId,
          contract: 'ERC-1155 Achievement token from the configured DecentNFT contract',
          amountPerAwardee: 1,
        },
        links: buildLinks(deployment, competition.rulesCID),
        payoutPolicy: { ...PAYOUT_POLICY },
      },
    },
  };
}

export function createCompetitionAwardTokenIdRange(firstTokenId, reservedTokenIds = []) {
  const first = BigInt(normalizeTokenId(firstTokenId, 'firstTokenId'));
  const ids = AWARD_ROLES.map((_, index) => {
    const tokenId = first + BigInt(index);
    if (tokenId > UINT256_MAX) throw new Error('Achievement token ID range exceeds uint256.');
    return tokenId.toString();
  });
  return normalizeTokenIds(Object.fromEntries(AWARD_ROLES.map(({ key }, index) => [key, ids[index]])), reservedTokenIds);
}

export function buildCompetitionAwardMetadata(input) {
  const normalized = normalizeInput(input);
  return AWARD_ROLES.map(role => metadataForRole(role, normalized));
}

function canonicalInput(normalized) {
  const { competition, deployment, awardTokenIds } = normalized;
  return {
    competition: {
      id: competition.id,
      name: competition.name,
      groupName: competition.groupName,
      creator: competition.creator,
      stakeToken: competition.stakeToken,
      stakeAmount: competition.stakeAmount,
      startTime: competition.startTime,
      endTime: competition.endTime,
      rules: competition.rules,
      rulesCID: competition.rulesCID,
    },
    deployment,
    awardTokenIds,
  };
}

function awardRecordKey(record) {
  return `${record.chainId}:${record.escrowAddress.toLowerCase()}:${record.competitionId}`;
}

function publicRecord(normalized) {
  const { competition, deployment, awardTokenIds } = normalized;
  return {
    schema: COMPETITION_AWARD_RECORD_SCHEMA,
    competitionId: competition.id,
    chainId: deployment.chainId,
    escrowAddress: deployment.escrowAddress,
    achievementContractAddress: deployment.nftAddress,
    awardTokenIds: { ...awardTokenIds },
    records: AWARD_ROLES.map(role => metadataForRole(role, normalized)),
  };
}

function readAwardMetadataRecords(storage) {
  const store = assertStorage(storage);
  const raw = store.getItem(COMPETITION_AWARD_METADATA_KEY);
  if (raw == null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Saved competition award metadata is invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Saved competition award metadata must be an array.');

  const entries = parsed.map((entry, index) => {
    const stored = assertAllowedKeys(
      entry,
      `saved award metadata record ${index}`,
      ['schema', 'competitionId', 'chainId', 'escrowAddress', 'nftAddress', 'input'],
      ['schema', 'competitionId', 'chainId', 'escrowAddress', 'nftAddress', 'input'],
    );
    if (stored.schema !== COMPETITION_AWARD_RECORD_SCHEMA) throw new Error('Unsupported saved competition award metadata schema.');
    const normalized = normalizeInput(stored.input);
    const record = publicRecord(normalized);
    if (
      record.competitionId !== normalizeCompId(stored.competitionId) ||
      record.chainId !== normalizeInteger(stored.chainId, 'saved award metadata chainId', { min: 1 }) ||
      record.escrowAddress.toLowerCase() !== normalizeAddress(stored.escrowAddress, 'saved award metadata escrowAddress').toLowerCase() ||
      record.achievementContractAddress.toLowerCase() !== normalizeAddress(stored.nftAddress, 'saved award metadata nftAddress').toLowerCase()
    ) {
      throw new Error('Saved competition award metadata identity does not match its validated input.');
    }
    return { record, input: canonicalInput(normalized) };
  });

  const keys = new Set();
  const tokenIdsByCollection = new Map();
  for (const { record } of entries) {
    const key = awardRecordKey(record);
    if (keys.has(key)) throw new Error('Saved competition award metadata contains a duplicate competition identity.');
    keys.add(key);
    const collectionKey = `${record.chainId}:${record.achievementContractAddress.toLowerCase()}`;
    const seenIds = tokenIdsByCollection.get(collectionKey) || new Set();
    for (const id of Object.values(record.awardTokenIds)) {
      if (seenIds.has(id)) throw new Error('Saved competition award metadata reuses an Achievement token ID.');
      seenIds.add(id);
    }
    tokenIdsByCollection.set(collectionKey, seenIds);
  }
  return entries;
}

export function listCompetitionAwardMetadata(storage) {
  return readAwardMetadataRecords(storage).map(({ record }) => JSON.parse(JSON.stringify(record)));
}

export function getCompetitionAwardMetadata(storage, identityInput) {
  const identity = assertAllowedKeys(identityInput, 'award metadata lookup', ['competitionId', 'chainId', 'escrowAddress'], ['competitionId', 'chainId', 'escrowAddress']);
  const key = `${normalizeInteger(identity.chainId, 'chainId', { min: 1 })}:${normalizeAddress(identity.escrowAddress, 'escrowAddress').toLowerCase()}:${normalizeCompId(identity.competitionId)}`;
  const match = readAwardMetadataRecords(storage).find(({ record }) => awardRecordKey(record) === key);
  return match ? JSON.parse(JSON.stringify(match.record)) : null;
}

export function saveCompetitionAwardMetadata(storage, input) {
  const store = assertStorage(storage);
  const normalized = normalizeInput(input);
  const nextRecord = publicRecord(normalized);
  const nextInput = canonicalInput(normalized);
  const entries = readAwardMetadataRecords(store);
  const key = awardRecordKey(nextRecord);
  const existing = entries.find(({ record }) => awardRecordKey(record) === key);
  if (existing) {
    if (JSON.stringify(existing.input) !== JSON.stringify(nextInput)) {
      throw new Error('Achievement metadata for this competition is already saved and cannot be replaced.');
    }
    return JSON.parse(JSON.stringify(existing.record));
  }

  const collectionKey = `${nextRecord.chainId}:${nextRecord.achievementContractAddress.toLowerCase()}`;
  const localTokenIds = new Set(entries
    .filter(({ record }) => `${record.chainId}:${record.achievementContractAddress.toLowerCase()}` === collectionKey)
    .flatMap(({ record }) => Object.values(record.awardTokenIds)));
  if (Object.values(nextRecord.awardTokenIds).some(id => localTokenIds.has(id))) {
    throw new Error('Achievement token IDs are already assigned to another saved local competition.');
  }

  const nextEntries = [
    ...entries.map(({ record, input: savedInput }) => ({
      schema: COMPETITION_AWARD_RECORD_SCHEMA,
      competitionId: record.competitionId,
      chainId: record.chainId,
      escrowAddress: record.escrowAddress,
      nftAddress: record.achievementContractAddress,
      input: savedInput,
    })),
    {
      schema: COMPETITION_AWARD_RECORD_SCHEMA,
      competitionId: nextRecord.competitionId,
      chainId: nextRecord.chainId,
      escrowAddress: nextRecord.escrowAddress,
      nftAddress: nextRecord.achievementContractAddress,
      input: nextInput,
    },
  ];
  store.setItem(COMPETITION_AWARD_METADATA_KEY, JSON.stringify(nextEntries));
  return JSON.parse(JSON.stringify(nextRecord));
}

function templateSlug(value) {
  const slug = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  if (!slug) throw new Error('Template name must contain letters or numbers.');
  return slug;
}

function validateTemplate(input) {
  const template = assertAllowedKeys(input, 'template', ['schema', 'id', 'name', 'groupName', 'durationSeconds', 'stakeToken', 'stakeAmount', 'rules', 'rulesCID'], ['schema', 'id', 'name', 'groupName', 'durationSeconds', 'stakeToken', 'stakeAmount', 'rules']);
  if (template.schema !== COMPETITION_AWARD_TEMPLATE_SCHEMA) throw new Error('Unsupported competition award template schema.');
  const name = boundedText(template.name, 'template.name', 64);
  if (template.id !== templateSlug(name)) throw new Error('template.id must match its template name.');
  const stakeToken = normalizeStakeToken(template.stakeToken);
  return {
    schema: COMPETITION_AWARD_TEMPLATE_SCHEMA,
    id: template.id,
    name,
    groupName: boundedText(template.groupName, 'template.groupName', 64),
    durationSeconds: normalizeInteger(template.durationSeconds, 'template.durationSeconds', { min: 1, max: 3650 * 86400 }),
    stakeToken,
    stakeAmount: normalizeStakeAmount(template.stakeAmount, stakeToken.decimals),
    rules: normalizeRules(template.rules),
    rulesCID: normalizeRulesCID(template.rulesCID),
  };
}

export function createCompetitionAwardTemplate(input, templateName) {
  const normalized = normalizeInput(input);
  const name = boundedText(templateName || normalized.competition.name, 'template.name', 64);
  return validateTemplate({
    schema: COMPETITION_AWARD_TEMPLATE_SCHEMA,
    id: templateSlug(name),
    name,
    groupName: normalized.competition.groupName,
    durationSeconds: normalized.competition.durationSeconds,
    stakeToken: normalized.competition.stakeToken,
    stakeAmount: normalized.competition.stakeAmount,
    rules: normalized.competition.rules,
    rulesCID: normalized.competition.rulesCID,
  });
}

function assertStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('A localStorage-compatible template store is required.');
  }
  return storage;
}

function readTemplates(storage) {
  const store = assertStorage(storage);
  const raw = store.getItem(COMPETITION_AWARD_TEMPLATES_KEY);
  if (raw == null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Saved competition award templates are invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Saved competition award templates must be an array.');
  const templates = parsed.map(validateTemplate);
  if (new Set(templates.map(template => template.id)).size !== templates.length) {
    throw new Error('Saved competition award templates contain duplicate names.');
  }
  return templates;
}

export function listCompetitionAwardTemplates(storage) {
  return readTemplates(storage).map(template => JSON.parse(JSON.stringify(template)));
}

export function saveCompetitionAwardTemplate(storage, templateInput) {
  const store = assertStorage(storage);
  const template = validateTemplate(templateInput);
  const templates = readTemplates(store);
  if (templates.some(existing => existing.id === template.id)) {
    throw new Error(`A competition award template named "${template.name}" already exists.`);
  }
  templates.push(template);
  store.setItem(COMPETITION_AWARD_TEMPLATES_KEY, JSON.stringify(templates));
  return JSON.parse(JSON.stringify(template));
}

export function applyCompetitionAwardTemplate(storage, templateId, identityInput) {
  const template = readTemplates(storage).find(candidate => candidate.id === templateId);
  if (!template) throw new Error(`Competition award template "${templateId}" was not found.`);
  const identity = assertAllowedKeys(
    identityInput,
    'template identity',
    ['competition', 'deployment', 'awardTokenIds', 'reservedTokenIds'],
    ['competition', 'deployment', 'awardTokenIds'],
  );
  const competition = assertAllowedKeys(
    identity.competition,
    'template identity.competition',
    ['id', 'name', 'groupName', 'creator', 'stakeToken', 'stakeAmount', 'startTime', 'endTime', 'rules', 'rulesCID'],
    ['id', 'creator', 'startTime'],
  );
  const startTime = normalizeInteger(competition.startTime, 'competition.startTime', { min: 1, max: MAX_DATE_SECONDS });
  const input = {
    competition: {
      id: normalizeCompId(competition.id),
      name: template.name,
      groupName: template.groupName,
      creator: normalizeAddress(competition.creator, 'competition.creator'),
      stakeToken: template.stakeToken,
      stakeAmount: template.stakeAmount,
      startTime,
      endTime: startTime + template.durationSeconds,
      rules: template.rules,
      rulesCID: template.rulesCID,
    },
    deployment: identity.deployment,
    awardTokenIds: identity.awardTokenIds,
  };
  if (identity.reservedTokenIds != null) input.reservedTokenIds = identity.reservedTokenIds;
  normalizeInput(input);
  return input;
}

export function mountCompetitionAwardsPanel(root, { storage } = {}) {
  if (!root || typeof root.querySelector !== 'function') throw new Error('An existing competition award panel root is required.');
  const templateStore = storage || globalThis.localStorage;
  assertStorage(templateStore);
  root.innerHTML = `
    <section class="competition-awards-panel" aria-labelledby="competition-awards-title">
      <h3 id="competition-awards-title">Competition achievement metadata</h3>
      <p>Local preview only: this panel does not upload metadata, send transactions, or include participant health data.</p>
      <label>Competition award configuration JSON
        <textarea data-award-input rows="14" spellcheck="false" autocomplete="off"></textarea>
      </label>
      <div>
        <button type="button" data-award-preview>Preview metadata locally</button>
        <button type="button" data-award-save-record>Save local competition metadata</button>
        <label>Template name <input data-template-name maxlength="64" autocomplete="off"></label>
        <button type="button" data-template-save>Save local template</button>
      </div>
      <div>
        <label>Saved local template <select data-template-select></select></label>
        <button type="button" data-template-apply>Apply to current competition</button>
      </div>
      <p data-award-status role="status" aria-live="polite"></p>
      <pre data-award-output aria-label="Local metadata preview"></pre>
    </section>`;

  const input = root.querySelector('[data-award-input]');
  const previewButton = root.querySelector('[data-award-preview]');
  const saveRecordButton = root.querySelector('[data-award-save-record]');
  const templateName = root.querySelector('[data-template-name]');
  const saveButton = root.querySelector('[data-template-save]');
  const templateSelect = root.querySelector('[data-template-select]');
  const applyButton = root.querySelector('[data-template-apply]');
  const status = root.querySelector('[data-award-status]');
  const output = root.querySelector('[data-award-output]');

  const parseInput = () => JSON.parse(input.value);
  const refreshTemplates = () => {
    const selected = templateSelect.value;
    templateSelect.textContent = '';
    for (const template of listCompetitionAwardTemplates(templateStore)) {
      const option = root.ownerDocument.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      templateSelect.append(option);
    }
    if ([...templateSelect.options].some(option => option.value === selected)) templateSelect.value = selected;
    applyButton.disabled = templateSelect.options.length === 0;
  };
  const showError = error => {
    output.textContent = '';
    status.textContent = error.message;
  };

  previewButton.addEventListener('click', () => {
    try {
      const metadata = buildCompetitionAwardMetadata(parseInput());
      output.textContent = JSON.stringify(metadata, null, 2);
      status.textContent = 'Local preview generated. No upload or transaction was performed.';
    } catch (error) {
      showError(error);
    }
  });
  saveRecordButton.addEventListener('click', () => {
    try {
      const record = saveCompetitionAwardMetadata(templateStore, parseInput());
      output.textContent = JSON.stringify(record.records, null, 2);
      status.textContent = `Competition ${record.competitionId} metadata saved in this browser only. No upload or transaction was performed.`;
    } catch (error) {
      showError(error);
    }
  });
  saveButton.addEventListener('click', () => {
    try {
      saveCompetitionAwardTemplate(templateStore, createCompetitionAwardTemplate(parseInput(), templateName.value));
      refreshTemplates();
      status.textContent = 'Template saved in this browser only; competition ID, creator, dates, and token IDs were not saved.';
    } catch (error) {
      showError(error);
    }
  });
  applyButton.addEventListener('click', () => {
    try {
      const nextInput = applyCompetitionAwardTemplate(templateStore, templateSelect.value, parseInput());
      input.value = JSON.stringify(nextInput, null, 2);
      output.textContent = '';
      status.textContent = 'Template terms applied locally. Confirm fresh competition and award token IDs before preview.';
    } catch (error) {
      showError(error);
    }
  });

  refreshTemplates();
  return { refreshTemplates };
}
