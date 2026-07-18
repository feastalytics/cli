---
name: feast
description: Operate a Feastalytics organization from the terminal — list, create, and update campaigns, automations, offers, funnels, and members-program rewards — via the `feast` CLI. Use this skill whenever the user wants to inspect or change Feastalytics data outside the dashboard: "list my campaigns", "create an automation for org X", "what offers does this location have", "clone this campaign", "update the members program", or any request to script/batch/automate Feastalytics operations. Reach for it even when the user doesn't say "CLI" — if the task is reading or changing Feastalytics campaign/automation/offer/reward data, this is the tool.
---

# Feast CLI

Drive the Feastalytics platform from the terminal. The `feast` CLI exposes the same tool surface the in-app AI agent uses (campaigns, automations, offers, funnels, members program) as plain commands that hit the production API as the logged-in user.

The CLI is the source of truth for *which* tools exist and *what* they accept — always discover that at runtime rather than assuming, because the tool set grows as new endpoints are tagged. Your job is to pick the right tool, scope it to the right organization, and hand it valid input.

## Prerequisites

The `feast` CLI must be installed and on PATH:

```bash
npm install -g @feast/cli    # or run ad-hoc with: npx @feast/cli <command>
```

Authenticate once — tokens are cached in `~/.config/feast-cli/credentials.json` and refreshed automatically:

```bash
feast login <username>
```

If a command reports you're not logged in or the session expired, re-run `feast login`.

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

Query tools (listing, describing, reading) are safe and read-only. Mutation tools (create, update, clone, delete, apply) change production data, so the CLI adds guards:

- Mutations require `--org` explicitly.
- Before running, the CLI verifies the server-resolved org and prompts for `y/N` confirmation.
- In a non-interactive context where the user has already told you to proceed, add `--yes` to skip the prompt. Only do this when the user's intent is unambiguous — the confirmation exists to prevent acting on the wrong org or with the wrong payload.

Prefer reading before writing: e.g. `listCampaigns` to find the right `campaignId` before `updateCampaign`, or `describe`/`listAutomationFlows` before creating a flow.

## Building good input

`--input` takes a JSON string (or `--input-file <path>` for larger payloads). Construct it from the schema you got via `describe`. When a tool references another entity by id (a campaign id, location id, flow id), look that id up first with the relevant list/read tool rather than inventing it.

For the domain-specific meaning of fields — how automations chain, what a funnel screen contains, how offers are structured — consult the guidance in `references/domains.md` when the schema alone isn't enough.

## Workflows

Many tasks are multi-step and have a required ordering the app normally enforces. The most important rule: **automations live inside flows — always find a flow (`listAutomationFlows`) or create one (`createAutomationFlow`) before adding automations; never create an orphan automation.** The same "resolve the parent/ids first, then act" shape recurs across campaigns, funnels, and offers.

For the ordered steps and domain rules of each common workflow, read `references/workflows.md`. It covers what's **fully doable** — creating/cloning a campaign, authoring automations end-to-end (create/edit/delete/simulate, with the trigger, condition, send-time, and chaining rules that make a flow professional), creating offers, and exploring users — and what's **not yet exposed** — funnel screen editing, members-program reward creation, brand identity, and replying to guests by SMS. Don't fabricate a call for a workflow whose tools aren't listed by `feast tools`; tell the user that part isn't available yet.

## Worked example

User: "add a $5-off offer to the Plum location in my Plum Vietnamese org."

```bash
feast whoami                                    # find the Plum Vietnamese org id
feast describe dfyCreateOffer                    # learn the offer input shape
feast call dfyGetMenuHierarchy --org <orgId> --input '{"locationId":"<id>"}'   # find the location/menu ids
feast call dfyCreateOffer --org <orgId> --input '{ ... }'                       # create it (confirms first)
```

The pattern generalizes: identify the org, learn the tool, resolve any referenced ids, then act.

## When something fails

- "Not logged in / session expired" → `feast login <username>`.
- "You belong to multiple organizations" → pick one with `--org`, using `feast whoami` to get the id.
- "Input does not match the tool schema" → re-read `feast describe <tool>` and fix the named fields.
- A tool you expected isn't listed by `feast tools` → it may not be exposed yet; don't fabricate a call, tell the user.
