const BIGNUTEN_LOGO_URL = 'https://raw.githubusercontent.com/TheJollyLaMa/BigNuten_Vanilla/main/img/BigNuten.png';
const ENS_ETH_LOGO_URL = 'https://raw.githubusercontent.com/TheJollyLaMa/BigNuten_Vanilla/main/img/Ens_Eth_Breathe.png';

const SCENES = [
  ['Bounty workshop', '🌌', '🟪', '🧑‍💻', '🛠️', '✨'], ['Contributor bridge', '🌃', '🟦', '🤝', '🌉', '💸'],
  ['Payroll vault', '🌙', '⬛', '🏦', '🔐', '🪙'], ['Feature launch', '🌌', '🟫', '🚀', '📦', '💫'],
  ['Recovery river', '🌧️', '🟦', '🛶', '↩️', '🪙'], ['Settlement sunrise', '🌅', '🟧', '⚖️', '✅', '☀️'],
  ['Testing lab', '🌐', '⬜', '🧪', '🔬', '✅'], ['Protocol builders', '🌃', '🟦', '🏗️', '🔵', '🧱'],
  ['Community garden', '☀️', '🟩', '🧑‍🌾', '🌱', '🌻'], ['Season payout', '🌤️', '🟨', '🎨', '🏆', '💰'],
  ['Wallet constellation', '🌌', '⬛', '👛', '⭐', '🔗'], ['Contract forge', '🌋', '🟥', '🔨', '📜', '🔥'],
  ['Idea spark', '🌠', '🟪', '💡', '🎨', '⚡'], ['Global studio', '🌍', '🟩', '🧑‍💻', '🖼️', '🌐'],
  ['Liquidity well', '🌙', '🟦', '⛲', '🪣', '💧'], ['Builder camp', '🌌', '🟫', '⛺', '🔥', '🎸'],
  ['Review station', '🌃', '⬜', '👀', '📋', '✅'], ['Token train', '🌄', '🟫', '🚂', '🪙', '🛤️'],
  ['Open source city', '🌇', '⬛', '🏙️', '💻', '🤲'], ['Milestone mountain', '🌤️', '🟩', '⛰️', '🚩', '🧗'],
  ['Treasury harbor', '🌊', '🟦', '⚓', '🏦', '⛵'], ['Onchain gallery', '🌌', '🟪', '🖼️', '🔗', '🎭'],
  ['Bounty orchard', '☀️', '🟩', '🌳', '🎯', '🍎'], ['Protocol classroom', '🌤️', '🟨', '🏫', '📚', '🧑‍🏫'],
  ['Future festival', '🎆', '🟪', '🎪', '🎉', '🎶'],
];

function makeArtwork([name, sky, ground, subject, detail, accent]) {
  return { name, rows: [
    [sky, sky, '✨', sky, sky, sky, '⭐', sky, sky, sky],
    [sky, '🥜', sky, sky, accent, sky, sky, sky, '💠', sky],
    [sky, sky, sky, detail, sky, sky, subject, sky, sky, sky],
    [sky, sky, '☁️', sky, sky, sky, sky, '☁️', sky, sky],
    [sky, sky, sky, '🧑‍🎨', subject, detail, '🧑‍💻', sky, sky, sky],
    [sky, sky, '🤝', '➡️', '🪙', '➡️', '✅', sky, sky, sky],
    [sky, accent, sky, sky, '🔗', sky, sky, accent, sky, sky],
    [ground, ground, ground, ground, ground, ground, ground, ground, ground, ground],
    [ground, '🌱', ground, detail, ground, subject, ground, '🌱', ground, ground],
    [ground, ground, ground, ground, '🥜', '💠', ground, ground, ground, ground],
  ] };
}

const ARTWORKS = SCENES.map(makeArtwork);

function artworkIndex(issueNumber, commentType) {
  const input = `${Number(issueNumber) || 0}:${String(commentType || 'comment')}`;
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % ARTWORKS.length;
}

function selectArtwork(issueNumber, commentType) { return ARTWORKS[artworkIndex(issueNumber, commentType)]; }

function renderCell(cell) {
  if (cell === '🥜') return `<td align="center"><img src="${BIGNUTEN_LOGO_URL}" alt="BigNuten logo" width="24"></td>`;
  if (cell === '💠') return `<td align="center"><img src="${ENS_ETH_LOGO_URL}" alt="ENS and Ethereum logo" width="24"></td>`;
  return `<td align="center">${cell}</td>`;
}

function renderArtworkTable(artwork) {
  const rows = artwork.rows.map(row => `<tr>${row.map(renderCell).join('')}</tr>`).join('\n');
  return `<table><tbody>\n${rows}\n</tbody></table>`;
}

function renderBigNutenComment(body, issueNumber, commentType) {
  const artwork = selectArtwork(issueNumber, commentType);
  return [body, '', `<strong>${artwork.name}</strong>`, renderArtworkTable(artwork)].join('\n');
}

module.exports = { ARTWORKS, BIGNUTEN_LOGO_URL, ENS_ETH_LOGO_URL, artworkIndex, renderArtworkTable, renderBigNutenComment, selectArtwork };