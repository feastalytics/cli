---
name: feast
description: Operate a Feastalytics organization (campaigns, automations, funnels, members-program rewards, the wallet pass, creator sourcing, Meta ads, texting, onboarding, and read-only data queries) through the Feastalytics tools, either the `feast` CLI or the Feastalytics MCP server. Use this skill whenever the user wants to inspect or change Feastalytics data outside the dashboard: "list my campaigns", "create an automation for org X", "approve this creator", "publish the recruitment ad", "text this guest back", "query my guests", "update the members program", or any request to script, batch or automate Feastalytics operations. Reach for it even when the user doesn't name the CLI or the MCP server: if the task is reading or changing Feastalytics data, these are the tools.
---

# Feast

Drive the Feastalytics platform with the same tool surface the in-app AI agent uses: campaigns, automations, funnels, members program, creator sourcing, Meta ads, texting, onboarding and data queries. Every tool hits the production API as the logged-in user.

The live tool list is the source of truth for *which* tools exist and *what* they accept. Read it at runtime rather than assuming, because the tool set grows as new endpoints are tagged. Your job is to pick the right tool, scope it to the right organization, and hand it valid input.

## Two ways in

The same tools, with the same names and inputs, are reachable two ways. Use whichever this session has.

| | MCP server | `feast` CLI |
|---|---|---|
| How you know you have it | Tools such as `listCampaigns` and `listOrganizations` are in your tool list | `feast tools` runs |
| See every tool | Your tool list | `feast tools` |
| One tool's input schema | Its entry in your tool list | `feast describe <tool>` |
| A schema that says "Named type X. Call describeSchema…" | Call `describeSchema` with `{ "names": ["X"] }` | `feast describe <tool>` prints it in full |
| Which organizations you can act on | `listOrganizations` | `feast whoami` |
| Choose the organization | The `organizationId` argument on each call | `--org <organizationId>` |
| Call a tool | Call it directly with its input | `feast call <tool> --org <id> --input '<json>'` (or `--input-file <path>`) |

Setting either one up (installing the CLI, logging in, connecting the MCP server) is in `references/setup.md`. Some environments hand you either one already connected and pinned to one organization; if a read such as `listCampaigns` works, you are set.

The rest of this skill and every workflow file names tools and their JSON input only. Translate to your transport with the table above.

## The core loop: discover, read the schema, call

Don't guess tool names or input shapes. Before calling an unfamiliar tool, read its input schema (and, over MCP, `describeSchema` for any named type it points to). The schema tells you the exact required fields. The CLI also validates input locally before sending, so a bad payload fails with the field named; over MCP the server validates and returns the same kind of error as a tool error.

That schema is also the boundary for what's worth asking the user about. Before sending a clarifying question, check whether the tool you're about to call has a field for the answer. A question about something the schema can't accept (a limit, a repeat rule, anything not in the schema) wastes a message and never gets used. Only ask about what the call in front of you can actually configure.

## Organizations: never let the API guess

Most tools act on one organization, and which one must be explicit. Acting on the wrong restaurant is worse than stopping to ask.

- If the user names an organization, resolve it to its id (`listOrganizations` or `feast whoami`) and pass that id.
- If the user belongs to exactly one, it is used automatically.
- If they belong to several and you don't say which, the call is refused with a list of their organizations rather than silently picking one. Show the list and confirm which one they mean.

## Reads vs. writes

Query tools (listing, describing, reading) are safe and read-only; over MCP they carry a read-only hint. Mutation tools (create, update, clone, delete, apply, send) change production data.

- Always name the organization explicitly for a mutation.
- On the CLI, a mutation prints the organization's name to stderr before it runs (`Acting on organization <id> as <ROLE>`), so a wrong `--org` shows up as the wrong restaurant. Read that line.
- **Nothing asks twice.** The CLI has no confirmation prompt, and an MCP client may or may not ask the user to approve a call depending on its settings. A mutation runs the moment it is called, and nothing undoes it.

That last point matters most for the tools that reach the real world rather than just the database:

- `sendText` texts a guest or creator immediately, one person per call, with no scheduling and no undo.
- Approving or denying a creator visit (`updateCreatorVisit`) or deciding a submission (`decideCreatorSubmission`) texts that person. `updateCreatorVisit` can preview its texts with `dryRun: true` or skip them with `sideEffects: false`; `decideCreatorSubmission` can skip its text with `skipApprovalText`.
- Paying a creator's bonus (`createInfluencerPayout`) charges the organization's card.
- `awardReward` puts a real reward in a member's wallet pass, and a retried call grants a second one.
- `inviteUser` sends a real email.
- Buying a phone number bills the account.
- Publishing a campaign puts it live, and pricing a recurring promotion creates real Stripe products.
- Activating a Meta campaign spends real ad budget.
- Saving automation edits changes what guests receive.

Treat those as irreversible, and get the user's intent straight *before* the call. For a text, show the user the exact message and get their go-ahead first. The one schema-level gate is `publishAds`, which requires `confirm: true` in its input; that is you confirming, not anyone asking.

