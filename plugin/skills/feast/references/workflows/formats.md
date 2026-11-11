# Formats from an Instagram link

When someone sends an Instagram reel, post or carousel link and wants to copy it, make one like it, or save it as a format, turn the link into a format with `extractFormatFromUrl`. It reads the post, breaks it down shot by shot (timings, on-screen text, what is said, whether anyone talks), checks it against the format catalog and writes a draft recipe. Don't watch the post yourself or write the recipe by hand.

## Steps

1. **`extractFormatFromUrl`** with `url`: the link exactly as sent (`instagram.com/reel/`, `/p/` or `/tv/`, with or without a username or query string). It returns `extractionId` and `reused`. `reused: true` means this person already read the same post in the last 30 days, and it cost nothing. Anything that is not an Instagram post link is refused with a readable message: pass it on.
2. **Poll** about every 30 seconds with `queryData` on `formats.formatExtraction` filtered on `extractionId`, until `status` is `ready` or `failed`. It usually takes one to two minutes. Don't call `extractFormatFromUrl` again for the same link while one is running.
3. **On `failed`,** say why in plain words from `failureReason`: `private` (the account is private), `ageRestricted` (Instagram needs a login to show it), `notFound` (deleted or a wrong link), `unsupported` (not a post link) or `error` (try again later). Ask for another link.
4. **On `ready`,** read `draft.match`. `candidates` holds up to three catalog formats closest first, each with a `confidence` (`high`, `medium` or `low`) and a one-line `reason`.
   - First candidate `high`: the post is already that catalog format. Ask the person whether to use it or save a new format of their own, naming the format and the reason in one sentence. Prefer the catalog format: a duplicate splits its examples and results.
   - First candidate `medium`: offer both, the closest catalog format or a new one.
   - No candidates, or only `low`: save a new format without asking.
   - `voiceAgrees: false` means the post fits the format but not its voice (for example a voiceover where the format has none). Say so when you offer the match.
5. **To save a new format,** call `createFormat` from `draft.format`: `kind`, `name`, `description`, `recipe` and `difficulty` as they are, `category` as `style`, the post link (`url` on the row) as `sourceUrl`, and the row's `extractionId` so the pasted post shows as the format's example. Share it with the organization only when asked.
6. **To use the catalog format,** nothing is written. Hand over the link to the Formats page and the format's name.

Close with the link to the Formats page (`references/links.md`).

## Rules

- A person can start 20 extractions a day. Each new one costs Feast about 10 cents; a repeat of the same post within 30 days is free. It needs no spend question.
- Extractions are private to the person who started them: `formats.formatExtraction` returns only your own rows in this organization, and `createFormat` refuses an `extractionId` someone else started.
- The organization needs Content Studio (Video Editor 2). Without it the tool is refused; say Content Studio isn't on for this restaurant yet.
- A format is a recipe, not a post. Making a post from it is a separate step (the video workflow, or `addContentIdeas` with `formatId`).
