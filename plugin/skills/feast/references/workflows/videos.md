# Video ads (Bevyl)

## Making a video

One video is one `projectId`, from Generate to the finished MP4. The loop:

1. **`getVideoPromptOptions({ campaignId })`**. `defaultPrompt` is what Content Studio would send: four plain-text sections (Campaign, Concept, Creative direction, CTA), each a heading line then its text. `campaign`, `concept`, `direction` and `cta` list the alternatives for each section (`{ id, label, text }`). Concepts carry the reference video they came from (`videoUrl`, `description`), and directions a `suggestedFormat`. Show the human the prompt you plan to send. Swap a section for another option's text or rewrite it as they ask.
2. **`generateVideo`** with `campaignId`, `prompt` (sent to Bevyl verbatim, 5,000 characters at most) and `format` (`voiceover`, `talking-head`, `trending-sounds` with a `trendId`, or `no-audio`; the chosen direction's `suggestedFormat` is the default). Pass `angleId` (from the campaign's videos, below) to add a version to an existing angle; otherwise a new angle is named from the Concept's first line, or from `angleTitle`. Footage is every clip already synced to Bevyl unless you pass `brollKeys` (S3 keys from `listMedia` scope `creativeLibraryBroll`). **This spends Bevyl credits: only with the human's explicit go-ahead.**
3. **Poll the video** about every 30 seconds with `queryData` on `videos.video` filtered on the `projectId` `generateVideo` returned (it has no `wait` option). `pipelineStatus` moves uploading, processing, creating, rendering, exporting, then `ready` (`exportUrl` is the MP4) or `failed` (`pipelineStatusMessage` says why). A first video takes several minutes.
4. Send the human `exportUrl` to watch. For one change, **`requestVideoEdit`** with only that change in `note` (credits again; `pipelineStatus` goes back to `rendering`, then `ready` with the new export). When they approve it, **`approveVideo({ projectId })`** saves the MP4 to the campaign's creative library and returns its `libraryKey`. It approves the run of the newest export unless you pass `runId`; see below for where run ids come from.

## Reading videos

`queryData` on `videos.video`, one row per video. Videos are only there for organizations with acquisition enabled.

One video, and the poll in step 3:

```json
{ "schemaName": "videos", "objectTypeName": "video",
  "commands": [{ "type": "filter", "filter": { "$projectId": { "string": "<projectId>", "match": "EQ" } } }] }
```

A campaign's videos, newest first:

```json
{ "schemaName": "videos", "objectTypeName": "video",
  "commands": [{ "type": "filter", "filter": { "$campaignId": { "string": "<campaignId>", "match": "EQ" } } }],
  "args": { "fields": ["projectId", "angleId", "angleTitle", "title", "createdAt", "pipelineStatus", "exportUrl", "latestRun", "approvedRunId", "edits"],
            "order": { "field": "createdAt", "direction": "DESC" } } }
```

- Videos are grouped into angles by `angleId`. Old videos have no `angleId`; `angleTitle` names their angle.
- `latestRun` is the newest Bevyl run (`runId`, `status` working, completed, failed or no_clips, `completedAt`). Its `runId` is the one `approveVideo` takes. Every export also carries its run (`exports[].runId`, with `url` the MP4 of that run), so pass `runId` to `approveVideo` only to approve an earlier run than the newest export. `approvedRunId` is the run already approved.
- `edits` lists the changes asked for with `requestVideoEdit`, each with the run it started.
- Videos made before the server pipeline have no `pipelineStatus`; read `latestRun` and `exports` for those.
- `describeData` with `{ "schemaName": "videos" }` lists every column.

## Reference scripts

For a campaign whose brief is not an awareness brief, the `concept` options from `getVideoPromptOptions` are the reference ad scripts Content Studio offers as Concept presets, each distilled from an ad that performed: `label` (its title), `text` (the exact concept Content Studio sends to Bevyl), `description` (what the video shows) and `videoUrl` (a public MP4 preview). The list is the same for every organization. Copy the structure and pacing, not the words. Use one to explain a concept option or to write a concept of your own for `prompt`. An awareness campaign's concepts come from its creative brief instead and carry no video.