Prefer reading before writing: `listCampaigns` to find the right `campaignId` before `updateCampaign`, or `listAutomationFlows` before creating a flow.

## Building good input

Input is a JSON object built from the tool's schema. When a tool references another entity by id (a campaign id, location id, flow id), look that id up first with the relevant list or read tool rather than inventing it.

For the domain meaning of fields (how automations chain, what a funnel screen contains, how offers are structured), consult `references/domains.md` when the schema alone isn't enough.

## Workflows

Many tasks are multi-step and have a required ordering the app normally enforces. The most important rule: **automations live inside flows. Always find a flow (`listAutomationFlows`) or create one (`createAutomationFlow`) before adding automations; never create an orphan automation.** The same "resolve the parent and ids first, then act" shape recurs across campaigns, funnels and offers.

**Before acting on any multi-step task, read the workflow file for it.** Each one carries the required call ordering and the domain rules that make the result good rather than merely valid, and neither is in the tool schemas. Read it first; don't reconstruct the sequence from tool descriptions.

| Doing this | Read |
|---|---|
| Creating, cloning or configuring a campaign; promotions | `references/workflows/campaigns.md` |
| Anything touching automations: creating, editing, simulating, promoting a draft | `references/workflows/automations.md` |
| Editing funnel screens, applying a funnel template, staging a new screen | `references/workflows/funnels.md` |
| Writing guest-facing Meta ad copy (`adCopy`) | `references/workflows/ad-copy-guest.md` |
| Writing creator-recruitment ad copy (`recruitmentAdCopy`) | `references/workflows/ad-copy-creator.md` |
| Publishing, pausing, budgeting or diagnosing Meta ads | `references/workflows/ads.md` |
| Creator sourcing: approving applicants, reviewing content, creatives, payouts, reimbursements, texting a creator | `references/workflows/creators.md` |
| Members-program rewards, granting a reward to one member; reading or saving the wallet pass configuration | `references/workflows/members-program.md` |
| Working the onboarding taskboard; brand identity; phone, media, invites, billing | `references/workflows/onboarding.md` |
| Searching guests and members, texting a guest back, querying anything through the data catalog | `references/workflows/guests.md` |

Every row names one file, and one file is the whole answer for that row. Pick the row that matches what you're doing and read only it. The two ad-copy rows are mutually exclusive: you are writing to guests or to creators, never both in one piece of copy.

Read more than one file when a task genuinely spans steps. A new campaign usually means `campaigns.md` plus `automations.md` and `funnels.md`. Read each one as you reach that step rather than gathering them up front: a file stays in context for the rest of the session, so one you open speculatively is re-read on every later turn.

When the ask is a question rather than a change (where something lives, what a field means, which link to send), read the single file the table names and answer from it.

Some things have no tool: firing an automation at a live member, pass image generation, ad-copy generation (write it yourself), and publishing creator content as partnership ads. The workflow files say which. Don't fabricate a call for a tool that isn't in the tool list; tell the user that part has to be done in the dashboard.

## Link to what you touched

Work you do through these tools lands somewhere in the product, and a link is a cheap thing to offer, so offer them freely. After a turn where you created, changed or published something, close with a short markdown list: where to see it, where to edit it, where to preview it. Opening the thing is usually the next step anyway. When someone asks where a thing lives or how to set it up, lead with the link rather than click-by-click directions.

**You don't know these URLs. Read `references/links.md` before you write one.** The dashboard's shape is not the one you'd extrapolate from the guest-facing links elsewhere in this skill, so a URL that looks obviously right is the exact case to check. A wrong link is worse than no link: it looks authoritative and 404s.

That file has the dashboard routes with their panel and tab names, the guest-facing pages on the organization's own subdomain, the preview route that completes the funnel draft loop, and which query params suppress analytics versus merely tagging a visit as a preview.

## Worked example

User: "add a Free Dessert reward members can redeem for 100 points in my Plum Vietnamese org."

1. Find the organization's id with `listOrganizations` (CLI: `feast whoami`), unless you were given it.
2. Read the `createMembersProgramReward` schema to learn the input shape (`type: "item"` vs `type: "name"`).
3. Call `listMembersProgramRewards` to avoid duplicating an existing reward or catalog item.
4. Call `createMembersProgramReward` with `{ "type": "name", "name": "Free Dessert", "pointsCost": 100 }`.

On the CLI, step 4 is:

```bash
feast call createMembersProgramReward --org <organizationId> --input '{"type":"name","name":"Free Dessert","pointsCost":100}'
```

The pattern generalizes: identify the organization, learn the tool, resolve any referenced ids, then act.

## When something fails

- Not logged in, session expired, `feast` isn't on PATH, or the MCP server asks you to authenticate: `references/setup.md`.
- "You belong to multiple organizations": pick one and pass it explicitly (see Organizations above).
- The input doesn't match the schema: re-read the tool's schema (and any named type) and fix the named fields.
- A tool you expected isn't in the tool list: don't fabricate a call; tell the user that part has to be done in the dashboard.
