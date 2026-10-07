# Video ads (Bevyl)

## Making a video

One video is one `projectId`, from Generate to the finished MP4. The loop:

1. **`getVideoPromptOptions({ campaignId })`**. `defaultPrompt` is what Content Studio would send: four plain-text sections (Campaign, Concept, Creative direction, CTA), each a heading line then its text. `campaign`, `concept`, `direction` and `cta` list the alternatives for each section (`{ id, label, text }`). Concepts carry the reference video they came from (`videoUrl`, `description`), and directions a `suggestedFormat`. Show the human the prompt you plan to send. Swap a section for another option's text or rewrite it as they ask.
2. **`generateVideo`** with `campaignId`, `prompt` (sent to Bevyl verbatim, 5,000 characters at most) and `format` (`voiceover`, `talking-head`, `trending-sounds` with a `trendId`, or `no-audio`; the chosen direction's `suggestedFormat` is the default). Pass `angleId` from `listCampaignVideos` to add a version to an existing angle; otherwise a new angle is named from the Concept's first line, or from `angleTitle`. Footage is every clip already synced to Bevyl unless you pass `brollKeys` (S3 keys from `listMedia` scope `creativeLibraryBroll`). **This spends Bevyl credits: only with the human's explicit go-ahead.**
3. **`getVideo({ projectId })`** about every 30 seconds. `pipeline.status` moves uploading, processing, creating, rendering, exporting, then `ready` (`exportUrl` is the MP4) or `failed` (`message` says why). A first video takes several minutes.
4. Send the human `exportUrl` to watch. For one change, **`requestVideoEdit`** with only that change in `note` (credits again; `getVideo` goes back to rendering). When they approve it, **`approveVideo({ projectId })`** saves the MP4 to the campaign's creative library and returns its `libraryKey`.

## Reference scripts

`listReferenceScripts` returns the reference ad scripts Content Studio offers as Concept presets for Bevyl videos, each distilled from an ad that performed: `description` (what the video shows), `videoUrl` (a public MP4 preview), `structure` (the ordered beats), `keyPhrases` (lines to adapt, with `<placeholders>` filled from the campaign's facts) and `concept` (the exact text Content Studio sends to Bevyl). Copy the structure and pacing, not the words. The list is the same for every organization. Use one to explain a concept option or to write a concept of your own for `prompt`.
