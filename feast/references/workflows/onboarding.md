# Onboarding and brand

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.


## Onboarding tasks (the taskboard)

`getTaskboard` is the single "what needs fixing or finishing" surface: one `entries` list discriminated by `kind`. `task` entries are the org's onboarding tasks; `issue` entries are live-computed misconfigurations with a `fixHint`. Scope with `{"scope":{"type":"onboarding"}}` for tasks only, `{"type":"task","task":{"taskId":"..."}}` for one task, or leave the default `all`.

- **Start from `completionInstructions`, not guesswork.** Every task entry says exactly what completes it and whether it needs a human in a browser. Trust it over inferring from the task name.
- **Split the work accordingly.** Campaigns, automations, funnel fixes, rewards, brand identity, the phone number, image uploads and the onboarding form are all completable through CLI tools — do them. Tasks that need OAuth (Facebook, POS), physical device setup, or in-restaurant staff training cannot be: hand the user that task's **`completionUrl`** — a page where they complete exactly that task. Paste the URL directly in your reply; in the dashboard chat it opens the task next to the conversation, and in a terminal it's clickable.
- **Never claim a task complete or try to mark one.** Statuses are derived from live data by a recompute (triggered by every taskboard read, ~30s lag) — do the underlying work, then re-read the taskboard to confirm the checkmark flipped.
- Working through onboarding = repeat: `getTaskboard` (scope `onboarding`) → do the CLI-doable incomplete required tasks → hand over completionUrls for the rest → re-read to verify.

## The onboarding form

Some tasks read self-reported answers rather than observed data — launch date, funnel direction, per-step `isComplete` markers. `getOnboardingForm` reads them (`null` when the org has no form yet); `updateOnboardingForm` writes them. **Nested step objects are replaced, not merged** — read first and send back the whole step you're editing (`data` is the exception and is merged). Setting `pos.details.type` to `"other"` provisions a manual-entry POS location as a side effect.

Two POS setup tasks complete off `updateOrganization` instead: `staffInstructions.scan` completes *Members Program Visits POS setup*, and `.prepaid` is additionally required for *Campaign POS setup* when the promotion allows pre-pay. `staffInstructions` is replaced wholesale — send every key you want to keep.

## Establishing brand identity

1. `searchGooglePlaces` — resolve the restaurant to its Google Place. Include the city in the query; only trust `confidentMatch` when it's non-null, otherwise show the candidates and let the customer pick.
2. `createBrandIdentity` — the branded site: a subdomain, layout config, and a full default screen tree. The subdomain is claimed **across all organizations** and gates everything funnel-shaped downstream, so confirm the name with the customer first. Get `logoUrl` via `getMediaUploadUrl`.
3. `updateBrandIdentity` — business data, theme, tracking pixel IDs, OpenTable links, and the Google Place link. It deep-merges, so send only what you're changing. **Setting `googleConfig.placeId` enqueues a review/photo scrape; changing an existing placeId orphans everything scraped under the old one** — confirm before replacing.

Browser-only: the brand *import* intelligence — auto-extracting a usable palette and logo from a scraped site lives in the app, not the API. If the customer wants that flow, hand them the dashboard.

## Plumbing the taskboard leans on

- **Phone number** — `searchAvailablePhoneNumbers` (free, search by the restaurant's own postal code or coordinates — proximity beats a memorable area code) then `purchaseAndConfigurePhoneNumber`, which **bills the account irreversibly**. Establish where the restaurant actually is before buying.
- **Media** — `getMediaUploadUrl` (PUT the bytes to the presigned URL, then reference the returned key), `listMedia`, `deleteMedia`. This is how logos and offer images get in from the CLI.
- **Team** — `inviteUser` sends a real email immediately and **defaults to OWNER** (full billing access) — always pass `role` explicitly; VIEWER is read-only, SCANNER is for staff running the scanner app.
- **Billing** — `getBillingStatus`, read-only: `hasAccess` answers "can they use the product," `needsPayment` flags the states worth acting on. Every billing write stays in the dashboard.
