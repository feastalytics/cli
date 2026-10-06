# Members program and wallet pass

## Members program (retention)

The retention counterpart to campaigns: flows with no `campaignId`.

- **Automations are authorable** (see the automations workflow): use `listAutomationFlows` with `{ "scope": "membersProgram" }`, then the same create/edit loop. Remember the members-program 30-day `awardReward` default.
- **Rewards are fully manageable.** `listMembersProgramRewards` returns every reward with its catalog item's `name`, `staffInstructions`, `pointsCost` and `source`. The item is resolved across the Feast, Toast, Square and Clover catalogs, and a `null` name means it doesn't exist in any of them.
- **Creating takes one of two shapes.** `{ "type": "item", "itemId" }` promotes an existing catalog item; prefer it whenever the item already exists in the POS. `{ "type": "name", "name" }` looks the name up across all four catalogs and creates a new Feast item only if nothing matches; **the match is exact, so a near-miss silently duplicates a menu item the restaurant already has**. Check `listMembersProgramRewards` or the catalog first. When several items share the name, a Feast item among them wins; otherwise you get a CONFLICT listing the candidates so you can pass `itemId` instead. `staffInstructions` only exist on Feast items and are rejected for POS-sourced ones.
- **The `pointsCost` fork matters.** A reward with `pointsCost` set is redeemed *by the member with points* and is never auto-awarded. Omit `pointsCost` for automation-awarded rewards, and then actually pair the reward with an `awardReward` automation (see the automations workflow), or it will never reach anyone. To find orphans, cross-reference `listAutomations` for `awardReward` actions carrying the reward's `itemId`.
- `updateMembersProgramReward` corrects a reward in place; `pointsCost: null` converts a points reward into an automation-granted one. `deleteMembersProgramReward` is the orphan cleanup; it leaves the catalog item alone (it may be a real menu item) and doesn't claw back anything already redeemed.

### Giving one member a reward

`awardReward` grants a reward to a single member right now, like the dashboard's Give Reward button. It is **not** `createMembersProgramReward`: that defines a reward the program offers, this puts one into a specific guest's wallet pass.

- Input: `{ "serialNumber": "...", "itemId": "...", "expiresInDays": 14 }`. Get `serialNumber` from `searchUsers` and `itemId` from `listMembersProgramRewards` (or a catalog query). Both are checked against the organization, and a wrong id is rejected rather than granted.
- Expiry is optional, and a reward with none never expires. `expiresInDays` ends at the end of that day in the restaurant's timezone (what a guest reads "14 days" to mean); `expiresAt` takes an exact ISO 8601 instant. Pass one or the other. `locationId` restricts redemption to one participating location.
- It recomputes the member's progress, which **re-evaluates their automations**, so a flow triggered by earning a reward will fire (and may text them).
- **No undo and no idempotency key: a retried call grants a second reward.** Confirm the member, item and expiry with the user before calling, call once per member, and if a call's outcome is unclear, check the member's `rewardAwarded` events with `getMemberConversation` before retrying.

---

## Wallet pass configuration

The pass (the wallet membership card) is read and written as a whole document.

- **`getPassConfiguration`** `{}`: returns the latest live configuration (`sections`, `features`, `locations`, `metadata`, and its `version`), or `null` when none has been saved.
- **`updatePassConfiguration`**: **a full-document save, not a patch.** Anything you omit is dropped from the new version. The only safe workflow is read → modify the returned document → save the complete result. `sections` is a `PassSections` and `features` a `PassFeatures`. Saving appends a new version (history is preserved server-side), and a change to sections, features, locations or `passStyle` re-pushes the pass to every member's wallet. `passStyle` is the Apple pass style every one of the organization's passes is built with (`eventTicket`, `storeCard`, `generic`, `coupon`); unset means `eventTicket`. There is no confirmation prompt, so treat it with the same care as a live send. Omit `passStyle` to keep the current style; `null` clears it back to `eventTicket`.
- Pass **image generation** (punch-card strips etc.) is not exposed; image workflows go through the app.
