# Feastalytics domain model

Background for constructing tool input correctly. This is the conceptual map; the authoritative field list for any tool always comes from `feast describe <tool>`.

## Organizations

The top-level tenant. Nearly every tool is scoped to one organization via `--org`. An org has one or more POS locations (Toast/Square/Clover); many tools that operate on menus or offers need a `locationId`, which you get from `getOrganization` (it returns the org's `locations`) — not the organization id.

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
- **Authoring:** `createAutomationFlow` makes a flow; `batchEditAutomations` creates/updates/deletes automations in one atomic batch (create ops **require** a `flowId`); `updateAutomationFlow` / `deleteAutomationFlow` manage the flow itself; `simulateAutomations` dry-runs a flow with no real sends. See `workflows/automations.md` for the ordering and the trigger/condition/send-time rules.
- Templates: `listAutomationTemplates` → `listTemplateAutomations` (preview) → `applyAutomationTemplate`. Only apply a template to a campaign/members-program that has no existing flows.

## Offers and promotions

Promotions live on the campaign record (`getCampaign` / `updateCampaign`), and real menu items come from `queryData` on `interface.catalogItem`.

## Members program (retention)

The retention counterpart to campaigns: rewards and pass configuration for returning guests. Members-program automations are the flows with no `campaignId` (`scope: "membersProgram"` above). Rewards are fully manageable (`listMembersProgramRewards` / `createMembersProgramReward` / `updateMembersProgramReward` / `deleteMembersProgramReward`), and the wallet pass is a read-modify-write document (`getPassConfiguration` / `updatePassConfiguration`) — see `workflows/members-program.md`.

## Creator sourcing

Restaurants recruit local content creators to visit and post. One config per location (`getInfluencerBoardConfig`), an approval queue of applications, content review, and bonus payouts — see `workflows/creators.md`. Recruitment *ads* publish through the Meta ads surface (`workflows/ads.md`).

## Meta ads

A template-driven publish pipeline: `listAdTemplates` → `planAds` → `publishAds` → `getJob` → `setAdCampaignStatus`, plus `ads_*` tools for reading and steering what's already on the ad account — see `workflows/ads.md`.

## The data catalog

`describeData` / `queryData` expose a read-only, org-scoped query surface over the data model — guests, orders, menu items, texts, creator visits, payouts. When no purpose-built tool answers a read question, the catalog usually does; `describeData` with no arguments is the index.

---

Maintenance note: this file is currently hand-authored. The richest source of this domain knowledge is the in-app agent's prompt files (`src/agent-core/src/prompts/` — AutomationsPrompt, CampaignsPrompt, LayoutEnginePrompt, MembersProgramPrompt, OfferPrompt). A future improvement is to generate this reference from those, so the skill and the in-app agent never drift.
