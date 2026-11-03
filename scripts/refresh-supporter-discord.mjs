import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DISCORD_WEBHOOK = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w.-]+$/;
const NFT = '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const ESCROW = '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};

function clean(value) {
  return String(value).replace(/[@`*_~<>]/g, '').slice(0, 160);
}

export function buildRefreshPayload({ repo, version, releaseDate, summary, purchaseUrl, frontUrl }) {
  const releaseUrl = `https://github.com/${repo}/releases/tag/${encodeURIComponent(version)}`;
  return {
    allowed_mentions: { parse: [] },
    content: `${clean(repo)} ${clean(version)} Supporter DNFT is minted and listed: $10 USDC on Base. Support the new version and collect a dated artifact of Decent history; no financial return guaranteed. Royalties are not universal.`,
    embeds: [{
      title: `${clean(version)} · Supporter DNFT`,
      url: purchaseUrl,
      description: `${clean(summary || 'A new Decent release: support our ongoing development and keep a dated artifact of the work.')}\n\nCreator: thejollylama.eth\nRelease date: ${releaseDate.slice(0, 10)}\n[Purchase](${purchaseUrl}) · [Release notes](${releaseUrl})\nCollect, keep or resell where supported; resale value is not guaranteed.`,
      image: { url: frontUrl },
    }],
  };
}

export async function editDiscordMessage({ webhook, messageId, payload, fetcher = fetch }) {
  requireThat(DISCORD_WEBHOOK.test(webhook || ''), 'DISCORD_SUPPORTER_WEBHOOK required');
  requireThat(/^\d+$/.test(messageId || ''), 'Discord message ID required');
  let response;
  try {
    response = await fetcher(`${webhook}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Discord message edit unconfirmed after network failure');
  }
  requireThat(response.ok, `Discord message edit failed (HTTP ${response.status})`);
  const message = await response.json();
  requireThat(message.id === messageId, 'Discord edit acknowledgement did not match the stored message');
  return message.id;
}

async function main() {
  const [tag] = process.argv.slice(2);
  const { GITHUB_REPOSITORY: repo, DISCORD_SUPPORTER_WEBHOOK: webhook } = process.env;
  requireThat(/^[\w.-]+\/[\w.-]+$/.test(repo || ''), 'GITHUB_REPOSITORY required');
  requireThat(/^[\w./-]+$/.test(tag || '') && !tag.startsWith('-'), 'Valid release tag required');
  requireThat(DISCORD_WEBHOOK.test(webhook || ''), 'DISCORD_SUPPORTER_WEBHOOK required');

  const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const release = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'assets,isDraft']));
  requireThat(!release.isDraft, 'Published release required');
  const names = new Set(release.assets.map(asset => asset.name));
  for (const asset of ['supporter-release.json', 'supporter-minted.json', 'supporter-discord-sent.json', 'supporter-art-refresh.json', 'supporter-front.png']) {
    requireThat(names.has(asset), `Release is missing ${asset}`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'supporter-discord-refresh-'));
  try {
    for (const asset of ['supporter-release.json', 'supporter-minted.json', 'supporter-discord-sent.json', 'supporter-art-refresh.json']) {
      gh(['release', 'download', tag, '--repo', repo, '--pattern', asset, '--dir', dir]);
    }
    const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const manifest = read('supporter-release.json');
    const minted = read('supporter-minted.json');
    const marker = read('supporter-discord-sent.json');
    const refresh = read('supporter-art-refresh.json');
    requireThat(manifest.repo === repo && manifest.version === tag, 'Release manifest identity mismatch');
    requireThat(marker.repo === repo && marker.version === tag, 'Discord delivery marker identity mismatch');
    requireThat(minted.repo === repo && minted.version === tag && minted.verification?.verifiedBlock > 0, 'Verified mint record missing');
    requireThat(minted.mint?.chainId === 8453 && minted.mint?.nftContract?.toLowerCase() === NFT.toLowerCase()
      && minted.mint?.escrow?.toLowerCase() === ESCROW.toLowerCase() && minted.mint?.tokenId === '76'
      && minted.mint?.listingId === '6', 'Mint record does not match the BigNuten Supporter listing');
    requireThat(refresh.repo === repo && refresh.version === tag && refresh.tokenId === '76'
      && refresh.current?.image && refresh.current?.metadataURI && refresh.setTokenURITx, 'Art refresh record is incomplete');

    const purchaseUrl = minted.mint.purchaseUrl;
    const parsedPurchase = new URL(purchaseUrl);
    requireThat(parsedPurchase.protocol === 'https:' && parsedPurchase.searchParams.get('chainId') === '8453'
      && parsedPurchase.searchParams.get('escrow')?.toLowerCase() === ESCROW.toLowerCase()
      && parsedPurchase.searchParams.get('listingId') === '6', 'Purchase URL does not match the verified listing');
    const frontUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/supporter-front.png`;
    const payload = buildRefreshPayload({
      repo, version: tag, releaseDate: manifest.releaseDate, summary: manifest.summary,
      purchaseUrl, frontUrl,
    });
    const editedId = await editDiscordMessage({ webhook, messageId: marker.messageId, payload });
    console.log(`Updated existing Discord announcement ${editedId} with the refreshed release artwork.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error.message.split('\n')[0]);
    process.exitCode = 1;
  });
}
