# @feast/cli

Command-line client for the Feastalytics platform. It exposes the same tool surface the in-app AI agent uses — campaigns, automations, offers, funnels, members-program rewards — as plain commands that hit the production API as the logged-in user.

Ships with an [agent skill](#agent-skill) so Claude Code, Codex, and other agents can drive it.

## Install

```bash
npm install -g @feast/cli
```

Or run without installing:

```bash
npx @feast/cli <command>
```

## Usage

```bash
feast login <username>          # authenticate once; tokens cached in ~/.config/feast-cli
feast whoami                    # your user + every organization (with names) you can act on
feast tools                     # list every available tool
feast describe <tool>           # a tool's description + input JSON schema
feast call <tool> --org <organizationId> --input '<json>'
feast logout
```

### The core loop

The CLI is the source of truth for which tools exist and what they accept — discover it at runtime rather than assuming:

```bash
feast tools
feast describe updateCampaign
feast call listCampaigns --org <organizationId>
```

`--input` is validated locally against the tool's JSON schema before anything is sent, so a bad payload fails fast with a clear message.

### Organizations

Most tools act on one organization, and you may belong to several. Pass `--org <organizationId>`:

- Belong to exactly one org → it's used automatically.
- Belong to several and omit `--org` → the CLI **errors and lists your orgs** rather than silently picking one. Acting on the wrong org is worse than stopping to ask.
- A typo'd org id is rejected client-side (it never falls through to a default).

Mutations additionally require `--org`, verify the server-resolved org, and prompt for confirmation (`--yes` to skip in scripts).

## Agent skill

The `feast/` directory is an [agent skill](https://www.skills.sh) that teaches an agent to operate the CLI. Install it into your agent(s):

```bash
npx skills add feastalytics/cli
```

It works across Claude Code, Codex, Cursor, and the other agents the `skills` tool supports.

## Environment

- `FEAST_API_URL` — override the API base URL (e.g. a local dev server)
- `FEAST_API_KEY` — override the static API key

## Development

```bash
npm install
npm run dev -- tools          # run from source via tsx
npm run build                 # bundle to dist/cli.js
npm run typecheck
```

The tool manifest (`src/generated/manifest.ts`) is generated from the Feastalytics API in the main monorepo and published here — do not edit it by hand.
