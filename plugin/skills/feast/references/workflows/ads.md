# Publishing and steering Meta ads

Publishing is drivable end to end through the tools: resolve a template, plan, publish, activate. The planner is the only door in. **Never hand-assemble Meta campaign parameters**; `publishAds` re-derives everything from the template variables and refuses anything else.

For the *words* in the ads, read the copywriting file for your audience first: `ad-copy-guest.md` for guest-facing offer ads, `ad-copy-creator.md` for creator recruitment. Copywriting is its own discipline with its own failure modes.

### The model: template → plan → publish → activate

- A **template** is a server-owned recipe. `listAdTemplates` returns each one with its variables, budget range, and which plan paths may be overridden. Each variable that names a `producedBy` tool is telling you exactly where its value comes from. Treat that as the shopping list.
- **`planAds`** resolves template + variables into the exact tree of campaigns, ad sets and ads that would be created. It creates nothing on Meta and changes no Feastalytics data. It returns the tree, a `planHash`, the fully defaulted variables, and validation issues.
- **`publishAds`** takes those variables, overrides and hash back *unchanged*, re-derives the tree server-side, and refuses on a mismatch, so a stale plan fails loudly instead of publishing something the human never saw. Everything is created **paused**.
- **`setAdCampaignStatus`** `ACTIVE` starts a campaign Feastalytics published, cascading to every ad set and ad. This is the moment real money starts moving: explicit user confirmation first, every time.

### The loop

1. `listAdTemplates`: pick the template, read each variable's `producedBy`.
2. Gather variables with those tools. Most Meta ids come from one call, `ads_get_assets`, with an `include` list naming the sections you need; it runs them in parallel and returns only those keys. Then `listCreatives`, `getCampaign`, etc. A typical first call is `{ "include": ["adAccounts", "pages"] }`; once you have the ids, `{ "include": ["instagramAccounts", "instagramMedia", "customAudiences"], "pageId": "...", "adAccountId": "..." }`. A section missing its id (`adAccountId` for `customAudiences` and `datasets`, `pageId` for `instagramAccounts` and `instagramMedia`) is refused.
   - `adAccounts` are the accounts you can publish to (`hiddenAdAccountCount` says how many the token reaches beyond them; `includeUnassigned: true` lists those for diagnosing a missing account, and they are not publishable).
   - `pages`: prefer a Page with `usedByOrganization: true`; the token reaches other businesses' Pages and nothing stops you publishing from the wrong one. Each Page shows its linked Instagram business account when it has one.
   - `customAudiences` supplies the `customAudienceIds` and `excludedCustomAudienceIds` variables. Skip any audience with `isReadyForUse: false` (Meta will not deliver to it, so an ad set targeting it reaches nobody), and remember audience ids belong to one ad account and are rejected by another. An audience's size bounds are approximate and go stale while Meta is updating it. Nothing says how fresh the underlying list is: a customer-list audience is a snapshot of the last upload, and `timeUpdated` is when that happened.
   - `instagramMedia` is `{ instagramAccount, media }`: up to 50 recent posts (id, caption, thumbnail, mediaType, permalink, timestamp) from the Instagram business account linked to that Page, each with the `instagramUserId` that goes on an `igMedia` creative reference. A Page with no linked Instagram business account returns `instagramAccount: null`.
   - `instagramAccounts` is the full list of identities that Page can run ads as, for the `instagramAccountId` variable (`kind: "pageBacked"` is the identity Meta creates for a Page with no Instagram account, and is valid too).
3. `planAds`: fix every issue with severity `error` and re-plan. Summarize the resulting tree (campaign name, budget, targeting, ad count) for the user before going further; the plan is the thing they're approving.
4. `publishAds` with the returned `variables`, `overrides` and `planHash` unchanged, plus:
   - `confirm: true`. The schema demands it; this is the only tool with a schema-level confirm.
   - an `idempotencyKey` you generate. Reuse the same key when retrying the *same* publish: a duplicate key is refused with the earlier job's id, so read that job with `getJob` instead of publishing twice. Never reuse one for a new publish.
   - `effects`: see below.

   If the organization resolves differently than when you planned (a `PLAN_STALE` refusal), re-run `planAds` and show the human what changed before publishing again.
5. Pass `"wait": true` to `publishAds` and it returns the finished `job` (up to 20 seconds). If that `job` is still `PENDING` or `RUNNING`, call `getJob` with the `jobId` + `jobType` and `"wait": true` until `COMPLETED` or `FAILED`. `{ "job": null }` means not landed yet, so call again. **Read the job's effect outcomes.** Each declared effect reports `done`, `skipped` or `error` with a human-readable detail, and effect failures do not fail the job (the ads already exist by then), so this is the only place you find out.
6. `setAdCampaignStatus` to go live, after the user says go. Check the preflight counts in the response. For guest-facing ads linked to a Feast campaign, run the campaign readiness check first (`getTaskboard` with the campaign scope, see "Before a campaign goes live" in `campaigns.md`). Ads that send traffic to a funnel with no automations pay for sign ups that never receive their offer.

