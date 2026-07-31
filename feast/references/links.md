# Linking to your work

The CLI changes data; people still have to go *look* at it. Every campaign, funnel, automation and settings pane has a stable URL, so end your work by handing over links rather than describing where to click.

The rule: after any turn where you created, changed, or published something, finish your message with a short markdown list of links — usually two to four, covering where to see it, where to edit it, and where to preview it. When someone asks where a thing lives or how to set it up, answer with the link.

You can build every URL below from ids you already have. `{organizationId}` is the same value you pass to `--org`. Campaign, flow and draft ids come back from the tool call you just made. Only `{subdomain}` needs a lookup.

## Dashboard

Everything an authenticated user sees hangs off `https://feastalytics.com/{organizationId}/app`:

```
/                                        home
/campaigns                               every acquisition campaign
/campaigns/{campaignId}                  one campaign
/campaigns/{campaignId}?panel=funnel-v2  that campaign's funnel editor
/members-program?panel={panel}           the members program
/members-program?panel=funnel            the members program funnel editor
/automation/{flowId}                     one automation flow
/settings/{tab}                          settings
/chats                                   guest conversations
/orders   /activity   /guest-journey
```

Campaign panels: `overview`, `funnel-v2`, `automations`, `promotions`, `metrics`, `ads`, `orders`, `reservations`, `subscriptions`, `creative-strategy`. With no `?panel=`, an unpublished campaign opens on `funnel-v2` and a published one on `overview`.

Members-program panels: `overview`, `funnel`, `automations`, `pass-builder`, `rewards`.

Settings tabs: `account`, `general`, `members`, `integrations`, `notifications`, `usage`, `scanning`, `texting`, `subscription`. Point people at `/settings/integrations` when a task needs a POS or Meta connection you can't make for them.

Funnels are always edited inside a panel, never on a page of their own — a campaign's `funnel-v2` panel, or the members program's `funnel` panel.

## Public pages

The guest-facing site lives on the organization's own subdomain, `https://{subdomain}.feastalytics.com`:

```
/campaign/{campaignId}           the live campaign funnel
/                                the live members program funnel
/preview/{draftId}               an unsaved funnel draft, as a tree of every screen
/preview/{draftId}/{campaignId}  the same draft, scoped to one campaign
```

Get `{subdomain}` from `loadCurrentOrganization` → `organization.subdomains2[].subdomain`. When the link is about a campaign, pick the subdomain matching that campaign's `referrers` rather than the first one. The funnel draft tools (`createFunnelDraft`, `getFunnelDraft`) already return the draft's `referrer`, so use that instead of looking it up again.

The `/preview/{draftId}` route is the payoff of the draft → preview → promote loop in `workflows.md`: it renders every screen of the staged funnel as a tree, so it's the right link to hand over after `stageFunnelEdit` and before `saveFunnelEdits`. It stops working once the draft is discarded or expires.

## Two query params that don't do what they look like

`utm_source=PREVIEW` only *tags* a visit as a preview so it can be filtered out of reporting later. The visit is still counted. The in-app preview panes append it, so use it when you want to match what the app does.

`internal_qa=1` is what actually suppresses analytics, and it sticks for that browser until cleared with `internal_qa=0`. Use it when the point is to look at a live page without being counted. `qa=1`, `review=1` and `campaign_review=1` suppress the current page only.

## Worked example

After creating a campaign and applying a funnel template:

```markdown
Done — "Fall Prix Fixe" is live as a draft.

- [Open the campaign](https://feastalytics.com/{organizationId}/app/campaigns/{campaignId})
- [Edit the funnel](https://feastalytics.com/{organizationId}/app/campaigns/{campaignId}?panel=funnel-v2)
- [See it as a guest](https://{subdomain}.feastalytics.com/campaign/{campaignId}?utm_source=PREVIEW)
```
