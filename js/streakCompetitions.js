import { getDateInUserTz, getTodayInUserTz, formatInUserTz } from './timezone.js';
import { uploadViaStorageRelay, uploadIpfsDesktopSnapshot } from './pinataStorage.js';
import { evaluateStreakRules, validateStreakRules } from './streakRules.mjs';

const ABI = [
  'function nextCompId() view returns (uint256)',
  'function owner() view returns (address)',
  'function challengeStakeToken() view returns (address)',
  'function challengeTreasury() view returns (address)',
  'function streakAwardNFT() view returns (address)',
  'function completionAwardId() view returns (uint256)',
  'function firstPlaceAwardId() view returns (uint256)',
  'function secondPlaceAwardId() view returns (uint256)',
  'function thirdPlaceAwardId() view returns (uint256)',
  'function getStreakChallenge(uint256) view returns (bool enabled,string habitType,string meetupGoal,uint8 requiredActivityDays,uint8 requiredMeetups,uint8 minimumWeeklyLogs,uint16 dailyGoal)',
  'function getCompetition(uint256) view returns (tuple(string name,address stakeToken,uint256 stakeAmount,uint256 totalWeeks,uint256 startTime,uint256 endTime,uint256 joinDeadline,bool yieldEnabled,bool potDeployed,string metadataCID,uint8 status,uint256 potBalance,uint256 entrantCount,uint256 winnerCount))',
  'function getStreakEntrant(uint256,address) view returns (bool joined,uint256 reportsSubmitted,uint8 verifiedMeetups,uint8 verifiedActivityDays,uint8 place,uint64 qualifiedAt,bool disqualified,uint8 status)',
  'function meetups(uint256,uint8) view returns (uint64 opensAt,uint64 closesAt,bytes32 codeHash,string meetingUrl,bool configured)',
  'function meetupAttendance(uint256,uint8,address) view returns (uint8 totalActivityDays,uint8 weeklyActivityDays,bytes32 progressHash,bool checkedIn,bool peerApproved)',
  'function meetupPeerReviewed(uint256,uint8,address,address) view returns (bool)',
  'function reviewPolicyVersion() view returns (uint8)',
  'function meetupReviewerInvited(uint256,uint8,address,address) view returns (bool)',
  'function getMeetupReviewTally(uint256,uint8,address) view returns (uint32 approvals,uint32 rejections)',
  'function createCompetition(tuple(string name,address stakeToken,uint256 stakeAmount,uint256 totalWeeks,uint256 startTime,uint256 endTime,uint256 joinDeadline,bool yieldEnabled,string metadataCID) p)',
  'function configureStreakChallenge(uint256,string,string,uint8,uint8,uint8,uint16)',
  'function joinCompetition(uint256) payable',
  'function submitReport(uint256,string)',
  'function scheduleMeetup(uint256,uint8,uint64,uint64,bytes32,string)',
  'function selfCheckInMeetup(uint256,uint8,string,uint8,uint8,bool,bytes32)',
  'function reviewMeetupAttendance(uint256,uint8,address,bool)',
  'function inviteMeetupReviewer(uint256,uint8,address,address)',
  'function setStreakAwards(address,uint256,uint256,uint256,uint256)',
  'function settleCompetition(uint256,string)',
  'function cancelCompetition(uint256)',
  'event EntrantJoined(uint256 indexed compId,address indexed entrant,uint256 amount)',
  'event MeetupSelfCheckedIn(uint256 indexed compId,uint8 indexed meetupIndex,address indexed entrant,uint8 totalActivityDays,bytes32 progressHash)',
];
const ERC20_ABI = ['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)'];
const NFT_ROLE_ABI = [
  'function MINTER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function grantRole(bytes32,address)',
];
const NETWORK_REGISTRY_ABI = ['function publishCommunityData(string cid,bytes32 contentHash) returns (uint256 shareId)'];
const DAY = 86400;
const WATER_HISTORY_KEY = 'waterDailyHistory';
const WATER_TODAY_KEY = 'waterTrackerData';
const FITNESS_DATA_KEY = 'fitnessTrackerData';
const MEETUP_CODE_KEY = 'bignuten.meetup.codes.v1';
const FOUR_WEEKS = 4;

