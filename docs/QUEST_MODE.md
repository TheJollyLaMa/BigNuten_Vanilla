# Local Quest Mode (partial #209)

Open **Settings → Quest Mode** and opt in, or type **BNUT** followed by
**Enter** outside text fields, editable content, interactive controls, and
dialogs. Seven chapters introduce community coordination, data choices,
challenge rules, fair reviews, evidence, contributions, and continued learning.
Each chapter reads the current deterministic `js/communityGuide.mjs` sections,
also used by Genie's Community Guide; there is no separate policy model.

The fixed progress bar has an always-available Exit button. The nonmodal card
does not trap focus or make the underlying app inert. Use Tab, the chapter
selector, Previous / Mark read buttons, or left/right arrow keys inside the
card. Escape exits unless another dialog or a text-editing control is handling
the keyboard. On mobile the card is scrollable and limited to half the screen.
The final chapter includes an optional unsaved knowledge check, not an
eligibility test. Find related UI moves focus only; it never activates a control.
The app header moves below the Quest bar. No automatic animation or idle timer
runs. Exit removes the overlay, highlights, active keyboard handler and layout
observer; only opt-in Settings and the guarded Easter-egg listener remain.
If another dialog opens, Quest temporarily hides its card/bar and yields the
keyboard until that dialog closes. Progress is retained; no modal is dismissed
or activated on the user's behalf.

## What this does not do

The reader is **off**: Quest does not read contracts or health records, load a
model, request a wallet, sign, vote, join a challenge, configure or mint an NFT,
deploy, pay, settle, claim, or upload. Highlights outline only UI that is
currently visible when a chapter renders. Hidden, absent, or unavailable UI
gets explicit directions and an unavailable message, never fabricated live
data. Open the menu yourself and reselect a chapter to refresh its highlight.
The contributor chapter exits Quest before dispatching the existing
`bn:issue-helper` event; the helper opens a local draft, not a submission.

Financial concepts in shared educational text are **not financial chapters
fulfilled**. The seven chapters are reading checkpoints, not proof of
participation, activity, governance rights, funds, or eligibility.

**Deferred from #209:** token/role unlocks (including ≥1 BNUT / `dao-nest`
checks), gated extra chapters / golden holder visuals, on-chain rewards,
claimable DNFT / BNUT bonuses, and any real financial interaction. Deployment,
signing, treasury/payroll, token gates, NFT configuration/minting, real rewards,
and uploads are outside this delivery. **#209 remains partial unless a steward
formally narrows its acceptance criteria.**

## Local progress and deletion

Only `bignuten:quest:v1` is used. It stores a schema version, opt-in/resume flag,
current chapter, chapter indices marked read, and a local completion boolean.
No health data, wallet identity, chat, or secrets are stored by Quest.

- Reload while active resumes the saved chapter. Exit persists the off flag
  and retains progress; resume through Settings or the Easter egg.
- Read all seven chapters to earn **Nest Explorer**, a browser-local keepsake.
  It is not a token, reward, competition award, or access entitlement.
- **Reset Quest progress and badge** starts over locally.
- **Clear all local Quest data and turn off** removes just this key.
- Invalid/unreadable storage, failed writes, and failed deletion are displayed
  explicitly in Settings and the active card. Failed writes leave session-only
  state; older saved progress can return on reload. A failed deletion does not
  claim data was erased. Restore browser storage permissions and retry.
- Storage is device/browser-local, not synchronized or an authoritative record.

## Reuse and verification

Receiving need: accessible, opt-in, nonfinancial onboarding in the live app.
Reuse `COMMUNITY_GUIDE_SECTIONS` and `bn:issue-helper` at BigNuten main
`9945b26` (Apache-2.0), rather than duplicating guide rules or draft UI.
Use the existing native-dialog issue-helper construction, text-only rendering,
and Settings modal close behavior.

Canopy's `data/agency-map.json` was consulted as a curated lead. Read-only
inspection also covered DecentBusking `js/tutorial.js` at `ab7c1dd`
(`_storage`, `_readProgress`, `_rememberProgress`; last change `3a0741b`) and
DecentHead `js/ui.js` at `8542720` (`bindModalClose`, `modalStyles`; last change
`7aacde6`, Apache-2.0), plus their worktree status and recent PRs. Busking's storage/tour
state approach informed an independently written, injected-storage state
adapter with explicit failures. No Busking code was copied: that checkout has
no tracked license. Head has no dedicated onboarding tour in the inspected
source; its modal pattern is useful but a blocking modal would prevent live-app
exploration. Neither donor's wallet, payment, playlist, shadow-DOM, or content
model is imported. BigNuten health/snapshot state helpers are deliberately not
called: their health-data/storage contracts are incompatible with a guide
that must not inspect health records. No shared package or dependency is added.
Original worktrees/WIP are untouched.

Focused validation: `node --test test/questMode.test.js test/communityGuide.test.js`.
Full validation: `npm test` and `npm run test:smoke`; browser coverage includes
desktop/mobile enter, advance, exit, reload/resume, local badge, typing/modal
safety, helper handoff, reset/clear, storage failures, and absence of wallet
actions or hosted-model calls. The existing full local-fork rehearsal remains
part of `test:smoke`; it is not a live financial operation.

Receiving-app result: 11 focused tests passed; the full suite passed 103
Hardhat tests and 244 Node tests. Desktop/mobile smoke passed with zero
unexpected console/page/network errors. The unchanged local rehearsal passed
14 browser actions, 41 fake-token transactions, and five server guard checks.
