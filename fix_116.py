我先查看一下现有文件以了解当前结构。

Now let me check for existing GitHub Actions workflows:

现在我明白了。这个 `workflow` 已经实现了大部分功能，但是 `issue` 要求创建一个独立的 `scripts/bountyBot.js` 模块来提取并增强逻辑。我将创建：

```javascript
/**
 * scripts/bountyBot.js
 * BigNuten Bounty Bot — Personalized comment generation module.
 *
 * Separates comment logic from the GitHub Actions workflow so it can be
 * tested independently, reused across jobs, and extended without touching
 * YAML.  The workflow (bounty-bot.yml) calls the exported functions via
 * require() inside actions/github-script.
 *
 * Related issues: #45 (bounty bot), #116 (personalized comments)
 */

'use strict';

// ─── Scene Art ────────────────────────────────────────────────────────────────

/**
 * Seasonal art pools.  Each season has a set of scenes; the function picks
 * one deterministically based on the issue number so the same issue always
 * gets the same art while different issues rotate through the pool.
 *
 * Extend the arrays to add more scenes — the selector handles any length.
 */
const SEASONAL_SCENES = {
  spring: [
    [
      '```',
      '🌸 🌿 🌸 🌿 🌸  🌳  🌸 🌿 🌸 🌿 🌸',
      ' 🌸   🦋     🌳      🐝   🌸',
      '  🌸  🌷🌷🌷  🌳  🌷🌷🌷  🌸',
      '   🌸  🌷🌷🌷  🌳  🌷🌷🌷  🌸',
      '  ~~~~~ 🐣 ~~~~~ 🐥 ~~~~~',
      ' 🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱',
      '```',
    ].join('\n'),
    [
      '```',
      '  🌈     ✨      🌈     ✨',
      ' 🌸🌸  🌿🌿🌿  🌸🌸  🌿🌿🌿',
      '🌸🌸🌸 🦋🌿🌿🦋 🌸🌸🌸',
      '  🐝   🌷🌷🌷   🐝',
      ' ~~~~~🐢~~~~🐢~~~~🐢~~~~',
      ' 🌱🌱🌱🍄🌱🌱🌱🍄🌱🌱🌱',
      '```',
    ].join('\n'),
  ],
  summer: [
    [
      '```',
      '....♆..⚯.....♆.♅...☉...🌓.....☉.... Dismiss..♆...',
      '☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️',
      '🌲🌲🌲🌳🌳🌳🌳🌳🌳🌳🌲🌴🌴🏝️',
      '~~🦀~~~~~~~~🐢~~~~~~~~~~🌊',
      '~~~~~~~~~~~~🐢~~~~ 🐟 ~~~🌊',
      '~~~~~~~🐢~~~~~~~~🐢~~~~~🌊✨✨✨',
      '~~🐢 ~~~~~~~ 🐬 ~~~~~~~🐢 🌊((( ☿🔥🏕️',
      '```',
    ].join('\n'),
    [
      '```',
      '🌞  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  🌞',
      '☁️☁️     ☁️         ☁️☁️      ☁️',
      '🌴🏝️🌴🌴🌊🌊🌊🌊🌊🌊🌊🌊🌊🌊',
      '~~~🐬~~~~🐠~~~🐠~~~🐡~~~🦈~~~~🌊',
      '~~~~🐙~~~🦀~~~🐢~~~~🐟~~~🌊✨',
      '🪸🪸🪸🪸🪸🪸🪸🪸🪸🪸🪸🪸🪸🪸🪸',
      '```',
    ].join('\n'),
  ],
  autumn: [
    [
      '```',
      '🍂🍁🍂🍁🍂  🌳  🍂🍁🍂🍁🍂',
      ' 🍂    🦊     🌳     🐿️   🍂',
      '  🍂  🍁🍁🍁  🌳  🍁🍁🍁  🍂',
      '   🍂  🍁🍁🍁  🌳  🍁🍁🍁  🍂',
      '  ~~~~~ 🦉 ~~~~~ 🍄 ~~~~~',
      ' 🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂',
      '```',
    ].join('\n'),
    [
      '```',
      '  🌙       ✧        🌙',
      ' 🍁   ☁️     🍁   ☁️',
      '🍁🍁 🍂🏔️🏔️🍁🍁 🍂🏔️🏔️🍁',
      '  🦔  🍄🍄  🦔  🍄🍄',
      ' ~~~~~~🐿️~~~~🐿️~~~~~',
      ' 🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂🍂',
      '```',
    ].join('\n'),
  ],
  winter: [
    [
      '```',
      '❄️  ✦  ❄️  ✦  ❄️  ✦  ❄️  ✦  ❄️',
      '  ❄️       🌲        ❄️',
      ' ❄️ ❄️   🎄🌲🎄   ❄️ ❄️',
      '  ❄️    ⛄   🎿    ❄️',
      ' ~~~~~ 🐧 ~~~~~ 🐻‍❄️ ~~~~~',
      ' 🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️',
      '```',
    ].join('\n'),
    [
      '```',
      '  🌟        ✦        🌟',
      ' ❄️     ☁️      ❄️',
      '❄️❄️  🎄   🏠   🎄  ❄️❄️',
      '  ❄️   ⛄          ❄️',
      ' ~~~~~ 🐿️ ~~~~~ 🦌 ~~~~~',
      ' 🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️🏔️',
      '```',
    ].join('\n'),
  ],
};

