# Campaigns and offers

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.


## Creating a campaign

Fully doable via the CLI. The server does the heavy lifting (id generation, default config, the funnel prerequisite) — you sequence the calls.

1. `getOrganization` — read the org to get valid **referrers** (subdomains, from `subdomains2[].subdomain`) and location ids.
2. `createCampaign` with `{ "campaign": { "name": "...", "isCreating": true, "fbCampaigns": [], "attributionRules": [] } }` — keep the returned campaign **id** (a UUID). It comes back `isCreating: true`.
3. `populateCampaign` with the `campaignId` and a **`funnelType`**:
   - `"reservation"` — no extra config.
   - `"simpleRewards"` — needs `simpleRewardsConfig` with a `promotionName` and an image. Pass a public `imageUrl` string (the CLI can't do the app's file-upload path).
   - `"prepay"` — needs `prepayConfig` with `promotionName`, `price`, and an image (`imageUrl`).
4. (optional) `applyFunnelTemplate` — the **acquisition** half: the funnel screens a guest sees. Requires a fresh campaign whose funnel is unset; resolves the referrer from the campaign.
5. (optional) `applyAutomationTemplate` — the **retention** half: the follow-up messaging. Provisions the campaign's flow *and* its automations in one call, so you don't hand-build a flow for this path. Preview options first with `listAutomationTemplates` / `listTemplateAutomations`.

Steps 4 and 5 are the two independent halves of a working campaign — the funnel (what the guest sees) and the automations (the messaging that follows). A fully working campaign has a funnel with no screen errors and at least one automation flow.

**Reading a campaign back:** `getCampaign` returns the full config for one campaign (funnel/offer config, referrers, status); `listCampaigns` is the summary list; `getCampaignKpis` is performance metrics. Read with `getCampaign` before any `updateCampaign`.

**Cloning:** `cloneCampaign` with `sourceCampaignId`, `newCampaignName`, and a `referrer` (subdomain) duplicates funnel + automations + offers and returns a `newCampaignId`. **Gotcha:** the cloned automations still contain the *source* campaign's reservation links. After cloning, review the new campaign's automations and rewrite any reservation link to the new campaign's shorthand — the format is `https://{subdomain}.feastalytics.com/i/{new-shorthand}/reservation`.

The one-shot text→campaign endpoints (`createWithOffer` / `parseCampaignDescription`) aren't exposed to the CLI — use the steps above.

---

## Offers and promotions

The strategy-backlog offer tools (`dfyCreateOffer` and friends) were **removed from the surface deliberately** — the backlog is read-only in the product now, so don't go looking for them or tell the user they're coming back.

What remains CLI-drivable:

- A campaign's **promotions** are part of the campaign record: read them with `getCampaign`, edit them with `updateCampaign` (including a promotion's `staffInstructions`, and prices — noting the Stripe-products warning in `updateCampaign`'s description).
- **Real menu data** for grounding any offer or promotion copy comes from `queryData` on `interface.catalogItem` — POS-agnostic, hierarchical via `parentId`/`catalogItemLink`.
- When you write guest-facing offer language anywhere, frame it as an "offer," never a "discount" or "deal."

---
