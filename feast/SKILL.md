---
name: feast
description: Operate a Feastalytics organization from the terminal — campaigns, automations, funnels, members-program rewards, the wallet pass, creator sourcing, Meta ads, onboarding, and read-only data queries — via the `feast` CLI. Use this skill whenever the user wants to inspect or change Feastalytics data outside the dashboard — "list my campaigns", "create an automation for org X", "approve this creator", "publish the recruitment ad", "query my guests", "update the members program", or any request to script/batch/automate Feastalytics operations. Reach for it even when the user doesn't say "CLI" — if the task is reading or changing Feastalytics data, this is the tool.
---

# Feast CLI

Drive the Feastalytics platform from the terminal. The `feast` CLI exposes the same tool surface the in-app AI agent uses (campaigns, automations, funnels, members program, creator sourcing, Meta ads, onboarding, data queries) as plain commands that hit the production API as the logged-in user.

The CLI is the source of truth for *which* tools exist and *what* they accept — always discover that at runtime rather than assuming, because the tool set grows as new endpoints are tagged. Your job is to pick the right tool, scope it to the right organization, and hand it valid input.

## Prerequisites

The `feast` CLI must be installed and on PATH:

```bash
npm install -g @feastalytics/cli    # or run ad-hoc with: npx @feastalytics/cli <command>
```

Authenticate once — tokens are cached in `~/.config/feast-cli/credentials.json` and refreshed automatically:

```bash
feast login                        # opens a browser to authorize (default)
feast login --password [username]  # headless / CI: username + password prompt, no browser
```

If a command reports you're not logged in or the session expired, re-run `feast login`.

## Staying current

Neither the CLI nor this skill updates itself. When a command prints an update notice on stderr:

```
Update available: feast 0.1.1 → 0.2.0
```

update both, then tell the user in one line that you did:

```bash
npm install -g @feastalytics/cli@latest      # only if `feast` is already on PATH from a global install
npx skills add feastalytics/cli -g -a '*' -y # refresh this skill from the repo
```

If you've been invoking the CLI through `npx` rather than a global install, skip the `npm install -g` and use `npx @feastalytics/cli@latest <command>` for the rest of the session instead — `npx` reuses a cached copy otherwise.

Update the skill whenever you update the CLI: the two ship from the same repo but on different triggers, so a new CLI version usually means this skill's guidance has moved too. If the global install fails on permissions, don't retry with `sudo` — tell the user and fall back to `npx @feastalytics/cli@latest`.

## The core loop: discover → describe → call

Don't guess tool names or input shapes. Introspect the live CLI:

```bash
feast tools                 # list every available tool, its domain, and whether it mutates
feast describe <tool>       # full description + input JSON schema for one tool
feast call <tool> --org <organizationId> --input '<json>'
```

Always `describe` an unfamiliar tool before calling it — the schema tells you the exact required fields, and the CLI validates your `--input` against it locally before sending anything, so a bad payload fails fast with a clear message instead of a confusing server error.

## Organizations: never let the API guess

Most tools act on one organization. A user often belongs to several, so which one you target matters and must be explicit.

```bash
feast whoami                # shows the logged-in user and every org (with names) they can act on
```

Pass the target org with `--org <organizationId>`:

- If the user names an org, resolve it to its id with `feast whoami` and pass that id.
- If the user belongs to exactly one org, the CLI uses it automatically — no flag needed.
- If they belong to more than one and you omit `--org`, the CLI refuses and lists the orgs rather than silently picking one. That's intentional: acting on the wrong org is worse than stopping to ask. When this happens, surface the list to the user and confirm which one they mean.

## Reads vs. writes

Query tools (listing, describing, reading) are safe and read-only. Mutation tools (create, update, clone, delete, apply) change production data.

- Mutations require `--org` explicitly.
- Before running one, the CLI resolves the organization server-side and prints its name, so a wrong `--org` shows up as the wrong restaurant rather than an opaque id. Read that line.
- **There is no confirmation prompt.** A mutation runs the moment you call it. Nothing asks twice, and nothing undoes it.

That last point matters most for the tools that reach the real world rather than just the database. Buying a phone number bills the account. Approving a creator visit or deciding a submission sends that person a text immediately and cannot be recalled. Paying a creator's bonus charges the organization's card. Publishing a campaign puts it live, and pricing a recurring promotion creates real Stripe products. Activating a Meta campaign spends real ad budget. Saving automation edits changes what guests receive. Treat those as irreversible, and get the user's intent straight *before* the call, because there is no gate after it. (The one schema-level exception: `publishAds` requires `confirm: true` in its input — but that's you confirming, not the CLI asking.)

