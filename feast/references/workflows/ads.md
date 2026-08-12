# Publishing and steering Meta ads

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

Publishing is CLI-drivable end to end: resolve a template, plan, publish, activate. The planner is the only door in — **never hand-assemble Meta campaign parameters**; `publishAds` re-derives everything from the template variables and refuses anything else.

For the *words* in the ads, read `facebook.md` first — copywriting is its own discipline with its own failure modes.

### The model: template → plan → publish → activate

- A **template** is a server-owned recipe. `listAdTemplates` returns each one with its variables, budget range, and which plan paths may be overridden. Each variable that names a `producedBy` tool is telling you exactly where its value comes from — treat that as the shopping list.
- **`planAds`** resolves template + variables into the exact tree of campaigns, ad sets and ads that would be created. It creates nothing on Meta and changes no Feastalytics data. It returns the tree, a `planHash`, the fully defaulted variables, and validation issues.
- **`publishAds`** takes those variables, overrides and hash back *unchanged*, re-derives the tree server-side, and refuses on a mismatch — so a stale plan fails loudly instead of publishing something the human never saw. Everything is created **paused**.
- **`setAdCampaignStatus`** `ACTIVE` starts a campaign Feastalytics published, cascading to every ad set and ad. This is the moment real money starts moving — explicit user confirmation first, every time.

### The loop

1. `listAdTemplates` — pick the template, read each variable's `producedBy`.
2. Gather variables with those tools: `ads_get_ad_accounts`, `ads_get_user_pages`, `ads_get_ig_accounts`, `listCreatives`, `getCampaign`, etc. Prefer a Page with `usedByOrganization: true` — the token reaches other businesses' Pages and nothing stops you publishing from the wrong one.
3. `planAds` — fix every issue with severity `error` and re-plan. Summarize the resulting tree (campaign name, budget, targeting, ad count) for the user before going further; the plan is the thing they're approving.
4. `publishAds` with the returned `variables`, `overrides` and `planHash` unchanged, plus:
   - `confirm: true` — the schema demands it; this is the only tool with a schema-level confirm.
   - an `idempotencyKey` you generate. Reuse the same key when retrying the *same* publish — a duplicate key returns the earlier job instead of publishing twice. Never reuse one for a new publish.
   - `effects` — see below.
5. Poll `getJob` with the returned `jobId` + `jobType` until `COMPLETED` or `FAILED`. `{ job: null }` means not landed yet — keep polling. **Read the job's effect outcomes** — each declared effect reports `done`, `skipped` or `error` with a human-readable detail, and effect failures do not fail the job (the ads already exist by then), so this is the only place you find out.
6. `setAdCampaignStatus` to go live, after the user says go. Check the preflight counts in the response.

### Effects: the write-back is declared, not called afterwards

Bookkeeping that must happen once the ads exist travels *inside* the publish as `effects`, and the worker runs it as part of the job — because a follow-up call you're supposed to remember is a follow-up call that gets missed, silently.

- **A recruitment publish must declare `linkRecruitmentOffer`** with its `offerId` and `creativeIds` — the server refuses the publish without it. The effect stamps the creatives as published, stamps the offer that the monthly sourcing cap and the dashboard's spend both read, and texts the program's approver that sourcing is live.
- **`linkFeastCampaign`** records the published Meta campaign onto a Feast campaign, which is what makes its ads panel and KPIs see the spend.

An effect that reports `error` in the job is a case for the dashboard, not for patching around — surface it to the user.

### Which template

- **`directOffer`** — guest-facing offer ads for a campaign. Copy rules: the `adCopy` half of `facebook.md`.
- **`recruitment`** — creator-recruitment ads. An always-on trickle with an enforced budget floor and ceiling. Creatives come from `createRecruitmentCreatives` → `listCreatives` (pass each creative's `imageKey` as a `libraryAsset` reference); copy rules: the `recruitmentAdCopy` half of `facebook.md`; program context: `creators.md`.
- **`addAds`** — add fresh creatives to an ad set that is already running. Copy the settings the new ads must match from an existing ad via `ads_get_ad_entities` — its description carries the exact field-by-field recipe, and Meta will happily publish a mismatched ad rather than reject it.

### Reading and steering what's live

- `ads_get_ad_entities` — read campaigns/ad sets/ads on an account, creatives attached. The diagnostic read for everything below.
- `ads_update_entity` — rename, re-budget, or pause. Budgets are integer cents and **replace** the current value; read first, confirm the number with the human. Creatives are immutable at Meta — new copy or media means a new ad (the `addAds` template).
- `ads_activate_entity` — go-live for structures Feastalytics did *not* publish. No cascade: activate top-down and check `willDeliver`; a child under a paused parent is live in name only. For campaigns Feastalytics published, `setAdCampaignStatus` cascades and is the right tool.
- `ads_get_datasets` / `ads_create_dataset` — pixel checks and creation. The pixel a campaign should optimise against is the one its funnel actually fires (from the layout config), not whichever pixel looks plausible on the account. After creating one, write its id back with `updateBrandIdentity` — creation alone connects nothing.

> **Not exposed:** ad-copy generation (write it yourself — `facebook.md`), creative *content* editing on Meta (immutable there), and publishing creator content as partnership ads.
