# Common workflows

Multi-step tasks in Feastalytics have a required ordering the UI normally enforces for you. Driving the API directly, you have to sequence the calls yourself. Each workflow below lists the ordered steps, and — importantly — flags where a step is **not yet exposed to the CLI** so you don't fabricate a call. Always confirm a tool exists with `feast tools` before relying on it; if a workflow's tool is missing, tell the user that part isn't available via the CLI yet rather than inventing it.

## Creating a campaign

Fully doable via the CLI today. The server does the heavy lifting (id generation, default config, the funnel prerequisite) — you just sequence three calls.

1. `feast call loadCurrentOrganization --org <org>` — read the org to get valid **referrers** (subdomains) and location ids.
2. `feast call createCampaign --org <org> --input '{"name": "...", "referrers": ["<subdomain>"]}'` — keep the returned campaign **id** (a UUID). The campaign comes back `isCreating: true`.
3. `feast call populateCampaign --org <org> --input '{"campaignId": "<id>", ...}'` — finalizes it. To attach a promotion image, pass a public `imageUrl` string (skip the file-upload path, which the CLI can't do).
4. (optional) `feast call chooseFunnelTemplate --org <org> --input '{"campaignId": "<id>", ...}'` — applies a funnel template (the **acquisition** side: the screens a guest sees).
5. (optional) `feast call applyAutomationTemplate --org <org> --input '{...}'` — applies an automation template (the **retention** side: the follow-up welcome/reminder messaging). This is the automation counterpart to the funnel template, and it provisions the campaign's automation flow *and* its automations in one call — so you don't create a flow by hand for this path. Preview options first with `listAutomationTemplates` / `loadTemplateAutomations`.

Steps 4 and 5 configure the two halves of a campaign — the funnel (what the guest sees) and the automations (the messaging that follows). Both are optional and independent.

The one-shot `createWithOffer` / `parseCampaignDescription` (text → campaign) endpoints aren't exposed to the CLI yet — use the steps above.

## Setting up a funnel and editing it

- **Applying a funnel template is doable**: `chooseFunnelTemplate` expands a whole screen tree server-side in one call. It requires the campaign's funnel to be unset (a fresh campaign), and resolves the referrer from the campaign.
- **Editing individual funnel screens is NOT exposed to the CLI yet.** The screen-level endpoints (`layoutEngine.screens.listV2` / `create` / `updateV2`) carry no CLI tool. Screen editing also depends on client-side machinery (UUID generation per renderable, staged-edit folding, default-renderable construction). If the user asks to edit funnel screens, tell them that's not available via the CLI yet.

## Setting up automations — flow first

**Automations always live inside a flow.** A flow groups automations by a shared trigger (visit, signUp, checkout, textBlast, …). The UI hides this because you're always inside a flow when you add automations; from the CLI you must handle it explicitly. The ordering is mandatory:

1. `feast call listAutomationFlows --org <org> --input '{...}'` — **find an existing flow** to use. Pass `{"campaignId": "<id>"}` for a campaign's flows, or `{"scope": "membersProgram"}` for members-program flows.
2. If no suitable flow exists, `feast call createAutomationFlow --org <org> --input '{...}'` to create one — never add automations without a flow.
3. Apply a prebuilt flow of automations with `applyAutomationTemplate` (preview first with `loadTemplateAutomations`, list options with `listAutomationTemplates`).

**Editing individual automations** (add/edit/delete nodes within a flow) is NOT exposed to the CLI yet — those write endpoints aren't tagged. Today the CLI can create flows and apply templates; per-automation node editing must be done in the app.

## Creating members-program rewards

**Not exposed to the CLI yet.** Reward creation in the app writes a catalog item and a reward link through generic object-query mutations with no dedicated tool, and the app orchestrates catalog-item-create-or-reuse plus awarding-automation scaffolding client-side. There is no tagged `createReward` tool. If asked, tell the user this needs the app (or a new endpoint).

## Establishing brand identity

**Not exposed to the CLI yet.** Brand setup (logo, colors, fonts, subdomain look) writes to several untagged endpoints, and the intelligent part — auto-extracting a usable palette from a scraped brand, with WCAG-contrast derivation and logo selection — lives entirely in the browser, not the API. A brand-import endpoint exists only as a raw scrape (unfiltered logos/colors). If asked, tell the user brand setup isn't CLI-drivable yet.

## Exploring users (guests/members) and replying

**Not exposed to the CLI yet.** Guest/member search (`searchUsersV3`), per-guest event timelines, and the creator/influencer message threads are all untagged, so the CLI can't list guests or read a thread today.

**Replying by SMS** is a sensitive write: the single send primitive enforces opt-out, quiet-hours, dedup, and rate limits *downstream* (not at the endpoint), and opt-in is currently only enforced by a disabled UI control. If a reply capability is ever exposed to the CLI, it must run with confirmation and must not bypass those guardrails. For now, tell the user that exploring and replying to guests is done in the app.
