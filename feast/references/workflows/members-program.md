# Members program and wallet pass

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.


## Members program (retention)

The retention counterpart to campaigns — flows with no `campaignId`.

- **Automations are authorable** (see the automations workflow): use `listAutomationFlows` with `{ "scope": "membersProgram" }`, then the same create/edit loop. Remember the members-program 30-day `awardReward` default.
- **Rewards are now readable and creatable.** `listMembersProgramRewards` returns every reward with its catalog `name`, `staffInstructions`, and `pointsCost` (fields are `null` when unset). `createMembersProgramReward` takes `{ "name", "staffInstructions"?, "pointsCost"? }` and does the catalog-item dance for you: an existing catalog item with that exact name is reused (updating its `staffInstructions` if you passed any), otherwise one is created, then the reward row is linked to it.
- **The `pointsCost` fork matters.** A reward with `pointsCost` set is redeemed *by the member with points* and is never auto-awarded. Omit `pointsCost` for automation-awarded rewards — and then actually pair the reward with an `awardReward` automation (see the automations workflow), or it will never reach anyone. `listMembersProgramRewards` deliberately has no `hasAutomation` flag: cross-reference `listAutomations` for `awardReward` actions carrying the reward's `itemId` to find orphans.
- Reward **update/delete are not exposed** yet — those still need the app.

---

## Wallet pass configuration

The pass (the wallet membership card) is now CLI-readable and -writable as a whole document.

- **`getPassConfiguration`** `{}` — returns the latest live configuration: `sections`, `features`, `locations`, `metadata`, and its `version`.
- **`updatePassConfiguration`** — **a full-document save, not a patch.** Anything you omit is dropped from the new version. The only safe workflow is read → modify the returned document → save the complete result. Saving appends a new version (history is preserved server-side), and a visible change triggers a re-push of the pass to every member's wallet — so this confirms before running and deserves the same care as a live send.
- Pass **image generation** (punch-card strips etc.) is not exposed — image workflows still need the app.

---
