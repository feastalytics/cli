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

### Booking windows

`listAvailability` (no arguments, **org-wide** — filter by `locationId` or `campaignId` yourself), `createAvailability`, `updateAvailability`, `deleteAvailability`.

A window's `block` is one of two shapes: `once`, with a `utcStart` and `utcEnd`; or `weekly`, with start and end hour/minute, the `utcDaysOfWeek` it repeats on, and `blockUtcStart` for when the repetition begins.

**Everything is UTC and the restaurant will describe it in local time.** For weekly blocks `utcDaysOfWeek` is the day of week *in UTC*, so an evening local window that crosses midnight UTC lands on the **following** day — 9pm Friday New York is 02:00 Saturday UTC, and writing `Friday` there opens the wrong night. Convert the day and the time together, never just the time. This fails silently: you get a valid window on a day nobody asked for.

**Set `campaignId`, not just `locationId`.** It's optional in the schema and required by the task — *Set booking windows* completes only when a window carries the first campaign's id. Without it the window books fine and the task stays open forever.

`updateAvailability` replaces `block` whole rather than merging it, so send the complete block including the parts you aren't changing, and it returns nothing — re-read with `listAvailability` to confirm. `deleteAvailability` **succeeds silently on an id that doesn't exist**, so no error is not proof anything was removed; take ids from `listAvailability`. Deleting closes future slots but does not cancel visits already booked inside the window — those are separate rows.

### The creative brief

`createCreativeStrategy` has two paths behind one tool, and only one of them finishes synchronously:

- **`awareness`** — assembled from a fixed template and saved before the call returns. `generationStatus` comes back `complete`.
- **`cta`** — handed to a background LLM. You get a `strategyId` and `generationStatus: "generating"` immediately. **Poll `getCreativeStrategy` until it reads `complete` or `failed`** before using the brief or quoting anything from it.

`getCreativeStrategy` is the one tool that takes `organizationId` in its input rather than from `--org` — it also serves the creator-facing brief pages. Pass the organization you're acting on.

`updateCreativeStrategy` is the revision step. Two things to get right: omitting `strategyId` **creates a new strategy** instead of editing the one you meant, and it replaces the fields you send rather than merging them — so read first, apply your edits to the full `concepts` array, and send the whole thing back. Generating into a strategy that isn't still a draft is rejected rather than silently overwritten.

### Recruitment creatives and the recruitment ad

The ads that bring applicants in are CLI-drivable end to end:

1. `createRecruitmentCreatives` with the `campaignId` — it resolves (or creates) the campaign's recruitment offer itself, which is what groups the creatives and carries the monthly sourcing cap. Each run calls an image model per missing type; `force` deletes and regenerates the whole set, so don't pass it casually.
2. `listCreatives` — each creative's `imageKey` is the reference `planAds` takes as a `libraryAsset`; `staleCreativeIds` flags creatives generated from an older version of their offer.
3. Publish through the `recruitment` template in `ads.md`, declaring the **`linkRecruitmentOffer` effect** — the publish is refused without it. The effect stamps the creatives, links the offer (which the sourcing cap and dashboard spend read), and texts the program's approver that sourcing is live.
4. Copy rules for the ad live in `facebook.md` (`recruitmentAdCopy` — the creator-facing half; conflating it with guest copy is the classic failure).

`markCreativesPublished` is only the fallback for recording ads created outside `publishAds` or repairing an effect that reported `error`.

### The decision loop

1. `listCreatorApplications` — the approval queue, newest first, across every location. Takes no arguments. Use this rather than querying the data model: it carries **`instagramFollowerCount`**, which is usually the deciding factor and isn't reachable any other way.
2. `updateCreatorVisit` with `{ "eventId": "...", "status": "approved" | "denied" }`. **This texts the creator immediately** — approved sends their booking link and creative brief, denied sends a decline and is not reversible from here. It also **consumes the location's monthly creator sourcing allowance**, and recruitment auto-pauses once that limit is reached, so an approval is both a message and a spend. Confirm with the user before working through a queue; don't batch-approve on your own initiative. Approving a row that is no longer actionable is a no-op and comes back with `changed: false` rather than texting twice.

   The same tool is how you reschedule and how you record what happened. `startTime` moves the visit and texts the creator the new time; `status` also accepts `pending_approval`, `confirmed`, `visited`, `missed`, `issue` and `cancelled`. Pass `sideEffects: false` to write the fields silently — no creator text, no allowance spend, no post-approval automation — which is what you want when you are correcting a record after the fact rather than making the decision now.
3. The creator books, visits, and submits content on their own — none of that is driven from here.
4. `listCreatorSubmissions` with `{ "status": "submitted" }` (and `"revision_requested"`) — the content review queue. Submissions are stored outside the queryable data model, so this tool is the only way to read them.
5. `decideCreatorSubmission` — `approved`, `rejected`, `revision_requested`, or `under_review`. **This texts the creator too.** `revision_requested` sends your `feedbackMessage` verbatim plus a resubmit link, so write it as something the creator will read, not an internal note. Approving queues their bonus payout. `approvalType` defaults to `"ad"` (the content may run in paid ads) and is rejected when the board's bonus is $0 — use `"organic"` when it's just for their own channels.

### Paying the bonus

`createInfluencerPayout` charges the organization's card and starts the creator's bonus on its way. **Never call it on your own initiative** — every call needs the client's explicit, fresh approval to pay this specific creator; a standing instruction doesn't count. The endpoint enforces its own preconditions (an ad-approved submission, no payout already active for the visit — one per visit), the amount comes from the board config grossed up to cover the Stripe fee, and after the charge Stripe webhooks carry it to the creator with no further action from you. Follow progress in `queryData` `creators.creatorPayout`, joined to the visit on `visitEventId`.

### Conversations

`listCreatorConversations` is the "who is waiting on a reply" queue: every creator's SMS thread with `hasUnread`, the last message body and direction, and a derived `visitStatus` chip that's more reliable than reading raw columns.

`getCreatorConversation` with a row's `userId` loads the full thread behind it, newest first. Read it before characterizing an exchange or drafting a reply for the human — the queue's last-message snippet is not enough context to speak for a whole conversation.

**You cannot reply from the CLI, and you cannot clear the unread flag.** Both stay in the dashboard — texting a creator back is the highest-consequence action in this area. Surface who's waiting, read the thread, propose the reply if asked, then hand the user the conversation to send it.

### Everything else: queryData

The `creators` schema exposes `creator` (the person, one row shared across all their applications), `creatorVisitApplication` (one application/visit), and `creatorPayout` (one initiated bonus payout, joined to the visit on `visitEventId`). Join person to visit on `creator.influencerId = creatorVisitApplication.userId`. Use it for anything the tools above don't answer — no-shows, per-location counts, repeat creators, payout history. Content submissions are **not** in the catalog; `listCreatorSubmissions` is the only read.

> **Not exposed:** replying to a creator's texts or marking a conversation read (the dashboard owns creator messaging), the dashboard's launch-program button itself (its bookkeeping rides the recruitment publish effect — see above), and publishing a creator's submitted content as a partnership ad.

---
