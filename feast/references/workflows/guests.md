# Guests and members

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

**Reading is now available** via `searchUsers`. It returns a page of recent member activity — one event per member, each carrying the member's `serialNumber` plus the event (type, time, related object).

- Filter with `query` (free-text name), `eventTypes` (e.g. `sentText`, `receivedText`, `scan`, `order`, `rewardAwarded`, `rewardRedeemed`, `checkout`, the `*Attribution` types), `progressMinBound`/`progressMaxBound` (visit-count range), `isUnread: true` (members with unanswered inbound texts), `orderBy` (ASC|DESC by event time).
- Paginate with `limit` (default 100) and `cursor` (pass back the `cursor` from the previous call; an undefined cursor means no more pages).

**Replying by SMS is NOT exposed, deliberately.** The send primitive enforces opt-out, quiet-hours, dedup, and rate limits *downstream* (not at the endpoint), and opt-in is currently gated only by a UI control. If a reply capability is ever exposed, it must run with confirmation and must not bypass those guardrails. For now, tell the user that replying to guests is done in the app.
