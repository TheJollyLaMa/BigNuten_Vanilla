const MANIFEST_KEY = 'bignutenSnapshotManifest';
const POINTER_KEY = 'bignutenSnapshotPointer';

const DEFAULT_RETENTION = {
  hourlyKeep: 48,
  monthlyKeepMonths: 12,
  annualKeepYears: 5,
};

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function toDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function sameMonth(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

function sameYear(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear();
}

function monthAge(current, candidate) {
  return (
    (current.getUTCFullYear() - candidate.getUTCFullYear()) * 12 +
    (current.getUTCMonth() - candidate.getUTCMonth())
  );
}

function yearAge(current, candidate) {
  return current.getUTCFullYear() - candidate.getUTCFullYear();
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const cid = String(entry.cid || '').trim();
  const hash = String(entry.hash || entry.fileHash || '').trim();
  const timestamp = String(entry.timestamp || entry.createdAt || new Date().toISOString());
  if (!cid) return null;
  return {
    cid,
    hash,
    timestamp,
    tier: entry.tier || 'hourly',
    archiveTier: entry.archiveTier || entry.archive || null,
    provider: entry.provider || 'lighthouse',
    verified: entry.verified !== false,
    source: entry.source || 'upload',
    sessionAddress: entry.sessionAddress || '',
    fileName: entry.fileName || 'bignuten-health-data.json',
  };
}

function normalizeManifest(manifest) {
  const value = manifest && typeof manifest === 'object' ? manifest : {};
  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots.map(normalizeEntry).filter(Boolean)
    : [];
  snapshots.sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp));

  const current = normalizeEntry(value.current) || snapshots[0] || null;
  const retention = {
    ...DEFAULT_RETENTION,
    ...(value.retention && typeof value.retention === 'object' ? value.retention : {}),
  };

  return {
    version: 1,
    updatedAt: value.updatedAt || current?.timestamp || new Date().toISOString(),
    current,
    snapshots,
    cleanupCandidates: Array.isArray(value.cleanupCandidates)
      ? value.cleanupCandidates.map(normalizeEntry).filter(Boolean)
      : [],
    retention,
  };
}

export function loadSnapshotManifest() {
  return normalizeManifest(safeParse(localStorage.getItem(MANIFEST_KEY), {}));
}

export function saveSnapshotManifest(manifest) {
  const normalized = normalizeManifest(manifest);
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(normalized));
  if (normalized.current) {
    localStorage.setItem(POINTER_KEY, JSON.stringify(normalized.current));
  } else {
    localStorage.removeItem(POINTER_KEY);
  }
  return normalized;
}

export function clearSnapshotManifest() {
  localStorage.removeItem(MANIFEST_KEY);
  localStorage.removeItem(POINTER_KEY);
  localStorage.removeItem('snapshotHistory');
}

export function getCurrentSnapshotPointer() {
  const manifest = loadSnapshotManifest();
  return manifest.current || null;
}

function chooseArchiveTier(entry, existingSnapshots) {
  if (!existingSnapshots.length) return null;
  const candidateDate = toDate(entry.timestamp);
  const sameYearSnapshot = existingSnapshots.some(snapshot => sameYear(candidateDate, toDate(snapshot.timestamp)));
  if (!sameYearSnapshot) return 'annual';

  const sameMonthSnapshot = existingSnapshots.some(snapshot => sameMonth(candidateDate, toDate(snapshot.timestamp)));
  if (!sameMonthSnapshot) return 'monthly';

  return null;
}

function selectRetentionSet(snapshots, retention, currentTime) {
  const kept = new Set();
  const byAge = [...snapshots].sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp));

  const keepAnnual = byAge.filter(snapshot => snapshot.archiveTier === 'annual' && yearAge(currentTime, toDate(snapshot.timestamp)) < retention.annualKeepYears);
  keepAnnual.forEach(snapshot => kept.add(snapshot.cid));

  const keepMonthly = byAge.filter(snapshot => snapshot.archiveTier === 'monthly' && monthAge(currentTime, toDate(snapshot.timestamp)) < retention.monthlyKeepMonths);
  keepMonthly.forEach(snapshot => kept.add(snapshot.cid));

  byAge
    .filter(snapshot => !snapshot.archiveTier)
    .slice(0, Math.max(0, Number(retention.hourlyKeep) || 0))
    .forEach(snapshot => kept.add(snapshot.cid));

  return kept;
}

function trimCandidates(candidates, limit = 25) {
  return candidates.slice(0, Math.max(0, limit));
}

function syncLegacyHistory(manifest) {
  localStorage.setItem(
    'snapshotHistory',
    JSON.stringify(
      manifest.snapshots.map(snapshot => ({
        cid: snapshot.cid,
        hash: snapshot.hash,
        timestamp: snapshot.timestamp,
        tier: snapshot.tier,
        archiveTier: snapshot.archiveTier,
        provider: snapshot.provider,
      }))
    )
  );
}

export function recordSnapshotUpload({
  cid,
  hash,
  timestamp = new Date().toISOString(),
  provider = 'lighthouse',
  source = 'upload',
  sessionAddress = '',
  fileName = 'bignuten-health-data.json',
} = {}) {
  const entry = normalizeEntry({
    cid,
    hash,
    timestamp,
    provider,
    source,
    sessionAddress,
    fileName,
  });

  if (!entry) throw new Error('Cannot record an empty snapshot entry.');

  const manifest = loadSnapshotManifest();
  const snapshots = [entry, ...manifest.snapshots.filter(snapshot => snapshot.cid !== entry.cid)];
  const currentTime = toDate(entry.timestamp);
  entry.tier = 'hourly';
  entry.archiveTier = chooseArchiveTier(entry, snapshots.slice(1));
  const retainedSet = selectRetentionSet(snapshots, manifest.retention, currentTime);
  retainedSet.add(entry.cid);

  const retainedSnapshots = snapshots.filter(snapshot => retainedSet.has(snapshot.cid));
  const cleanupCandidates = snapshots.filter(snapshot => !retainedSet.has(snapshot.cid));

  const nextManifest = saveSnapshotManifest({
    ...manifest,
    current: entry,
    updatedAt: entry.timestamp,
    snapshots: retainedSnapshots,
    cleanupCandidates: trimCandidates(cleanupCandidates),
  });

  localStorage.setItem('lastAutoSnapshotTimestamp', String(Date.now()));
  syncLegacyHistory(nextManifest);
  return {
    entry,
    manifest: nextManifest,
    cleanupCandidates,
  };
}

export function getSnapshotLifecycleSummary() {
  const manifest = loadSnapshotManifest();
  const snapshots = manifest.snapshots;
  return {
    current: manifest.current,
    retention: manifest.retention,
    counts: {
      total: snapshots.length,
      hourly: snapshots.filter(snapshot => !snapshot.archiveTier).length,
      monthly: snapshots.filter(snapshot => snapshot.archiveTier === 'monthly').length,
      annual: snapshots.filter(snapshot => snapshot.archiveTier === 'annual').length,
      cleanup: manifest.cleanupCandidates.length,
    },
  };
}
