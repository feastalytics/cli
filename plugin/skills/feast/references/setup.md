# Setup, auth, and organizations

One-time and troubleshooting material: connecting the Feastalytics MCP server or installing and logging in to the `feast` CLI, keeping the CLI and this skill current, and working out which organization to act on. The day-to-day loop lives in `SKILL.md`; you only need this file when something isn't working yet.

Some environments hand you the tools already connected and authenticated, pinned to a single organization. Nothing in this file applies there: if a read such as `listCampaigns` works and your calls are going to the right restaurant, you are already set up.

## The MCP server

The hosted server is at `https://mcp.feast-api.com/mcp` (streamable HTTP, OAuth). The user adds it once in their MCP client, for example:

```bash
claude mcp add --transport http feast https://mcp.feast-api.com/mcp   # Claude Code
```

In other clients (Claude Desktop, claude.ai, Cursor) it is a custom connector with that URL. The first call opens a browser to the Feastalytics login, then a consent page naming the client; after that the client refreshes the session itself. A session lasts 30 days from that login, then the user logs in again. If tool calls start failing with an authentication error, ask the user to reconnect the server in their client.

You can't add the server for the user from inside a conversation. Tell them the URL and where to add it.

## The `feast` CLI

### Installing

The `feast` CLI must be installed and on PATH:

```bash
npm install -g @feastalytics/cli    # or run ad hoc with: npx @feastalytics/cli <command>
```

If the global install fails on permissions, don't retry with `sudo`. Tell the user and fall back to `npx @feastalytics/cli@latest`.

### Authenticating

Authenticate once. The CLI keeps you signed in and refreshes the session itself:

```bash
feast login                        # opens a browser to authorize (default)
feast login --password [username]  # headless or CI: username and password prompt, no browser
```

If a command reports you're not logged in or the session expired, run `feast login` again.

### Staying current

Neither the CLI nor this skill updates itself. When a command prints an update notice on stderr:

```
Update available: feast 0.1.1 → 0.2.0
```

update both, then tell the user in one line that you did:

```bash
npm install -g @feastalytics/cli@latest      # only if `feast` is on PATH from a global install
npx skills add feastalytics/cli -g -a '*' -y # refresh this skill from the repo
```

If you've been invoking the CLI through `npx` rather than a global install, skip the `npm install -g` and use `npx @feastalytics/cli@latest <command>` for the rest of the session instead (`npx` reuses a cached copy otherwise).

Update the skill whenever you update the CLI: the two ship from the same repo but on different triggers, so a new CLI version usually means this skill's guidance has moved too. The MCP server always serves the current tools, so over MCP only the skill needs refreshing.

## Playbook skills

Feastalytics publishes further skills that build on this one (campaign diagnosis and other playbooks). They come from the API, not from GitHub, and installing them takes the CLI:

```bash
feast skill list                       # what is published for your organization
feast skill install feast-playbooks    # install or refresh one for your agent
```

Install what `feast skill list` offers when the user asks for a playbook this skill does not cover, and re-run the install when the CLI prints an update notice.

## Which organization

Most tools act on one organization. A user often belongs to several, so which one you target matters and must be explicit.

- See every organization the user can act on, with names and their role: `listOrganizations` over MCP, `feast whoami` on the CLI.
- Pass the target as the `organizationId` argument (MCP) or `--org <organizationId>` (CLI).
- If the user names an organization, resolve it to its id from that list and pass the id.
- If the user belongs to exactly one organization, it is used automatically.
- If they belong to more than one and you don't pass one, the call is refused with the list of their organizations rather than silently picking one. That's intentional: acting on the wrong organization is worse than stopping to ask. Show the user the list and confirm which one they mean.
