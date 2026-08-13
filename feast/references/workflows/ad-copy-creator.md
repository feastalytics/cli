# Creator-recruitment ad copy (`recruitmentAdCopy`)

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

This is the creator-facing half of Meta ad copy: `recruitmentAdCopy`, which sells a paid collaboration to a content creator shopping for brand deals.

**Writing to guests instead? Read `ad-copy-guest.md` and not this file.** `adCopy` sells the offer and the food to a hungry local scrolling past — a different audience and a completely different pitch. Conflating the two is the failure mode in this area, and it has happened repeatedly. A creator is not a customer; the food is their perk, not the pitch. If you catch yourself writing "claim your voucher" here, stop and start over.

For the creator program itself — applicants, visits, briefs, the decision loop — read `creators.md`. Publishing the finished ad is a separate job with its own loop — read `ads.md`.

**You write the copy yourself.** The dashboard has a "generate copy" button behind an LLM call; there is no CLI equivalent and you shouldn't want one, because it would be you calling an HTTP endpoint in order to call a model. The copy lands on a plain field of the campaign record, so saving it is trivial and covered at the bottom of this file. Everything between here and there is the part that's actually hard.

## Variations: write a set, not a single

Meta's Advantage+ creative optimization tests combinations of headlines and primary texts against each other, so you're writing a *set* — several headlines and several primary texts that genuinely differ.

**Genuinely** is the load-bearing word. There is no required count. Three sharp variations that each take a real angle beat five where two are padding, and a set of near-identical rewrites teaches the optimizer nothing. Write as many as the collab actually supports. Judge it, and stop when the next variation would be filler.

The other reason to write more than one is that the restaurant may want to pick, and people form opinions by seeing alternatives rather than by being handed a single answer. So offering the set is usually the right move — but you have taste, and you should use it. Recommend the one you'd launch and say why. Cut the weak ones before anyone sees them rather than padding them in to look thorough. Three you'd defend beats five you wouldn't.

## The audience

**Local food and lifestyle content creators** on Instagram and TikTok — someone scrolling for brand collabs, not a hungry person hunting a deal. The ad is decoupled from any consumer campaign the restaurant is running, *even if one is running right now*. Your job is to get the right creator to tap "Learn More" on a landing page that explains the collab in full — not to close the deal inside the ad.

## Absolute rules — this is exactly where past generations went wrong

- **Never mention an offer, deal, voucher, promotion, discount, "claiming" anything, or pre-paying.** This is a collaboration, not a customer offer.
- **Don't pitch the food the way you'd pitch it to a diner.** The food is the perk; the collab is the pitch.
- **No customer-facing language** — "claim your voucher", "come hungry", "limited time offer", "this week only", "tap below to save".
- **Don't reuse the campaign's guest-facing framing** — banner copy, promotions, offer headlines. None of it belongs here, however good it is.
- **If there's a cash bonus, never imply it's automatic or guaranteed.** It is earned only if the restaurant selects the creator's reel to run as a paid ad. Phrasings like "earn a $100 bonus", "get a $100 bonus when you post", or "$100 bonus if you nail the brief" read as guaranteed-on-completion, and they have caused real creators to demand a bonus they hadn't earned. Always frame it conditionally: "a chance to earn", "up to", "if your reel gets picked to run as an ad".

## What to pitch

- The restaurant is booking local food/lifestyle creators to come in, eat on the house, and post a short reel.
- **The creator gets:** a dining credit (order whatever they want), a creative brief with style direction but no script — they stay authentic — and, when acquisition is enabled, their reel boosted as a paid partnership ad alongside the restaurant's Instagram, which is free promotion to thousands of local foodies plus followers and engagement on their own page. Where a bonus exists, add it conditionally.
- **The creator gives:** one 30–60 second vertical reel (Instagram Reel / TikTok), filmed during the visit, submitted within 72 hours.
- **Eligibility:** an active food/lifestyle creator with a minimum local-area follower count on Instagram or TikTok.

