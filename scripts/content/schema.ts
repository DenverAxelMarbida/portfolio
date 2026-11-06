import { isIP } from 'node:net';
import { z } from 'zod';

const text = z.string().trim().min(1).max(20_000);
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const ids = z
  .array(id)
  .refine((values) => new Set(values).size === values.length, 'Duplicate evidence reference');
const supportedIds = ids.min(1, 'Supporting evidence is required');
const checkedDate = z.iso
  .date()
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    'Evidence checkedAt cannot be later than today (UTC)',
  )
  .nullable();

export const HttpsUrl = text.refine((value) => {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      value.startsWith('https://') &&
      !/[\s\\]/.test(value) &&
      ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      isIP(host) === 0 &&
      host.length <= 253 &&
      host.includes('.') &&
      host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
      !/(^|\.)(localhost|local|internal|test|invalid|example|example\.com|example\.org|example\.net)$/.test(
        host,
      ) &&
      ![...url.searchParams.keys()].some((key) =>
        /token|secret|password|api.?key|signature|credential/i.test(key),
      )
    );
  } catch {
    return false;
  }
}, 'Expected a public HTTPS URL without credentials or placeholder destinations');

export const RepositoryUrl = HttpsUrl.refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.hostname === 'github.com' &&
    /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname) &&
    !['settings', 'features', 'topics', 'orgs', 'users', 'login', 'signup', 'marketplace'].includes(
      url.pathname.split('/')[1] ?? '',
    ) &&
    !url.search &&
    !url.hash
  );
}, 'Expected a GitHub repository URL, not a profile or placeholder');

export const MediaPath = z
  .string()
  .regex(
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|jpg|jpeg|pdf|apk)$/,
    'Expected a safe relative media path (PNG, JPEG, PDF or APK)',
  );
const imagePath = MediaPath.refine(
  (value) => /\.(png|jpe?g)$/.test(value),
  'Expected PNG or JPEG image',
);
const claim = z.strictObject({
  text,
  basis: z.enum(['owner-provided', 'proposed', 'verified']),
  evidenceIds: ids,
});
const image = z.strictObject({
  assetPath: imagePath,
  alt: text,
  caption: text.nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  evidenceIds: supportedIds,
});
const link = z.strictObject({ label: text, url: HttpsUrl, evidenceIds: supportedIds });
const architecture = z.strictObject({
  summary: claim,
  decisions: z.array(claim),
  diagrams: z.array(image),
  evidenceIds: supportedIds,
});
const evidence = z
  .strictObject({
    id,
    kind: z.enum([
      'owner-brief',
      'repository',
      'commit',
      'pull-request',
      'documentation',
      'screenshot',
      'artifact',
    ]),
    reference: text,
    label: text,
    checkedAt: checkedDate,
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'owner-brief') return;
    const external = value.reference.startsWith('https://');
    const parsed =
      value.kind === 'repository'
        ? RepositoryUrl.safeParse(value.reference)
        : external
          ? HttpsUrl.safeParse(value.reference)
          : ['screenshot', 'artifact'].includes(value.kind)
            ? MediaPath.safeParse(value.reference)
            : HttpsUrl.safeParse(value.reference);
    if (!parsed.success)
      ctx.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Invalid evidence source URL or media path',
      });
    if (
      external &&
      URL.canParse(value.reference) &&
      ['commit', 'pull-request'].includes(value.kind)
    ) {
      const url = new URL(value.reference);
      const suffix = value.kind === 'commit' ? 'commit/[a-f0-9]{7,40}' : 'pull/[1-9][0-9]*';
      if (
        url.hostname !== 'github.com' ||
        !new RegExp(`^/[^/]+/[^/]+/${suffix}/?$`).test(url.pathname) ||
        url.search ||
        url.hash
      )
        ctx.addIssue({
          code: 'custom',
          path: ['reference'],
          message: 'Expected a reviewable GitHub commit or pull request',
        });
    }
    if (value.kind === 'screenshot' && !external && !imagePath.safeParse(value.reference).success)
      ctx.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Screenshot evidence requires an image',
      });
  });

