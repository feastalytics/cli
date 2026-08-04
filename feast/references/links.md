# Linking to your work

Most of what you create or change through the CLI has a stable URL in the product. Handing one over is cheap and saves the user hunting through the dashboard for the thing you just made — opening it is usually their next step anyway.

So offer links freely: after a turn where you created, changed, or published something, close with a short markdown list — usually two to four, covering where to see it, where to edit it, and where to preview it. When someone asks where a thing lives or how to set it up, lead with the link rather than describing where to click. It's an affordance, not a checkpoint; nobody has to go verify your work.

You can build almost every URL below from ids you already have. `<organizationId>` is the same value you pass to `--org`. Campaign, flow and draft ids come back from the tool call you just made. Only `<subdomain>` needs a lookup.

Angle brackets below mark a value **you** substitute. A finished link contains no brackets, no braces and no backticks — if you emit `{{...}}` or a bare `<campaignId>`, the link is broken.

## Dashboard

Everything an authenticated user sees hangs off `https://feastalytics.com/<organizationId>/app`. Note the shape: the organization id is a **path segment**, not a subdomain — there is no `app.feastalytics.com`.

```
/                                        home
/campaigns                               every acquisition campaign
/campaigns/<campaignId>                  one campaign
/campaigns/<campaignId>?panel=funnel-v2  that campaign's funnel editor
/members-program?panel=<panel>           the members program
/members-program?panel=funnel            the members program funnel editor
/automation/<flowId>                     one automation flow
/settings/<tab>                          settings
/chats                                   guest conversations
/orders   /activity   /guest-journey
```

Campaign panels: `overview`, `funnel-v2`, `automations`, `promotions`, `metrics`, `ads`, `orders`, `reservations`, `subscriptions`, `creative-strategy`. With no `?panel=`, an unpublished campaign opens on `funnel-v2` and a published one on `overview`.

Members-program panels: `overview`, `funnel`, `automations`, `pass-builder`, `rewards`.

Settings tabs: `account`, `general`, `members`, `integrations`, `notifications`, `usage`, `scanning`, `texting`, `subscription`. Point people at `/settings/integrations` when a task needs a POS or Meta connection you can't make for them.

Funnels are always edited inside a panel, never on a page of their own — a campaign's `funnel-v2` panel, or the members program's `funnel` panel.

### Onboarding task pages

Task entries from `getTaskboard` come with a ready-made `completionUrl` — always prefer pasting that over constructing a URL. The shape behind it: `https://feastalytics.com/tasks/<organizationId>` is the org's standalone task list, and `https://feastalytics.com/tasks/<organizationId>/<taskId>` opens one task's completion UI directly (chrome-less; works in the dashboard's agent preview panel and as a normal browser link). These are the links to hand over when a task needs the human — OAuth connections, phone purchase, device setup.

### Automation previews

These two hang off the **root**, not off `/<organizationId>/app` — the organization id is the first path segment:

```
https://feastalytics.com/automation-preview/<organizationId>/<flowId>
https://feastalytics.com/automation-preview/<organizationId>/<flowId>?draftId=<draftId>
```

Without `draftId` it dry-runs the live flow as a text-message thread. With one, the same page diffs the draft's staged changes against live — added messages tinted, removed struck through, edited showing the old copy above the new — which is the link to hand someone before you promote.

A `flowId` contains `:` and `;` and **must be percent-encoded** in the path. Easier: `createAutomationDraft` and `stageAutomationEdits` both return `previewUrls`, already built and encoded, one per flow the draft touches. Use those rather than assembling your own.

## Public pages

The guest-facing site lives on the organization's own subdomain, `https://<subdomain>.feastalytics.com`:

```
/campaign/<campaignId>           the live campaign funnel
/                                the live members program funnel
/preview/<draftId>               an unsaved funnel draft, as a tree of every screen
/preview/<draftId>/<campaignId>  the same draft, scoped to one campaign
```

Get `<subdomain>` from `loadCurrentOrganization` → `organization.subdomains2[].subdomain`. When the link is about a campaign, pick the subdomain matching that campaign's `referrers` rather than the first one. The funnel draft tools (`createFunnelDraft`, `getFunnelDraft`) already return the draft's `referrer`, so use that instead of looking it up again.

The `/preview/<draftId>` route is the payoff of the draft → preview → promote loop in `workflows.md`: it renders every screen of the staged funnel as a tree, so it's the right link to hand over after `stageFunnelEdit` and before `saveFunnelEdits`. It stops working once the draft is discarded or expires.

## Two query params that don't do what they look like

`utm_source=PREVIEW` only *tags* a visit as a preview so it can be filtered out of reporting later. The visit is still counted. The in-app preview panes append it, so use it when you want to match what the app does.

`internal_qa=1` is what actually suppresses analytics, and it sticks for that browser until cleared with `internal_qa=0`. Use it when the point is to look at a live page without being counted. `qa=1`, `review=1` and `campaign_review=1` suppress the current page only.

## Worked example

After creating a campaign and applying a funnel template. Every id below is substituted — this is what a finished message looks like, with nothing left to fill in:

```markdown
Done — "Fall Prix Fixe" is live as a draft.

- [Open the campaign](https://feastalytics.com/3e8cb27c-6e54-444b-859f-66dbae0e711b/app/campaigns/e8ccc852-6555-4a9a-b48b-127d687bb34a)
- [Edit the funnel](https://feastalytics.com/3e8cb27c-6e54-444b-859f-66dbae0e711b/app/campaigns/e8ccc852-6555-4a9a-b48b-127d687bb34a?panel=funnel-v2)
- [See it as a guest](https://melbourneseafoodstation.feastalytics.com/campaign/e8ccc852-6555-4a9a-b48b-127d687bb34a?utm_source=PREVIEW)
```
