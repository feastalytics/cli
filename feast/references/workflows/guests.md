# Guests and members

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

`searchUsers` returns a page of recent member activity — one event per member, each carrying the member's `serialNumber` plus the event (type, time, related object).

- Filter with `query` (free-text name), `eventTypes` (e.g. `sentText`, `receivedText`, `scan`, `order`, `rewardAwarded`, `rewardRedeemed`, `checkout`, the `*Attribution` types), `progressMinBound`/`progressMaxBound` (visit-count range), `isUnread: true` (members with unanswered inbound texts), `orderBy` (ASC|DESC by event time).
- Paginate with `limit` (default 100) and `cursor` (pass back the `cursor` from the previous call; an undefined cursor means no more pages).

`getMemberConversation` with a member's `serialNumber` loads their thread, newest first — the pair to `searchUsers` the same way `getCreatorConversation` pairs with `listCreatorConversations`. Always pass `eventTypes`: `["sentText","receivedText"]` is the SMS thread, and adding `scan`/`order`/`checkout`/`rewardAwarded`/`rewardRedeemed` interleaves what happened between the messages. Unfiltered it returns the member's entire history unpaginated.

**Replying by SMS is NOT exposed, deliberately.** The send primitive enforces opt-out, quiet-hours, dedup, and rate limits *downstream* (not at the endpoint), and opt-in is currently gated only by a UI control. If a reply capability is ever exposed, it must run with confirmation and must not bypass those guardrails. For now, tell the user that replying to guests is done in the app.

## Everything else: the data catalog

`searchUsers` answers "recent activity, one event per member." Every other read question about guests — and about orders, menu items, texts, reservations, creator visits, payouts — goes through **`describeData` → `queryData`**:

- `describeData` with no arguments returns the index of every queryable object type plus the full query grammar; narrowed by schema or object type it returns full column detail. Never guess column names.
- `queryData` is read-only and always scoped to the calling organization — never filter on organizationId yourself.
- Six schemas: `interface` (POS-agnostic orders, order items, menu `catalogItem`s, `location`s, reservations — same shape whichever POS the org runs), `core` (guests/members), `events` (user events), `texting` (SMS logs), `creators` (visits and payouts), `attribution` (campaign attribution). Prefer `interface` for anything POS-shaped.

Typical uses: visit counts and cohorts, order history for one guest, menu items with real prices for grounding copy, text delivery history, creator payout status.
