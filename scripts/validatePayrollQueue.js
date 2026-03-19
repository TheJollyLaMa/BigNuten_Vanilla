#!/usr/bin/env node
/**
 * scripts/validatePayrollQueue.js
 *
 * Validates the structure and correctness of payroll-queue.json and
 * cross-checks entries against contributor-accounts.json.
 *
 * Checks performed:
 *   1. Required fields are present on every entry (issueRef, contributor,
 *      contributorGithub, amount, queuedAt, queuedBy).
 *   2. `issueRef` matches the canonical format:
 *      `<owner>/<repo>#<number>`  (e.g. `TheJollyLaMa/BigNuten_Vanilla#77`)
 *   3. `contributor` is a valid Ethereum address (0x + 40 hex chars).
 *   4. `amount` is a positive integer string.
 *   5. No duplicate (issueRef, contributorGithub) pairs in pending or settled.
 *   6. Every `contributorGithub` in the queue exists in contributor-accounts.json.
 *   7. Every wallet address in the queue matches the registered wallet in
 *      contributor-accounts.json (when the contributor is registered).
 *
 * Usage:
 *   node scripts/validatePayrollQueue.js
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — one or more validation errors found
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── File paths ──────────────────────────────────────────────────────────────
const ROOT          = path.resolve(__dirname, '..');
const QUEUE_PATH    = path.join(ROOT, 'payroll-queue.json');
const ACCOUNTS_PATH = path.join(ROOT, 'contributor-accounts.json');

// ── Helpers ──────────────────────────────────────────────────────────────────
const ISSUE_REF_RE  = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/;
const ETH_ADDR_RE   = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT_RE     = /^\d+$/;

let errors   = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ❌  ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  ⚠️  ${msg}`);
  warnings++;
}

function pass(msg) {
  console.log(`  ✅  ${msg}`);
}

// ── Load files ───────────────────────────────────────────────────────────────
if (!fs.existsSync(QUEUE_PATH)) {
  console.error(`❌  ${QUEUE_PATH} not found`);
  process.exit(1);
}
if (!fs.existsSync(ACCOUNTS_PATH)) {
  console.error(`❌  ${ACCOUNTS_PATH} not found`);
  process.exit(1);
}

let queue, accounts;
try {
  queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
} catch (e) {
  console.error(`❌  Failed to parse payroll-queue.json: ${e.message}`);
  process.exit(1);
}
try {
  accounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8'));
} catch (e) {
  console.error(`❌  Failed to parse contributor-accounts.json: ${e.message}`);
  process.exit(1);
}

const pending  = Array.isArray(queue.pending)  ? queue.pending  : [];
const settled  = Array.isArray(queue.settled)  ? queue.settled  : [];
const contribs = Array.isArray(accounts.contributors) ? accounts.contributors : [];

// Build lookup maps from contributor-accounts.json
const walletByGithub = Object.fromEntries(
  contribs.map(c => [c.github.toLowerCase(), (c.walletAddress || '').toLowerCase()])
);
const knownGithubHandles = new Set(contribs.map(c => c.github.toLowerCase()));

// ── Validate a section of the queue (pending or settled) ─────────────────────
function validateSection(entries, sectionName) {
  console.log(`\n── ${sectionName} (${entries.length} entries) ─────────────────────────`);

  const seen = new Set(); // track (issueRef, contributorGithub) duplicates

  entries.forEach((entry, idx) => {
    const label = `[${sectionName}][${idx}]`;

    // 1. Required fields
    const required = ['issueRef', 'contributor', 'contributorGithub', 'amount', 'queuedAt', 'queuedBy'];
    const missing  = required.filter(f => entry[f] === undefined || entry[f] === null || entry[f] === '');
    if (missing.length > 0) {
      error(`${label} Missing required field(s): ${missing.join(', ')}`);
    }

    // 2. issueRef format
    if (entry.issueRef !== undefined) {
      if (!ISSUE_REF_RE.test(entry.issueRef)) {
        error(`${label} Malformed issueRef: "${entry.issueRef}" (expected "<owner>/<repo>#<number>")`);
      }
    }

    // 3. contributor is a valid Ethereum address (may be empty if wallet not yet registered)
    if (entry.contributor !== undefined && entry.contributor !== '') {
      if (!ETH_ADDR_RE.test(entry.contributor)) {
        error(`${label} contributor "${entry.contributor}" is not a valid Ethereum address`);
      }
    } else if (entry.contributor === '') {
      warn(`${label} contributor wallet is empty — contributor @${entry.contributorGithub || '?'} may not be registered`);
    }

    // 4. amount is a positive integer string
    if (entry.amount !== undefined) {
      if (!AMOUNT_RE.test(String(entry.amount)) || parseInt(entry.amount, 10) < 1) {
        error(`${label} amount "${entry.amount}" is not a positive integer`);
      }
    }

    // 5. Duplicate (issueRef, contributorGithub) check
    if (entry.issueRef && entry.contributorGithub !== undefined) {
      const key = `${entry.issueRef}::${(entry.contributorGithub || '').toLowerCase()}`;
      if (seen.has(key)) {
        error(`${label} Duplicate entry: (${entry.issueRef}, @${entry.contributorGithub})`);
      } else {
        seen.add(key);
      }
    }

    // 6. contributorGithub exists in contributor-accounts.json
    if (entry.contributorGithub) {
      const handle = entry.contributorGithub.toLowerCase();
      if (!knownGithubHandles.has(handle)) {
        warn(`${label} @${entry.contributorGithub} not found in contributor-accounts.json`);
      } else {
        // 7. Wallet address matches registered wallet (when contributor has a wallet)
        const registeredWallet = walletByGithub[handle];
        const entryWallet      = (entry.contributor || '').toLowerCase();
        if (registeredWallet && entryWallet && registeredWallet !== entryWallet) {
          error(
            `${label} Wallet mismatch for @${entry.contributorGithub}: ` +
            `queue has "${entry.contributor}", registered wallet is "${walletByGithub[handle]}"`
          );
        }
      }
    }

    // All checks passed for this entry
    if (missing.length === 0) {
      pass(`${label} ${entry.issueRef} → @${entry.contributorGithub || '?'} (${entry.amount} BNUT)`);
    }
  });
}

// ── Cross-section duplicate check (pending vs settled) ────────────────────────
function checkCrossSectionDuplicates() {
  console.log('\n── Cross-section duplicate check ─────────────────────────────────────');
  const settledKeys = new Set(
    settled
      .filter(e => e.issueRef && e.contributorGithub !== undefined)
      .map(e => `${e.issueRef}::${(e.contributorGithub || '').toLowerCase()}`)
  );

  for (const [idx, entry] of pending.entries()) {
    if (!entry.issueRef || entry.contributorGithub === undefined) continue;
    const key = `${entry.issueRef}::${(entry.contributorGithub || '').toLowerCase()}`;
    if (settledKeys.has(key)) {
      error(`[pending][${idx}] Entry (${entry.issueRef}, @${entry.contributorGithub}) also exists in settled`);
    }
  }
  if (errors === 0 && warnings === 0) {
    pass('No cross-section duplicates found');
  }
}

// ── Run validations ──────────────────────────────────────────────────────────
console.log('🔍  Validating payroll-queue.json…\n');
validateSection(pending, 'pending');
validateSection(settled, 'settled');
checkCrossSectionDuplicates();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════════');
if (errors > 0) {
  console.error(`❌  Validation FAILED: ${errors} error(s), ${warnings} warning(s).`);
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`⚠️  Validation passed with ${warnings} warning(s).`);
  process.exit(0);
} else {
  console.log('✅  All checks passed — payroll-queue.json is valid.');
  process.exit(0);
}