## Angles — rotate across the set

With a bonus: **get paid** ("Get paid to eat at X") → **free food + free promotion**, both sides of the exchange → **local creator call-out** ("Local foodies on IG — we want you") → **grow your page**, the boost and the new followers → **straightforward collab pitch**, no fluff: free meal + paid post + bonus.

Without a bonus, swap the first for **free food collab** ("Eat on us at X"), and grow-your-page for **brand partnership** (a collaboration, not a giveaway) or **behind-the-scenes** (be part of the restaurant's story).

Take as many of these as the collab genuinely supports rather than filling a quota.

## Tone

Talk like a brand DM'ing a creator about a collab, not like a restaurant running an ad. Confident, peer-to-peer, slightly insider: "We're partnering with…", "We're booking creators for…", "Looking for local foodies who…".

Specifics over fluff — name the dollar amounts, the deliverable (one reel, 30–60s), the eligibility. Emoji fine in moderation (📸 🎥 🍴), don't spam. **Separate every sentence with a blank line (two newlines)** — each sentence has to stand alone visually, because a paragraph is a wall and a wall gets skipped.

**GOOD primary text:**

```
Plum Vietnamese is booking local food creators this month. 📸

You get a $30 tab on us, a creative brief, and a chance to earn a $100 bonus if your reel gets run as a paid ad.

We'll also boost it as a partnership ad — free promo to thousands of local foodies. 1,000+ local IG/TikTok followers to apply.
```

**GOOD headlines:** `Get paid to post about Plum` · `Local creators — eat free, post a reel` · `Foodies w/ 1,000+ followers, read this 👀`

**BAD — do not generate this:**

```
Free meal at Plum Vietnamese this week! Claim your voucher and come hungry — you won't want to miss this deal. 🍴
```

That's a customer offer wearing a creator ad's clothes. Every one of "free meal", "claim your voucher", "come hungry" and "this deal" is independently disqualifying. Note what the good version does instead: it names the restaurant as the one doing the booking, states the exchange in plain numbers, and gates on follower count — so the wrong reader self-selects out in the first line.

## The terms are baked into the copy — record them

`foodCreditCents`, `creatorPayoutCents` and `minFollowerCount` on `recruitmentAdCopy` record the terms your copy actually stated. The dashboard compares them against the live creator board config and flags the copy as drifted when they diverge — so if you write "$30 tab" and leave them unset, nobody finds out when the credit later changes to $50 and the ad starts lying.

**Read the creator board config with `getInfluencerBoardConfig` first** — the dining credit, the bonus and the follower minimum live there and nowhere else. Write those exact numbers into the copy, and mirror them into these fields (in **cents** for the two money fields). Don't guess them, and don't ask the user for numbers the config already has.

The creator landing page is `/creator-landing` on the org's subdomain with `orgId`, `locId`, `campaignId` and UTM params — fiddly enough that you should reuse the existing `recruitmentAdCopy.landingPageUrl` when the campaign already has copy, rather than reconstructing it.

## Saving it

One `updateCampaign` call writes `recruitmentAdCopy`. Run `feast describe updateCampaign` for the fields — alongside the headlines and primary texts it wants the landing page URL, the creative mix, a timestamp, and optional indices for the variation you're recommending.

**The one thing the schema won't tell you: `update.adCopy` replaces the whole object rather than merging into it.** Read the campaign with `getCampaign` first and send back everything you want kept, not just what changed.

## Publishing

**CLI-drivable — read `ads.md`.** The loop is `listAdTemplates` → gather variables → `planAds` → `publishAds` (with its effects) → `getJob` → `setAdCampaignStatus`, and that file carries the ordering, the idempotency-key discipline, and the effect declarations that make the publish self-bookkeeping.

---

> **Not exposed:** ad copy generation (write it yourself, per above). Read `references/links.md` before writing any dashboard link you hand over.
