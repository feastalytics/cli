# Creator sourcing

Restaurants recruit local creators to visit and post about them. A recruitment ad brings applicants in; from there it's a queue of decisions: approve the applicant, then later approve the content they made. Both decisions text the creator, so neither is a quiet status change.

### The model: the application IS the visit row

There is no separate application object. One row covers a creator's whole journey with a location, and you read the stage off its columns rather than a single status field:

- `approvalStatus` `pending_approval` → awaiting your decision, then `approved` or `denied`.
- `startTime` **null** on an approved row → they're approved but haven't booked yet. Set → scheduled.
- `preVisitConfirmationStatus` `confirmed` → they confirmed they're coming.
- `postVisitFollowUpSentAt` set → the visit is done.

**Gotcha:** denying an application stamps `postVisitFollowUpSentAt` and every content follow-up with the current time, as the way to suppress the remaining message sequence. So a denied row looks *completed* on those timestamps. Always pair a timestamp check with `approvalStatus == "approved"`.

### Setting up the program

The program lives on a **location**, not the organization: one config per `locationId`, which you get from `queryData interface.location`.

`updateInfluencerBoardConfig` is an **upsert**. There is no create tool: call it for a location with no program and it writes one, seeding a 5000-cent dining credit and leaving `landingPageConfirmed`, `passConfigured` and `reimbursementEnabled` false. Omitted fields are left alone on subsequent calls. `foodCreditAmountCents` has a floor of 2500.

**Every program is apply-only.** Creators apply, the approver reviews them, and the creator AI agent texts approved creators to book the visit. There is no scheduling mode to choose.

**The setup task and the launch check agree.** The *Design creator program* task and the launch both need a positive credit and `landingPageConfirmed: true`. Since the credit is seeded at 5000 and can't go below 2500, `landingPageConfirmed` is the one field you actually have to set.

Other fields worth knowing on the same call:

- **`maxCreatorsPerMonth`** caps how many creators the location's recruitment ads source per calendar month. When the cap is reached every recruitment campaign at the location pauses automatically until the 1st of the next month; changing or clearing the cap (`null`) reconciles the campaigns immediately, so raising it can restart paused ads.
- **`agentPaused: true`** turns the creator AI agent off for the location: no AI replies, visit reminders or content follow-ups until it is set back to `false`. Texts sent by people (including `sendText`) deliver as usual.
- **`reimbursementEnabled`** switches the board from comping the meal to reimbursing a meal the creator paid for, and `foodCreditAmountCents` becomes the reimbursement cap rather than a dining credit. It changes what creators are promised on the landing page, brief and rights agreement, so **never set it unless the client asks for it**. See *Reimbursing boards* below.

`getInfluencerBoardConfig` returns the config (or `null`) plus the location's recruitment offers. **Read it before writing recruitment copy**: the dining credit, creator bonus and follower minimum you're supposed to quote live here and nowhere else. It's also how you check the bonus is non-zero before calling `decideCreatorSubmission` with `approvalType: "ad"`.

### Booking windows

`listAvailability` (no arguments, **org-wide**: filter by `locationId` or `campaignId` yourself), `createAvailability`, `updateAvailability`, `deleteAvailability`.

A window's `block` is one of two shapes: `once`, with a `utcStart` and `utcEnd`; or `weekly`, with start and end hour/minute, the `utcDaysOfWeek` it repeats on, and `blockUtcStart` for when the repetition begins.

**Everything is UTC and the restaurant will describe it in local time.** For weekly blocks `utcDaysOfWeek` is the day of week *in UTC*, so an evening local window that crosses midnight UTC lands on the **following** day: 9pm Friday New York is 02:00 Saturday UTC, and writing `Friday` there opens the wrong night. Convert the day and the time together, never just the time. This fails silently: you get a valid window on a day nobody asked for.

**Set `campaignId`, not just `locationId`.** It's optional in the schema and required by the task: *Set booking windows* completes only when a window carries the first campaign's id. Without it the window books fine and the task stays open forever.

