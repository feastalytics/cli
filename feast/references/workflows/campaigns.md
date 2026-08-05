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

## Creating offers (strategy backlog)

Fully doable from the CLI. Offers live in the organization's strategy backlog (the offer queue), sourced from real menu data.

1. `getOrganization` → get the **`locationId`** (from `locations`) — offer tools key on the location, **never** the organizationId.
2. `dfyGetMenuHierarchy` with that `locationId` — browse real menu items and prices.
3. `dfyListOffers` — see the current backlog; avoid duplicates.
4. `dfyCreateOffer` — create it. `dfyUpdateOffer` / `dfyDeleteOffer` to revise.

Every offer picks one **framework**:

- **`free`** — give away a low-cost item (appetizer, side, drink, small dessert) with no purchase. Maximizes signups. `offerPrice: null`; `items` = the single free item at its menu price. Headline: "A Complimentary [Item]" / "Free [Item]".
- **`combo`** — bundle to lift the ticket. *Pattern A* "Buy X, Get Y Free" (`offerPrice` = purchased item only) — best for quick-service. *Pattern B* fixed-price bundle "[Item] & [Item] for $XX" (`offerPrice` = bundle price) — preserves brand equity for upscale.
- **`experience`** — a curated multi-item tasting/pairing/prix-fixe with **no discount** (`offerPrice` = sum of item prices). MUST have 2+ items.

`dfyCreateOffer` needs `name` (internal label, no restaurant name), `headline` (states what the guest gets + price, using real item names), a short `description` (context the headline can't carry), `framework`, `items` (`[{name, price}]` from the menu), `offerPrice`, and `locationId`. Always frame as "offers," never "discounts" or "deals."

---
