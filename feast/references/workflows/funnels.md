# Funnels

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

**Applying a funnel template** expands a whole screen tree server-side in one call: `chooseFunnelTemplate` (needs the campaign's funnel unset — a fresh campaign — and resolves the referrer from the campaign). `deleteFunnel` tears one down.

**Editing individual funnel screens is now CLI-drivable** through a **draft → preview → promote** loop. You never apply edits locally: you stage them on an off-prod draft, preview the result at a stable URL, then save. Tools: `listFunnelScreens`, `createFunnelDraft`, `stageFunnelEdit`, `stageFunnelScreen`, `getFunnelDraft`, `listFunnelDrafts`, `discardFunnelDraft`, `saveFunnelEdits`.

### The loop

1. **`listFunnelScreens`** `{ "referrer": "<subdomain>", "campaignId": "<id>" }` — read the funnel's screens to get each `screenId` and its renderables' `id`s + content. **Read before any `update` edit** — an update replaces a renderable by id, so you need its current shape. (Omit `campaignId` for a base/members-program funnel.)
2. **`createFunnelDraft`** `{ "referrer": "...", "campaignId": "..." }` — creates an off-prod overlay; keep the returned `draftId`. Nothing is live yet. **Immediately inspect the funnel's current state**: open the draft's preview URL (see step 4 — with no edits staged yet it renders the live funnel as-is) so you have a visual baseline of what you're about to change. If you have a browser/screenshot tool, open and screenshot it now; if you can't view it yourself, share the URL with the user before editing.
3. **`stageFunnelEdit`** `{ "draftId": "...", "screenId": "...", "edit": <RenderableEdit> }` — one renderable edit per call; the server validates it against the current screen. Repeat per change. A `RenderableEdit` is a discriminated union (`describe stageFunnelEdit` for the full schema):
   - `{ "type": "update", "id": "<renderableId>", "renderable": { ...clone of what you read, with your changes... } }` — keep the same `id`.
   - `{ "type": "create", "renderable": { "id": "<new-uuid>", ... }, "targetId": "<sibling id>", "position": "before" | "after" | "inside" }` — generate a fresh UUID.
   - `{ "type": "delete", "id": "<renderableId>" }` and `{ "type": "move", "id": "...", "targetId": "...", "position": "..." }`.
   **Need a brand-new screen?** `stageFunnelScreen` `{ "draftId": "...", "title": "...", "description"? }` stages an empty screen on the draft and returns its **permanent `screenId`** — the id is assigned at staging time, not at save, so you can immediately `stageFunnelEdit` content into it and reference it from navigation/buttons on other screens; nothing gets re-keyed at promote. On a campaign draft the screen is campaign-scoped unless you pass `"campaignScoped": false`. The screen only exists on the draft (and in draft-scoped `listFunnelScreens`/previews) until `saveFunnelEdits` promotes it, which reports it in `createdScreenIds`.
4. **Preview** (no CLI call): open `https://{referrer}.feastalytics.com/preview/{draftId}/{campaignId}` (drop `/{campaignId}` for a members-program draft). It renders the whole funnel as a flow diagram with the draft's edits applied. Screenshot it, then iterate — re-run `listFunnelScreens` **with the `draftId`** to read the funnel *with* the staged edits, stage more, re-preview — until it's right.
5. **`saveFunnelEdits`** `{ "draftId": "..." }` — **promotes to prod** (mutation, confirms first): applies the draft's edits to the live funnel and marks the draft `promoted`. To abandon instead, `discardFunnelDraft`.

`saveFunnelEdits` can also take an inline `{ "referrer", "campaignId", "edits": [ { "screenId", "edit" } ] }` array instead of a `draftId` — a one-shot save with no persisted draft (you lose the preview step, so prefer the draft loop when the change is visual).

### Domain rules
- **Base screens vs campaign screens.** A campaign-owned screen is edited in place; a **base/shared screen edited in a campaign context becomes a campaign *override*** — the shared screen is left untouched. `saveFunnelEdits` decides this automatically from the draft's `campaignId`, so a change scoped to one campaign only affects that campaign.
- **Read before every `update`.** Construct the edit from what `listFunnelScreens` returned (renderable ids are stable), never from memory.
- **One edit per `stageFunnelEdit`**, staged incrementally; each is validated as it lands.
- **Drift guard.** `saveFunnelEdits` rejects the promote if the live funnel changed since the draft was created — re-create the draft in that case.

---