`updateAvailability` replaces `block` whole rather than merging it, so send the complete block including the parts you aren't changing, and it returns nothing: re-read with `listAvailability` to confirm. `deleteAvailability` **succeeds silently on an id that doesn't exist**, so no error is not proof anything was removed; take ids from `listAvailability`. Deleting closes future slots but does not cancel visits already booked inside the window; those are separate rows.

### The creative brief

`createCreativeStrategy` has two paths behind one tool, and only one of them finishes synchronously:

- **`awareness`**: assembled from a fixed template and saved before the call returns. `generationStatus` comes back `complete`.
- **`cta`**: handed to a background LLM. You get a `strategyId` and `generationStatus: "generating"` immediately. **Poll `getCreativeStrategy` until it reads `complete` or `failed`** before using the brief or quoting anything from it.

`updateCreativeStrategy` is the revision step. Two things to get right: omitting `strategyId` **creates a new strategy** instead of editing the one you meant, and it replaces the fields you send rather than merging them, so read first, apply your edits to the full `concepts` array, and send the whole thing back. Generating into a strategy that isn't a draft is rejected rather than silently overwritten.

### Recruitment creatives and the recruitment ad

The ads that bring applicants in are tool-drivable end to end:

1. `createRecruitmentCreatives` with `{ "locationId": "...", "foodCredit": ..., "campaignId": "..." }`. `locationId` and `foodCredit` are required; take the credit from `getInfluencerBoardConfig`. Pass `campaignId` and the tool resolves (or creates) the campaign's recruitment offer itself, which is what groups the creatives and carries the monthly sourcing cap; pass `offerId` instead only when you already have the exact offer. One of the two is needed, or the creatives are generated, charged for, and attached to nothing. Each run calls an image model per missing type; `force` deletes and regenerates the whole set, so don't pass it casually.
2. `listCreatives`: each creative's `imageKey` is the reference `planAds` takes as a `libraryAsset`; `staleCreativeIds` flags creatives generated from an older version of their offer.
3. Publish through the `recruitment` template in `ads.md`, declaring the **`linkRecruitmentOffer` effect**; the publish is refused without it. The effect stamps the creatives, links the offer (which the sourcing cap and dashboard spend read), and texts the program's approver that sourcing is live.
4. Copy rules for the ad live in `ad-copy-creator.md` (`recruitmentAdCopy`; conflating it with guest copy is the classic failure).

### The decision loop