const ACTIVITY_OPTIONS = {
  hydration: { label: 'Hydration', dailyGoal: 8, unit: 'glasses', meetupGoal: 'drink 1 liter together' },
};

function node(id) { return document.getElementById(id); }
function streakAddress() {
  return Number(window.CONTRACTS?.chainId) === 8453 ? window.CONTRACTS?.streakBetEscrow || '' : '';
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function localDateTimeInput(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function challengeImageUrl(value) {
  const image = String(value || '').trim();
  if (/^https:\/\//i.test(image)) return image;
  if (/^ipfs:\/\//i.test(image)) {
    const path = image.slice(7);
    const [cid, ...segments] = path.split('/');
    if (/^[a-z0-9]+$/i.test(cid)) return `https://dweb.link/ipfs/${encodeURIComponent(cid)}${segments.length ? `/${segments.map(encodeURIComponent).join('/')}` : ''}`;
  }
  return 'img/BigNuten.png';
}
function localMeetupCodes() {
  try { return JSON.parse(localStorage.getItem(MEETUP_CODE_KEY) || '{}'); }
  catch { return {}; }
}
function saveMeetupCode(compId, index, code) {
  const codes = localMeetupCodes();
  codes[`${compId}:${index}`] = code;
  localStorage.setItem(MEETUP_CODE_KEY, JSON.stringify(codes));
}
function loadHydrationHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(WATER_HISTORY_KEY) || '{}');
    const current = JSON.parse(localStorage.getItem(WATER_TODAY_KEY) || '{}');
    if (current.date && Number(current.count) > 0) history[current.date] = Number(current.count);
    return history;
  } catch { return {}; }
}
function loadFitnessData() {
  try { return JSON.parse(localStorage.getItem(FITNESS_DATA_KEY) || '{}'); }
  catch { return {}; }
}
function dateKeyNumber(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / (DAY * 1000));
}
const rulesCache = new Map();

async function loadActivityRules(competition, config) {
  const reference = String(competition.metadataCID || '').trim();
  if (!reference.startsWith('ipfs://')) {
    return validateStreakRules({
      schema: 'bignuten-streak-rules/v1',
      metrics: [{ id: 'hydration', type: 'hydration', label: 'Hydration', cadence: 'daily', target: Number(config.dailyGoal), unit: 'glasses' }],
    });
  }
  const cid = reference.slice('ipfs://'.length).replace(/\/$/, '');
  if (rulesCache.has(cid)) return rulesCache.get(cid);
  let response;
  for (const gateway of ['https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/']) {
    try {
      response = await fetch(`${gateway}${encodeURIComponent(cid)}`);
      if (response.ok) break;
    } catch { /* try next gateway */ }
  }
  if (!response?.ok) throw new Error('Could not load the public streak rules document.');
  const rules = await response.json();
  validateStreakRules(rules);
  rulesCache.set(cid, rules);
  return rules;
}

function logDate(entry) {
  const value = entry?.timestamp || entry?.date || '';
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return getDateInUserTz(value) || '';
}

