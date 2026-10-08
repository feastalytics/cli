# Campaigns and offers

## Creating a campaign

Ask the dashboard wizard's questions, one at a time, skipping any the user already answered:

1. Name, and which site (`subdomains2[].subdomain` from `getOrganization`).
2. "How will you run this campaign?": I have the content (`self`), I need creator-made content (`creator`, only if `featureFlags.isDfyEnabled`), or tracking only.
3. "Is there an offer?"
4. If yes: its name, whether guests can prepay (then a price in dollars), and an image (required for prepay). Upload with `getMediaUploadUrl` (`scope: "organizationFilePublic"`, a PNG), PUT the bytes, keep the `key`.

Then:

1. `createCampaign` with `{ "campaign": { "name": "...", "referrers": ["<subdomain>"] } }`. Keep the returned id.
2. One `updateCampaign` with `"isCreating": false` (until then the campaign is stuck in the creation wizard) and:
   - `enabledFeatures`: start from `["OFFER", "CREATOR_SOURCING", "AD_PUBLISHING", "FUNNEL", "AUTOMATIONS"]`; drop `OFFER` with no offer, drop `CREATOR_SOURCING` for `self`. Tracking only: `[]` and `"isPublished": true`.
   - With an offer: `promotions: [{ "promoId": "<new-uuid>", "type": "basic", "basic": { "title": "...", "price"?: 29.99, "canPrePay"?: true } }]`, `imageUrl: { "type": "s3", "key": "..." }`, and if there is no description, `"Prepay for <offer>"` or `"Earn <offer>"`.

Tracking only stops here. Otherwise continue:

3. (optional) the funnel, the **acquisition** half: the funnel screens a guest sees. Same list → pick → apply shape as automations:
   - `listFunnelTemplates` with the `campaignId`: the template catalog with per-campaign `eligible`/`ineligibleReason`, a `recommended` id, and each template's guest `journey`. Read this before applying; never guess a template id.
   - Pick by what the guest should experience, not by whether the offer has a price:
     - `offer-basic`: Sign Up goes straight to the offer wallet. **No payment step.** The template for any offer redeemed in person, priced or not.
     - `offer-prepay` / `offer-direct-prepay`: a Stripe payment screen is part of the funnel (after Sign Up for `offer-prepay`, straight from the landing page for `offer-direct-prepay`). Only eligible when the promotion has `canPrePay: true` **and** a `price`; anything else is rejected with `PRECONDITION_FAILED`.
     - `reservation-offer-basic` / `reservation-offer-prepay` / `reservation-offer-direct-prepay` / `reservation-only`: the reservation variants of the same split.
   - `applyFunnelTemplate` with `{ "campaignId": ..., "templateId": ... }`. Resolves the referrer from the campaign. If the campaign already has a funnel (`hasFunnel` in `listFunnelTemplates`), applying replaces it: the campaign's own screens and every edit made to them are deleted first, so confirm with the user before replacing a funnel someone has edited. Base screens such as Members Pass are untouched, and an ineligible template is rejected before anything is deleted.
   - The promotion's `canPrePay` flag does **not** change what a template builds; it only gates eligibility. A "no prepay" request means `offer-basic` (or another no-payment template), full stop.
   - After applying, confirm with `listFunnelScreens` that the journey matches intent. For a no-prepay offer there must be no `payment` screen.
4. The automations, the **retention** half: the follow-up messaging. **Required whenever the funnel has a sign up form or a checkout**, which covers every `offer-*` and `reservation-offer-*` template. Read `automations.md` before this step. `applyAutomationTemplate` provisions the campaign's flow *and* its automations in one call, so you don't hand-build a flow for this path. Pick one with `listAutomationTemplates`. The automations go live as soon as it is applied, so read them right after with `listAutomations` (`{ "flowId": "<id>" }`) and check the texts against what the offer promises (an expiring-offer template contradicts a "no expiration" offer); fix anything wrong through an automation draft.

Steps 3 and 4 are the two halves of a working campaign: the funnel (what the guest sees) and the automations (what happens after they sign up). They are not independent. Outside checkout, the guest's reward is granted by an `awardReward` action inside a sign up automation, so a funnel with no automations signs guests up, hands them a pass with nothing on it, and sends no text. A campaign is not finished until both halves are in place, even when the user only asked about the ad or the landing page. If you stop before the automations, say so plainly in your summary as an open item that blocks going live.

### Before a campaign goes live

Setting `isPublished: true` with `updateCampaign` puts the campaign in front of guests, and so does switching on its Meta ads. The server checks nothing on either path. So before either one:

1. Run `getTaskboard` with `{ "scope": { "type": "campaign", "campaign": { "campaignId": "..." } } }`.
2. Any `issue` entry with severity `error` blocks going live. The one that matters most is `campaign-automations-missing`: guests would sign up and get nothing. Fix it (step 4), or stop and tell the user exactly what is missing and what guests would experience. Do not publish around it.
3. Tell the user about `warning` entries before going live; they can choose to proceed.

A short approval like "save it" or "looks good" is not a go-live instruction when the readiness check has not passed. Report what is missing first.

**Reading a campaign back:** `getCampaign` returns the full config for one campaign (funnel/offer config, referrers, status); `listCampaigns` is the summary list; performance is covered in "Reading a campaign's performance" below. Read with `getCampaign` before any `updateCampaign`.

