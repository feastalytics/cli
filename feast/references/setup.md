# Setup, auth, and organizations

One-time and troubleshooting material: getting the `feast` CLI installed and logged in, keeping it and this skill current, and working out which organization to act on. The day-to-day loop lives in `SKILL.md`; you only need this file when something isn't working yet.

Some environments hand you a CLI that is already installed and authenticated, and pin you to a single organization. Nothing in this file applies there — if `feast tools` runs and your commands are going to the right restaurant, you are already set up.

## Installing

The `feast` CLI must be installed and on PATH:

```bash
npm install -g @feastalytics/cli    # or run ad-hoc with: npx @feastalytics/cli <command>
```

If the global install fails on permissions, don't retry with `sudo` — tell the user and fall back to `npx @feastalytics/cli@latest`.

## Authenticating

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

Update the skill whenever you update the CLI: the two ship from the same repo but on different triggers, so a new CLI version usually means this skill's guidance has moved too.

## Which organization

Most tools act on one organization. A user often belongs to several, so which one you target matters and must be explicit.

```bash
feast whoami                # shows the logged-in user and every org (with names) they can act on
```

Pass the target org with `--org <organizationId>`:

- If the user names an org, resolve it to its id with `feast whoami` and pass that id.
- If the user belongs to exactly one org, the CLI uses it automatically — no flag needed.
- If they belong to more than one and you omit `--org`, the CLI refuses and lists the orgs rather than silently picking one. That's intentional: acting on the wrong org is worse than stopping to ask. When this happens, surface the list to the user and confirm which one they mean.
