# @feastalytics/cli

Command-line client for the Feastalytics platform. It exposes the same tool surface the in-app AI agent uses — campaigns, automations, offers, funnels, members-program rewards — as plain commands that hit the production API as the logged-in user.

Ships with an [agent skill](#agent-skill) so Claude Code, Codex, and other agents can drive it.

## Install

```bash
npm install -g @feastalytics/cli
```

Or run without installing:

```bash
npx @feastalytics/cli <command>
```

### Staying current

Neither install path updates itself. Once a day the CLI checks npm for a newer
published version and, if there is one, prints a one-line notice to stderr after
the command finishes:

```
Update available: feast 0.1.1 → 0.2.0
  npx @feastalytics/cli@latest <command>   (or: npm install -g @feastalytics/cli@latest)
```

The check is skipped when stderr isn't a TTY, when `CI` is set, or when
`FEAST_NO_UPDATE_CHECK` or `NO_UPDATE_NOTIFIER` is set. It never blocks longer
than 1.5s and fails silently offline.

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

### Updating the installed skill

The skill is **copied** into a global store (`~/.agents/skills/feast`) and symlinked into each agent's skills directory, so it does **not** auto-update when this repo changes. After the skill is updated (or if your agents are showing a stale version), re-run the add to refresh every agent at once:

```bash
npx skills add feastalytics/cli -g -a '*' -y
```

- `-g` installs globally (user-level), matching where the skill lives.
- `-a '*'` re-links **all** agents (Claude Code, Codex, …) so each picks up the new version.
- `-y` skips the confirmation prompts.

To refresh from a local checkout instead of GitHub, run `npx skills add ./feast -g -a '*' -y` from the repo root.

## Environment

- `FEAST_API_URL` — override the API base URL (e.g. a local dev server)
- `FEAST_API_KEY` — override the static API key

### Non-interactive credentials

`feast login` stores tokens under `~/.config/feast-cli/` and refreshes them on
demand. That does not work where there is no interactive login and no writable
home directory — most importantly inside a sandboxed agent, where the token is
supplied by the host and must never be readable by the agent itself.

Set `FEAST_ACCESS_TOKEN` for that case:

```bash
export FEAST_ACCESS_TOKEN="$TOKEN"
export FEAST_ORGANIZATION_ID=4fafb31e-dd46-4081-9778-c298e577a1d1
export FEAST_PREFERRED_ROLE=OWNER
feast call listCampaigns
```

- `FEAST_ACCESS_TOKEN` — access token sent verbatim as `x-access-token`
- `FEAST_ORGANIZATION_ID` — **pins** the organization
- `FEAST_PREFERRED_ROLE` — **pins** the role; a role name (`OWNER`) or a full role ARN

When `FEAST_ACCESS_TOKEN` is set the CLI reads no token from disk, refreshes
nothing, and **never decodes the token**. Normally the organization and role are
read from the token's `cognito:groups` claim, so both must be supplied instead.

Not decoding the token is the point, not a limitation: it lets the token be an
opaque placeholder that a secret store substitutes for the real value after the
request leaves the machine, so a compromised sandbox yields nothing.

`FEAST_ORGANIZATION_ID` and `FEAST_PREFERRED_ROLE` pin the session rather than
just defaulting it. `--org` and `--role` may repeat the pinned value but cannot
change it:

```
$ FEAST_ORGANIZATION_ID=org-A feast call listCampaigns --org org-B
FEAST_ORGANIZATION_ID pins this session to org-A, so --org org-B is not allowed.
```

Pinning the role is how you run an agent at **reduced** privilege. The API
validates a requested role against the user's real Cognito groups, so it will
happily accept `OWNER` from a user who is an owner — only the pin can hold that
user's agent down to `VIEWER`.

Neither pin is a security boundary on its own: both are ordinary environment
variables, so anything that can set env vars in the same process tree can change
them. They stop a tool call from wandering, not a determined process. Scope the
token itself if you need a hard guarantee.

## Development

```bash
npm install
npm run dev -- tools          # run from source via tsx
pnpm feast tools              # same thing via pnpm (no `--` needed)
npm run build                 # bundle to dist/cli.js
npm run typecheck
```

### Install the `feast` command locally

To get a global `feast` command backed by your local checkout:

```bash
npm run build          # build dist/cli.js first
npm link               # symlink global `feast` -> this repo
feast tools
```

`npm link` points the global command at the **built** `dist/cli.js`, so re-run `npm run build` after source changes. To remove it: `npm unlink -g @feastalytics/cli`.

The tool manifest (`src/generated/manifest.ts`) is generated from the Feastalytics API in the main monorepo and published here — do not edit it by hand.
