# Creator sourcing

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

Restaurants recruit local creators to visit and post about them. A recruitment ad brings applicants in; from there it's a queue of decisions — approve the applicant, then later approve the content they made. Both decisions text the creator, so neither is a quiet status change.

### The model: the application IS the visit row

There is no separate application object. One row covers a creator's whole journey with a location, and you read the stage off its columns rather than a single status field:

- `approvalStatus` `pending_approval` → awaiting your decision, then `approved` or `denied`.
- `startTime` **null** on an approved row → they're approved but haven't booked yet. Set → scheduled.
- `preVisitConfirmationStatus` `confirmed` → they confirmed they're still coming.
- `postVisitFollowUpSentAt` set → the visit is done.

**Gotcha:** denying an application stamps `postVisitFollowUpSentAt` and every content follow-up with the current time, as the way to suppress the remaining message sequence. So a denied row looks *completed* on those timestamps. Always pair a timestamp check with `approvalStatus == "approved"`.

### The decision loop

1. `listCreatorApplications` — the approval queue, newest first, across every location. Takes no arguments. Use this rather than querying the data model: it carries **`instagramFollowerCount`**, which is usually the deciding factor and isn't reachable any other way.
2. `approveCreatorVisit` with `{ "eventId": "...", "decision": "approved" | "denied" }`. **This texts the creator immediately** — approved sends their booking link and creative brief, denied sends a decline. It also **consumes the location's monthly creator sourcing allowance**, and recruitment auto-pauses once that limit is reached, so an approval is both a message and a spend. Confirm with the user before working through a queue; don't batch-approve on your own initiative.
3. The creator books, visits, and submits content on their own — none of that is driven from here.
4. `listCreatorSubmissions` with `{ "status": "submitted" }` (and `"revision_requested"`) — the content review queue. Submissions are stored outside the queryable data model, so this tool is the only way to read them.
5. `decideCreatorSubmission` — `approved`, `rejected`, `revision_requested`, or `under_review`. **This texts the creator too.** `revision_requested` sends your `feedbackMessage` verbatim plus a resubmit link, so write it as something the creator will read, not an internal note. Approving queues their bonus payout. `approvalType` defaults to `"ad"` (the content may run in paid ads) and is rejected when the board's bonus is $0 — use `"organic"` when it's just for their own channels.

### Conversations

`listCreatorConversations` is the "who is waiting on a reply" queue: every creator's SMS thread with `hasUnread`, the last message body and direction, and a derived `visitStatus` chip that's more reliable than reading raw columns.

**You cannot reply from the CLI, and you cannot clear the unread flag.** Both stay in the dashboard — texting a creator back is the highest-consequence action in this area. Surface who's waiting and what they said, then hand the user the conversation.

### Everything else: queryData

The `creators` schema exposes `creator` (the person, one row shared across all their applications) and `creatorVisitApplication` (one application/visit). Join on `creator.influencerId = creatorVisitApplication.userId`. Use it for anything the tools above don't answer — no-shows, per-location counts, repeat creators. Content submissions and payouts are **not** in the catalog.

> **Not exposed:** launching recruitment ads, scheduling or cancelling a visit, marking a visit attended, paying a bonus, and publishing creator content to Facebook. Those stay in the app.

---
