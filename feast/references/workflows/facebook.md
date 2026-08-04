# Meta ads

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

Two jobs live under Meta ads: **writing the ad copy** and **publishing the ad**. Only the first is CLI work today.

**You write the copy yourself.** The dashboard has a "generate copy" button behind an LLM call; there is no CLI equivalent and you shouldn't want one, because it would be you calling an HTTP endpoint in order to call a model. The copy lands on a plain field of the campaign record, so saving it is trivial and covered at the bottom of this file. Everything between here and there is the part that's actually hard.

## First: which audience are you writing for?

Two fields, two completely different pitches:

- **`adCopy`** — guest-facing. Sells the offer and the food to a hungry local scrolling past.
- **`recruitmentAdCopy`** — creator-facing. Sells a paid collaboration to a content creator shopping for brand deals.

**Conflating them is the failure mode in this area — it has happened repeatedly.** A creator is not a customer; the food is their perk, not the pitch. Decide which one you're writing before you write a word, and then read only that section below. If you catch yourself writing "claim your voucher" in a recruitment ad, stop and start over.

## Variations: write a set, not a single

Meta's Advantage+ creative optimization tests combinations of headlines and primary texts against each other, so you're writing a *set* — several headlines and several primary texts that genuinely differ.

**Genuinely** is the load-bearing word. There is no required count. Three sharp variations that each take a real angle beat five where two are padding, and a set of near-identical rewrites teaches the optimizer nothing. Write as many as the campaign actually supports: a rich offer with a strong landing page and a distinctive neighbourhood might carry five; a thin one-line promo might only honestly carry three. Judge it, and stop when the next variation would be filler.

The other reason to write more than one is that the restaurant may want to pick, and people form opinions by seeing alternatives rather than by being handed a single answer. So offering the set is usually the right move — but you have taste, and you should use it. Recommend the one you'd launch and say why. Cut the weak ones before anyone sees them rather than padding them in to look thorough. Three you'd defend beats five you wouldn't.

---

## Guest-facing copy (`adCopy`)

### Read before you write

Generic copy is the failure mode, and specifics are the entire job. The difference between an ad that works and one that doesn't is almost never cleverness — it's whether the copy contains something only this restaurant could have said. So go get those things first:

1. `loadCurrentOrganization` — brand name, cuisine, and the subdomains in `subdomains2[].subdomain`.
2. `getCampaign` — `name`, `description`, `bannerConfig`, `promotions`, `referrers`, `shorthand`.
3. `listFunnelScreens` `{ "referrer": "<subdomain>", "campaignId": "<id>" }` — **the actual landing-page copy the guest sees after the click.** This is your source of truth for congruence: the trip from ad to landing page should feel like one continuous thing, not a bait-and-switch. Copy that promises something the landing page doesn't deliver burns the click.
4. `dfyListOffers` / `dfyGetMenuHierarchy` — real item names and real prices, not approximations of them.

The landing page URL is `https://{referrer}.feastalytics.com/campaign/{campaignId}`, using a referrer from the campaign's own `referrers` rather than just the org's first subdomain.

Mine all of it for things a human would actually remember: opening dates, the street, menu item names, sweepstakes mechanics, numbers, proper nouns. **If the source has real specifics and your copy says "taco time!", you did it wrong.** When you finish a draft, check that you couldn't paste it onto a different restaurant's campaign without anyone noticing.

### Headlines — each ≤ 40 characters

The headline appears *below* the image or video. Forty characters is a hard ceiling; Meta truncates past it, and a headline that dies mid-word looks broken.

Each headline in your set should take a **different angle**. These five are the ones that work for local restaurants — a menu to pick from, not a checklist to complete:

1. **Value** — lead with what they get: the offer, the free item, the deal. The safest angle and usually the strongest, because it answers "what's in it for me" before anyone has to think.
2. **Curiosity** — make them need to find out ("This spot on Fillmore is hiding something…"). Works only when there's a real answer waiting on the landing page; curiosity with nothing behind it reads as clickbait.
3. **Social proof** — popularity or local reputation ("The neighborhood's worst-kept secret"). Borrows credibility the restaurant already earned.
4. **Urgency** — time pressure or scarcity ("This week only", "Limited spots"). Only when it's true. Manufactured urgency on an evergreen offer is the fastest way to sound like every other ad in the feed.
5. **Locality** — the neighborhood, the street, the local identity. The one angle a national chain can't copy, and often the most distinctive thing available to you.

