# Members program and wallet pass

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.


## Members program (retention)

The retention counterpart to campaigns — flows with no `campaignId`.

- **Automations are authorable** (see the automations workflow): use `listAutomationFlows` with `{ "scope": "membersProgram" }`, then the same create/edit loop. Remember the members-program 30-day `awardReward` default.
- **Rewards are fully manageable.** `listMembersProgramRewards` returns every reward with its catalog item's `name`, `staffInstructions`, `pointsCost` and `source` — the item is resolved across the Feast, Toast, Square and Clover catalogs, and a `null` name means it no longer exists in any of them.
- **Creating takes one of two shapes.** `{ "type": "item", "itemId" }` promotes an existing catalog item — prefer it whenever the item already exists in the POS. `{ "type": "name", "name" }` looks the name up across all four catalogs and creates a new Feast item only if nothing matches; **the match is exact, so a near-miss silently duplicates a menu item the restaurant already has** — check `listMembersProgramRewards` or the catalog first. A name shared by several items returns a CONFLICT listing candidates so you can pass `itemId` instead. `staffInstructions` only exist on Feast items and are rejected for POS-sourced ones.
- **The `pointsCost` fork matters.** A reward with `pointsCost` set is redeemed *by the member with points* and is never auto-awarded. Omit `pointsCost` for automation-awarded rewards — and then actually pair the reward with an `awardReward` automation (see the automations workflow), or it will never reach anyone. To find orphans, cross-reference `listAutomations` for `awardReward` actions carrying the reward's `itemId`.
- `updateMembersProgramReward` corrects a reward in place — `pointsCost: null` converts a points reward into an automation-granted one. `deleteMembersProgramReward` is the orphan cleanup; it leaves the catalog item alone (it may be a real menu item) and doesn't claw back anything already redeemed.

---

## Wallet pass configuration

The pass (the wallet membership card) is read and written as a whole document.

- **`getPassConfiguration`** `{}` — returns the latest live configuration: `sections`, `features`, `locations`, `metadata`, and its `version`.
- **`updatePassConfiguration`** — **a full-document save, not a patch.** Anything you omit is dropped from the new version. The only safe workflow is read → modify the returned document → save the complete result. Saving appends a new version (history is preserved server-side), and a visible change triggers a re-push of the pass to every member's wallet — there is no confirmation prompt, so treat it with the same care as a live send.
- Pass **image generation** (punch-card strips etc.) is not exposed — image workflows still need the app.

---
