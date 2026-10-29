# Genie issue / idea helper

Open Settings (Aesculapius → gear) → **Report an issue / suggest an idea
(no AI needed)**, or **Issue / idea** in a Genie chat header, including Yoga Genie.
The helper is available without enabling AI, downloading a model, an API key,
or hosted-model consent.

1. Choose bug, feature idea, challenge proposal, or metric request.
2. Answer what happened, what you expected, steps, and which surface.
   Describe behavior with synthetic examples, not health data.
3. Create a safe draft, then edit its title/body.
4. Review the sanitized text. Confirm that it contains no health data, secrets,
   or unwanted personal details; then open the prefilled GitHub draft.
5. Review and submit on GitHub yourself. Opening a link is **not** submission.

The deterministic builder has no access to storage, wallet, logs, chat history,
diagnostics, or models. Drafts remain in the dialog's memory and are discarded
on close. No draft or diagnostics are sent to a hosted model, even if general
Genie hosted consent was previously granted. The only outgoing draft is the
explicitly opened GitHub URL; GitHub/browser history may retain that URL.
There is no posting API, token request, upload, or financial action.

Credential-labeled lines, known token/key patterns, long key-like strings,
URLs, and address-like text are removed conservatively. Pasted URL-encoded
text is decoded before scanning. This is not a comprehensive secret, health,
or personal-data detector: inspect the entire outgoing preview yourself.
Public addresses require a separate explicit opt-in and exact per-address
list (case-sensitive, at most ten). This cannot override credential/key
removal. Unsupported or key-like addresses are refused rather than exposed.
Switching opt-in or editing any field invalidates the previously reviewed link.
Invalid/oversized inputs produce an explicit error, never a partial URL.

The GitHub template chooser also offers four structured forms. The helper uses
the plain `title`/`body` new-issue URL, not a YAML-form template parameter, so
GitHub can prefill the reviewed Markdown without relying on issue-form field
prefill support. Existing `contributor-request.yml` is unchanged.

## Reuse decision

Need: a model-free, private-by-default interview and user-submitted issue draft.
Consulted Canopy's `data/agency-map.json` BigNuten/Busking/Head entries; its
storage, community, and guide leads are not an issue-builder implementation.
Searched tracked issue/feedback files and JS source in DecentBusking and
DecentHead, donor statuses/worktrees and recent PRs, and relevant feedback
issues. Also inspected the public DBusker guide branch's `js/dbusker.mjs`
at `6be300e913c111cd6896c23cee32e1c399a7a1a8`: `initDBusker` provides
editable starter questions and an explicit shared-exchange review flow, but
requires service consent, invited wallet authentication, and hosted requests.
Those are incompatible with this unauthenticated, local-only issue helper.
No compatible issue-URL builder was located within that scope.
DecentBusking `.github/ISSUE_TEMPLATE/whitelist-request.yml` at
`23ea9fbdaa1a68c23dba0915c20d0b3073acb676` is an existing issue-form pattern,
but requests a wallet for rewards: inappropriate here. The receiving app's
`contributor-request.yml` is preserved, not adapted into this nonfinancial flow.
No donor implementation is copied, so no additional dependency or attribution
obligation is introduced; BigNuten retains its Apache-2.0 license.

Build-new choice: `buildIssueDraft`, `reviewIssueDraft`, and
`sanitizeIssueText` share one deterministic gate; separate DOM UI reuses
BigNuten's native modal pattern (`js/geniePrivacy.js`, `showConsentDialog`).
Unlike hosted Genie, the helper never reads consent, model settings, memory,
or health context. No shared framework is extracted.

Validation: `node --test test/issueHelper.test.js` tests pure URL encoding,
stripping and opt-in boundaries, malformed/oversized text, no health/storage/
model access, and template preservation. `npm run test:smoke` exercises the
real desktop/mobile create/edit/review/link path without navigating to or
publishing on GitHub. See the PR for actual run results.
