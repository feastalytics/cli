# Common workflows

Multi-step tasks in Feastalytics have a required ordering the UI normally enforces for you. Driving the API directly, you have to sequence the calls yourself. Each workflow below gives the ordered steps and the domain rules that make the result *good*, not just valid — and flags where a step is **not yet exposed to the CLI** so you don't fabricate a call.

Always confirm a tool exists with `feast tools` before relying on it; if a workflow's tool is missing, tell the user that part isn't available via the CLI yet rather than inventing it. The exact field list for any tool always comes from `feast describe <tool>` — this file gives you the *meaning* and *ordering* the schema can't.

---

## Creating a campaign

Fully doable via the CLI. The server does the heavy lifting (id generation, default config, the funnel prerequisite) — you sequence the calls.

1. `loadCurrentOrganization` — read the org to get valid **referrers** (subdomains, from `subdomains2[].subdomain`) and location ids.
2. `createCampaign` with `{ "campaign": { "name": "...", "isCreating": true, "fbCampaigns": [], "attributionRules": [] } }` — keep the returned campaign **id** (a UUID). It comes back `isCreating: true`.
3. `populateCampaign` with the `campaignId` and a **`funnelType`**:
   - `"reservation"` — no extra config.
   - `"simpleRewards"` — needs `simpleRewardsConfig` with a `promotionName` and an image. Pass a public `imageUrl` string (the CLI can't do the app's file-upload path).
   - `"prepay"` — needs `prepayConfig` with `promotionName`, `price`, and an image (`imageUrl`).
4. (optional) `chooseFunnelTemplate` — the **acquisition** half: the funnel screens a guest sees. Requires a fresh campaign whose funnel is unset; resolves the referrer from the campaign.
5. (optional) `applyAutomationTemplate` — the **retention** half: the follow-up messaging. Provisions the campaign's flow *and* its automations in one call, so you don't hand-build a flow for this path. Preview options first with `listAutomationTemplates` / `loadTemplateAutomations`.

Steps 4 and 5 are the two independent halves of a working campaign — the funnel (what the guest sees) and the automations (the messaging that follows). A fully working campaign has a funnel with no screen errors and at least one automation flow.

**Reading a campaign back:** `getCampaign` returns the full config for one campaign (funnel/offer config, referrers, status); `listCampaigns` is the summary list; `getCampaignKpis` is performance metrics. Read with `getCampaign` before any `updateCampaign`.

**Cloning:** `cloneCampaign` with `sourceCampaignId`, `newCampaignName`, and a `referrer` (subdomain) duplicates funnel + automations + offers and returns a `newCampaignId`. **Gotcha:** the cloned automations still contain the *source* campaign's reservation links. After cloning, review the new campaign's automations and rewrite any reservation link to the new campaign's shorthand — the format is `https://{subdomain}.feastalytics.com/i/{new-shorthand}/reservation`.

The one-shot text→campaign endpoints (`createWithOffer` / `parseCampaignDescription`) aren't exposed to the CLI — use the steps above.

---

## Setting up automations

**Now fully authorable from the CLI** (create / edit / delete / dry-run). This is the richest workflow — the ordering is simpler than the app's, but the domain rules below are what separate a professional flow from a carrier-blocked mess. Follow them when creating, and use them as a checklist when reviewing.

### The model: automations live inside flows

- An **automation** is one trigger → (conditions) → action unit (e.g. "on checkout, send a text").
- A **flow** groups automations by a shared trigger, and belongs to *either* a campaign *or* the members program — never both.
- **The rule that matters most: every automation needs a `flowId`. `batchEditAutomations` throws on a create op without one.** So you must resolve the flow *before* creating. Never invent a flowId.

### The CLI loop (simpler than the app — no navigate/stage/save split)

Unlike the in-app agent (which scaffolds an automation, then edits it, then explicitly saves), the CLI sends a **complete** automation in one operation and it persists immediately.

1. `listAutomationFlows` — find an existing flow. Pass `{ "campaignId": "<id>" }` for a campaign's flows, or `{ "scope": "membersProgram" }` for members-program flows. Reuse a matching flow when one fits.
2. If none fits, `createAutomationFlow` to make one. If the campaign/members-program has **no flows at all**, strongly prefer `applyAutomationTemplate` (then customize) over building from scratch. Only apply a template when there are no existing flows.
3. `listAutomations` with `{ "flowId": "<id>" }` to see the automations already in that flow before editing (omit the input to list every automation in the org).
4. `batchEditAutomations` with a list of `operations`:
   - `{ "type": "create", "automation": { ...full automation..., "flowId": "<id>" } }` — generate a fresh UUID for the automation's id, set the `flowId`, and include triggers, conditions, actions, send time, and a descriptive title all at once. The server validates it and (create ops) requires the flowId.
   - `{ "type": "update", "automationId": "<id>", "automation": { ...changed fields... } }`
   - `{ "type": "delete", "automationId": "<id>" }` — blocked if the automation already has sends.