No generic marketing language. Write like a person, not a brand.

### Primary text — each 2–4 sentences

The primary text appears *above* the image or video. It's the first thing anyone reads, and it's read in a fast scroll on a phone.

**The formatting rule that matters most: separate every sentence with a blank line (two newlines).** Each sentence has to stand alone visually. A paragraph is a wall; a wall gets skipped. This is not optional polish, and it is the single most-ignored rule in this file — check for it explicitly before you save anything.

- No hashtags.
- No "click the link below" / "tap below" — Meta owns the CTA button, and pointing at a link that isn't there is just confusing.
- Emoji are welcome when they add energy or visual punch. **At most one per sentence**, never forced. A well-placed emoji > no emoji > emoji spam.
- Each variation takes a different approach, but all of them must work whether the viewer sees a static image or a video (see `creativeMix` below).

### Voice

Write like you're texting a friend about a spot you're genuinely hyped about. Not like a brand's social media manager. Not like a restaurant's About page.

- Short punchy fragments > grammatically perfect sentences.
- Confidence and excitement > polite and formal.
- Specific details > vague claims ("crispy baguette with savory fillings" > "delicious food").
- Talk **to** the reader, not **at** them.

**BAD** (robotic, corporate, flat):

```
We are giving away a free Coconut Matcha or Sea Salt Coffee with any regular nine inch banh mi. Our sandwiches are made fresh daily with crispy baguettes and savory fillings. Get your voucher and come hungry.
```

**GOOD** (energetic, specific, scroll-stopping):

```
Free Coconut Matcha with any banh mi. 🍵

Yeah, you read that right.

Crispy baguette, savory fillings, and a specialty coffee on the house. Grab your voucher before this one's gone.
```

**BAD:**

```
Our specialty coffees are the perfect sweet treat to balance a savory meal. Right now you can get one completely free when you order a regular banh mi.
```

**GOOD:**

```
Crispy baguette + savory fillings + a free specialty coffee? 👏

That's lunch sorted.

Claim your voucher and come see what the hype is about.
```

Study what actually changes between them. The bad versions aren't wrong on the facts — they carry the same information. They fail because they *announce* where the good ones *react*. "We are giving away" is a press release; "Yeah, you read that right" is a person. The good versions also front-load the hook into the first line, break every sentence onto its own visual row, and trade a complete sentence for a fragment wherever the fragment hits harder. Notice too that neither good version is longer than the bad one it replaces — this is compression, not decoration.

### `creativeMix` changes what the copy may assume

Set this to what's actually true of the assets that will run, then write to it:

- **`static_only`** — the offer is printed on the image. Reference it directly; the viewer always sees it.
- **`video_only`** — videos are awareness-driven and **do not show the offer on screen**. The copy has to stand up with no offer visible: intrigue, the restaurant, the experience.
- **`mixed`** — the hard case. Meta shows some viewers a video with no offer and others a static with the offer front and centre. The copy must read correctly **both** ways, which usually means naming the offer in words rather than gesturing at it ("free matcha with any banh mi", not "check out the deal above").

Copy that only makes sense next to a visible offer, running as `mixed`, will quietly underperform for half the audience.

### Video-led campaigns: the one thing you can't do

The in-app generator **feeds the video assets to the model as multimodal input** and mines them for quotes, moments and on-screen specifics that end up in the copy. **You cannot watch a video from the CLI.**

So for a `video_only` or `mixed` campaign, either work from a description or transcript the user gives you — saying plainly that's what you're working from — or write what you can from the landing page and tell the user the in-app dialog will do better here, because it can see the footage. Don't quietly produce video-campaign copy that never references the video and present it as equivalent. It isn't.

---

## Creator-recruitment copy (`recruitmentAdCopy`)

**Read this section only when writing `recruitmentAdCopy`.**

The audience is **local food and lifestyle content creators** on Instagram and TikTok — someone scrolling for brand collabs, not a hungry person hunting a deal. The ad is decoupled from any consumer campaign the restaurant is running, *even if one is running right now*. Your job is to get the right creator to tap "Learn More" on a landing page that explains the collab in full — not to close the deal inside the ad.

### Absolute rules — this is exactly where past generations went wrong