function readActivityProgress(competition, rules, meetupIndex) {
  const history = loadHydrationHistory();
  const storedFitness = loadFitnessData();
  const fitness = {
    ...storedFitness,
    weightLogs: Array.isArray(storedFitness.weightLogs) ? storedFitness.weightLogs : [],
    foods: Array.isArray(storedFitness.foods) ? storedFitness.foods : [],
    exercises: { entries: [], ...(storedFitness.exercises || {}) },
  };
  const startDate = getDateInUserTz(new Date(Number(competition.startTime) * 1000));
  const today = getTodayInUserTz();
  const startDay = dateKeyNumber(startDate);
  const todayDay = dateKeyNumber(today);
  const durationDays = Math.ceil((Number(competition.endTime) - Number(competition.startTime)) / DAY);
  const maxDay = Math.min(durationDays - 1, todayDay - startDay);
  const dailyRows = [];
  for (let day = 0; day <= maxDay; day += 1) {
    const date = new Date((startDay + day) * DAY * 1000).toISOString().slice(0, 10);
    dailyRows.push({
      date,
      waterGlasses: Number(history[date] || 0),
      weightLogs: fitness.weightLogs.filter(entry => logDate(entry) === date),
      exerciseEntries: (fitness.exercises?.entries || []).filter(entry => logDate(entry) === date),
      foodEntries: fitness.foods.filter(entry => logDate(entry) === date),
    });
  }
  const result = evaluateStreakRules(rules, dailyRows, meetupIndex);
  return {
    totalDays: result.totalActivityDays,
    weeklyDays: result.weeklyActivityDays,
    weeklyCounts: result.weeklyTotals,
    weeklyRequirementsMet: result.weeklyRequirementsMet,
    records: result.records,
  };
}
async function getWallet(connect = false) {
  if (!window.ethereum) return '';
  const accounts = await window.ethereum.request({ method: connect ? 'eth_requestAccounts' : 'eth_accounts' });
  return accounts[0] || '';
}
async function readContract() {
  return streakAddress()
    ? new ethers.Contract(streakAddress(), ABI, new ethers.JsonRpcProvider(window.CONTRACTS?.rpcUrl || 'https://mainnet.base.org'))
    : null;
}
async function signerContract() {
  const account = await getWallet(true);
  if (!account) throw new Error('Connect your wallet first.');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  const expected = Number(window.CONTRACTS?.chainId || 8453);
  if (Number(network.chainId) !== expected) throw new Error(`Switch to ${window.CONTRACTS?.label || 'Base Mainnet'}.`);
  const signer = await provider.getSigner();
  return { account, signer, contract: new ethers.Contract(streakAddress(), ABI, signer) };
}
function showStatus(id, text, failed = false) {
  const status = node(id);
  if (!status) return;
  status.textContent = text;
  status.style.color = failed ? '#b42318' : '#16784a';
}
async function renderStreakChallenges() {
  const targets = ['streak-challenge-list', 'streak-admin-challenge-list'].map(node).filter(Boolean);
  if (!targets.length) return;
  const renderAll = html => targets.forEach(target => { target.innerHTML = html; });
  if (!streakAddress()) {
    renderAll('<p>Monthly challenges will appear after the Base StreakBet deployment.</p>');
    return;
  }
  try {
    const contract = await readContract();
    try {
      if (await contract.reviewPolicyVersion() !== 1n) throw new Error('Unsupported review policy version.');
    } catch {
      renderAll('<p>The current StreakBet deployment uses legacy peer review. Monthly challenge actions will be enabled after the adaptive-review replacement is deployed.</p>');
      return;
    }
    const wallet = await getWallet();
    const captain = await contract.owner();
    const isCaptain = wallet && wallet.toLowerCase() === captain.toLowerCase();
    const total = Number(await contract.nextCompId());
    const cards = [];
    for (let compId = 0; compId < total; compId += 1) {
      const [competition, config] = await Promise.all([
        contract.getCompetition(compId),
        contract.getStreakChallenge(compId),
      ]);
      if (!config.enabled) continue;
      const habitType = config.habitType;
      const rules = await loadActivityRules(competition, config);
      const ruleLabel = rules.metrics.map(metric => metric.label || metric.id).join(' + ');
      const entrant = wallet ? await contract.getStreakEntrant(compId, wallet) : null;
      const entrantIndex = entrant?.joined ? 1 : 0;
      const progress = readActivityProgress(competition, rules, 0);
      const imageUrl = challengeImageUrl(rules.image);
      const joinedEvents = await contract.queryFilter(contract.filters.EntrantJoined(compId));
      const participantWallets = [...new Set(joinedEvents.map(log => log.args.entrant.toLowerCase()))];
      const cardsForMeetups = [];

      for (let index = 0; index < Number(config.requiredMeetups); index += 1) {
        const meetup = await contract.meetups(compId, index);
        if (!meetup.configured) {
          cardsForMeetups.push(`<li>Week ${index + 1}: not scheduled${isCaptain ? `<button data-streak-action="schedule" data-comp="${compId}" data-week="${index}">Schedule call</button>` : ''}</li>`);
          continue;
        }
        const now = Date.now() / 1000;
        const inCall = now >= Number(meetup.opensAt) && now <= Number(meetup.closesAt);
        const ownAttendance = wallet && entrantIndex ? await contract.meetupAttendance(compId, index, wallet) : null;
        const checkIns = await contract.queryFilter(contract.filters.MeetupSelfCheckedIn(compId, index));
        const addresses = [...new Set(checkIns.map(log => log.args.entrant.toLowerCase()))];
        const roster = await Promise.all(addresses.map(async peer => {
          const [attendance, reviewed, tally, invited, peerEntrant] = await Promise.all([
            contract.meetupAttendance(compId, index, peer),
            wallet ? contract.meetupPeerReviewed(compId, index, peer, wallet) : true,
            contract.getMeetupReviewTally(compId, index, peer),
            wallet ? contract.meetupReviewerInvited(compId, index, peer, wallet) : false,
            contract.getStreakEntrant(compId, peer),
          ]);
          const reviewOpen = now >= Number(meetup.opensAt) && now <= Number(meetup.closesAt) + DAY;
          const canReview = reviewOpen && peer.toLowerCase() !== wallet?.toLowerCase() && !reviewed && !attendance.peerApproved && !peerEntrant.disqualified
            && ((entrantIndex > 0 && ownAttendance?.checkedIn) || invited);
          const approvals = Number(tally.approvals);
          const rejections = Number(tally.rejections);
          const disputed = approvals > 0 && approvals === rejections;
          const reviewStatus = attendance.peerApproved ? 'verified'
            : peerEntrant.disqualified ? 'rejected by majority'
              : disputed ? `disputed · ${approvals} support / ${rejections} dispute`
                : `${approvals} support / ${rejections} dispute`;
          const inviteButton = isCaptain && disputed && reviewOpen
            ? `<button data-streak-action="invite-reviewer" data-comp="${compId}" data-week="${index}" data-peer="${peer}">Invite tie-break reviewer</button>` : '';
          return `<li><code>${escapeText(peer.slice(0, 6))}…${escapeText(peer.slice(-4))}</code> · ${attendance.weeklyActivityDays}/${7} qualifying days · ${reviewStatus}${canReview ? `<button data-streak-action="approve" data-comp="${compId}" data-week="${index}" data-peer="${peer}">Confirm</button><button data-streak-action="reject" data-comp="${compId}" data-week="${index}" data-peer="${peer}">Dispute</button>` : ''}${inviteButton}</li>`;
        }));
        const weekly = readActivityProgress(competition, rules, index);
        const joinCall = entrantIndex && inCall && !ownAttendance?.checkedIn && weekly.weeklyDays >= Number(config.minimumWeeklyLogs) && weekly.weeklyRequirementsMet
          ? `<label class="streak-public-consent"><input type="checkbox" data-public-stats="${compId}:${index}" /> Publish wallet-linked progress details to public IPFS <small>Includes selected weight/exercise/food details; anyone can read them and pins may persist. If configured, request community-node replication too.</small></label><button data-streak-action="checkin" data-comp="${compId}" data-week="${index}">Check in · confirm ${escapeText(config.meetupGoal)}</button>`
          : '';
        const meetupLink = meetup.meetingUrl ? `<a href="${escapeText(meetup.meetingUrl)}" target="_blank" rel="noopener noreferrer">Open call</a>` : '';
        const revealCode = isCaptain && inCall && participantWallets.length
          ? `<button data-streak-action="reveal" data-comp="${compId}" data-week="${index}" data-attendees="${addresses.length}">Confirm call roster and reveal code</button>` : '';
        const updateCall = isCaptain && now < Number(meetup.opensAt)
          ? `<button data-streak-action="schedule" data-comp="${compId}" data-week="${index}" data-start="${localDateTimeInput(meetup.opensAt)}" data-url="${escapeText(meetup.meetingUrl)}">Update call and rotate code</button>` : '';
        cardsForMeetups.push(`<li><strong>Week ${index + 1}</strong> · ${formatInUserTz(Number(meetup.opensAt) * 1000)} · ${addresses.length} attendees ${meetupLink}${joinCall}${revealCode}${updateCall}<ul>${roster.join('') || '<li>No check-ins yet.</li>'}</ul></li>`);
      }

      const joinButton = !entrantIndex && wallet && Number(competition.status) === 0
        ? `<button class="comp-user-btn comp-join" data-streak-action="join" data-comp="${compId}">Join · ${ethers.formatUnits(competition.stakeAmount, 18)} BNUT</button>` : '';
      const entrantStatus = entrant
        ? `${entrant.verifiedActivityDays}/${config.requiredActivityDays} tracked days · ${entrant.verifiedMeetups}/${config.requiredMeetups} peer-approved meetups · ${entrant.disqualified ? 'Disqualified' : entrant.status === 1n ? 'Monthly challenge complete' : 'In progress'}`
        : 'Connect and join to participate.';
      const settleButton = isCaptain && Number(competition.status) === 0 && Date.now() / 1000 >= Number(competition.endTime)
        ? `<button data-streak-action="settle" data-comp="${compId}">Settle challenge</button>` : '';
      const participantList = participantWallets.map(account => `<li>${escapeText(account.slice(0, 6))}…${escapeText(account.slice(-4))}</li>`).join('');
      cards.push(`<article class="comp-card"><header class="comp-card-header"><img class="streak-challenge-art" src="${escapeText(imageUrl)}" alt="" onerror="this.onerror=null;this.src='img/BigNuten.png'" /><h4>${escapeText(competition.name)}</h4><span>${Number(competition.status) === 0 ? 'Active' : Number(competition.status) === 1 ? 'Settled' : 'Cancelled'}</span></header><div class="comp-card-body"><p>Metrics: ${escapeText(ruleLabel)}</p><p>Challenge: ${config.requiredActivityDays} qualifying days · ${config.requiredMeetups} weekly calls · meetup goal: ${escapeText(config.meetupGoal)}</p><p>Your app progress: ${progress.totalDays} / ${config.requiredActivityDays} days · ${entrantStatus}</p><p class="streak-peer-note">Logs stay in your browser unless you explicitly opt to publish a wallet-linked progress report to public IPFS. During the call, share the app progress screen with a peer.</p><details><summary>Joined wallets (${participantWallets.length})</summary><ul>${participantList || '<li>No entrants yet.</li>'}</ul></details><ol>${cardsForMeetups.join('')}</ol>${joinButton}${settleButton}</div></article>`);
    }
    renderAll(cards.length ? cards.join('') : '<p>No monthly challenges are active.</p>');
    targets.forEach(bindStreakActions);
    if (isCaptain) renderCaptainSetup(contract, isCaptain);
  } catch (error) {
    renderAll(`<p>${escapeText(error.shortMessage || error.message)}</p>`);
  }
}

