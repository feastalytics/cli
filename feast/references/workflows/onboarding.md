# Onboarding and brand

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.


## Onboarding tasks (the taskboard)

`getTaskboard` is the single "what needs fixing or finishing" surface: one `entries` list discriminated by `kind`. `task` entries are the org's onboarding tasks; `issue` entries are live-computed misconfigurations with a `fixHint`. Scope with `{"scope":{"type":"onboarding"}}` for tasks only, `{"type":"task","task":{"taskId":"..."}}` for one task, or leave the default `all`.

- **Start from `completionInstructions`, not guesswork.** Every task entry says exactly what completes it and whether it needs a human in a browser. Trust it over inferring from the task name.
- **Split the work accordingly.** Tasks like campaigns, automations, funnel fixes, and rewards are completable through the workflows above — do them. Tasks that need OAuth (Facebook, POS), purchases (phone number), device setup, image uploads, or in-restaurant staff training cannot be done from the CLI: hand the user that task's **`completionUrl`** — a page where they complete exactly that task. Paste the URL directly in your reply; in the dashboard chat it opens the task next to the conversation, and in a terminal it's clickable.
- **Never claim a task complete or try to mark one.** Statuses are derived from live data by a recompute (triggered by every taskboard read, ~30s lag) — do the underlying work, then re-read the taskboard to confirm the checkmark flipped.
- Working through onboarding = repeat: `getTaskboard` (scope `onboarding`) → do the CLI-doable incomplete required tasks → hand over completionUrls for the rest → re-read to verify.

---

## Establishing brand identity

**Not exposed to the CLI yet.** Brand setup (logo, colors, fonts, subdomain look) writes to several untagged endpoints, and the intelligent part — auto-extracting a usable palette from a scraped brand with WCAG-contrast derivation and logo selection — lives entirely in the browser, not the API. A brand-import endpoint exists only as a raw scrape (unfiltered logos/colors). If asked, tell the user brand setup isn't CLI-drivable yet.