- **Never mention an offer, deal, voucher, promotion, discount, "claiming" anything, or pre-paying.** This is a collaboration, not a customer offer.
- **Don't pitch the food the way you'd pitch it to a diner.** The food is the perk; the collab is the pitch.
- **No customer-facing language** — "claim your voucher", "come hungry", "limited time offer", "this week only", "tap below to save".
- **Don't reuse the campaign's guest-facing framing** — banner copy, promotions, offer headlines. None of it belongs here, however good it is.
- **If there's a cash bonus, never imply it's automatic or guaranteed.** It is earned only if the restaurant selects the creator's reel to run as a paid ad. Phrasings like "earn a $100 bonus", "get a $100 bonus when you post", or "$100 bonus if you nail the brief" read as guaranteed-on-completion, and they have caused real creators to demand a bonus they hadn't earned. Always frame it conditionally: "a chance to earn", "up to", "if your reel gets picked to run as an ad".

### What to pitch

- The restaurant is booking local food/lifestyle creators to come in, eat on the house, and post a short reel.
- **The creator gets:** a dining credit (order whatever they want), a creative brief with style direction but no script — they stay authentic — and, when acquisition is enabled, their reel boosted as a paid partnership ad alongside the restaurant's Instagram, which is free promotion to thousands of local foodies plus followers and engagement on their own page. Where a bonus exists, add it conditionally.
- **The creator gives:** one 30–60 second vertical reel (Instagram Reel / TikTok), filmed during the visit, submitted within 72 hours.
- **Eligibility:** an active food/lifestyle creator with a minimum local-area follower count on Instagram or TikTok.

### Angles — rotate across the set

With a bonus: **get paid** ("Get paid to eat at X") → **free food + free promotion**, both sides of the exchange → **local creator call-out** ("Local foodies on IG — we want you") → **grow your page**, the boost and the new followers → **straightforward collab pitch**, no fluff: free meal + paid post + bonus.

Without a bonus, swap the first for **free food collab** ("Eat on us at X"), and grow-your-page for **brand partnership** (a collaboration, not a giveaway) or **behind-the-scenes** (be part of the restaurant's story).

As with guest copy, take as many of these as the collab genuinely supports rather than filling a quota.

### Tone

Talk like a brand DM'ing a creator about a collab, not like a restaurant running an ad. Confident, peer-to-peer, slightly insider: "We're partnering with…", "We're booking creators for…", "Looking for local foodies who…".

Specifics over fluff — name the dollar amounts, the deliverable (one reel, 30–60s), the eligibility. Emoji fine in moderation (📸 🎥 🍴), don't spam. The blank-line-between-sentences rule applies here too.

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

### The terms are baked into the copy — record them

`foodCreditCents`, `creatorPayoutCents` and `minFollowerCount` on `recruitmentAdCopy` record the terms your copy actually stated. The dashboard compares them against the live creator board config and flags the copy as drifted when they diverge — so if you write "$30 tab" and leave them unset, nobody finds out when the credit later changes to $50 and the ad starts lying.

**You can't read the creator board config from the CLI.** Ask the user for the dining credit, the bonus and the follower minimum, write those exact numbers into the copy, and mirror them into these fields (in **cents** for the two money fields). Don't guess them.

The creator landing page is `/creator-landing` on the org's subdomain with `orgId`, `locId`, `campaignId` and UTM params — fiddly enough that you should reuse the existing `recruitmentAdCopy.landingPageUrl` when the campaign already has copy, rather than reconstructing it.

---

## Saving it

One `updateCampaign` call writes `adCopy` or `recruitmentAdCopy`. Run `feast describe updateCampaign` for the fields — alongside the headlines and primary texts it wants the landing page URL, the creative mix, a timestamp, and optional indices for the variation you're recommending.

**The one thing the schema won't tell you: `update.adCopy` replaces the whole object rather than merging into it.** Read the campaign with `getCampaign` first and send back everything you want kept, not just what changed.

## Publishing

**Not yet possible from the CLI.** Creating the ad in Meta — ad account, page, budget, targeting, creative — stays in the dashboard for now. Write the copy, then hand the user the campaign's `ads` panel (or `creative-strategy` for recruitment) to publish it.

---

> **Not exposed:** ad copy generation (write it yourself, per above), marking copy as pushed to Meta, and everything to do with creating, editing or pausing a live Meta ad. Read `references/links.md` before writing the dashboard link you hand over.

---
