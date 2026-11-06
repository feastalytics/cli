# Videos (Video Editor 2)

## Making a video

One video is one `projectId`, from the first idea to the approved MP4. Every step that spends money (generate, pick a story, edit) needs the human's explicit go-ahead.

1. **`generateVideo`** with `campaignId` (or `null` for an organic post, with `referrer` naming the brand when the organization has more than one site) and `prompt`: the idea for this video (the hook, the story, what to show, the tone). Claude already reads the campaign's brief, the restaurant's notes, menu and reviews and every labelled clip, so don't repeat the brief. Optional: `voiceId` from `listVideoVoices`, `voiceover: false` for on-screen text only, `music`, `font`, `headline`, `endCard`, and `angleId` (or `angleTitle`) to group it with other versions of the same idea. The footage is every labelled clip of the video's brand: `queryData` on `videos.footage` lists it scene by scene, and new footage goes in with `getMediaUploadUrl` (scope `creativeLibraryBroll`, `sourceUrl`), labelled a few minutes later.
2. **Poll** about every 30 seconds with `queryData` on `videos.video` filtered on `projectId` until `pipelineStatus` is `choosingScript`, `ready` or `failed` (`pipelineStatusMessage` says why).
3. **Pick a story.** `getVideoEditor` returns `editor.scripts`, the story options. Show them to the human. `chooseVideoScript` with `scriptId` (and optionally `lines`, one per beat) picks one and cuts version 1. `chooseVideoScript` with `feedback` rewrites the options instead (or only the one `scriptId` names), about $0.10. A video with `voiceover: false` skips this step.
4. **Watch.** When `pipelineStatus` is `ready`, `getVideoEditor`'s `exports[].url` is the version's MP4 (the link works for an hour). Send it to the human.
5. **Edit** with `requestVideoEdit`:
   - `note` for anything said in words ("punchier hook"); Claude turns it into changes. `scopeLineIds` keeps a note to the lines named.
   - `changes` for exact edits to the timeline from `getVideoEditor` (lines, shots, overlays, text style, voice, pronunciation, music). Segment ids come from `videos.footage`.
   - `recut: true` on its own for new shots and a new voice take from the same story.
   - `restore: "<versionId>"` on its own to bring back an earlier version.
   - `asNewVideo` to make the result a new video instead of a new version: a variation for testing another hook or opening shot. With no `note` or `changes` it is an exact copy and costs nothing.

   For a trial reel on the Content Calendar, don't use `asNewVideo`: send `addContentIdeas` an idea with `kind: "trial_reel"`, a `title`, the change as `brief`, and `variationOf: { projectId }`. It makes the variation and adds it as a draft post in one call; with no `brief`, Claude picks one small change itself.
6. **Approve** with `approveVideo({ projectId })` once the human has watched and approved it. It saves the current version's MP4 to the creative library and returns its `libraryKey`; pass `runId` to approve another version from `editor.versions`.

`describeTools` (MCP) or `feast describe` (CLI) gives each tool's full description: every input, what it costs and what comes next.

## Reading videos

`queryData` on `videos.video`, one row per video. Videos are only there for organizations with acquisition enabled.

One video, and the poll in step 2:

```json
{ "schemaName": "videos", "objectTypeName": "video",
  "commands": [{ "type": "filter", "filter": { "$projectId": { "string": "<projectId>", "match": "EQ" } } }] }
```

A campaign's videos, newest first:

```json
{ "schemaName": "videos", "objectTypeName": "video",
  "commands": [{ "type": "filter", "filter": { "$campaignId": { "string": "<campaignId>", "match": "EQ" } } }],
  "args": { "fields": ["projectId", "angleId", "angleTitle", "createdAt", "pipelineStatus", "latestRun", "editor", "approvedRunId", "variationOf"],
            "order": { "field": "createdAt", "direction": "DESC" } } }
```

- Videos are grouped into angles by `angleId`. Old videos have no `angleId`; `angleTitle` names their angle.
- A run is a version: `latestRun.runId`, `editor.currentVersionId` and `approvedRunId` are version ids.
- `variationOf` is set on a video made with `asNewVideo`: the video and version it was copied from.
- Videos with `engine` bevyl were made with the old editor. `getVideoEditor` returns `editor: null` for them and the video tools don't edit them.
- `describeData` with `{ "schemaName": "videos" }` lists every column.

## Where a video is running

An approved video goes into ads through `planAds` / `publishAds` with the `addAds` template, its `libraryKey` as a `{ "kind": "libraryAsset", "key": "..." }` creative. Every ad that publish creates gets a row in `ads.adLaunch` tying it back to the project and version, so `queryData` on `ads.adLaunch` filtered on `projectId` lists every ad set the video runs in, and the `facebookAdSpendPoint` link gives each one's daily spend and delivery. A new version of the same project is a different video: it is not running until it is approved and launched.