### Effects: the write-back is declared, not called afterwards

Bookkeeping that must happen once the ads exist travels *inside* the publish as `effects`, and the worker runs it as part of the job, because a follow-up call you're supposed to remember is a follow-up call that gets missed, silently. Both effects below are required for their template: `publishAds` refuses the publish when one is missing rather than skipping it.

- **A recruitment publish must declare `linkRecruitmentOffer`** with its `offerId` and `creativeIds`. The effect stamps the creatives as published, stamps the offer, links the location's creator board that the monthly sourcing cap and the dashboard's spend both read, and texts the program's approver that sourcing is live.
- **A `directOffer` publish must declare `linkFeastCampaign`** with the `campaignId` it runs for. The effect records the published Meta campaign onto that Feast campaign, which is what puts its spend on the campaign's ads panel and KPIs.

An effect that reports `error` in the job is a case for the dashboard, not for patching around. Surface it to the user.

### Which template

- **`directOffer`**: guest-facing offer ads for a campaign. Requires the `linkFeastCampaign` effect. Copy rules: `ad-copy-guest.md`.
- **`recruitment`**: creator-recruitment ads. An always-on trickle with an enforced budget floor and ceiling. Requires the `linkRecruitmentOffer` effect. Creatives come from `createRecruitmentCreatives` → `listCreatives` (pass each creative's `imageKey` as a `libraryAsset` reference); copy rules: `ad-copy-creator.md`; program context: `creators.md`.
- **`addAds`**: add fresh creatives to an ad set that is already running. Copy the settings the new ads must match from an existing ad; Meta will happily publish a mismatched ad (pointing somewhere different from its siblings) rather than reject it, so copy the values, never invent them. Call `ads_get_ad_entities` with `level: "ad"` and that `adSetId`, skip ads whose `effectiveStatus` is `DELETED` or `ARCHIVED`, take the first one left, and read from its creative:
  - `pageId`: `objectStorySpec.page_id`
  - `instagramAccountId`: `objectStorySpec.instagram_actor_id`, or `instagram_user_id` when that is absent (both spellings occur)
  - `urlTags`: `urlTags`
  - `headline`, `primaryText`, `landingUrl`: from whichever of three shapes the ad uses. `assetFeedSpec`, when present, wins: `titles[0].text`, `bodies[0].text`, `link_urls[0].website_url`. Otherwise `objectStorySpec.link_data` for an image ad: `name`, `message`, `link`. Otherwise `objectStorySpec.video_data` for a video ad: `title`, `message`, `call_to_action.value.link`.

### Reading and steering what's live

- `ads_get_ad_entities`: read campaigns/ad sets/ads on an account, creatives attached. The diagnostic read for everything below. `level` says what comes back; an id at the requested level fetches that one object, and an id from a level above lists that object's children: `campaignId` with `level: "adSet"` returns that campaign's ad sets, and with `level: "ad"` every ad in it across all its ad sets. Where several ids apply, the narrowest wins. To see the whole tree, do not walk it one level per call: pass `includeChildren: true` and each campaign comes back with its `adSets`, each with its `ads` (at `level: "adSet"`, each ad set with its `ads`). `limit` and `effectiveStatus` apply to every level, so add a `campaignId` when you need one campaign's complete tree.
- `ads_update_entity`: rename, re-budget, or pause; moving a daily budget is how you scale a winner or throttle a loser. Budgets are integer cents and **replace** the current value; read first, confirm the number with the human. Creatives are immutable at Meta, so new copy or media means a new ad (the `addAds` template).
- `ads_activate_entity`: go-live for structures Feastalytics did *not* publish. No cascade: activate top-down and check `willDeliver`; a child under a paused parent is live in name only. For campaigns Feastalytics published, `setAdCampaignStatus` cascades and is the right tool: those are published paused at all three levels, so activating the campaign alone would spend nothing.
- `ads_get_assets` with `include: ["datasets"]` and an `adAccountId` / `ads_create_dataset`: pixel checks and creation. The pixel a campaign should optimise against is the one its funnel actually fires (from the layout config), not whichever pixel looks plausible on the account. After creating one, write its id back with `updateBrandIdentity`; creation alone connects nothing. That layout config value is what makes the funnel fire the pixel and what the onboarding task reads.

> **Not exposed:** ad-copy generation (write it yourself: `ad-copy-guest.md` / `ad-copy-creator.md`), creative *content* editing on Meta (immutable there), and publishing creator content as partnership ads.