async function renderCaptainSetup(contract, isCaptain) {
  const panel = node('streak-captain-panel');
  if (!panel || !isCaptain) return;
  panel.hidden = false;
  const [token, treasury, nft, completionId, firstId, secondId, thirdId] = await Promise.all([
    contract.challengeStakeToken(), contract.challengeTreasury(), contract.streakAwardNFT(),
    contract.completionAwardId(), contract.firstPlaceAwardId(), contract.secondPlaceAwardId(), contract.thirdPlaceAwardId(),
  ]);
  const status = panel.querySelector('[data-streak-setup-status]');
  if (status) status.textContent = `Stake ${token.slice(0, 6)}…${token.slice(-4)} · Treasury ${treasury.slice(0, 6)}…${treasury.slice(-4)} · awards ${nft === ethers.ZeroAddress ? 'not configured' : `${nft.slice(0, 6)}…${nft.slice(-4)}`}`;
  const nftInput = node('streak-award-nft');
  if (nftInput && !nftInput.value) nftInput.value = nft === ethers.ZeroAddress ? window.CONTRACTS?.dnft || '' : nft;
  if (nft !== ethers.ZeroAddress) {
    ['completion', 'first', 'second', 'third'].forEach((name, index) => {
      const input = node(`streak-award-${name}`);
      if (input && !input.value) input.value = [completionId, firstId, secondId, thirdId][index].toString();
    });
  }
}

