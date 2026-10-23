# Automations

**Fully authorable** (create / edit / delete / dry-run). This is the richest workflow. The ordering is simpler than the app's, but the domain rules below are what separate a professional flow from a carrier-blocked mess. Follow them when creating, and use them as a checklist when reviewing.

### The model: automations live inside flows

- An **automation** is one trigger → (conditions) → action unit (e.g. "on checkout, send a text").
- A **flow** groups automations by a shared trigger, and belongs to *either* a campaign *or* the members program, never both.
- **The rule that matters most: every automation needs a `flowId`. A create op without one throws.** So you must resolve the flow *before* creating. Never invent a flowId.

### The loop: draft → stage → share → save

Automations have a staging tier, and it is the default path. Changes accumulate on a **draft** (an off-prod overlay) until someone explicitly promotes them. A draft carries a link that renders the change as a text-message thread with the edits highlighted, which is what you hand a human to look at before anything reaches a real guest.

1. `listAutomationFlows`: find an existing flow. Pass `{ "campaignId": "<id>" }` for a campaign's flows, or `{ "scope": "membersProgram" }` for members-program flows. Reuse a matching flow when one fits.
2. If none fits, `createAutomationFlow` to make one. If the campaign/members-program has **no flows at all**, strongly prefer `applyAutomationTemplate` (then customize) over building from scratch. Only apply a template when there are no existing flows.
3. `listAutomations` with `{ "flowId": "<id>" }` to see the automations already in that flow before editing (omit the input to list every automation in the org). **Do this immediately before every `update` op you stage, not just once at the start of the session.** An `update` replaces an automation's entire `actions` array; it does not merge one action in. If you reconstruct `actions` from an earlier tool result or from what you remember discussing, rather than the automation's current live state, you silently drop whatever isn't in your reconstruction (a reward grant, a task action, anything not under discussion in that turn). This is true even a few messages later in the same conversation, once the user has asked for a second or third change to the same automation.
4. `stageAutomationEdits` stages operations on a draft, and **the first call starts the draft**: omit `draftId` and pass a short `title` describing the change in the user's terms. That title is what the reviewer sees.
   ```json
   { "title": "Shorten the day-3 nudge", "operations": [ { "type": "update", "automationId": "<id>", "automation": { "actions": [ ... ] } } ] }
   ```
   The response carries the new `draftId`. **Pass it on every later `stageAutomationEdits`, `getAutomationDraft`, `simulateAutomationDraft` and `saveAutomationEdits` call**; `title` is ignored once `draftId` is there:
   ```json
   { "draftId": "<draftId from the first response>", "operations": [ ... ] }
   ```
   Omitting `draftId` again starts a **separate** draft. Keep the `draftId`; **there is no way to list drafts, so if you lose it the draft is unreachable.**
5. The `operations` array is applied in order. Each operation is the named type `AutomationOperation`, and its automation fields use the named types `UserCondition`, `AutomationTrigger`, `AutomationAction`, `AutomationSendTime` and `AutomationVariant`. Fetch those shapes once before writing your first op:
   - `{ "type": "create", "automation": { "automationId": "<new-uuid>", "flowId": "<id>", "title": "...", "isActive": true, "triggers": [...], "conditions": [...], "actions": [...], "time": {...} } }`: generate a fresh UUID for `automationId` (the key is `automationId`, not `id`). `automationId`, `isActive`, `triggers`, `conditions`, `actions` and `time` are required; set the `flowId` and a descriptive title too. Create ops require the flowId.
   - `{ "type": "update", "automationId": "<id>", "automation": { ...changed fields... } }`
   - `{ "type": "delete", "automationId": "<id>" }`: blocked at save time if the automation already has sends.
   - `{ "type": "createVariant", "automationId": "<id>", "variantId": "<new-uuid>", "variant": <AutomationVariant> }` and `{ "type": "updateVariant", "automationId": "<id>", "variantId": "<id>", "variant": { "triggers"?, "conditions"?, "actions"?, "time"? } }` add or change an A/B variant of an automation.
   Call it repeatedly to build a change up; ops append in order.
6. `simulateAutomationDraft` with `{ "draftId": "<id>" }`: dry-run the draft's staged operations against a synthetic event timeline with **no real sends** and confirm the right automations fire. `flowId` defaults to the draft's flow when it touches exactly one; pass it when the draft touches several. If the simulation surprises you, stage a correction rather than promoting and patching live.
   - **First call:** omit `events`. The server seeds a timeline from that flow's triggers (a `viewCampaign` event when the flow has a campaign, then the first eligible trigger event 15 seconds later) and returns it as `eventsUsed`.
   - **Later calls:** to test another day or continue the guest's journey, change `at` on those events or append more, and pass the array back as `events`. Each event is `{ "type": "...", "at": "<ISO 8601 timestamp>" }` plus a few optional fields per type; the server fills in the guest, organization and campaign.
   - The result is `scheduledTexts` (what would be sent, and when) plus `eventsUsed`.
