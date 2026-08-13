# Guest-facing ad copy (`adCopy`)

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

This is the guest-facing half of Meta ad copy: `adCopy`, which sells the offer and the food to a hungry local scrolling past.

**Writing to creators instead? Read `ad-copy-creator.md` and not this file.** `recruitmentAdCopy` sells a paid collaboration to a content creator shopping for brand deals — a different audience and a completely different pitch. Conflating the two is the failure mode in this area, and it has happened repeatedly. A creator is not a customer; the food is their perk, not the pitch.

Publishing the finished ad is a separate job with its own loop — read `ads.md` for that.

**You write the copy yourself.** The dashboard has a "generate copy" button behind an LLM call; there is no CLI equivalent and you shouldn't want one, because it would be you calling an HTTP endpoint in order to call a model. The copy lands on a plain field of the campaign record, so saving it is trivial and covered at the bottom of this file. Everything between here and there is the part that's actually hard.

## Variations: write a set, not a single

Meta's Advantage+ creative optimization tests combinations of headlines and primary texts against each other, so you're writing a *set* — several headlines and several primary texts that genuinely differ.

**Genuinely** is the load-bearing word. There is no required count. Three sharp variations that each take a real angle beat five where two are padding, and a set of near-identical rewrites teaches the optimizer nothing. Write as many as the campaign actually supports: a rich offer with a strong landing page and a distinctive neighbourhood might carry five; a thin one-line promo might only honestly carry three. Judge it, and stop when the next variation would be filler.

The other reason to write more than one is that the restaurant may want to pick, and people form opinions by seeing alternatives rather than by being handed a single answer. So offering the set is usually the right move — but you have taste, and you should use it. Recommend the one you'd launch and say why. Cut the weak ones before anyone sees them rather than padding them in to look thorough. Three you'd defend beats five you wouldn't.

## Read before you write

Generic copy is the failure mode, and specifics are the entire job. The difference between an ad that works and one that doesn't is almost never cleverness — it's whether the copy contains something only this restaurant could have said. So go get those things first:

1. `getOrganization` — brand name, cuisine, and the subdomains in `subdomains2[].subdomain`.
2. `getCampaign` — `name`, `description`, `bannerConfig`, `promotions`, `referrers`, `shorthand`.
3. `listFunnelScreens` `{ "referrer": "<subdomain>", "campaignId": "<id>" }` — **the actual landing-page copy the guest sees after the click.** This is your source of truth for congruence: the trip from ad to landing page should feel like one continuous thing, not a bait-and-switch. Copy that promises something the landing page doesn't deliver burns the click.
4. `queryData` on `interface.catalogItem` — real menu item names and real prices, not approximations of them. It's hierarchical; walk the tree with `parentId` or `catalogItemLink`.

The landing page URL is `https://{referrer}.feastalytics.com/campaign/{campaignId}`, using a referrer from the campaign's own `referrers` rather than just the org's first subdomain.

Mine all of it for things a human would actually remember: opening dates, the street, menu item names, sweepstakes mechanics, numbers, proper nouns. **If the source has real specifics and your copy says "taco time!", you did it wrong.** When you finish a draft, check that you couldn't paste it onto a different restaurant's campaign without anyone noticing.

## Headlines — each ≤ 40 characters

The headline appears *below* the image or video. Forty characters is a hard ceiling; Meta truncates past it, and a headline that dies mid-word looks broken.

Each headline in your set should take a **different angle**. These five are the ones that work for local restaurants — a menu to pick from, not a checklist to complete:

1. **Value** — lead with what they get: the offer, the free item, the deal. The safest angle and usually the strongest, because it answers "what's in it for me" before anyone has to think.
2. **Curiosity** — make them need to find out ("This spot on Fillmore is hiding something…"). Works only when there's a real answer waiting on the landing page; curiosity with nothing behind it reads as clickbait.
3. **Social proof** — popularity or local reputation ("The neighborhood's worst-kept secret"). Borrows credibility the restaurant already earned.
4. **Urgency** — time pressure or scarcity ("This week only", "Limited spots"). Only when it's true. Manufactured urgency on an evergreen offer is the fastest way to sound like every other ad in the feed.
5. **Locality** — the neighborhood, the street, the local identity. The one angle a national chain can't copy, and often the most distinctive thing available to you.

No generic marketing language. Write like a person, not a brand.

## Primary text — each 2–4 sentences

The primary text appears *above* the image or video. It's the first thing anyone reads, and it's read in a fast scroll on a phone.

**The formatting rule that matters most: separate every sentence with a blank line (two newlines).** Each sentence has to stand alone visually. A paragraph is a wall; a wall gets skipped. This is not optional polish, and it is the single most-ignored rule in this file — check for it explicitly before you save anything.

- No hashtags.
- No "click the link below" / "tap below" — Meta owns the CTA button, and pointing at a link that isn't there is just confusing.
- Emoji are welcome when they add energy or visual punch. **At most one per sentence**, never forced. A well-placed emoji > no emoji > emoji spam.
- Each variation takes a different approach, but all of them must work whether the viewer sees a static image or a video (see `creativeMix` below).

## Voice

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

## `creativeMix` changes what the copy may assume

Set this to what's actually true of the assets that will run, then write to it:

- **`static_only`** — the offer is printed on the image. Reference it directly; the viewer always sees it.
- **`video_only`** — videos are awareness-driven and **do not show the offer on screen**. The copy has to stand up with no offer visible: intrigue, the restaurant, the experience.
- **`mixed`** — the hard case. Meta shows some viewers a video with no offer and others a static with the offer front and centre. The copy must read correctly **both** ways, which usually means naming the offer in words rather than gesturing at it ("free matcha with any banh mi", not "check out the deal above").

Copy that only makes sense next to a visible offer, running as `mixed`, will quietly underperform for half the audience.

## Video-led campaigns: the one thing you can't do

The in-app generator **feeds the video assets to the model as multimodal input** and mines them for quotes, moments and on-screen specifics that end up in the copy. **You cannot watch a video from the CLI.**

So for a `video_only` or `mixed` campaign, either work from a description or transcript the user gives you — saying plainly that's what you're working from — or write what you can from the landing page and tell the user the in-app dialog will do better here, because it can see the footage. Don't quietly produce video-campaign copy that never references the video and present it as equivalent. It isn't.

## Saving it

One `updateCampaign` call writes `adCopy`. Run `feast describe updateCampaign` for the fields — alongside the headlines and primary texts it wants the landing page URL, the creative mix, a timestamp, and optional indices for the variation you're recommending.

**The one thing the schema won't tell you: `update.adCopy` replaces the whole object rather than merging into it.** Read the campaign with `getCampaign` first and send back everything you want kept, not just what changed.

## Publishing

**CLI-drivable — read `ads.md`.** The loop is `listAdTemplates` → gather variables → `planAds` → `publishAds` (with its effects) → `getJob` → `setAdCampaignStatus`, and that file carries the ordering, the idempotency-key discipline, and the effect declarations that make the publish self-bookkeeping.

---

> **Not exposed:** ad copy generation (write it yourself, per above). Read `references/links.md` before writing any dashboard link you hand over.