/**
 * Determine the current season in the Northern Hemisphere.
 * @returns {string} One of 'spring', 'summer', 'autumn', 'winter'
 */
function _currentSeason() {
  const month = new Date().getUTCMonth(); // 0-11
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/**
 * Pick a scene deterministically for a given issue number.
 * Rotates through the current season's pool; falls back to summer if season
 * has no scenes defined.
 *
 * @param {number} issueNumber
 * @param {string} [forceSeason] - Override season (for testing)
 * @returns {string}
 */
function getSceneArt(issueNumber, forceSeason) {
  const season = forceSeason || _currentSeason();
  const pool = SEASONAL_SCENES[season] || SEASONAL_SCENES.summer;
  if (!pool || pool.length === 0) return '';
  return pool[issueNumber % pool.length];
}

// ─── Milestone badges ─────────────────────────────────────────────────────────

/**
 * Return an emoji badge based on the number of issues completed.
 * Provides light gamification — new tiers can be added here.
 *
 * @param {number} count
 * @returns {string}
 */
function getMilestoneBadge(count) {
  if (count >= 20) return '🏆💎';
  if (count >= 10) return '🏆🌟';
  if (count >= 5)  return '🏆';
  if (count >= 3)  return '🥇';
  if (count >= 2)  return '🥈';
  return '🏅';
}

/**
 * Return a short motivational line based on milestone.
 * @param {number} count
 * @returns {string}
 */
function getMilestoneMessage(count) {
  if (count >= 20) return 'Legendary contributor status achieved! 🎆';
  if (count >= 10) return 'You\'re a top contributor — amazing dedication! 🌟';
  if (count >= 5)  return 'You\'re on a roll — keep it up! 🚀';
  if (count >= 3)  return 'Building a great track record! 💪';
  return 'Every contribution counts — nice work! 👏';
}

// ─── Comment builders ─────────────────────────────────────────────────────────

/**
 * Build a short, personalized comment for a returning (whitelisted) contributor.
 *
 * @param {object} opts
 * @param {string} opts.github       - Contributor's GitHub username
 * @param {string} opts.displayName  - Display name from contributor-accounts.json
 * @param {number} opts.issuesCompleted - Number of issues closed (from issuesClosed array length)
 * @param {number} opts.bnutEarned   - Cumulative BNUT earned (bnutEarned field)
 * @param {number} opts.bnutPending  - Pending BNUT (bnutPending field)
 * @param {string} opts.walletAddress - Wallet address (empty string if missing)
 * @param {string} opts.bountyAmount - Bounty label amount string (e.g. "500")
 * @param {number} opts.issueNumber  - Issue number (for scene art selection)
 * @param {string} opts.bountyLabel  - Full bounty label text (e.g. "bounty: 500 BNUT")
 * @param {string} opts.issueRef     - Full issue reference (e.g. "owner/repo#42")
 * @param {number} [opts.prNumber]   - PR number, if posting on merge
 * @returns {string} Markdown comment body
 */
function buildReturningContributorComment(opts) {
  const {
    github, displayName, issuesCompleted,
    bnutEarned, bnutPending, walletAddress,
    bountyAmount, issueNumber, bountyLabel,
    issueRef, prNumber,
  } = opts;

  const totalEarned = (bnutEarned || 0) + (bnutPending || 0);
  const hasWallet = !!(walletAddress);
  const badge = getMilestoneBadge(issuesCompleted);
  const milestoneMsg = getMilestoneMessage(issuesCompleted);
  const scene = getSceneArt(issueNumber);
  const prLine = prNumber ? ` (PR #${prNumber})` : '';

  const lines = [
    `${badge} Welcome back, @${github}! That's **${issuesCompleted} issue${issuesCompleted !== 1 ? 's' : ''} completed** and **${totalEarned} BNUT** earned so far! \\♆//`,
    '',
    `${milestoneMsg}`,
    '',
    '| | |',
    '|---|---|',
    `| 💰 This bounty | **${bountyAmount} BNUT** |`,
    `| 🏷️ Label | \`${bountyLabel}\` |`,
    `| 📌 Issue | ${issueRef}${prLine} |`,
    '',
    'Payout will be queued automatically when your PR is merged. Keep up the great work! 🌊✨',
    '',
  ];

  if (!hasWallet) {
    lines.push(
      '> ⚠️ **No wallet on file yet.** Contact `@TheJollyLaMa` to register your Optimism Mainnet address before payout can be processed.',
      '',
    );
  }

  if (scene) {
    lines.push(scene);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the full onboarding comment for first-time / non-whitelisted contributors.
 *
 * @param {object} opts
 * @param {string} opts.github       - Contributor's GitHub username
 * @param {string} opts.bountyAmount - Bounty label amount string
 * @param {number} opts.issueNumber  - Issue number
 * @param {string} opts.bountyLabel  - Full bounty label text
 * @param {string} opts.repoUrl      - Repository URL for CONTRIBUTING.md link
 * @returns {string} Markdown comment body
 */
function buildFirstTimeComment(opts) {
  const { github, bountyAmount, issueNumber, bountyLabel, repoUrl } = opts;

  return [
    `👋 Hey @${github}! This issue has a **$BNUT bounty** attached. 🎉`,
    '',
    '| | |',
    '|---|---|',
    `| 💰 Bounty | **${bountyAmount} BNUT** |`,
    `| 🏷️ Label | \`${bountyLabel}\` |`,
    `| 📌 Issue | #${issueNumber} |`,
    '',
    '**How to claim your bounty:**',
    '1. Complete the work described in this issue.',
    `2. Open a Pull Request that closes this issue (use \`Closes #${issueNumber}\` in the PR body).`,
    '3. Once your PR is merged, @TheJollyLaMa will approve the $BNUT payout.',
    '',
    '> ⚠️ **Whitelist registration required:** Payouts are only sent to wallets registered in the',
    '> contributor whitelist by `@TheJollyLaMa`. If you are not yet whitelisted, contact',
    '> `@TheJollyLaMa` directly (via video call or DM) to complete onboarding before your payout',
    '> can be processed. **Do not share your wallet address publicly in this issue.**',
    '',
    '> ℹ️ Payouts are sent in $BNUT on **Optimism Mainnet** via the BigNutenTreasury smart contract.',
    `> See [CONTRIBUTING.md](${repoUrl}/blob/main/CONTRIBUTING.md) for onboarding and whitelist registration details.`,
  ].join('\n');
}

/**
 * Build the auto-queue confirmation comment posted when a PR is merged.
 * Produces a personalized, stat-rich comment for returning contributors
 * and a table-based status for new/unregistered contributors.
 *
 * @param {object} opts
 * @param {Array<{github:string, wallet:string}>}  opts.queued   - Contributors queued this run
 * @param {Array<{github:string}>}                  opts.skipped  - Contributors already queued (dedup)
 * @param {Array<{github:string}>}                  opts.missing  - Contributors with no wallet
 * @param {string} opts.amount                       - Bounty amount string
 * @param {string} opts.issueRef                     - Full issue reference
 * @param {number} opts.issueNumber                 - Issue number (for scene art)
 * @param {number} opts.prNumber                    - Merged PR number
 * @param {object} opts.accounts                    - Full contributor-accounts.json data
 * @returns {string} Markdown comment body
 */
function buildAutoQueueComment(opts) {
  const { queued, skipped, missing, amount, issueRef, issueNumber, prNumber, accounts } = opts;
  const scene = getSceneArt(issueNumber);

  // Partition queued into returning vs new
  const returningQueued = queued.filter(({ github: gh }) =>
    (accounts.contributors || []).some(c => c.github.toLowerCase() === gh.toLowerCase()),
  );
  const newQueued = queued.filter(({ github: gh }) =>
    !(accounts.contributors || []).some(c => c.github.toLowerCase() === gh.toLowerCase()),
  );

  const lines = [];

  if (queued.length === 0 && skipped.length > 0) {
    lines.push(`⚠️ Payout for \`${issueRef}\` is already in the payroll queue for all contributors — no duplicate entries added.`);
    return lines.join('\n');
  }

  // Personalized welcome-back blocks for returning contributors
  for (const { github: gh } of returningQueued) {
    const rec = (accounts.contributors || []).find(
      c => c.github.toLowerCase() === gh.toLowerCase(),
    );
    const issuesCompleted = Array.isArray(rec.issuesClosed) ? rec.issuesClosed.length : 0;
    const totalEarned = (rec.bnutEarned || 0) + (rec.bnutPending || 0);
    const hasWallet = !!(rec.walletAddress);
    const badge = getMilestoneBadge(issuesCompleted);
    const milestoneMsg = getMilestoneMessage(issuesCompleted);

    lines.push(`${badge} Great work, @${gh}! That's **${issuesCompleted} issue${issuesCompleted !== 1 ? 's' : ''} completed** and **${totalEarned} BNUT** earned so far! \\♆//`);
    lines.push('');
    lines.push(milestoneMsg);
    lines.push('');
    lines.push(`**${amount} BNUT** for \`${issueRef}\` (PR #${prNumber}) has been added to the payroll queue. Payout coming soon! 🌊✨`);
    if (!hasWallet) {
      lines.push('');
      lines.push(`> ⚠️ No wallet address on file for @${gh}. Contact \`@TheJollyLaMa\` to register before payout can be processed.`);
    }
    lines.push('');
    if (scene) {
      lines.push(scene);
      lines.push('');
    }
  }

  // Standard table block for new/unregistered contributors
  if (newQueued.length > 0) {
    lines.push(`🤖 **Payroll Auto-Queue Update** for \`${issueRef}\` (PR #${prNumber})`);
    lines.push('');
    lines.push('| Contributor | Wallet | Amount | Status |');
    lines.push('|---|---|---|---|');
    for (const { github: gh, wallet } of newQueued) {
      const walletDisplay = wallet ? `\`${wallet}\`` : '⚠️ *no wallet on file*';
      lines.push(`| @${gh} | ${walletDisplay} | **${amount} BNUT** | ⏳ Queued |`);
    }
    lines.push('');
  }

  // Owner reminder
  if (queued.length > 0) {
    lines.push('> 💡 @TheJollyLaMa — visit the [BigNuten app](https://thejollylama.github.io/BigNuten_Vanilla/) and click **💸 Payroll** to settle all pending payouts with MetaMask. No private key required!');
  }

  // Dedup notice
  if (skipped.length > 0) {
    lines.push('');
    lines.push(`ℹ️ Already queued (skipped): ${skipped.map(g => `@${g}`).join(', ')}`);
  }

  // Missing wallet notice
  if (missing.length > 0) {
    lines.push('');
    lines.push(`⚠️ The following contributors are not yet registered or have no wallet address in \`contributor-accounts.json\`: ${missing.map(g => `@${g}`).join(', ')}`);
    lines.push('@TheJollyLaMa — please complete onboarding for these contributors and update their wallet addresses before the next payroll run.');
  }

  return lines.join('\n');
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Find a contributor record by GitHub username (case-insensitive).
 *
 * @param {object} accounts - Parsed contributor-accounts.json
 * @param {string} github   - GitHub username to look up
 * @returns {object|null}
 */
function findContributor(accounts, github) {
  return (accounts.contributors || []).find(
    c => c.github.toLowerCase() === github.toLowerCase(),
  ) || null;
}

/**
 * Parse a bounty label to extract the numeric BNUT amount.
 *
 * @param {string} label - e.g. "bounty: 500 BNUT"
 * @returns {string|null} Amount string or null if label doesn't match
 */
function parseBountyLabel(label) {
  const match = label.match(/^bounty:\s*(\d+)\s*BNUT$/i);
  return match ? match[1] : null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Scene art
  getSceneArt,
  SEASONAL_SCENES,

  // Milestone gamification
  getMilestoneBadge,
  getMilestoneMessage,

  // Comment builders
  buildReturningContributorComment,
  buildFirstTimeComment,
  buildAutoQueueComment,

  // Lookup helpers
  findContributor,
  parseBountyLabel,
};
```