**Updating a campaign:** `updateCampaign` takes `{ "campaignId": "...", "update": { ... } }`. The update is merged one level deep: each top-level field you pass replaces the stored value whole. `promotions` is an array, so pass the full list with your change applied, never just the one promotion you edited. Other things to know:
- `imageUrl` (the offer image) whose url or key contains the word `placeholder` counts as unset, and onboarding keeps asking for an image.
- Saving a recurring promotion with a `price` creates a live Stripe product and monthly price in the connected account (a changed price creates a new price and archives the old one). After that, the campaign's Stripe account cannot be switched until those promotions are archived; the server rejects the change and says so.

**Cloning:** `createCampaign` with `{ "sourceCampaignId": "<id>", "campaign": { "name": "...", "referrers": ["<subdomain>"] } }` copies the source's funnel, automations and offers and returns the new id. `referrers` holds exactly one subdomain (it becomes the copy's only referrer and the one whose funnel is copied), or leave it out to copy the source's first referrer's funnel and keep the source's referrers. `description` and `imageUrl` replace the source's when given. The copy keeps the source's `isCreating`, so a copy of a finished campaign needs no `updateCampaign` finish step. The landing page banner usually keeps the source's title, description and image until edited. **Gotcha:** the cloned automations contain the *source* campaign's reservation links. After cloning, review the new campaign's automations and rewrite any reservation link to the new campaign's shorthand. The format is `https://{subdomain}.feastalytics.com/i/{new-shorthand}/reservation`.

---

## Reading a campaign's performance

Three tools, all keyed by the Feast campaign `id` from `listCampaigns` (a UUID), never the Meta campaign id nested inside the campaign. They share one set of camelCase metric ids (`signupRate`, `thumbStopRatio`, `uniqueClickthrough`, `revenue`, ...) and one set of units.

**Units.** `count`; `percent` as 0 to 100 (not 0 to 1); `usd` in dollars (not cents); `days`; `multiple` for ROAS (2 means 2x). In the breakdown: sessions, visitors, signups, impressions and reach are counts; every `*Rate`, `thumbStopRatio`, `holdRate` and `uniqueClickthrough` are percents; spend, cpm, revenue, costPerSignup and revenuePerSignup are USD; averageTimeToShow is days from signup to first scan.

**Headline numbers: `getCampaignKpis`** with `{ "campaignId": "...", "start"?: ..., "end"?: ... }`. Send both `start` and `end` for a date range; with either missing it covers all time. `"isPrimaryOnly": true` returns only the primary metrics. Returns one `{ id, type, value, unit }` row per metric, covering ad performance (spend, impressions, hook rate, hold rate, CTR, from synced Facebook data, so ROAS is revenue divided by spend), the funnel, automations and results. Rate metrics with a target band also carry `benchmark: { min, good, great }` in the same unit. A metric whose value would be zero is left out rather than returned as 0. So a missing spend row means no spend or no Facebook sync yet, never a confirmed $0.

**Grading: `getCampaignBenchmarks`** (no input) returns `{ id, label, unit, description, formula, benchmark }` for every metric id. Call it once and reuse it; it is the same for every campaign. Grade a value green at or above `good`, yellow at or above `min`, red below `min`; `great` is a stretch level (null for ROAS). `benchmark` is null when a metric has no target band. The bands are fleet percentiles (P25/P50/P75 of campaigns with over 500 visitors), rounded, not per organization; ROAS is anchored at 1x break-even.

**Where the numbers come from: `getCampaignBreakdown`** with `{ "refs": [...], "start": ..., "end": ... }`. `start`/`end` (both required) are the session window. It is a tree loaded a batch at a time: pass node refs, get back each node's metrics plus the refs of its children (identifiers only, no metrics), then pass those refs back in to go a level deeper. Up to 100 refs per call, and refs from different campaigns can be mixed.
- Start with `{ "type": "campaign", "campaign": { "campaignId": "..." } }`. It returns the campaign totals and its channel refs.
- The tree: campaign → channel (`facebook`, `influencer`, `tiktok`, `google`, `misc`, `referral`, `unknown`), then per channel: facebook → fbCampaign → fbAdset → fbAd; google → googleCampaign; tiktok → tiktokCampaign; misc → miscSource; referral → referrer; influencer → creator.
- A `null` id inside a ref is the "Unknown" bucket: sessions that could not be matched to a specific child.
- **Variants** split the campaign by pass rather than by session. The campaign node lists them in `details.campaign.variants` (empty when the campaign has none). Load one with `{ "type": "variant", "variant": { "campaignId": "...", "variantId": "..." } }`; `variantId: null` is the default variant. Variant nodes carry only signups, pass registration and show rate, time to show, revenue and revenue per signup.
- **Missing key vs null.** A metric key that is absent means the metric does not apply to that node (spend on a Google row, for example). `null` means it applies but could not be computed: no denominator, or Facebook was unreachable (see `details.facebook.error`).
- Facebook delivery metrics in the breakdown are read live from Meta, while `getCampaignKpis` reads synced Facebook data, so the two can differ.

---

## Offers and promotions

- A campaign's **promotions** are part of the campaign record: read them with `getCampaign`, edit them with `updateCampaign` (including a promotion's `staffInstructions`, and prices, noting the Stripe-products warning in `updateCampaign`'s description).
- **Real menu data** for grounding any offer or promotion copy comes from `queryData` on `interface.catalogItem`: POS-agnostic, hierarchical via `parentId`/`catalogItemLink`.
- When you write guest-facing offer language anywhere, frame it as an "offer," never a "discount" or "deal."

---