const ProjectFields = z.strictObject({
  schemaVersion: z.literal(1),
  slug: id,
  internalName: text,
  displayName: text,
  headline: text,
  headlineKind: z.enum(['problem', 'intended-outcome']),
  summary: text,
  problem: claim.nullable(),
  proposedSolution: claim.nullable(),
  intendedOutcomes: z.array(claim),
  verifiedOutcomes: z.array(
    claim.refine((value) => value.basis === 'verified', 'Verified outcomes require verified basis'),
  ),
  contributions: z.array(claim),
  technologies: z.array(z.strictObject({ name: text, evidenceIds: supportedIds })),
  projectStatus: z.enum([
    'unknown',
    'in-development',
    'prototype',
    'released',
    'maintained',
    'archived',
  ]),
  statusEvidenceIds: ids,
  repositories: z.array(link.extend({ url: RepositoryUrl })),
  liveDemos: z.array(link),
  apkDownloads: z.array(
    link.extend({
      url: HttpsUrl.refine(
        (value) => URL.canParse(value) && new URL(value).pathname.endsWith('.apk'),
        'Expected an APK artifact URL',
      ),
      version: text.nullable(),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    }),
  ),
  screenshots: z.array(image),
  architecture: architecture.nullable(),
  featured: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
  publication: z.strictObject({
    status: z.enum(['draft', 'published']),
    readiness: z.enum(['preliminary', 'reviewed']),
  }),
  evidence: z.array(evidence),
  authorNotes: z.string().nullable(),
});

export const ProjectSchema = ProjectFields.superRefine((project, ctx) => {
  const sources = new Map(project.evidence.map((source) => [source.id, source]));
  if (sources.size !== project.evidence.length)
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'Evidence IDs must be unique' });
  if (project.projectStatus !== 'unknown' && !project.statusEvidenceIds.length)
    ctx.addIssue({
      code: 'custom',
      path: ['statusEvidenceIds'],
      message: 'Non-unknown status needs evidence',
    });
  function visit(value: unknown, path: (string | number)[]) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      if ((key === 'evidenceIds' || key === 'statusEvidenceIds') && Array.isArray(item)) {
        for (const ref of item as string[])
          if (!sources.has(ref))
            ctx.addIssue({
              code: 'custom',
              path: [...path, key],
              message: `Unknown evidence ID: ${ref}`,
            });
      } else visit(item, [...path, key]);
    }
    if (record.basis === 'verified') {
      const refs = record.evidenceIds as string[];
      if (
        !refs.some((ref) => {
          const source = sources.get(ref);
          return source && source.kind !== 'owner-brief' && source.checkedAt !== null;
        })
      )
        ctx.addIssue({
          code: 'custom',
          path,
          message: 'Verified claims need checked non-owner-brief evidence',
        });
    }
    if (record.basis === 'owner-provided' && !(record.evidenceIds as string[]).length)
      ctx.addIssue({
        code: 'custom',
        path,
        message: 'Owner-provided claims need supporting evidence',
      });
  }
  visit(project, []);
});

export const ProfileSchema = z.strictObject({
  name: text,
  title: text,
  headline: text.nullable(),
  introduction: text.nullable(),
  github: HttpsUrl.refine(
    (value) =>
      URL.canParse(value) &&
      new URL(value).hostname === 'github.com' &&
      /^\/[A-Za-z0-9-]+\/?$/.test(new URL(value).pathname),
    'Expected a GitHub profile',
  ),
  email: z.email(),
  image: z
    .strictObject({
      assetPath: imagePath,
      alt: text,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable(),
});

const publicEvidence = z.strictObject({
  id,
  kind: evidence.shape.kind,
  label: text,
  url: z.string().nullable(),
  checkedAt: checkedDate,
});
export const PublicProjectSchema = ProjectFields.omit({
  internalName: true,
  authorNotes: true,
  evidence: true,
}).extend({
  evidence: z.array(publicEvidence),
  publication: z.strictObject({
    status: z.literal('published'),
    readiness: z.enum(['preliminary', 'reviewed']),
  }),
});
export const PublicManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  profile: ProfileSchema,
  projects: z.array(PublicProjectSchema),
});
export type Project = z.infer<typeof ProjectSchema>;
export type PublicProject = z.infer<typeof PublicProjectSchema>;
export type PublicManifest = z.infer<typeof PublicManifestSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Claim = z.infer<typeof claim>;