Prefer reading before writing: e.g. `listCampaigns` to find the right `campaignId` before `updateCampaign`, or `describe`/`listAutomationFlows` before creating a flow.

## Building good input

`--input` takes a JSON string (or `--input-file <path>` for larger payloads). Construct it from the schema you got via `describe`. When a tool references another entity by id (a campaign id, location id, flow id), look that id up first with the relevant list/read tool rather than inventing it.

For the domain-specific meaning of fields — how automations chain, what a funnel screen contains, how offers are structured — consult the guidance in `references/domains.md` when the schema alone isn't enough.

## Workflows

Many tasks are multi-step and have a required ordering the app normally enforces. The most important rule: **automations live inside flows — always find a flow (`listAutomationFlows`) or create one (`createAutomationFlow`) before adding automations; never create an orphan automation.** The same "resolve the parent/ids first, then act" shape recurs across campaigns, funnels, and offers.

**Before acting on any multi-step task, read the workflow file for it.** Each one carries the required call ordering and the domain rules that make the result good rather than merely valid — neither of which is in the tool schemas. Read it first; don't reconstruct the sequence from tool descriptions.

| Doing this | Read |
|---|---|
| Creating, cloning or configuring a campaign; promotions | `references/workflows/campaigns.md` |
| Anything touching automations — creating, editing, simulating, promoting a draft | `references/workflows/automations.md` |
| Editing funnel screens, applying a funnel template, staging a new screen | `references/workflows/funnels.md` |
| Writing Meta ad copy — guest-facing or creator recruitment | `references/workflows/facebook.md` |
| Publishing, pausing, budgeting or diagnosing Meta ads | `references/workflows/ads.md` |
| Creator sourcing — approving applicants, reviewing content, creatives, payouts | `references/workflows/creators.md` |
| Members-program rewards; reading or saving the wallet pass configuration | `references/workflows/members-program.md` |
| Working the onboarding taskboard; brand identity; phone, media, invites, billing | `references/workflows/onboarding.md` |
| Searching guests/members; querying anything via the data catalog | `references/workflows/guests.md` |

Read more than one when a task spans them — a new campaign usually means `campaigns.md` plus `automations.md` and `funnels.md`, and publishing a recruitment ad means `creators.md` plus `facebook.md` and `ads.md`.

Some things are deliberately **not exposed**: replying to a guest or a creator by SMS, firing an automation at a live member, pass image generation, ad-copy generation (write it yourself), and publishing creator content as partnership ads. The workflow files say which. Don't fabricate a call for a workflow whose tools aren't listed by `feast tools` — tell the user that part isn't available yet.

## Link to what you touched

Work you do through the CLI lands somewhere in the product, and a link is a cheap thing to offer — so offer them freely. After a turn where you created, changed, or published something, close with a short markdown list: where to see it, where to edit it, where to preview it. Not because anyone has to go check your work, but because opening the thing is usually the next step anyway. When someone asks where a thing lives or how to set it up, lead with the link rather than click-by-click directions.

**You don't know these URLs — read `references/links.md` before you write one.** The dashboard's shape is not the one you'd extrapolate from the guest-facing links elsewhere in this skill, so a URL that looks obviously right is the exact case to check. A wrong link is worse than no link: it looks authoritative and 404s.

That file has the dashboard routes with their panel and tab names, the guest-facing pages on the organization's own subdomain, the preview route that completes the funnel draft loop, and which query params actually suppress analytics versus merely tagging a visit as a preview.

## Worked example

User: "add a Free Dessert reward members can redeem for 100 points in my Plum Vietnamese org."

```bash
feast whoami                                     # find the Plum Vietnamese org id
feast describe createMembersProgramReward        # learn the input shape (type: item vs name)
feast call listMembersProgramRewards --org <orgId>   # avoid duplicating an existing reward or catalog item
feast call createMembersProgramReward --org <orgId> --input '{"type":"name","name":"Free Dessert","pointsCost":100}'
```

The pattern generalizes: identify the org, learn the tool, resolve any referenced ids, then act.

## When something fails

- "Not logged in / session expired" → `feast login` (or `feast login --password [username]` in a headless/CI context).
- "You belong to multiple organizations" → pick one with `--org`, using `feast whoami` to get the id.
- "Input does not match the tool schema" → re-read `feast describe <tool>` and fix the named fields.
- A tool you expected isn't listed by `feast tools` → it may not be exposed yet; don't fabricate a call, tell the user.
