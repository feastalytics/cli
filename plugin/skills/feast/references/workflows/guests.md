# Guests and members

Every guest tool takes the member's `serialNumber`. Find it with `queryData` on `core.guest`:

- By name: filter `$firstName` or `$lastName` with `{ "string": "jan", "match": "IN" }`, a case-insensitive contains that also matches names that sound alike. `EQ` is an exact match.
- By phone: filter `$phoneNumber` with `{ "string": "5551234", "match": "ENDS_WITH" }` on the last digits, so the stored format doesn't matter.
- Ask for `args.fields: ["serialNumber", "firstName", "lastName", "phoneNumber", "optIn"]`. More than one row means ask the user which guest they mean.
  ```json
  { "schemaName": "core", "objectTypeName": "guest",
    "commands": [{ "type": "filter", "filter": { "$firstName": { "string": "jan", "match": "IN" } } }],
    "args": { "limit": 20, "fields": ["serialNumber", "firstName", "lastName", "phoneNumber", "optIn"] } }
  ```

Recent guest activity is `queryData` on `events.userEvent`: filter `$eventType` with `{ "strings": ["receivedText"] }` (or `scan`, `order`, `rewardAwarded`, and the other kinds) and order by `eventTime` `DESC`; each row has `serialNumber`, `eventTime` and `displayText` (the body, for texts). `texting.textMessage` has the texts themselves with `direction`, `body`, `dateCreated` and `serialNumber`.

`getConversation` with `{ "participant": { "type": "guest", "guest": { "serialNumber": "...", "eventTypes": [...] } } }` loads the member's timeline, newest first. Creators use the same tool with `{ "type": "creator", "creator": { "userId": "..." } }`, the `userId` from `queryData` `creators.creatorVisitApplication`. Texts come inline (`receivedText.text`, `sentText.text`: body, direction, status, who or what sent it); every other event is a `ref` `{ "object", "id" }` you can read with `queryData` (an `order` is `interface.order`, a `passCreated` is `core.guest`, a creator visit is `creators.creatorVisitApplication`) or leave as is. `eventTypes: ["receivedText","sentText"]` is the SMS thread, adding `scan`/`order`/`checkout`/`rewardAwarded`/`rewardRedeemed` interleaves what happened between the messages, and omitting it returns the whole history. Pages of `limit` (default 100, up to 500) with `cursor`; `direction: "asc"` for oldest first; `since`/`until` bound the times. `unread.count > 0` means the newest inbound text has no reply and nobody marked it read. `describeSchema ConversationEvent` lists every kind and its `ref.object`.

## Replying to a guest

`sendText` sends one SMS from the organization's texting number, the reply you would otherwise type into the dashboard chat. It is high priority and sent immediately: **no scheduling, no undo, no bulk form**.

1. Find the guest's `serialNumber` with `queryData` on `core.guest` (above) and read the thread with `getConversation` (`eventTypes: ["receivedText","sentText"]`) before drafting anything. Never guess a phone number: the participant is always named by id.
2. **Show the user the exact text and get their go-ahead before sending.** Drafting is yours; sending is theirs to approve, every time.
3. `sendText` with `{ "to": { "type": "guest", "serialNumber": "..." }, "message": "..." }`. Guest messages render `{{firstName}}`-style handlebars (the same ones text automations use) before sending. `mediaUrls` attaches up to 10 images.
4. **One recipient per call.** To reach several guests, call once per guest, each with its own confirmed text; for a broadcast, use a text blast automation instead.

The recipient is always named by id, never by phone number, and the type must match the thread: a guest who is also a creator exists in both tables, so use `type: "guest"` for a member thread and `type: "creator"` for a creator thread (see `creators.md`). A guest who doesn't belong to the organization is a 404, not a text to a stranger.

No tool lists the guests waiting on a reply yet. To find whom to answer, take recent `receivedText` rows from `events.userEvent`, then check each guest's `getConversation` `unread`.

**Unknown senders.** Someone who texted the organization's number without being a member or a creator is answered with `{ "type": "unknownSender", "phoneNumber": "+1..." }`. It is the only form that takes a raw number, and it is refused unless that number has an inbound message to the organization on file, so it can only answer, never cold-text.

## Everything else: the data catalog

Every other read question about guests (and about orders, menu items, texts, reservations, creator visits, payouts) goes through **`describeData` → `queryData`**:

- `describeData` with no arguments returns the index of every queryable object type plus the full query grammar; narrowed by schema or object type it returns full column detail (type, enum values, nullability, description, and the link names `pivot` and `join` take). Pass `includeGrammar: false` once you have the grammar. Never guess column names.
- `queryData` is read-only and always scoped to the organization; never filter on organizationId yourself.
- Writing a query: `commands` run in order (`filter`, `pivot`, `join`, `aggregate`), and `pivot` and `join` must come before any `aggregate`. Aggregate functions are `SUM`, `MAX`, `MIN`, `AVG`, `COUNT` and `COUNT_DISTINCT`: `SUM` and `AVG` need a number column, `COUNT` (non-null values) and `COUNT_DISTINCT` (distinct non-null values) work on any column, and without a `groupBy` the result is one row, e.g. `{ "aggregate": { "$serialNumber": "COUNT_DISTINCT" } }` for distinct members. A filter leaf is one column, written as the column name prefixed with `$`; combine leaves with `{ "type": "and" | "or", "filters": [...] }`. Use `{ "strings": [...] }` for any-of rather than a large `or`. Send `args.fields` to return only the columns you need on wide object types, and page by sending the returned `nextCursor` back as `args.cursor` (no `nextCursor` means no more rows).
- Example, opted-in members with more than 5 visits, newest first:
  ```json
  { "schemaName": "core", "objectTypeName": "guest",
    "commands": [{ "type": "filter", "filter": { "type": "and", "filters": [{ "$optIn": { "boolean": true } }, { "$progress": { "number": 5, "match": "GT" } }] } }],
    "args": { "limit": 500, "order": { "field": "timeAdded", "direction": "DESC" }, "fields": ["serialNumber", "phoneNumber", "progress"] } }
  ```
- Six schemas: `interface` (POS-agnostic orders, order items, menu `catalogItem`s, `location`s, reservations: the same shape whichever POS the org runs), `core` (guests/members), `events` (user events), `texting` (SMS logs), `creators` (creator program settings, applications and visits, Instagram stats, payouts), `attribution` (campaign attribution). Prefer `interface` for anything POS-shaped.

Typical uses: visit counts and cohorts, order history for one guest, menu items with real prices for grounding copy, text delivery history, creator payout status.