1. `listCreatorApplications`: the approval queue, newest first, across every location. Takes no arguments. Use this rather than querying the data model: it carries **`instagramFollowerCount`**, which is usually the deciding factor and isn't reachable any other way. Each row also carries the brief assigned to the visit as `strategyId`/`strategyTitle`. **Check `strategyId` is non-null before approving**: the approval text links whatever brief the visit carries at that moment. No tool assigns a brief to a visit, so when it is null, have the user assign one in the dashboard first.
2. `updateCreatorVisit` with `{ "eventId": "...", "status": "approved" | "denied" }`. **This texts the creator immediately**: approved sends their booking link and creative brief, denied sends a decline. A denial is reversible: approving a denied row later sends a "we changed our mind" text and re-arms the scheduled texts. Approval also **consumes the location's monthly creator sourcing allowance**, and recruitment auto-pauses once that limit is reached, so an approval is both a message and a spend. Confirm with the user before working through a queue; don't batch-approve on your own initiative. **Preview first with `dryRun: true`**: it returns the exact creator text(s) the same call would send and writes nothing, so show the user that before the real call. Approving a row that isn't actionable is a no-op and comes back with `changed: false` rather than texting twice.

   The same tool is how you reschedule and how you record what happened. `startTime` set to a date texts the creator a confirmation and alerts the approver; `null` clears the time and texts the creator asking for a new one. `startTime` is rejected while the row is `pending_approval` and in any call that passes `status: "approved"`, so approve first, then set the time in a second call (`status: "pending_approval"` clears the time itself; don't pass `startTime` with it). `status` also accepts `confirmed`, `visited`, `missed`, `issue` and `cancelled`; of these only `cancelled` texts the creator. `locationId` moves the visit to another location with a creator program and texts no one, so tell the creator yourself. `notes` sets staff notes shown on the scanner, never sent to the creator. Pass `sideEffects: false` to make any update silent (same field writes, but no creator text, no allowance spend, no post-approval automation), which is what you want when correcting a record after the fact rather than making the decision now.
3. The creator books, visits, and submits content on their own; none of that is driven from here.
4. `listCreatorSubmissions` with `{ "status": "submitted" }` (and `"revision_requested"`): the content review queue. Submissions are stored outside the queryable data model, so this tool is the only way to read them.
5. `decideCreatorSubmission`: `approved`, `rejected`, `revision_requested`, or `under_review`. **This texts the creator too**, unless you pass `skipApprovalText: true` (use that only for silent record corrections). `revision_requested` sends your `feedbackMessage` verbatim plus a resubmit link, so write it as something the creator will read, not an internal note. Approving queues their bonus payout. **Always pass `approvalType` explicitly**: `"ad"` means the content may run in paid ads and is rejected when the board's bonus is $0; `"organic"` is for content only on their own channels, and earns no payout.

### Paying the bonus

`createInfluencerPayout` with `{ "eventId": "..." }` charges the organization's card and starts the creator's bonus on its way. **Never call it on your own initiative**: every call needs the client's explicit, fresh approval to pay this specific creator; a standing instruction doesn't count. The endpoint enforces its own preconditions (a submission approved with `approvalType: "ad"`, no payout already active for the visit: one per visit). The amount defaults to the bonus stamped on the submission when it was approved (falling back to the board config), grossed up to cover the Stripe fee; pass `amountCents` only when the client explicitly asks to pay this one creator a different amount. A visit whose only attempts are FAILED or REFUNDED may be retried, which voids the earlier attempt's open invoice first. After the charge, Stripe webhooks carry it to the creator with no further action from you. Follow progress in `queryData` `creators.creatorPayout`, joined to the visit on `visitEventId`.

### Reimbursing boards

On a board with `reimbursementEnabled`, the creator pays for the meal and uploads a receipt with their submission, and the client pays them back by their own means (up to the `foodCreditAmountCents` cap). `markReimbursementPaid` with `{ "submissionId": "...", "reimbursementPaidNote": "..." }` **moves no money**: it only records that the client already sent it. **Call it only after the client tells you the money has gone out.** The submission must be approved with its reimbursement pending; a submission with no receipt was never on a reimbursing board and is rejected. Read the receipt total (`receiptTotalCents`) and `reimbursementStatus` off the `listCreatorSubmissions` row before recording anything.

### Conversations

`listCreatorConversations` is the "who is waiting on a reply" queue: every creator's SMS thread with `hasUnread`, the last message body and direction, and a derived `visitStatus` chip that's more reliable than reading raw columns.

`getCreatorConversation` with a row's `userId` loads the full thread behind it, newest first. Read it before characterizing an exchange or drafting a reply; the queue's last-message snippet is not enough context to speak for a whole conversation.

**Replying is `sendText` with `{ "to": { "type": "creator", "userId": "..." }, "message": "..." }`.** It is a real SMS, sent immediately, with no undo and no scheduling. **Show the user the exact text and get their go-ahead before sending**; drafting is yours, sending is theirs to approve. Use `type: "creator"` for a creator thread even if the person also holds a guest pass. One recipient per call; there is no bulk form. Creator messages are sent verbatim (no handlebars). Sending also dismisses any reply the AI agent has staged for that creator and re-runs the agent with your message in context, so it doesn't talk over you. Marking a conversation read is the one thing that stays in the dashboard.

### Everything else: queryData

The `creators` schema exposes `creator` (the person, one row shared across all their applications), `creatorVisitApplication` (one application/visit), and `creatorPayout` (one initiated bonus payout, joined to the visit on `visitEventId`). Join person to visit on `creator.influencerId = creatorVisitApplication.userId`. Use it for anything the tools above don't answer: no-shows, per-location counts, repeat creators, payout history. Content submissions are **not** in the catalog; `listCreatorSubmissions` is the only read.

> **Not exposed:** marking a creator conversation read, assigning a brief to a visit, the dashboard's launch-program button itself (its bookkeeping rides the recruitment publish effect, see above), and publishing a creator's submitted content as a partnership ad.
