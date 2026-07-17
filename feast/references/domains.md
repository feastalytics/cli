# Feastalytics domain model

Background for constructing tool input correctly. This is the conceptual map; the authoritative field list for any tool always comes from `feast describe <tool>`.

## Organizations

The top-level tenant. Nearly every tool is scoped to one organization via `--org`. An org has one or more POS locations (Toast/Square/Clover); many tools that operate on menus or offers need a `locationId`, which you get from `loadCurrentOrganization` (it returns the org's `locations`) — not the organization id.

## Campaigns (acquisition)

A campaign is an acquisition effort. It bundles:
- a **funnel** (the screens a new guest sees),
- **automations** (see below) scoped to that campaign,
- **promotions/offers** attached to it.

Typical flow: `createCampaign` (set `isCreating: true` if you'll finish it with `populateCampaign`), then `populateCampaign`, then choose a funnel template. `cloneCampaign` duplicates an existing one (funnel + automations + offers) — it needs the source campaign id and a `referrer` (a subdomain from the org's `subdomains2`).

## Automations and flows

- An **automation** is one trigger → action unit (e.g. "on checkout, award reward").
- A **flow** is a named grouping of automations. A flow belongs to *either* a campaign *or* the members program (never both).
- `listAutomationFlows` scopes with input: `{ campaignId }` returns that campaign's flows; `{ scope: "membersProgram" }` returns members-program flows (those with no campaign). `listAutomations` returns every automation in the org, ordered by execution priority.
- Templates: `listAutomationTemplates` → `loadTemplateAutomations` (preview) → `applyAutomationTemplate`. Only apply a template to a campaign/members-program that has no existing flows.

## Offers (DFY strategy)

Offers live in the organization's strategy backlog. `dfyCreateOffer` needs a `framework` — one of `free`, `combo`, or `experience` — a name, headline, description, and `items` (`[{ name, price }]`). `offerPrice` is null for the `free` framework. Browse the menu to source real item names/prices with `dfyGetMenuHierarchy` (needs a `locationId`). `dfyListOffers` shows the current backlog with status and priority.

## Members program (retention)

The retention counterpart to campaigns: rewards and pass configuration for returning guests. Members-program automations are the flows with no `campaignId` (`scope: "membersProgram"` above).

---

Maintenance note: this file is currently hand-authored. The richest source of this domain knowledge is the in-app agent's prompt files (`src/agent-core/src/prompts/` — AutomationsPrompt, CampaignsPrompt, LayoutEnginePrompt, MembersProgramPrompt, OfferPrompt). A future improvement is to generate this reference from those, so the skill and the in-app agent never drift.
