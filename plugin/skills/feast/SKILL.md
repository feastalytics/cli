---
name: feast
description: >-
  Operate a Feastalytics organization (campaigns, automations, funnels, members-program rewards, the wallet pass, creator sourcing, Meta ads, texting, onboarding, and read-only data queries) through the Feastalytics tools, either the `feast` CLI or the Feastalytics MCP server. Use this skill whenever the user wants to inspect or change Feastalytics data outside the dashboard: "list my campaigns", "create an automation for org X", "approve this creator", "publish the recruitment ad", "text this guest back", "query my guests", "update the members program", or any request to script, batch or automate Feastalytics operations. Reach for it even when the user doesn't name the CLI or the MCP server: if the task is reading or changing Feastalytics data, these are the tools.
---

# Feast

Drive Feastalytics with the same tools the in-app agent uses. Every tool hits the production API as the logged-in user. The live tool list is the source of truth for which tools exist and what they accept, so read it rather than assuming.

## Two ways in

The same tools, names and inputs, over either transport. Use whichever this session has.

| | MCP server | `feast` CLI |
|---|---|---|
| You have it when | `listCampaigns` and `listOrganizations` are in your tool list | `feast tools` runs |
| Every tool | Your tool list | `feast tools`: one line per tool by domain. Read it whole once; don't grep it or rerun it |
| Input schemas | Each tool's entry; `describeSchema` with `{ "names": ["X"] }` for a named type | `feast describe <tool> [<tool> ...]`, several in one call, named types inlined |
| Your organizations | `listOrganizations` | `feast whoami` |
| Call a tool | Pass `organizationId` and the input | `feast call <tool> --org <id> --input '<json>'` (or `--input-file <path>`) |
| Keep only some fields | Not available | `--fields files.key,nextCursor,total` on `feast call`: dotted paths, arrays mapped. Use it instead of piping the result into python to pick fields |

Setup (installing, logging in, connecting MCP) is in `references/setup.md`. If a read such as `listCampaigns` works, you are set. The workflow files name tools and JSON input only; translate with this table.

On the CLI, results are JSON on stdout and the `Acting on organization ...` line goes to stderr. Never merge stderr into a parser (`2>&1 | python3`, `2>&1 > file.json`); pipe stdout alone. Before a mutation runs, stderr also prints `Running <tool> against "<restaurant>"`: check it names the restaurant you meant.

## Before each call

- **Read the schema of a tool before its first use**, and describe every tool a step needs in one call. Schemas don't change during a session, so don't describe a tool twice. Never guess names, fields or ids: look ids up with the matching list or read tool.
- **Ask only what the schema can take.** Before a clarifying question, check the tool has a field for the answer.
- **Name the organization.** Resolve a named org to its id. With one org it is used automatically; with several, an unscoped call is refused with the list, so confirm which one. Acting on the wrong restaurant is worse than asking.
- **Read before you write**: the campaign row before `updateCampaign`, the flows before creating one. `references/domains.md` explains fields the schema doesn't.

## Writes run immediately

Reads are safe. Mutations change production the moment they run: the CLI never asks, an MCP client may not, and nothing undoes them. Get the user's intent straight first, and show the exact text before sending any message. These reach the real world:

- `sendText` texts one person now. Approving or denying a visit (`updateCreatorVisit`) or deciding a submission (`updateCreatorSubmission` with `decision`) texts the creator; preview with `dryRun: true` or skip with `sideEffects: false` / `decision.skipApprovalText`.
- `createInfluencerPayout` (CLI only) charges the organization's card. `awardReward` grants a real reward, and a retry grants a second. `inviteUser` sends an email.
- Publishing a campaign puts it live; pricing a recurring promotion creates Stripe products. Activating a Meta campaign spends budget (`publishAds` needs `confirm: true`). Saving automation edits changes what guests receive.

## Workflows: read the file before a multi-step task

Workflow files carry the call order and the rules that make a result good, and neither is in the schemas. Pick the matching row and read that one file. Read another only when the task reaches that step: a file stays in context for the rest of the session and is re-read on every turn.

| Doing this | Read |
|---|---|
| Creating, cloning or configuring a campaign; promotions | `references/workflows/campaigns.md` |
| Automations: creating, editing, simulating, saving a draft. Automations always live in a flow: find one (`listAutomationFlows`) or create one first | `references/workflows/automations.md` |
| Funnel screens, funnel templates, staging a new screen | `references/workflows/funnels.md` |
| Guest-facing Meta ad copy (`adCopy`) | `references/workflows/ad-copy-guest.md` |
| Creator-recruitment ad copy (`recruitmentAdCopy`) | `references/workflows/ad-copy-creator.md` |
| Publishing, pausing, budgeting or diagnosing Meta ads | `references/workflows/ads.md` |
| Who a live ad set reaches; lookalike, website, engagement or customer-list audiences | `references/workflows/meta-targeting-audiences.md` |
| A Bevyl video ad: prompt, generate, edit, approve | `references/workflows/videos.md` |
| Creator sourcing: applicants, content, creatives, payouts, reimbursements, texting a creator | `references/workflows/creators.md` |
| Members-program rewards, granting one; the wallet pass configuration | `references/workflows/members-program.md` |
| The onboarding taskboard; brand identity; phone, media, invites, billing | `references/workflows/onboarding.md` |
| Guests and members, texting a guest back, any data catalog query | `references/workflows/guests.md` |

The two ad-copy files are exclusive: copy is for guests or for creators, never both. A new campaign usually spans campaigns, automations and funnels. For a question rather than a change, read the one file the table names and answer from it.

Some things have no tool (firing an automation at a live member, pass image generation, ad-copy generation, partnership ads); the workflow files say which. Never fabricate a call: say that part is done in the dashboard.

## Link to what you touched

After you create, change or publish something, close with links to see, edit or preview it, and lead with a link when asked where something lives. **Read `references/links.md` before writing any URL.** Dashboard routes don't follow the shape you'd guess, and a wrong link looks authoritative and 404s.

## When something fails

- Not logged in, `feast` not on PATH, or MCP asks you to authenticate: `references/setup.md`.
- "You belong to multiple organizations": pass one explicitly.
- Input doesn't match the schema: the error names the fields, and with the CLI it also prints the expected shape at the failing path. Fix the call from that; there is no need to run `feast describe` again.
- An expected tool isn't listed: don't fabricate it; it's a dashboard task.
