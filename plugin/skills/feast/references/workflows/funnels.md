# Funnels

**Applying a funnel template** expands a whole screen tree server-side in one call: `applyFunnelTemplate`, which resolves the referrer from the campaign. On a campaign that already has a funnel it replaces it: the campaign's own screens are deleted, along with every edit made to them, and its overrides reset before the template is applied. Base screens such as Members Pass are untouched, and an ineligible template is rejected before anything is deleted. `applyFunnelTemplate` with `{ "campaignId": "...", "templateId": null }` deletes the funnel and applies nothing, returning the campaign to the choose-template state.

**Individual funnel screens are edited** through a **draft → preview → promote** loop. You never apply edits locally: you stage them on an off-prod draft, preview the result at a stable URL, then save. Tools: `listFunnelScreens`, `stageFunnelEdit`, `stageFunnelScreen`, `getFunnelDraft`, `listFunnelDrafts`, `discardFunnelDraft`, `saveFunnelEdits`.

### The loop

1. **`listFunnelScreens`** `{ "referrer": "<subdomain>", "campaignId": "<id>" }`: read the funnel's screens to get each `screenId` and its renderables' `id`s + content. **Read before any `update` edit**: an update replaces a renderable by id, so you need its current shape. (Omit `campaignId` for a base/members-program funnel.)
2. **Look at the live funnel first.** Open `https://{referrer}.feastalytics.com/campaign/{campaignId}` (`https://{referrer}.feastalytics.com/` for a members-program funnel) so you have a visual baseline of what you're about to change. If you have a browser/screenshot tool, open and screenshot it; if you can't view it yourself, share the URL with the user before editing. There is no separate step to open a draft: the first `stageFunnelEdit` or `stageFunnelScreen` starts one (step 3). 3. **`stageFunnelEdit`**: one renderable edit per call; the server validates it against the current screen. **The first edit starts the draft** (an off-prod overlay): omit `draftId` and pass the funnel's `referrer`, plus `campaignId` for a campaign funnel (and `variantId` for a variant):
   ```json
   { "referrer": "melbourneseafoodstation", "campaignId": "<campaignId>", "screenId": "<screenId>", "edit": { "type": "delete", "id": "<renderableId>" } }
   ```
   The response carries the new `draftId`. **Pass it on every later stage, preview and save call for the rest of the conversation**; `referrer` and `campaignId` are no longer needed (they're ignored once `draftId` is there):
   ```json
   { "draftId": "<draftId from the first response>", "screenId": "<screenId>", "edit": { "type": "update", "id": "<renderableId>", "renderable": { ... } } }
   ```
   Omitting `draftId` again starts a **separate** draft, so only do that after a promote (which seals the old draft) or when you're abandoning what you staged, and `discardFunnelDraft` the one you're leaving. One draft holds as many edits as you need. If the first edit is rejected, no draft is created; fix it and send it again without `draftId`. Don't adopt a draft you didn't create here: an open one may hold edits someone else staged, and promoting it would ship them. If the user asks you to pick up earlier work, `listFunnelDrafts` shows what's open (filter with `"status": "open"`); confirm which one with them before staging onto it. Nothing is live until the save. Drafts expire 14 days after they're started. Repeat per change. The `edit` is the named type `RenderableEdit`, a discriminated union (the renderables inside it are the named types `Renderable` and `RootRenderable`):
   - `{ "type": "update", "id": "<renderableId>", "renderable": { ...clone of what you read, with your changes... } }`: keep the same `id`.
   - `{ "type": "create", "renderable": { "id": "<new-uuid>", ... }, "targetId": "<sibling id>", "position": "before" | "after" | "inside" }`: generate a fresh UUID.
   - `{ "type": "delete", "id": "<renderableId>" }` and `{ "type": "move", "id": "...", "targetId": "...", "position": "..." }`.
   **Need a brand-new screen?** `stageFunnelScreen` `{ "draftId": "...", "title": "...", "description"? }` stages an empty screen on the draft (if it's your first change, pass `referrer` and `campaignId` instead of `draftId`, exactly as for `stageFunnelEdit`, and keep the `draftId` it returns) and returns its **permanent `screenId`**. The id is assigned at staging time, not at save, so you can immediately `stageFunnelEdit` content into it and reference it from navigation/buttons on other screens; nothing gets re-keyed at promote. On a campaign draft the screen is campaign-scoped unless you pass `"campaignScoped": false`. The screen only exists on the draft (and in draft-scoped `listFunnelScreens`/previews) until `saveFunnelEdits` promotes it, which reports it in `createdScreenIds`.
4. **Preview**, two ways; use whichever fits how you can look at things:
   - `previewFunnelDraft` renders every screen to a **PDF** (one screen per page, mobile viewport) and returns a short-lived download URL. This is the option that works when you can read files but not browse.
   - The live preview page `https://{referrer}.feastalytics.com/preview/{draftId}/{campaignId}` (drop `/{campaignId}` for a members-program draft) renders the funnel as a flow diagram with the edits applied. This is the link to hand the user.
   Iterate: re-run `listFunnelScreens` **with the `draftId`** to read the funnel *with* the staged edits, stage more, re-preview, until it's right.
5. **`saveFunnelEdits`** `{ "draftId": "..." }`, its only input. It **promotes to prod, with no confirmation prompt**: applies the draft's edits to the live funnel, creates any staged screens, and marks the draft `promoted`. To abandon instead, `discardFunnelDraft`.

**Promote once per piece of work, not once per change.** `stageFunnelEdit` rejects a draft that is not `open`, so a promote ends that draft and the next edit needs a new one. A user asking for four tweaks in a row wants four tweaks, not four promotes. Stage them together and promote when the funnel is where they asked for it, or when they say to publish. Every funnel edit goes through a draft; there is no one-shot save.

### Domain rules
- **Base screens vs campaign screens.** A campaign-owned screen is edited in place; a **base/shared screen edited in a campaign context becomes a campaign *override***, and the shared screen is left untouched. `saveFunnelEdits` decides this automatically from the draft's `campaignId`, so a change scoped to one campaign only affects that campaign.
- **Read before every `update`.** Construct the edit from what `listFunnelScreens` returned (renderable ids are stable), never from memory.
- **One edit per `stageFunnelEdit`**, staged incrementally; each is validated as it lands.
- **Drift guard.** `saveFunnelEdits` rejects the promote if the live funnel changed since the draft was created; start a new draft in that case (stage again without `draftId`). Do not lean on it to catch someone else editing the same funnel; keeping to one open draft (step 2) is the real protection.

---
