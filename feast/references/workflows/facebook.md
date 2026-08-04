# Meta ads

> Part of the Feastalytics CLI workflows. Confirm a tool exists with `feast tools` before relying on it, and get its exact fields from `feast describe <tool>` — this file gives the *meaning* and *ordering* the schema can't.

Two jobs live under Meta ads: **writing the ad copy** and **publishing the ad**. Only the first is CLI work today.

## Ad copy: you write it — there is no generator tool

The dashboard has a "generate copy" button behind an LLM call. **There is no CLI equivalent, and you shouldn't want one** — it would be you calling an HTTP endpoint in order to call a model. You *are* the model. (It's also fire-and-forget: it returns `{ "status": "generating" }` and writes the result onto the campaign a minute or two later, so a CLI caller would be reduced to polling for its own output.)

The copy is not a special object. `adCopy` and `recruitmentAdCopy` are plain fields on the campaign record, so writing copy is one `updateCampaign` call. What's missing from the tool schemas is the craft — that's what the rest of this file is.

### The shape you must produce

`updateCampaign` takes `{ "campaignId": "<id>", "update": { "adCopy": { ... } } }`. Getting this object wrong is the likely failure mode, so:

| Field | Required | Meaning |
|---|---|---|
| `headlines` | yes | Array of strings. **Write exactly 5** — the app renders a picker over them and Meta's Advantage+ tests the combinations. |
| `primaryTexts` | yes | Array of strings. **Exactly 5**, same reason. |
| `landingPageUrl` | yes | The page the ad clicks through to. The copy must be congruent with it. |
| `creativeMix` | yes | `"static_only"` \| `"video_only"` \| `"mixed"` — see below; it changes what the copy may assume the viewer can see. |
| `generatedAt` | yes | ISO 8601 timestamp. Set it to now; the app uses it to tell a fresh generation from a stale one. |
| `recommendedHeadlineIndex` | no | **0-based** index (0–4) of the one headline you'd launch with. |
| `recommendedPrimaryTextIndex` | no | **0-based** index (0–4) of the one primary text you'd launch with. |
| `foodCreditCents`, `creatorPayoutCents`, `minFollowerCount` | no | Recruitment only — the terms baked into the copy. See the recruitment section. |
| `lastPushedToMetaAt` | no | Stamped when the copy is pushed to live ads. **Don't set it** — you aren't publishing. |

**The update is a shallow merge**: `update.adCopy` *replaces* the whole existing object rather than merging into it. Always write every field you want kept, including the ones you didn't change. Read the current campaign with `getCampaign` first.

The schema is `additionalProperties: false` — an invented field fails local validation before anything is sent.

```json
{
  "campaignId": "e8ccc852-6555-4a9a-b48b-127d687bb34a",
  "update": {
    "adCopy": {
      "headlines": ["...", "...", "...", "...", "..."],
      "primaryTexts": ["...", "...", "...", "...", "..."],
      "landingPageUrl": "https://plumvietnamese.feastalytics.com/campaign/e8ccc852-6555-4a9a-b48b-127d687bb34a",
      "creativeMix": "static_only",
      "generatedAt": "2026-08-04T15:22:11.000Z",
      "recommendedHeadlineIndex": 2,
      "recommendedPrimaryTextIndex": 0
    }
  }
}
```

### Two fields, two audiences — never mix them

- **`adCopy`** — guest-facing. Sells the offer and the food to a hungry local.
- **`recruitmentAdCopy`** — creator-facing. Sells a paid collab to a content creator.

Same shape, opposite pitch. **Writing guest copy into `recruitmentAdCopy` is the single most common failure in this area** — it has happened repeatedly. Decide which one you're writing before you write a word, and read only that section below.

---

## Guest-facing copy (`adCopy`)

### Read before you write

Generic copy is the failure mode. Specifics are the whole job, so go get them:

1. `loadCurrentOrganization` — brand name, cuisine, and the subdomains in `subdomains2[].subdomain`.
2. `getCampaign` — `name`, `description`, `bannerConfig`, `promotions`, `referrers`, `shorthand`.
3. `listFunnelScreens` `{ "referrer": "<subdomain>", "campaignId": "<id>" }` — **the actual landing-page copy the guest sees after the click.** This is your source of truth for congruence; ad → landing page should feel like one continuous thing.
4. `dfyListOffers` / `dfyGetMenuHierarchy` — real item names and real prices.

The landing page URL is `https://{referrer}.feastalytics.com/campaign/{campaignId}`, using a referrer from the campaign's own `referrers` (not just the org's first subdomain).

Mine all of that for things a human would actually remember: opening dates, the street, menu item names, sweepstakes mechanics, numbers, proper nouns. **If the source has real specifics and your copy says "taco time!", you did it wrong.**

### Headlines — 5, each ≤ 40 characters

Appears *below* the image or video. Each one must take a **different angle**:

1. **Value** — lead with what they get (the offer, the free item, the deal).
2. **Curiosity** — make them need to find out ("This spot on Fillmore is hiding something…").
3. **Social proof** — popularity or local reputation ("The neighborhood's worst-kept secret").
4. **Urgency** — time pressure or scarcity ("This week only", "Limited spots").
5. **Locality** — the neighborhood, the street, the local identity.

No generic marketing language. Write like a person, not a brand.

### Primary text — 5, each 2–4 sentences

Appears *above* the image or video — it's the first thing anyone reads.

**The formatting rule that matters most: separate every sentence with a blank line (two newlines).** People scroll fast; a wall of text is a skipped ad. Each sentence has to stand alone visually on a phone. This is not optional polish — it is the single most-ignored rule in the source prompt.

- No hashtags.
- No "click the link below" / "tap below" — Meta owns the CTA button.
- Emoji are welcome when they add energy. **Max one per sentence**, never forced. A well-placed emoji > no emoji > emoji spam.
- Each of the 5 takes a different approach, but all 5 must work whether the viewer sees a static image or a video.

### Voice

Write like you're texting a friend about a spot you're genuinely hyped about. Not a social media manager. Not an About page.

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

Note what changes between them: the blank lines, the fragments, the concrete nouns, and the fact that the good one sounds like someone excited rather than someone announcing.

### `creativeMix` changes what the copy may assume

- **`static_only`** — the offer is printed on the image. Reference the offer directly; the viewer always sees it.
- **`video_only`** — videos are awareness-driven and **do not show the offer on screen**. The copy has to stand up with no offer visible: intrigue, the restaurant, the experience.
- **`mixed`** — the hard case. Meta shows some viewers a video with no offer and others a static with the offer front and centre. The copy must read correctly **both** ways.

Set the field to whatever is actually true of the assets that will run, and write to it. Copy that only makes sense next to a visible offer, tagged `mixed`, will underperform for half the audience.

### Recommend one of each

After writing all ten, judge them for *this* restaurant and *this* offer, then set `recommendedHeadlineIndex` and `recommendedPrimaryTextIndex` to the 0-based index of the strongest of each. Don't skip it — it's what the app pre-selects, and picking is part of the job.

### Video-led campaigns: the one thing you can't do

The in-app generator **feeds the video assets to the model as multimodal input** and mines them for quotes, moments, and specifics that end up in the copy. **You cannot watch a video from the CLI.** So for a `video_only` or `mixed` campaign, either:

- work from a description or transcript the user gives you (say plainly that this is what you're working from), or
- write what you can from the landing page and tell the user the in-app dialog will do better here, because it can see the footage.

Don't quietly produce video-campaign copy that never references the video and present it as equivalent. It isn't.

---

## Creator-recruitment copy (`recruitmentAdCopy`)

**Read this section only when writing `recruitmentAdCopy`.** The audience is **local food and lifestyle content creators** on Instagram and TikTok — someone scrolling for brand collabs, not a hungry person hunting a deal. The ad is decoupled from any consumer campaign the restaurant is running, *even if one is running right now*.

### Absolute rules (this is exactly where past generations went wrong)

- **Never mention an offer, deal, voucher, promotion, discount, "claiming" anything, or pre-paying.** This is a collab, not a customer offer.
- **Don't pitch the food the way you'd pitch it to a diner.** The food is the perk; the pitch is the collab.
- **No customer-facing language** — "claim your voucher", "come hungry", "limited time offer", "this week only", "tap below to save".
- **Don't reuse the campaign's guest-facing framing** — banner copy, promotions, offer headlines. None of it belongs here.
- The CTA goes to a creator landing page that explains the collab in full. Your job is to get the *right* creator to tap "Learn More", not to close the deal in the ad.
- **If there's a cash bonus, never imply it's automatic or guaranteed.** It is earned only if the restaurant selects the creator's reel to run as a paid ad. Phrasings like "earn a $100 bonus", "get a $100 bonus when you post", or "$100 bonus if you nail the brief" read as guaranteed-on-completion and have caused creators to demand a bonus they didn't earn. Always frame it conditionally: "a chance to earn", "up to", "if your reel gets picked to run as an ad".

### What to pitch

- The restaurant is booking local food/lifestyle creators to come in, eat on the house, and post a short reel.
- **The creator gets:** a dining credit (order whatever they want), a creative brief with style direction but no script, and — when acquisition is enabled — their reel boosted as a paid partnership ad alongside the restaurant's Instagram, which is free promotion to thousands of local foodies. Plus, where one exists, a conditional cash bonus.
- **The creator gives:** one 30–60 second vertical reel (Instagram Reel / TikTok), filmed during the visit, submitted within 72 hours.
- **Eligibility:** an active food/lifestyle creator with a minimum local-area follower count on Instagram or TikTok.

### Angles — rotate across the 5

With a bonus: **get paid** → **free food + free promotion** → **local creator call-out** → **grow your page** → **straightforward collab pitch**.

Without a bonus, swap the first for **free food collab** ("Eat on us at X") and the fourth for **brand partnership** or **behind-the-scenes**.

### Tone

Talk like a brand DM'ing a creator about a collab — confident, peer-to-peer, slightly insider. "We're partnering with…", "We're booking creators for…", "Looking for local foodies who…". Specifics over fluff: name the dollar amounts, the deliverable (one reel, 30–60s), the eligibility. Emoji fine in moderation (📸 🎥 🍴), don't spam. The blank-line-between-sentences rule applies here too.

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

That's a customer offer wearing a creator ad's clothes. Every one of "free meal", "claim your voucher", "come hungry", "this deal" is disqualifying.

### The terms are baked into the copy — record them

`foodCreditCents`, `creatorPayoutCents` and `minFollowerCount` on `recruitmentAdCopy` are the terms your copy actually stated. The dashboard compares them against the live creator board config and flags the copy as drifted when they diverge — so if you write "$30 tab" and leave them unset, nobody finds out when the credit changes to $50.

**You can't read the creator board config from the CLI.** Ask the user for the dining credit, the bonus, and the follower minimum, write those exact numbers into the copy, and mirror them into these fields (in **cents** for the two money fields). Don't guess them.

The creator landing page is `/creator-landing` on the org's subdomain with `orgId`, `locId`, `campaignId` and UTM params — fiddly enough that you should reuse the existing `recruitmentAdCopy.landingPageUrl` when the campaign already has copy, rather than reconstructing it.

---

## Publishing

**Not yet possible from the CLI.** Creating the ad in Meta — ad account, page, budget, targeting, creative — stays in the dashboard for now. Write the copy, then hand the user the campaign's `ads` panel (or `creative-strategy` for recruitment) to publish it.

---

> **Not exposed:** ad copy generation (`generateAdCopy` — write it yourself, per above), marking copy as pushed to Meta, and everything to do with creating, editing, or pausing a live Meta ad. Read `references/links.md` before writing the dashboard link you hand over.

---