function bindStreakActions(root) {
  root.querySelectorAll('[data-streak-action]').forEach(button => button.addEventListener('click', async () => {
    const compId = Number(button.dataset.comp);
    const week = Number(button.dataset.week);
    try {
      const { account, signer, contract } = await signerContract();
      const competition = await contract.getCompetition(compId);
      const config = await contract.getStreakChallenge(compId);
      if (button.dataset.streakAction === 'join') {
        const token = new ethers.Contract(competition.stakeToken, ERC20_ABI, signer);
        const allowance = await token.allowance(account, address());
        if (allowance < competition.stakeAmount) await (await token.approve(address(), competition.stakeAmount)).wait();
        await (await contract.joinCompetition(compId)).wait();
      } else if (button.dataset.streakAction === 'schedule') {
        node('streak-schedule-comp').value = compId;
        node('streak-schedule-week').value = week + 1;
        if (button.dataset.start) node('streak-meetup-start').value = button.dataset.start;
        if (button.dataset.url) node('streak-meetup-url').value = button.dataset.url;
        node('streak-meetup-start').focus();
        node('streak-schedule-button').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      } else if (button.dataset.streakAction === 'checkin') {
        const code = prompt('Enter the invite code shared during the call:');
        if (!code) return;
        const rules = await loadActivityRules(competition, config);
        const progress = readActivityProgress(competition, rules, week);
        if (progress.weeklyDays < Number(config.minimumWeeklyLogs)) throw new Error(`Track ${config.minimumWeeklyLogs} qualifying activity days this week first.`);
        if (!progress.weeklyRequirementsMet) throw new Error('Complete each configured weekly metric before checking in.');
        const goalMet = confirm(`Confirm: ${config.meetupGoal}`);
        const progressReport = {
          schema: 'bignuten-streak-progress/v1',
          competitionId: compId,
          meetupWeek: week + 1,
          wallet: account.toLowerCase(),
          publishedAt: new Date().toISOString(),
          rules: rules.metrics,
          qualifyingDays: progress.totalDays,
          weeklyMetricTotals: progress.weeklyCounts,
          activityRecords: progress.records,
        };
        const progressHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(progressReport)));
        const shareStats = root.querySelector(`[data-public-stats="${compId}:${week}"]`)?.checked || false;
        let reportCid = '';
        if (shareStats) {
          const meetup = await contract.meetups(compId, week);
          if (ethers.keccak256(ethers.toUtf8Bytes(code.trim())) !== meetup.codeHash) throw new Error('The meetup code is incorrect.');
          const fileName = `streak-${compId}-week-${week + 1}-${account.slice(2, 10).toLowerCase()}.json`;
          const uploaded = await uploadViaStorageRelay(progressReport, {
            fileName, wallet: account, signer, relayUrl: window.BIGNUTEN_STORAGE_RELAY_URL,
          });
          reportCid = uploaded.cid;
          try {
            await uploadIpfsDesktopSnapshot(progressReport, { fileName });
          } catch (error) {
            console.warn('[Streak] Local IPFS pin unavailable; Pinata copy is pinned.', error);
          }
        }
        await (await contract.selfCheckInMeetup(compId, week, code.trim(), progress.totalDays, progress.weeklyDays, goalMet, progressHash)).wait();
        if (reportCid) await (await contract.submitReport(compId, reportCid)).wait();
        const registryAddress = window.BIGNUTEN_NETWORK_REGISTRY_ADDRESS || window.CONTRACTS?.networkRegistry || '';
        if (reportCid && registryAddress && ethers.isAddress(registryAddress)) {
          try {
            const registry = new ethers.Contract(registryAddress, NETWORK_REGISTRY_ABI, signer);
            await (await registry.publishCommunityData(`ipfs://${reportCid}`, progressHash)).wait();
          } catch (error) {
            window.alert(`Check-in and Pinata report were saved, but community-node publication failed: ${error.shortMessage || error.message}`);
          }
        }
      } else if (button.dataset.streakAction === 'invite-reviewer') {
        const reviewer = prompt('Enter the guest reviewer wallet address. They do not need to stake or join the challenge.');
        if (!reviewer) return;
        if (!ethers.isAddress(reviewer)) throw new Error('Enter a valid reviewer wallet address.');
        await (await contract.inviteMeetupReviewer(compId, week, button.dataset.peer, reviewer)).wait();
      } else if (button.dataset.streakAction === 'approve' || button.dataset.streakAction === 'reject') {
        const approved = button.dataset.streakAction === 'approve';
        if (!approved && !confirm('Record a disagreement? A single dispute does not disqualify anyone; unresolved votes need a majority before rejection.')) return;
        await (await contract.reviewMeetupAttendance(compId, week, button.dataset.peer, approved)).wait();
      } else if (button.dataset.streakAction === 'reveal') {
        const code = localMeetupCodes()[`${compId}:${week}`];
        if (!code) throw new Error('No invite code is saved in this captain browser.');
        if (!confirm(`Confirm that everyone you intend to admit is visible on the call and has shown the required app progress. The scheduled meetup has ${button.dataset.attendees} on-chain check-ins so far. Reveal the code now?`)) return;
        alert(`Read this code aloud in the call: ${code}`);
      } else if (button.dataset.streakAction === 'settle') {
        await (await contract.settleCompetition(compId, '')).wait();
      }
      await renderStreakChallenges();
    } catch (error) {
      alert(error.shortMessage || error.reason || error.message);
    }
  }));
}
function inviteCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function bindStreakAdmin() {
  node('streak-authorize-minter-button')?.addEventListener('click', async () => {
    try {
      const { signer } = await signerContract();
      const nftAddress = node('streak-award-nft').value.trim();
      if (!ethers.isAddress(nftAddress)) throw new Error('Enter the deployed DecentNFT address.');
      const nft = new ethers.Contract(nftAddress, NFT_ROLE_ABI, signer);
      const minterRole = await nft.MINTER_ROLE();
      if (await nft.hasRole(minterRole, address())) {
        showStatus('streak-setup-status', 'StreakBetEscrow already has MINTER_ROLE.');
      } else {
        await (await nft.grantRole(minterRole, address())).wait();
        showStatus('streak-setup-status', 'StreakBetEscrow can now mint Achievement DNFTs.');
      }
    } catch (error) { showStatus('streak-setup-status', error.shortMessage || error.reason || error.message, true); }
  });

  node('streak-awards-button')?.addEventListener('click', async () => {
    try {
      const { contract } = await signerContract();
      const nft = node('streak-award-nft').value.trim();
      const ids = ['completion', 'first', 'second', 'third'].map(name => BigInt(node(`streak-award-${name}`).value));
      await (await contract.setStreakAwards(nft, ...ids)).wait();
      showStatus('streak-setup-status', 'Reusable streak awards configured.');
      await renderStreakChallenges();
    } catch (error) { showStatus('streak-setup-status', error.shortMessage || error.reason || error.message, true); }
  });
  node('streak-create-button')?.addEventListener('click', async () => {
    try {
      const { contract } = await signerContract();
      const name = node('streak-create-name').value.trim();
      const habitType = node('streak-create-habit').value;
      const rulesCID = node('streak-create-rules-cid').value.trim();
      const stakeAmount = ethers.parseUnits(node('streak-create-stake').value.trim(), 18);
      const startTime = Math.floor(new Date(node('streak-create-start').value).getTime() / 1000);
      const endTime = startTime + 30 * DAY;
      const meetupGoal = node('streak-create-meetup-goal').value.trim();
      const dailyGoal = Number(node('streak-create-goal').value);
      const compId = Number(await contract.nextCompId());
      if (!name || !meetupGoal || !Number.isInteger(dailyGoal) || dailyGoal < 1) throw new Error('Complete all challenge fields.');
      if (habitType === 'multi' && !/^ipfs:\/\/[a-zA-Z0-9]+$/.test(rulesCID)) throw new Error('Publish streak-rules.json and enter its ipfs://CID.');
      if (rulesCID && !/^ipfs:\/\/[a-zA-Z0-9]+$/.test(rulesCID)) throw new Error('Rules CID must use ipfs://<CID>.');
      const metadataCID = rulesCID || `habit:${habitType}`;
      await (await contract.createCompetition({
        name, stakeToken: await contract.challengeStakeToken(), stakeAmount, totalWeeks: FOUR_WEEKS,
        startTime, endTime, joinDeadline: startTime, yieldEnabled: false,
        metadataCID,
      })).wait();
      await (await contract.configureStreakChallenge(compId, habitType, meetupGoal, 28, FOUR_WEEKS, 5, dailyGoal)).wait();
      showStatus('streak-create-status', `Monthly challenge #${compId} created.`);
      await renderStreakChallenges();
    } catch (error) { showStatus('streak-create-status', error.shortMessage || error.reason || error.message, true); }
  });

  node('streak-schedule-button')?.addEventListener('click', async () => {
    try {
      const { contract } = await signerContract();
      const compId = Number(node('streak-schedule-comp').value);
      const week = Number(node('streak-schedule-week').value) - 1;
      const opensAt = Math.floor(new Date(node('streak-meetup-start').value).getTime() / 1000);
      const meetingUrl = node('streak-meetup-url').value.trim();
      if (!Number.isInteger(compId) || !Number.isInteger(week) || week < 0 || week >= FOUR_WEEKS) throw new Error('Choose a valid challenge and week.');
      if (!Number.isFinite(opensAt) || !meetingUrl || new URL(meetingUrl).protocol !== 'https:') throw new Error('Provide a meetup time and HTTPS video link.');
      const code = inviteCode();
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes(code));
      await (await contract.scheduleMeetup(compId, week, opensAt, opensAt + 3600, codeHash, meetingUrl)).wait();
      saveMeetupCode(compId, week, code);
      showStatus('streak-meetup-status', 'Call scheduled. The code is kept locally and revealed during the meetup.');
      await renderStreakChallenges();
    } catch (error) { showStatus('streak-meetup-status', error.shortMessage || error.reason || error.message, true); }
  });
}

function setDefaultChallengeStart() {
  const input = node('streak-create-start');
  if (!input || input.value) return;
  const start = new Date(Date.now() + DAY * 1000);
  start.setMinutes(0, 0, 0);
  input.value = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function bindMonthlyInvite() {
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-open-monthly-challenge]')) return;
    node('challenge-modal')?.classList.remove('modal-hidden');
    renderStreakChallenges();
  });
}

function initStreakCompetitions() {
  if (!node('streak-challenge-list')) return;
  setDefaultChallengeStart();
  bindStreakAdmin();
  bindMonthlyInvite();
  renderStreakChallenges();
  window.addEventListener('bignuten:network-changed', renderStreakChallenges);
}

document.addEventListener('DOMContentLoaded', initStreakCompetitions);
