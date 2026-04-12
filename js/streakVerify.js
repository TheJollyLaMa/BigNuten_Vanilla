/**
 * js/streakVerify.js
 * v3.1.0 — Streak Verification Engine & Daily Report Builder
 *
 * Provides:
 *  - checkDataForDate(source, dateStr) — check if user logged data for a given day
 *  - buildDailyReport(comp, verifications, previousCID) — build chained IPFS report
 *  - publishDailyReport(report) — upload report to IPFS via w3up
 *  - runAutoVerify() — on app load, auto-check & submit reports for active comps
 *
 * Data source mapping:
 *  - water       → localStorage 'waterDailyHistory' (keyed by YYYY-MM-DD)
 *  - weight      → fitnessTrackerData.weightLogs (has timestamp)
 *  - exercise    → fitnessTrackerData.exercises.entries (has timestamp)
 *  - nutrition   → fitnessTrackerData.foods (has timestamp)
 *  - supplements → fitnessTrackerData.supplements (has timestamp)
 *
 * Daily reports are chained: each report includes previousReportCID,
 * forming an immutable linked list on IPFS.
 *
 * Related issue: #71 (v3.1.0 Epic).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORT_CHAIN_KEY = 'bignuten_streak_report_chain'; // { [compId]: { latestCID, reports[] } }
const VERIFY_TS_KEY    = 'bignuten_streak_last_verify';  // ISO timestamp of last auto-verify

// Data source labels for the UI
export const DATA_SOURCES = [
  { value: 'water',       label: '💧 Water Intake' },
  { value: 'weight',      label: '⚖️ Weight Logs' },
  { value: 'exercise',    label: '🏋️ Exercise' },
  { value: 'nutrition',   label: '🥗 Nutrition' },
  { value: 'supplements', label: '💊 Supplements' },
];

// ─── Data Source Checkers ─────────────────────────────────────────────────────

/**
 * Check if the user logged data for a given date string (YYYY-MM-DD).
 * @param {string} source — one of: water, weight, exercise, nutrition, supplements
 * @param {string} dateStr — YYYY-MM-DD format
 * @returns {boolean}
 */
export function checkDataForDate(source, dateStr) {
  switch (source) {
    case 'water':
      return _checkWater(dateStr);
    case 'weight':
      return _checkTimestampArray('weightLogs', dateStr);
    case 'exercise':
      return _checkExercise(dateStr);
    case 'nutrition':
      return _checkTimestampArray('foods', dateStr);
    case 'supplements':
      return _checkTimestampArray('supplements', dateStr);
    default:
      console.warn(`[StreakVerify] Unknown data source: ${source}`);
      return false;
  }
}

function _checkWater(dateStr) {
  try {
    // waterDailyHistory is { "YYYY-MM-DD": count }
    const hist = JSON.parse(localStorage.getItem('waterDailyHistory') || '{}');
    const count = hist[dateStr];
    return typeof count === 'number' && count > 0;
  } catch { return false; }
}

function _checkTimestampArray(field, dateStr) {
  try {
    const raw = localStorage.getItem('fitnessTrackerData');
    if (!raw) return false;
    const data = JSON.parse(raw);
    const arr = data[field];
    if (!Array.isArray(arr)) return false;
    return arr.some(entry => {
      const ts = entry.timestamp || entry.date;
      if (!ts) return false;
      return _toDateStr(ts) === dateStr;
    });
  } catch { return false; }
}

function _checkExercise(dateStr) {
  try {
    const raw = localStorage.getItem('fitnessTrackerData');
    if (!raw) return false;
    const data = JSON.parse(raw);
    const ex = data.exercises;
    if (!ex) return false;
    const entries = Array.isArray(ex) ? ex : (ex.entries || []);
    return entries.some(entry => {
      const ts = entry.timestamp || entry.date;
      if (!ts) return false;
      return _toDateStr(ts) === dateStr;
    });
  } catch { return false; }
}

