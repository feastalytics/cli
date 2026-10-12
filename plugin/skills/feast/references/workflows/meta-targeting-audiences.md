# Targeting edits and custom audiences

Changing who a live ad set reaches (location, age, gender, included and excluded audiences) and building audiences (lookalikes, website visitors, Page or Instagram engagers, customer lists). The Feastalytics tools cover part of this. The rest goes through `scripts/meta_graph.py` in this skill.

## Use the Feastalytics tools first

Reach for a script only for a step no tool covers. The tools check that the ad account belongs to the organization, log the change, and use the organization's own Meta connection. The script does none of that.

| Step | Use |
|---|---|
| Find the ad account, Page, Instagram account | `ads_get_assets` with `include: ["adAccounts", "pages"]`, then `instagramAccounts` (see `ads.md`) |
| List existing custom audiences, check one is ready | `ads_get_assets` with `include: ["customAudiences"]` and the `adAccountId`. Skip any with `isReadyForUse: false` |
| Find the pixel | `ads_get_assets` with `include: ["datasets"]` |
| Find ad sets and their ids | `ads_get_ad_entities` with `level: "adSet"` |
| Rename, re-budget, pause or turn on | `ads_update_entity` |
| Targeting on a **new** ad set | `planAds` / `publishAds` (the template's targeting variables, including `customAudienceIds` and `excludedCustomAudienceIds`) |
| Read an ad set's **current** targeting | script: `targeting get` |
| Change targeting on an ad set that **already exists** | script: `targeting set` |
| Look up a city, zip or state key | script: `geo` |
| Create a lookalike, website, engagement or customer-list audience | script: `audience …` |

`ads_update_entity` accepts only `name`, budgets and `status`. A `targeting` field is rejected, so don't try it.

## Running the script

```bash
python3 scripts/meta_graph.py <command> [flags]
```

The path is relative to this skill's directory. Every command prints JSON and needs one call. `--help` on any command lists its flags.

It needs `META_ACCESS_TOKEN`, the organization's Meta token, which Feastalytics agent sessions provide. Run `python3 scripts/meta_graph.py check --account <adAccountId>` once at the start: it prints whose token it is, whether the account accepted the Custom Audience terms, and its pixels. If it says `META_ACCESS_TOKEN is not set`, you are not in such a session. Stop and tell the user this step is done in the dashboard or Meta Ads Manager. Never ask the user to paste a token, and never put one in a command, a file or a message.

Ad account ids work with or without `act_`. Every id must belong to the organization you are acting for: take it from `ads_get_assets`, never from memory or another organization.

## Changing targeting on a live ad set

Meta replaces an ad set's whole targeting on every write, so a careless edit clears placements, interests and exclusions. `targeting set` reads the live spec, changes only the flags you pass, writes it back and re-reads it, all in one call. Never build a targeting spec by hand.

1. `targeting get <adSetId> [<adSetId> ...]` and show the user the current location, age and audiences.
2. Agree the change with the user. Spell out the radius in miles and the audiences by name.
3. `targeting set <adSetId> ... --dry-run` prints the changed keys before and after. Show it.
4. Run the same command without `--dry-run`. The output's `now` is the re-read result; confirm from it.

Several ad set ids in one call apply the same change to each, which is how you move a whole campaign. Get them from `ads_get_ad_entities` with the `campaignId` and `level: "adSet"`.

**Location.** The geo flags you pass together replace the whole location. `location_types` (home, recent) is kept.
- `--radius LAT,LNG,MILES`: a pin and radius, repeatable. The restaurant's coordinates come from `searchGooglePlaces` or the campaign's location. A radius drops any country on purpose: Meta adds location kinds together, so a radius left next to `US` reaches the whole country.
- `--cities KEY[:MILES]`, `--regions KEY`, `--zips 84604`, `--countries US`: city, state and zip keys come from `geo "<name>" --kind city|region|zip`. Pick the right one by its region, since city names repeat.

**People.** `--age-min`, `--age-max` (18 to 65), `--genders all|male|female`.

**Audiences.** `--include-audience ID`, `--remove-audience ID`, `--exclude-audience ID`, `--unexclude-audience ID`, each repeatable. Only use audiences that `ads_get_assets` (or `audience status`) shows ready. An ad set restricted to an unready or tiny audience delivers to almost nobody.

**Advantage audience.** When `advantageAudience` is 1, Meta treats your audiences and age as suggestions and may go beyond them. Feastalytics publishes with it off (`--advantage-audience 0`). Only turn it on when the user asks.

**Anything else.** `--set KEY=JSON` sets any other top-level targeting key, and `--set KEY=null` removes it. Use it only for what the user asked for by name.

A targeting change on a running ad set restarts Meta's learning phase. Say so before you make it.

## Building audiences

Audiences belong to one ad account and only work in ad sets on that account. Create them on the account the ads run on.

**Lookalike.** `audience lookalike --account <id> --source <seedAudienceId> --country US --ratio 0.01`.
- The seed is an existing custom audience on the same account: a customer list, website visitors or engagers. Meta wants at least 100 matched people in it; a seed of 1,000 to 50,000 good customers works best.
- `--ratio` is the share of the country, 0.01 (closest match) to 0.20 (broadest). Start at 0.01 for a local restaurant.
- Lookalikes are country-wide. To keep the ads local, include the lookalike in an ad set whose location is the restaurant's radius.
- A new lookalike reports a tiny size or "updating" for up to a few hours while Meta builds it. Check with `audience status <id>` before relying on it.

**Website visitors.** `audience website --account <id> --pixel <pixelId> --name "..." --days 30`, optionally `--event Lead` or `--url-contains /checkout` (repeatable, all must match). This only works if the pixel fires on the funnel, which `check` shows through each pixel's `last_fired_time`. The lookback is 1 to 180 days. Past visitors in the window are included.

**Page or Instagram engagers.** `audience engagement --account <id> --page <pageId> --name "..."` or `--instagram <igAccountId>`, `--days` up to 730 (default 365). `--action messaged` narrows to people who messaged, `cta` (Page) to call-to-action clicks, `visited` (Instagram) to profile visits.

**Customer list** (members, guests, past customers). Export the people with `queryData` into a CSV with any of the columns `phone`, `email`, `first_name`, `last_name`, `zip`, `country`. Every row needs a phone or email. Then run `audience customer-list --account <id> --csv <file> --name "..."`, or `--audience <id>` to add to an existing list.
- The script normalizes and SHA-256 hashes every value before upload. Raw phones and emails never leave the sandbox.
- Ten-digit phones are treated as US numbers.
- The ad account must have accepted Meta's Custom Audience terms (`check` shows `customAudienceTermsAccepted`). If not, the script refuses and prints the link the account owner opens to accept. You cannot accept for them.
- Only upload people the restaurant may market to. Leave out anyone who opted out of texts or asked to be removed.
- Matching takes up to an hour. The size reads low until then.

**Check and clean up.**
- `audience status <id> [<id> ...]` shows size, `readyForUse` and Meta's status line.
- `audience delete <id> [<id> ...]` deletes audiences permanently, and any ad set using one loses it. Delete only audiences the user names, after confirming.

## After a change

Close with what changed, in plain words: "Ad set X now reaches people within 10 miles of the restaurant, ages 21 to 55, members excluded." Mention the learning phase restart for live ad sets, and when a new audience will be ready to use. Link the ads with the routes in `references/links.md`.