7. **Give the user the `previewUrls` from the draft** and let them look before you promote. Each entry is one flow's before/after view. Don't promote unprompted work on the user's behalf; staging exists so a human sees the change first.
8. `saveAutomationEdits` with `{ "draftId": "<id>" }`: this is the write to production. It refuses if any automation the draft touches was changed by someone else since you staged, naming which; re-stage against the current state rather than retrying.

To abandon a draft, just stop using it: nothing is live until `saveAutomationEdits`, and drafts expire 14 days after they're started. `getAutomationDraft` re-reads one by id, including `resultingAutomations` (each touched automation as it will look after the save); check it for fields that changed or disappeared.

`updateAutomationFlow` renames/retitles a flow; `deleteAutomationFlow` removes a flow and its automations (blocked at ≥20 sends; turn it off instead).

> **Not exposed:** actually *firing* an automation at a live member (the app's "run") is intentionally not a tool, because it sends a real SMS. Use `simulateAutomationDraft` for verification; real sends happen in the app.

### Choosing the trigger

- **Campaign flows: prefer `viewCampaign` over `signUp`.** A guest viewing the campaign page is the natural entry point: it captures new sign-ups *and* returning guests. Use `signUp` only for members-program welcome flows or a fire-once-at-registration moment.
- **`offerExpiration` is rarely a *flow* trigger.** Use it on an individual automation inside an expiration nurture chain, not as a standalone flow's trigger type.

### Text blasts (one scheduled send to everyone who matches)

A text blast is **not a trigger type**, and there is no `textBlast` entry in `AutomationTrigger`. It is an ordinary automation, built and saved through the same draft loop, with no trigger. Text blasts can be built with these tools: never tell the user they have to finish one in the dashboard.

1. **The flow:** `createAutomationFlow` with `"triggerType": "textBlast"` (or reuse a `textBlast` flow from `listAutomationFlows { "scope": "membersProgram" }`).
2. **The automation:** `isTextBlast: true` and `"triggers": []`. The first trigger-less automation created in a `textBlast` flow gets `isTextBlast` set for it, but set it yourself anyway.
3. **The audience is `conditions`.** Who gets it is every member who passes them at send time. "Hasn't visited in 3 weeks" is a `not` around a visit within 21 days:
   ```json
   { "type": "not", "condition": { "type": "event", "event": { "event": { "type": "visit" }, "occur": { "match": "LTE", "duration": 1814400000 } } } }
   ```
   Empty `conditions` means every member.
4. **The send time must be `absoluteDelay` with a `utcDay`** (`"YYYY-MM-DD"`, plus `utcHour`/`utcMinute`), inside a prime window in the org's timezone. A blast with only a time or a `utcDayOfWeek` never sends. A blast runs once per member; it does not repeat. For a recurring win-back, stage a new blast for each date, or use a per-guest trigger instead.
5. **Every text must include STOP in all caps**, e.g. end it with `Text STOP to opt out`. The server refuses to stage or save a text blast whose texts lack it. When you update a blast's `actions`, keep the STOP line the existing text already has.
6. **The org needs the `isTextBlastEnabled` feature flag** (`getOrganization`); without it the save is refused.
7. To grant a reward with the blast, add an `awardReward` action next to the text, with an `expirationDate` if the offer should expire.

Members excluded from blasts (the customer panel's blast exclusion) are skipped automatically. Simulate, share `previewUrls`, and save as with any other change; the save is what schedules the send.

### Conditions: the nested event/occur shape

Event conditions nest the event and its timing. The `occur` object uses `match` (GTE/LTE/EQ) and `duration` (milliseconds):

```json
{ "type": "event",
  "event": { "event": { "type": "signUp" },
             "occur": { "match": "GTE", "duration": 86400000 } } }
```

- **Positive duration = past** (event already happened), for `signUp`, `addPass`, `visit`, `offerRedemption`, etc.
- **Negative duration = future**, only for `offerExpiration` (e.g. "expires within 2 hours" → `LTE`, `-7200000`).
- `EQ` matches within the whole increment (day/week/hour).

### Send times & prime texting windows

Send times are `immediate`, `relativeDelay` (`delayMs` after the trigger), or `absoluteDelay` (`utcHour`/`utcMinute`, optional `utcDayOfWeek` or `utcDay`). Think in the **org's local timezone**, then convert to UTC.

**Always schedule inside a prime window. Never arbitrary times, never before 8 AM or after 9 PM:**
- Morning: **8:00 to 11:30 AM** (org timezone)
- Afternoon: **4:00 to 6:00 PM** (org timezone)

Which window depends on meal service: breakfast/lunch-only → all morning; dinner-only → mostly afternoon, at most one morning; both → roughly 50/50. Determine meal service from existing automations/funnel/settings, or ask the user. **Vary the minutes** so no two automations in a flow share a send time (e.g. 9:03, 9:17, 4:22). Recommend specific times rather than asking.

### Chaining vs. keeping independent

Chain with the `receiveAutomation` trigger (automation B fires because A was received) **only when B always follows A**.

- **Good:** welcome → follow-up tips 2 days later; expiration nurture reminders (per-guest timeline).
- **Do NOT linearly chain a calendar countdown** ("1 week before" → "3 days before" → "day of"). If an early step fails or the guest joins late, every later step is blocked. Instead **fan out from a shared parent**: every countdown message uses `receiveAutomation` → the same entry automation, each with its own `absoluteDelay` date. Then no single message can block the rest.
- **Expiration loops are valid** when gated by user action + a state change: e.g. `... → expired → (guest texts EXTEND, a reply-trigger automation runs extendReward) → re-enters "expires in 3 days"`. The loop is safe because EXTEND gates re-entry and `extendReward` moves the expiration date so conditions re-evaluate. A loop with no user action or no state change is invalid (infinite).

### Backfill (chained automations against past recipients)

When an automation's trigger is `receiveAutomation`, ask the user whether it should apply only going forward or also to everyone who already received the upstream automation:

- Default `applyToHistorical: false` (going forward only).
- For past recipients, set `applyToHistorical: true` as a **top-level sibling** of `automation` on the create/update op (never inside a trigger). It isn't stored; it only enqueues a one-shot backfill on that save.
- Before confirming, count the audience: the distinct members the parent automation has run for. Run `queryData` with exactly this input, putting the parent automation's id in place of `<parentAutomationId>`:

  ```json
  {
    "schemaName": "core",
    "objectTypeName": "automationLog",
    "commands": [
      { "type": "filter", "filter": { "$automationId": { "string": "<parentAutomationId>", "match": "EQ" } } },
      { "type": "aggregate", "aggregate": { "aggregate": { "$serialNumber": "COUNT_DISTINCT" } } }
    ]
  }
  ```

  The count is `data[0].serialNumber`. Count on `core.automationLog`, not `texting.textMessage`: the backfill reads the automation log, which also records runs that sent no text or whose text failed, so a count of texts comes out low.
- Tell the user the number, warn if it is above 1000, and only backfill after they explicitly confirm.

### Rewards inside automations

- **Checkout auto-creates the reward.** For a checkout-triggered automation, do NOT add an `awardReward` action; the reward is already granted. Checkout flows only send texts. Use `awardReward` for non-checkout flows (visit milestones, sign-up rewards).
- **Members-program `awardReward` defaults to a 30-day expiration**: `{ "type": "relative", "relative": { "offsetMs": 2592000000 } }`. Mention it in your summary; omit only if the user says the reward shouldn't expire. This does not apply to campaign offers.

### Text-content best practices (rules when creating, checklist when reviewing)

1. **Descriptive names**: "Day 2: Visit Reminder with Wallet Link", not "Reminder 1".
2. **Lead with the wallet link**: the first post-signup text MUST include the link that adds the guest's card to Apple or Google Wallet, written with the `passLink` text variable (see the variables below).
3. **Every link starts with https**: carriers block links written without it.
4. **Mobile Google Maps links only**: `https://maps.app.goo.gl/...`, never desktop `maps.google.com`.
5. **Correct reservation links**: `https://{subdomain}.feastalytics.com/i/{shorthand}/reservation` using the *current* campaign's shorthand (from `listCampaigns`) and a valid subdomain. Never reuse another campaign's link.
6. **Personalize** with the `firstName` variable; **vary** tone/wording across automations; **re-share** useful info (wallet link, hours, maps, reservation) in reminders; keep **empty lines** between blocks for readability.
7. **Align offer expirations with open hours**: never expire an offer while the restaurant is closed.
8. **Text blasts include STOP**: every text a text blast sends needs opt-out language with STOP in all caps (`Text STOP to opt out`).

**Text variables.** A text action fills these in per guest when it sends. Write each one as its name wrapped in double curly braces (two opening braces, the name, two closing braces), exactly as spelled: `firstName`, `lastName`, `memberNumber`, `serialNumber`, `progress`, `passLink` (the guest's wallet link), `referralLink` (the campaign referral link), `googleMapsLink`, `membersProgramLink`, `visitCount`, `offer`. Any other name is sent to the guest as literal text.

---