/** Convert a timestamp (epoch ms, ISO string, or YYYY-MM-DD) to YYYY-MM-DD. */
function _toDateStr(ts) {
  if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Get today's date as YYYY-MM-DD in user's timezone. */
function _todayStr() {
  return new Date().toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD
}

/** Get yesterday's date as YYYY-MM-DD. */
function _yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

// ─── Daily Report Builder ─────────────────────────────────────────────────────

/**
 * Build a daily streak report object suitable for IPFS publishing.
 * @param {object} comp — competition object from fetchAllCompetitions()
 * @param {Array} verifications — [{wallet, verified, dataSource, dateChecked}]
 * @param {string} previousCID — CID of the previous day's report (or '' for day 1)
 * @returns {object} report
 */
export function buildDailyReport(comp, verifications, previousCID) {
  const now = new Date().toISOString();
  return {
    version: 1,
    compId: comp.id,
    compName: comp.name,
    date: _todayStr(),
    generatedAt: now,
    previousReportCID: previousCID || null,
    dataSource: extractSource(comp.metadataCID),
    cycle: extractCycleFromMeta(comp.metadataCID),
    stakeToken: comp.stakeToken,
    stakeAmount: String(comp.stakeAmount),
    potBalance: String(comp.potBalance),
    totalWeeks: comp.totalWeeks,
    startTime: comp.startTime,
    endTime: comp.endTime,
    yieldEnabled: comp.yieldEnabled,
    entrantCount: comp.entrantCount,
    winnerCount: comp.winnerCount,
    status: comp.status,
    verifications,
    summary: {
      total: verifications.length,
      verified: verifications.filter(v => v.verified).length,
      failed: verifications.filter(v => !v.verified).length,
    },
  };
}

// ─── IPFS Publishing ──────────────────────────────────────────────────────────

/**
 * Publish a daily report to IPFS via the w3up client.
 * Returns the CID string or null on failure.
 * @param {object} report — built by buildDailyReport()
 * @returns {Promise<string|null>}
 */
export async function publishDailyReport(report) {
  try {
    // Use existing w3up client if available
    const client = window._w3upClient;
    if (!client) {
      console.warn('[StreakVerify] No w3up client available for IPFS upload.');
      return null;
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const cid = await client.uploadFile(blob);
    const cidStr = cid.toString();

    // Update local report chain
    _saveToChain(report.compId, cidStr, report);

    return cidStr;
  } catch (err) {
    console.error('[StreakVerify] IPFS publish failed:', err);
    return null;
  }
}

// ─── Report Chain Storage ─────────────────────────────────────────────────────

function _getChainData() {
  try { return JSON.parse(localStorage.getItem(REPORT_CHAIN_KEY)) || {}; }
  catch { return {}; }
}

function _saveToChain(compId, cid, report) {
  const chains = _getChainData();
  if (!chains[compId]) chains[compId] = { latestCID: null, reports: [] };
  chains[compId].latestCID = cid;
  chains[compId].reports.unshift({
    cid,
    date: report.date,
    generatedAt: report.generatedAt,
    verified: report.summary.verified,
    failed: report.summary.failed,
  });
  // Keep last 90 entries
  if (chains[compId].reports.length > 90) chains[compId].reports.length = 90;
  localStorage.setItem(REPORT_CHAIN_KEY, JSON.stringify(chains));
}

/**
 * Get the latest report CID for a competition (for chaining).
 * @param {number} compId
 * @returns {string} CID or ''
 */
export function getLatestReportCID(compId) {
  const chains = _getChainData();
  return (chains[compId] && chains[compId].latestCID) || '';
}

/**
 * Get full report chain for a competition.
 * @param {number} compId
 * @returns {Array} [{cid, date, generatedAt, verified, failed}]
 */
export function getReportChain(compId) {
  const chains = _getChainData();
  return (chains[compId] && chains[compId].reports) || [];
}

// ─── Auto-Verification ───────────────────────────────────────────────────────

/**
 * Run auto-verification for all active streak bet competitions
 * the user has joined. Checks local data and auto-submits reports
 * to the contract if the data is present.
 *
 * Called on app load. Runs once per calendar day.
 */
export async function runAutoVerify() {
  // Only run once per day
  const lastVerify = localStorage.getItem(VERIFY_TS_KEY);
  const today = _todayStr();
  if (lastVerify === today) return;

  // Need wallet and contract
  if (!window.ethereum) return;
  const streakAddr = (window.CONTRACTS && window.CONTRACTS.streakBetEscrow) || '';
  if (!streakAddr) return;

  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    const wallet = accounts[0];
    if (!wallet) return;

    const provider = new ethers.JsonRpcProvider(
      (window.CONTRACTS && window.CONTRACTS.rpcUrl) || 'https://mainnet.optimism.io'
    );
    const ABI = [
      'function nextCompId() view returns (uint256)',
      'function getCompetition(uint256 compId) view returns (tuple(string name, address stakeToken, uint256 stakeAmount, uint256 totalWeeks, uint256 startTime, uint256 endTime, uint256 joinDeadline, bool yieldEnabled, bool potDeployed, string metadataCID, uint8 status, uint256 potBalance, uint256 entrantCount, uint256 winnerCount))',
      'function getEntrant(uint256 compId, address addr) view returns (bool joined, uint256 reportsSubmitted, uint8 status)',
    ];
    const contract = new ethers.Contract(streakAddr, ABI, provider);
    const total = Number(await contract.nextCompId());

    const yesterday = _yesterdayStr();
    let autoSubmitted = 0;

    for (let i = 0; i < total; i++) {
      try {
        const c = await contract.getCompetition(i);
        if (Number(c.status) !== 0) continue; // only active

        const e = await contract.getEntrant(i, wallet);
        if (!e.joined || Number(e.status) !== 0) continue; // must be joined & active

        const source = extractSource(c.metadataCID);
        if (!source) continue; // no data source means manual-report comp

        // Check yesterday's data (bot runs "after midnight")
        const verified = checkDataForDate(source, yesterday);
        if (verified) {
          console.log(`[StreakVerify] Auto-verified comp #${i} (${source}) for ${yesterday}`);
          autoSubmitted++;
          // Auto-submit on-chain report via MetaMask
          try {
            const browserProvider = new ethers.BrowserProvider(window.ethereum);
            const signer = await browserProvider.getSigner();
            const writeContract = new ethers.Contract(streakAddr, [
              'function submitReport(uint256 compId, string proofCID)',
            ], signer);
            const tx = await writeContract.submitReport(i, `auto:${source}:${yesterday}`);
            await tx.wait();
            console.log(`[StreakVerify] Auto-submitted report for comp #${i}`);
          } catch (txErr) {
            console.warn(`[StreakVerify] Auto-submit tx failed for comp #${i}:`, txErr.message);
          }
        } else {
          console.log(`[StreakVerify] No ${source} data for ${yesterday} — comp #${i}`);
        }
      } catch (_) { /* skip individual comp errors */ }
    }

    localStorage.setItem(VERIFY_TS_KEY, today);
    if (autoSubmitted > 0) {
      console.log(`[StreakVerify] Auto-verified ${autoSubmitted} competition(s).`);
    }
  } catch (err) {
    console.warn('[StreakVerify] Auto-verify error:', err.message);
  }
}

// ─── Metadata Parsers ─────────────────────────────────────────────────────────

// metadataCID on-chain format: "cycle:<cycle>;src:<source>[;<ipfsCID>]"
function extractCycleFromMeta(metadataCID) {
  if (!metadataCID) return 'weekly';
  const match = metadataCID.match(/cycle:([^;]+)/);
  return match ? match[1] : 'weekly';
}

/**
 * Extract the data source from the competition metadataCID.
 * @param {string} metadataCID
 * @returns {string} source key (e.g. 'water') or ''
 */
export function extractSource(metadataCID) {
  if (!metadataCID) return '';
  const match = metadataCID.match(/src:([^;]+)/);
  return match ? match[1] : '';
}
