# Photos and posts from the restaurant's Facebook Page

When someone asks for photos "from our Facebook", or you need what the restaurant has already posted there (an event, a product, an announcement), read the Page with `scripts/meta_graph.py`. No Feastalytics tool lists a Page's photos or posts: `ads_get_assets` covers the Page itself and its Instagram media only. Web search and `web_fetch` cannot read Facebook either, so don't try them.

```bash
python3 scripts/meta_graph.py page <command> [flags]
```

The path is relative to this skill's directory. Every command is read-only, prints JSON and needs one call. It needs `META_ACCESS_TOKEN`, which Feastalytics agent sessions provide to owners. If it says `META_ACCESS_TOKEN is not set`, ask the person to text or upload the photos instead.

## Steps

1. Find the Page: `ads_get_assets` with `include: ["pages"]`. Use the one with `usedByOrganization: true`. The token often lists other restaurants' Pages too. Never read one that is not this organization's.
2. Search posts first, since the post text says what a photo shows: `page posts --page <pageId> --search "coffee cart"`. `--search` matches the post text in any case and is repeatable (any one term matches). Add `--since` / `--until` (`YYYY-MM-DD`) to narrow by date, `--limit` for more than 25 results.
3. Each post comes back with its `message`, `permalink` and `images`: one entry per photo with a full-size `imageUrl`, `width` and `height`. A post whose `mediaTypes` is `video` has only a small preview image.
4. Photos posted without useful text: `page photos --page <pageId>` lists every uploaded photo newest first, with `--search` on the caption. `page albums --page <pageId>` lists albums, and `page photos --page <pageId> --album <albumId>` reads one.
5. Look at a photo before you use it. Copy it into the organization's files with `getMediaUploadUrl` (`scope: "organizationFilePublic"`, `sourceUrl` the `imageUrl`, `referrer` the brand), then read the returned Feast `url`. The caption is a hint, not proof of what is in the picture.

## Rules

- `imageUrl` is a Facebook CDN link. It expires within days and the sandbox cannot fetch it. Always copy the photo in with `getMediaUploadUrl` and use the Feast `url` or `key` from then on. Never put a Facebook CDN link in a post, an ad, a text or a note.
- `scanned` is how many posts or photos were read, and `moreAvailable: true` means the search stopped early (the result limit, or 2,000 items). Narrow with `--since` / `--until` to reach older ones.
- Nothing found is an answer: say which terms and dates you searched, and ask the person for the photos or the post link.
- Only copy in the photos the task needs. Each copy is a file in the restaurant's library.
- A photo of a guest or a private event is the restaurant's to reuse only if they say so. When a photo shows identifiable guests, name it in your draft so the owner can decide.
