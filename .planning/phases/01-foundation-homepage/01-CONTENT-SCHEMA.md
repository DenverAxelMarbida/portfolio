# Project content schema

Status: Schema design approved in scope; implementation awaits package-audit approval and explicit authorization.

## Authoring model

One JSON record per project, validated by Zod. TypeScript types are inferred from the schema. Schema version starts at `1`; adding optional fields remains backward compatible. Unknown keys fail validation to catch typos.

| Field | Type / meaning | Rules |
|---|---|---|
| `schemaVersion` | literal `1` | Required |
| `slug` | lowercase kebab-case string | Unique, matches filename; no paths, query or traversal |
| `internalName` | nonempty string | Authoring identity, omitted from public projection |
| `displayName` | nonempty string | Public project name secondary to headline |
| `headline` | nonempty string | Problem/outcome-oriented editorial title |
| `headlineKind` | `problem` or `intended-outcome` | Phase 1 headlines do not assert verified results |
| `summary` | nonempty plain text | Owner-provided or reviewed factual description |
| `problem` | claim or null | Null when not yet established |
| `proposedSolution` | claim or null | Describe intent; no invented implementation |
| `intendedOutcomes` | claim array | Explicit intended-outcome label in UI |
| `verifiedOutcomes` | verified-claim array | Every item requires qualifying evidence |
| `contributions` | claim array | Denver's actual role, not inferred team ownership |
| `technologies` | `{name, evidenceIds}` array | Empty until independently supported or owner-confirmed |
| `projectStatus` | `unknown`, `in-development`, `prototype`, `released`, `maintained`, `archived` | Unknown is valid; no inference from repository activity |
| `statusEvidenceIds` | string array | Non-unknown status needs a supporting source |
| `repositories` | `{label,url,evidenceIds}` array | HTTPS GitHub repository URL, not profile URL; no guessed paths |
| `liveDemos` | `{label,url,evidenceIds}` array | Valid HTTPS destination; absent when unavailable |
| `apkDownloads` | `{label,url,version,sha256,evidenceIds}` array | version/hash nullable; real linked artifact required |
| `screenshots` | `{assetPath,alt,caption,width,height,evidenceIds}` array | Actual local media, dimensions positive, alt meaningful |
| `architecture` | null or `{summary,decisions,diagrams,evidenceIds}` | All prose claims follow claim rules; diagrams need source/alt |
| `featured` | boolean | Only relevant for published entries |
| `displayOrder` | nonnegative integer | Deterministic order; slug tie-break |
| `publication` | `{status,readiness}` | status `draft` or `published`; readiness `preliminary` or `reviewed` |
| `evidence` | evidence array | Unique IDs within project |
| `authorNotes` | string or null | Never public |

`claim`: `{text, basis, evidenceIds}`. `basis` is `owner-provided`, `proposed`, or `verified`. Proposed text is always presented as intent. Owner-provided text can be published with preliminary labeling. Verified text needs evidence that supports precisely that statement.

`evidence`: `{id, kind, reference, label, checkedAt}`. Kinds: `owner-brief`, `repository`, `commit`, `pull-request`, `documentation`, `screenshot`, `artifact`. `checkedAt` is nullable until actually checked. `reference` is a local source identifier for owner-brief, or a valid HTTPS URL / validated local media path for the relevant kind. No placeholder URL such as `#` or `example.com` is accepted as evidence.

The owner brief records supplied facts, not independent verification. A verified outcome needs at least one checked, reviewable non-owner-brief source. A schema can enforce presence and relationships, not truth: editorial review must confirm the linked source supports the claim. A repository link alone does not substantiate business impact. Evidence IDs must resolve within the project.

## Public projection

Select only published records. Output the known public fields above except `internalName` and `authorNotes`. Public evidence entries contain display label and safe source link when available; owner-brief entries become `Owner-provided description`, without internal paths or conversation content. Any future private evidence fields must be explicitly excluded.

Filter before imports and bundling, not in `ProjectCard`. Generate one deterministic public manifest for UI, prerendering and sitemap. Production never emits draft slugs or draft-only media. No indexer is created in Phase 1; later systems must consume the manifest.

Use safe relative paths rooted under `content/media/`, reject traversal/symlink escapes and validate real files. Copy only assets referenced by the public projection, plus explicitly public profile media. The supplied profile image is `content/media/profile/profile.jpg` and must be referenced by its real path, not guessed. A failed real image falls back to `Portrait unavailable` rather than a broken image URL. Missing screenshots use an empty array and `Screenshots pending` text.

## Initial records to prepare after approval

| Slug | Name | Proposed public headline | Publication | Project status |
|---|---|---|---|---|
| `saklolo161` | Saklolo161 | Improving Emergency Reporting and Response Coordination | published / preliminary | unknown |
| `bistrobuddies-app` | BistroBuddies App | Simplifying Coffee Ordering and Business Operations | published / preliminary | unknown |
| `bistrobuddies-promo` | BistroBuddies Promo Website | Making a Mobile Coffee App Easier to Discover | published / preliminary | unknown |
| `erp-quotation-migrator` | ERP Quotation Migrator | Turning PDF Quotations into Structured, Editable Records | published / preliminary | unknown |

Public summaries use only these brief descriptions: emergency response and incident coordination platform; mobile coffee ordering and business operations; product discovery and app promotion; PDF quotation extraction and Excel monitor automation. All four are featured initially, in this table's order. Each has an owner-brief evidence record. ReadyMama is not a record in Phase 1.

Initial contributions, technology lists, verified outcomes, repositories, demos, APK links, screenshots and architecture remain empty/null. Initial problem and proposed-solution claims can remain null rather than extrapolating. Intended outcomes may paraphrase only the editorial headlines and are marked `proposed`. The user has approved preliminary visibility, not unknown factual details.

## Validation rules and meaningful tests

- Accept honest unknown/null/empty states and exactly four initial records.
- Reject duplicate slugs, wrong schema versions, unexpected keys, invalid enums, path traversal and malformed/unsafe URL schemes.
- Reject a `verified` claim without qualifying checked evidence and any dangling evidence ID.
- Reject invalid public media references while permitting empty screenshot arrays.
- Verify synthetic draft sentinel text and its unique media never appear anywhere in generated public files or `dist`. The authorized four records are all published, so this uses test-only fixtures.
- Verify author-note sentinels on a published record are excluded too.
- Flip a formerly published fixture to draft, rebuild without manual cleanup, and verify stale HTML/media are removed.
- Reject draft route resolution and prevent sitemap inclusion.

## Adding a project workflow

1. Copy a documented minimal JSON example to `content/projects/<slug>.json` with publication `draft`.
2. Enter supported facts, mark proposed outcomes explicitly, and leave unknown fields empty/null.
3. Add original media under `content/media/projects/<slug>/`; supply alt text and provenance.
4. Add evidence IDs and review every claimed role, technology and result.
5. Run `npm run content:check` and targeted content tests; locally preview through the documented authoring process without shipping drafts.
6. Explicitly change publication to `published` after review. Set `preliminary` if evidence remains incomplete.
7. Run the full check/build and publication-artifact tests, review the rendered page, then commit conventionally under the approved workflow.

For Phase 1, draft review is via source validation, not a browser preview route that could leak drafts. Published local previews use the same public boundary as production.