5. `simulateAutomations` — dry-run the flow against a synthetic event timeline with **no real sends**, to confirm the right automations fire before or after you save. It can also preview un-saved `edits` before you commit them.

`updateAutomationFlow` renames/retitles a flow; `deleteAutomationFlow` removes a flow and its automations (blocked at ≥20 sends — turn it off instead).

> **Not exposed:** actually *firing* an automation at a live member (the app's "run") is intentionally not a CLI tool — it sends a real SMS. Use `simulateAutomations` for verification; real sends stay in the app.

### Choosing the trigger

- **Campaign flows: prefer `viewCampaign` over `signUp`.** A guest viewing the campaign page is the natural entry point — it captures new sign-ups *and* returning guests. Use `signUp` only for members-program welcome flows or a fire-once-at-registration moment.
- **`offerExpiration` is rarely a *flow* trigger.** Use it on an individual automation inside an expiration nurture chain, not as a standalone flow's trigger type.

### Conditions: the nested event/occur shape

Event conditions nest the event and its timing. The `occur` object uses `match` (GTE/LTE/EQ) and `duration` (milliseconds):

```json
{ "type": "event",
  "event": { "event": { "type": "signUp" },
             "occur": { "match": "GTE", "duration": 86400000 } } }
```

- **Positive duration = past** (event already happened) — for `signUp`, `addPass`, `visit`, `offerRedemption`, etc.
- **Negative duration = future** — only for `offerExpiration` (e.g. "expires within 2 hours" → `LTE`, `-7200000`).
- `EQ` matches within the whole increment (day/week/hour).

### Send times & prime texting windows

Send times are `immediate`, `relativeDelay` (`delayMs` after the trigger), or `absoluteDelay` (`utcHour`/`utcMinute`, optional `utcDayOfWeek` or `utcDay`). Think in the **org's local timezone**, then convert to UTC.

**Always schedule inside a prime window — never arbitrary times, never before 8 AM or after 9 PM:**
- Morning: **8:00–11:30 AM** (org timezone)
- Afternoon: **4:00–6:00 PM** (org timezone)

Which window depends on meal service: breakfast/lunch-only → all morning; dinner-only → mostly afternoon, at most one morning; both → roughly 50/50. Determine meal service from existing automations/funnel/settings, or ask the user. **Vary the minutes** so no two automations in a flow share a send time (e.g. 9:03, 9:17, 4:22). Recommend specific times rather than asking.

### Chaining vs. keeping independent

Chain with the `receiveAutomation` trigger (automation B fires because A was received) **only when B always follows A**.

- **Good:** welcome → follow-up tips 2 days later; expiration nurture reminders (per-guest timeline).
- **Do NOT linearly chain a calendar countdown** ("1 week before" → "3 days before" → "day of"). If an early step fails or the guest joins late, every later step is blocked. Instead **fan out from a shared parent**: every countdown message uses `receiveAutomation` → the same entry automation, each with its own `absoluteDelay` date. Then no single message can block the rest.
- **Expiration loops are valid** when gated by user action + a state change: e.g. `... → expired → (guest texts EXTEND, a reply-trigger automation runs extendReward) → re-enters "expires in 3 days"`. The loop is safe because EXTEND gates re-entry and `extendReward` moves the expiration date so conditions re-evaluate. A loop with no user action or no state change is invalid (infinite).

### Backfill (chained automations against past recipients)

When an automation's trigger is `receiveAutomation`, ask the user whether it should apply only going forward or also to everyone who already received the upstream automation:

- Default `applyToHistorical: false` (going forward only).
- For past recipients, set `applyToHistorical: true` as a **top-level sibling** of `automation` on the create/update op (never inside a trigger; it isn't stored — it only enqueues a one-shot backfill on that save).
- Before confirming, call `countParentAutomationRecipients` and tell the user the audience size; warn if > 1000. Only backfill after explicit confirmation.

### Rewards inside automations

- **Checkout auto-creates the reward.** For a checkout-triggered automation, do NOT add an `awardReward` action — the reward is already granted. Checkout flows only send texts. Use `awardReward` for non-checkout flows (visit milestones, sign-up rewards).
- **Members-program `awardReward` defaults to a 30-day expiration**: `{ "type": "relative", "relative": { "offsetMs": 2592000000 } }`. Mention it in your summary; omit only if the user says the reward shouldn't expire. This does not apply to campaign offers.

### Text-content best practices (rules when creating, checklist when reviewing)

1. **Descriptive names** — "Day 2 – Visit Reminder with Pass Link", not "Reminder 1".
2. **Lead with the pass link** — the first post-signup text MUST include it ("add your pass: {{pass link}}").
3. **Always `https://`** on every link (carriers block bare/protocol-less links).
4. **Mobile Google Maps links only** — `https://maps.app.goo.gl/...`, never desktop `maps.google.com`.
5. **Correct reservation links** — `https://{subdomain}.feastalytics.com/i/{shorthand}/reservation` using the *current* campaign's shorthand (from `listCampaigns`) and a valid subdomain. Never reuse another campaign's link.
6. **Personalize** with `{{firstName}}`; **vary** tone/wording across automations; **re-share** useful info (pass link, hours, maps, reservation) in reminders; keep **empty lines** between blocks for readability.
7. **Align offer expirations with open hours** — never expire an offer while the restaurant is closed.

---

## Creating offers (strategy backlog)

Fully doable from the CLI. Offers live in the organization's strategy backlog (the offer queue), sourced from real menu data.

1. `loadCurrentOrganization` → get the **`locationId`** (from `locations`) — offer tools key on the location, **never** the organizationId.
2. `dfyGetMenuHierarchy` with that `locationId` — browse real menu items and prices.
3. `dfyListOffers` — see the current backlog; avoid duplicates.
4. `dfyCreateOffer` — create it. `dfyUpdateOffer` / `dfyDeleteOffer` to revise.

Every offer picks one **framework**:

- **`free`** — give away a low-cost item (appetizer, side, drink, small dessert) with no purchase. Maximizes signups. `offerPrice: null`; `items` = the single free item at its menu price. Headline: "A Complimentary [Item]" / "Free [Item]".
- **`combo`** — bundle to lift the ticket. *Pattern A* "Buy X, Get Y Free" (`offerPrice` = purchased item only) — best for quick-service. *Pattern B* fixed-price bundle "[Item] & [Item] for $XX" (`offerPrice` = bundle price) — preserves brand equity for upscale.
- **`experience`** — a curated multi-item tasting/pairing/prix-fixe with **no discount** (`offerPrice` = sum of item prices). MUST have 2+ items.

`dfyCreateOffer` needs `name` (internal label, no restaurant name), `headline` (states what the guest gets + price, using real item names), a short `description` (context the headline can't carry), `framework`, `items` (`[{name, price}]` from the menu), `offerPrice`, and `locationId`. Always frame as "offers," never "discounts" or "deals."

---

## Members program (retention)

The retention counterpart to campaigns — flows with no `campaignId`.

- **Automations are authorable** (see the automations workflow): use `listAutomationFlows` with `{ "scope": "membersProgram" }`, then the same create/edit loop. Remember the members-program 30-day `awardReward` default.
- **Creating members-program rewards themselves is NOT exposed.** Reward creation in the app writes a catalog item + reward link through generic object-query mutations with no dedicated tool, and orchestrates catalog-item-create-or-reuse plus awarding-automation scaffolding client-side. There's no tagged `createReward`. If asked, tell the user this needs the app (or a new endpoint).
- **Pass builder** (wallet pass design) is not exposed to the CLI.

---

## Exploring users (guests / members)

**Reading is now available** via `searchUsers`. It returns a page of recent member activity — one event per member, each carrying the member's `serialNumber` plus the event (type, time, related object).

- Filter with `query` (free-text name), `eventTypes` (e.g. `sentText`, `receivedText`, `scan`, `order`, `rewardAwarded`, `rewardRedeemed`, `checkout`, the `*Attribution` types), `progressMinBound`/`progressMaxBound` (visit-count range), `isUnread: true` (members with unanswered inbound texts), `orderBy` (ASC|DESC by event time).
- Paginate with `limit` (default 100) and `cursor` (pass back the `cursor` from the previous call; an undefined cursor means no more pages).

**Replying by SMS is NOT exposed, deliberately.** The send primitive enforces opt-out, quiet-hours, dedup, and rate limits *downstream* (not at the endpoint), and opt-in is currently gated only by a UI control. If a reply capability is ever exposed, it must run with confirmation and must not bypass those guardrails. For now, tell the user that replying to guests is done in the app.

---

**Applying a funnel template** expands a whole screen tree server-side in one call: `chooseFunnelTemplate` (needs the campaign's funnel unset — a fresh campaign — and resolves the referrer from the campaign). `deleteFunnel` tears one down.

**Editing individual funnel screens is now CLI-drivable** through a **draft → preview → promote** loop. You never apply edits locally: you stage them on an off-prod draft, preview the result at a stable URL, then save. Tools: `listFunnelScreens`, `createFunnelDraft`, `stageFunnelEdit`, `getFunnelDraft`, `listFunnelDrafts`, `discardFunnelDraft`, `saveFunnelEdits`.

### The loop

1. **`listFunnelScreens`** `{ "referrer": "<subdomain>", "campaignId": "<id>" }` — read the funnel's screens to get each `screenId` and its renderables' `id`s + content. **Read before any `update` edit** — an update replaces a renderable by id, so you need its current shape. (Omit `campaignId` for a base/members-program funnel.)
2. **`createFunnelDraft`** `{ "referrer": "...", "campaignId": "..." }` — creates an off-prod overlay; keep the returned `draftId`. Nothing is live yet. **Immediately inspect the funnel's current state**: open the draft's preview URL (see step 4 — with no edits staged yet it renders the live funnel as-is) so you have a visual baseline of what you're about to change. If you have a browser/screenshot tool, open and screenshot it now; if you can't view it yourself, share the URL with the user before editing.
3. **`stageFunnelEdit`** `{ "draftId": "...", "screenId": "...", "edit": <RenderableEdit> }` — one renderable edit per call; the server validates it against the current screen. Repeat per change. A `RenderableEdit` is a discriminated union (`describe stageFunnelEdit` for the full schema):
   - `{ "type": "update", "id": "<renderableId>", "renderable": { ...clone of what you read, with your changes... } }` — keep the same `id`.
   - `{ "type": "create", "renderable": { "id": "<new-uuid>", ... }, "targetId": "<sibling id>", "position": "before" | "after" | "inside" }` — generate a fresh UUID.
   - `{ "type": "delete", "id": "<renderableId>" }` and `{ "type": "move", "id": "...", "targetId": "...", "position": "..." }`.
4. **Preview** (no CLI call): open `https://{referrer}.feastalytics.com/preview/{draftId}/{campaignId}` (drop `/{campaignId}` for a members-program draft). It renders the whole funnel as a flow diagram with the draft's edits applied. Screenshot it, then iterate — re-run `listFunnelScreens` **with the `draftId`** to read the funnel *with* the staged edits, stage more, re-preview — until it's right.
5. **`saveFunnelEdits`** `{ "draftId": "..." }` — **promotes to prod** (mutation, confirms first): applies the draft's edits to the live funnel and marks the draft `promoted`. To abandon instead, `discardFunnelDraft`.

`saveFunnelEdits` can also take an inline `{ "referrer", "campaignId", "edits": [ { "screenId", "edit" } ] }` array instead of a `draftId` — a one-shot save with no persisted draft (you lose the preview step, so prefer the draft loop when the change is visual).

### Domain rules
- **Base screens vs campaign screens.** A campaign-owned screen is edited in place; a **base/shared screen edited in a campaign context becomes a campaign *override*** — the shared screen is left untouched. `saveFunnelEdits` decides this automatically from the draft's `campaignId`, so a change scoped to one campaign only affects that campaign.
- **Read before every `update`.** Construct the edit from what `listFunnelScreens` returned (renderable ids are stable), never from memory.
- **One edit per `stageFunnelEdit`**, staged incrementally; each is validated as it lands.
- **Drift guard.** `saveFunnelEdits` rejects the promote if the live funnel changed since the draft was created — re-create the draft in that case.

---

## Establishing brand identity

**Not exposed to the CLI yet.** Brand setup (logo, colors, fonts, subdomain look) writes to several untagged endpoints, and the intelligent part — auto-extracting a usable palette from a scraped brand with WCAG-contrast derivation and logo selection — lives entirely in the browser, not the API. A brand-import endpoint exists only as a raw scrape (unfiltered logos/colors). If asked, tell the user brand setup isn't CLI-drivable yet.
