# Project authoring

Projects are JSON files under `content/projects/`. The complete field contract is in [01-CONTENT-SCHEMA.md](../.planning/phases/01-foundation-homepage/01-CONTENT-SCHEMA.md); `scripts/content/schema.ts` implements it. Node 24.21.x and the reviewed lockfile are required.

## Edit a record

1. Copy an existing record to `content/projects/<slug>.json`. Use a unique lowercase kebab-case slug matching the filename, and start with `publication.status: "draft"`.
2. Supply a problem-oriented headline, public display name, and factual summary. Choose `headlineKind` to distinguish a problem from an intended outcome. Keep unknown facts null or empty, and project status `unknown` until supported.
3. Add evidence with unique IDs. Refer to those IDs from claims, technologies, status, links, screenshots, and architecture. Unknown references and unsupported verified claims fail validation.
4. Run `npm run content:check`. Errors identify the source filename and invalid field or media path. All records, including drafts, must validate.
5. Publish only after content review by changing status to `published`. `readiness: "preliminary"` is appropriate while evidence is pending; publication is independent of completion status.

The current four publications use only the owner-approved descriptions. Technologies, contributions, results, completion, demos, repositories, APKs, screenshots, and architecture remain unknown. Adding any of those requires actual supporting information. Do not replace unknowns with plausible guesses.

## Evidence and links

- Claim `basis` is `owner-provided`, `proposed`, or `verified`. Proposed text renders as intent. Verified claims require at least one checked non-owner-brief evidence source. `checkedAt` is an ISO calendar date no later than the current UTC date; future dates fail validation so they cannot support a verified claim.
- Validation checks structure and relationships; a human must verify that each cited source actually supports the claim. A date or valid URL does not establish truth or destination availability.
- `owner-brief` evidence becomes **Owner-provided description** publicly. Its reference, private label and check date are omitted. `internalName` and `authorNotes` are also excluded from the public projection.
- Repository links must identify an actual GitHub repository, not a profile. External links must use public HTTPS destinations without credentials, secret-bearing query keys, or placeholder/local destinations. Hostnames must use valid DNS labels: 1-63 characters each, no leading or trailing hyphen, and at most 253 characters overall. Commit and pull-request evidence uses its specific GitHub path. APK download URLs must end in `.apk`; version and SHA-256 are nullable until known.
- Missing links are omitted, not rendered as disabled or fake controls. Ordinary strings render through React escaping; HTML is not accepted as executable content.
- Source records remain visible in a public Git repository. Author-only fields are a website publishing boundary, not secret storage.

## Media

Store media in `content/media/`, with lowercase kebab-case directories and filenames. References are relative to that directory, for example `projects/project-slug/screen.png`. Supported local evidence files are PNG, JPEG, PDF and APK; screenshots/diagrams must be PNG or JPEG with meaningful alt text and their actual pixel dimensions. Local files must exist. Traversal and symlink escapes are rejected.

PNG and JPEG references are checked beyond their header: the complete container structure must be valid (PNG chunk framing, CRCs and IEND; JPEG frame, scan and EOI) and the file is decoded with the pinned Playwright Chromium. The extension must match the decoded format. Files over 32 MiB or images over 40 megapixels are rejected, as are truncated, corrupt or undecodable files. A file that merely starts with the right bytes is not accepted.

Only files referenced by published records or explicitly public profile configuration are copied to `.generated/media/` and `dist/media/`. Copies are byte-verified. Never put author media into a Vite `public/` directory or import source content from browser code.

The original `content/media/profile/profile.jpg` is preserved unchanged. Profile presentation and final homepage work belong to 01-03. No real project media has been supplied for 01-02.

## Build and review

```sh
npm run content:check
npm run content:generate
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run test:e2e -- --project=chromium
```

On a fresh checkout, run the reviewed `npm ci` first. Install the pinned Playwright Chromium browser if it is not already provisioned: browser tests need it, and so do `content:check`, `build` and any media test that references a PNG or JPEG, because image validation decodes the file in that browser. Generate content before direct type/lint checks because the application imports the ignored `.generated/public-content.json`.

`npm run build` cleans its owned outputs, validates every record, generates the public projection, bundles, prerenders, copies selected media, and verifies deployable artifacts. Invalid records fail before bundling. A failed build leaves no deployable `dist/`; failed generation removes the stale public manifest. Source maps and unexpected files are rejected. The artifact verifier rebuilds an isolated copy from only the validated public manifest and selected media, then compares the complete output inventory and every byte against the real `dist/`. Author records, unselected media and private fields never reach that reference build. This detects omitted private text without a hand-maintained string list; it is a publication-consistency check, not proof against a compromised build script. Deploy **only `dist/`**, never `.generated/` or the repository.

`npm run dev` regenerates before serving at `http://127.0.0.1:5173/`. Restart it after authoring changes. Source watching and draft browser previews are not provided. Run builds/generation with the dev server stopped, since these commands replace its generated inputs and cache.

`npm run preview` serves the production build at `http://127.0.0.1:4173/`. Automated browser tests own that port; stop any manual preview first. Test fixtures copy the application into owned temporary workspaces and never swap the real author records.

## Unpublish

Set `publication.status` to `draft`, then rebuild. The new output removes the old project page, media, manifest entry and browser data. Replace the deployed output completely: an additive upload may retain old host files even though the local build is clean. Host/CDN caches and live status codes require deployment-specific verification.

The shared detail URL is `/projects/<slug>/`. Only that exact canonical path is a route. Case changes, doubled slashes, percent-encoded slugs and a missing trailing slash are 404s in static output, after hydration and in development; do not add host rewrites that alias them onto project pages. The selected host must serve directory indexes, canonical index/trailing-slash redirects, and the generated `404.html` with real HTTP 404 responses. Hosting is currently origin-root-relative; no deployment origin has been assumed.
