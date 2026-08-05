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

### Setting up the program

The program lives on a **location**, not the organization — one config per `locationId`, which you get from `queryData interface.location`.

`updateInfluencerBoardConfig` is an **upsert**. There is no create tool: call it for a location with no program and it writes one, seeding a 5000-cent dining credit and leaving `landingPageConfirmed`, `calendarConfigured` and `passConfigured` false. Omitted fields are left alone on subsequent calls.

**Set `schedulingMode` on the first call.** It's the one field with no default, and without it the *Design creator program* task never completes no matter what else you fill in. `self_schedule_approval` lets approved creators book themselves; `apply_only` collects applications for the restaurant to schedule.

**The setup task and the launch check disagree.** The task wants `schedulingMode` *and* a positive credit *and* `landingPageConfirmed`. Launching only checks `landingPageConfirmed` and a positive credit — and since the credit's floor and its default are both 5000, that leaves `landingPageConfirmed` as the only real precondition. A program can be live while its task still reads incomplete; don't report the task as the launch gate.

`getInfluencerBoardConfig` returns the config (or `null`) plus the location's recruitment offers. **Read it before writing recruitment copy** — the dining credit, creator bonus and follower minimum you're supposed to quote live here and nowhere else. It's also how you check the bonus is non-zero before calling `decideCreatorSubmission` with `approvalType: "ad"`.

### The creative brief

`createCreativeStrategy` has two paths behind one tool, and only one of them finishes synchronously:

- **`awareness`** — assembled from a fixed template and saved before the call returns. `generationStatus` comes back `complete`.
- **`cta`** — handed to a background LLM. You get a `strategyId` and `generationStatus: "generating"` immediately. **Poll `getCreativeStrategy` until it reads `complete` or `failed`** before using the brief or quoting anything from it.

`getCreativeStrategy` is the one tool that takes `organizationId` in its input rather than from `--org` — it also serves the creator-facing brief pages. Pass the organization you're acting on.

`updateCreativeStrategy` is the revision step. Two things to get right: omitting `strategyId` **creates a new strategy** instead of editing the one you meant, and it replaces the fields you send rather than merging them — so read first, apply your edits to the full `concepts` array, and send the whole thing back. Generating into a strategy that isn't still a draft is rejected rather than silently overwritten.

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

> **Not exposed:** launching the program, launching recruitment ads, booking windows, scheduling or cancelling a visit, marking a visit attended, paying a bonus, and publishing creator content to Facebook. Those stay in the app — so you can configure a program and write its brief from here, but a human still has to launch it.

---
