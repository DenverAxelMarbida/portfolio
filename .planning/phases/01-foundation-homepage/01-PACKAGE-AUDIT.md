# Package legitimacy audit — Phase 1

Status: **01-01 REVIEWED INSTALLATION COMPLETE, 2026-11-05.** Owner authorization and registry/peer/runtime/lockfile-first checks preceded `npm ci`. All 19 direct pins and the approved transitive graph are unchanged. Post-install and final audits report zero production findings and the approved 10 moderate dev-tooling entries, zero high/critical. No pin substitutions or automatic audit fixes. Later direct dependencies remain deferred. Execution evidence is in `01-01-EXECUTION.md` and `docs/verification/phase-1.md`.

Audit date: 2026-11-05. Registry: `https://registry.npmjs.org/` (official npm registry).
Runtime observed: Node `24.21.0`, npm `11.19.0`, Windows x64.

Method: direct registry metadata for each exact version; checked package name, version, publish date, deprecation state, license, repository, engines, peer dependencies, dist integrity, and registry attestation presence. No tarball was downloaded or executed. `npm audit` cannot run until a lockfile exists and is a later check, not a substitute for this legitimacy review.

## Decision summary

- **01-01 installs only the foundation set below.** Content, motion, icon, and axe packages are installed by the milestone that first needs them.
- **Pin exact versions. No `^`, `latest`, `--force`, or `--legacy-peer-deps`.**
- TypeScript **5.9.3**, not latest 7.0.2: `typescript-eslint@8.72.1` supports `>=4.8.4 <6.1.0`.
- ESLint **10.14.0**, not 9.39.5: the 9.x line is deprecated upstream. `eslint-plugin-jsx-a11y` has no ESLint 10-compatible release, so it is **not installed**; accessibility is enforced by axe, Playwright, and manual checks.
- All selected packages are `[VERIFIED]` for registry identity and declared compatibility. `[VERIFIED]` means the published metadata is legitimate and compatible, not that package source code was audited.

## 01-01 foundation install set

Install these only after the owner approves this audit and explicitly authorizes implementation.

| Package | Pin | Why it is needed in 01-01 | Node / peer compatibility | License | Published | Verdict |
|---|---|---|---|---|---|---|
| `react` | `19.3.1` | UI runtime | Node `>=0.10`; no peers | MIT | 2026-10-14 | `[VERIFIED]` attested |
| `react-dom` | `19.3.1` | Static render and hydration | peer `react ^19.3.1` | MIT | 2026-10-14 | `[VERIFIED]` attested |
| `react-router-dom` | `7.18.5` | `/`, explicit 404, future `/projects/:slug/` links | Node `>=20`; peer `react >=18`, `react-dom >=18` | MIT | 2026-10-27 | `[VERIFIED]` attested |
| `vite` | `8.3.6` | Dev, browser build, build-only server bundle | Node `^20.19 \|\| >=22.12`; Node 24.21 satisfies | MIT | 2026-11-05 | `[VERIFIED]` attested; same-day release risk noted |
| `@vitejs/plugin-react` | `6.2.1` | JSX transform and Fast Refresh | peer `vite ^8.0.0`; optional Babel/compiler peers not installed | MIT | 2026-11-02 | `[VERIFIED]` attested |
| `tailwindcss` | `4.3.4` | Design tokens and utilities; v4 CSS-first setup | no engine/peer constraint | MIT | 2026-11-02 | `[VERIFIED]` attested |
| `@tailwindcss/vite` | `4.3.4` | Official Vite integration; no PostCSS chain | peer `vite ^5.2 \|\| ^6 \|\| ^7 \|\| ^8` | MIT | 2026-11-02 | `[VERIFIED]` attested |
| `typescript` | `5.9.3` | Strict type checking | Node `>=14.17`; satisfies typescript-eslint `<6.1.0` | Apache-2.0 | 2025-09-30 | `[VERIFIED]` no attestation |
| `@types/react` | `19.3.0` | React types | no peers; matches React 19.3 line | MIT | 2026-09-09 | `[VERIFIED]` no attestation |
| `@types/react-dom` | `19.3.0` | DOM renderer types | peer `@types/react ^19.3.0` | MIT | 2026-09-09 | `[VERIFIED]` no attestation |
| `@types/node` | `24.19.2` | Node APIs in build/config scripts; matches Node 24 | no engine; peer `{}` | MIT | 2026-10-09 | `[VERIFIED]` no attestation |
| `eslint` | `10.14.0` | Lint runner | Node `^20.19 \|\| ^22.13 \|\| >=24`; optional `jiti` peer not installed | MIT | 2026-10-30 | `[VERIFIED]` no attestation |
| `@eslint/js` | `10.0.1` | Recommended ESLint config | peer `eslint ^10.0.0` | MIT | 2026-02-06 | `[VERIFIED]` no attestation |
| `typescript-eslint` | `8.72.1` | Type-aware TS rules and flat config helpers | peer `eslint ^8.57 \|\| ^9 \|\| ^10`; `typescript >=4.8.4 <6.1.0` | MIT | 2026-10-26 | `[VERIFIED]` attested |
| `eslint-plugin-react-hooks` | `7.1.1` | Hooks correctness rules | Node `>=18`; peer `eslint ^3 … ^10` | MIT | 2026-04-17 | `[VERIFIED]` no attestation |
| `eslint-plugin-react-refresh` | `0.5.7` | Fast Refresh boundary rules | peer `eslint ^9 \|\| ^10` | MIT | 2026-09-14 | `[VERIFIED]` attested |
| `globals` | `17.14.0` | Browser/Node globals for flat config | Node `>=18` | MIT | 2026-11-01 | `[VERIFIED]` no attestation |
| `prettier` | `3.9.10` | Formatting check | Node `>=14` | MIT | 2026-10-10 | `[VERIFIED]` no attestation |
| `@playwright/test` | `1.64.1` | Production-preview browser tests | Node `>=20`; no peers | Apache-2.0 | 2026-10-14 | `[VERIFIED]` attested |

### 01-01 `package.json` dependency shape

```json
{
  "dependencies": {
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "react-router-dom": "7.18.5"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@playwright/test": "1.64.1",
    "@tailwindcss/vite": "4.3.4",
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.2.1",
    "eslint": "10.14.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.7",
    "globals": "17.14.0",
    "prettier": "3.9.10",
    "tailwindcss": "4.3.4",
    "typescript": "5.9.3",
    "typescript-eslint": "8.72.1",
    "vite": "8.3.6"
  }
}
```

## Later-milestone install set

| Package | Pin | Milestone | Why it is needed there | Compatibility | License | Published | Verdict |
|---|---|---|---|---|---|---|---|
| `zod` | `4.6.7` | 01-02 | Strict project schema and inferred types | no engine/peer constraint | MIT | 2026-10-12 | `[VERIFIED]` attested |
| `vitest` | `5.1.0` | 01-02 | Non-watch schema/publication tests | Node `^22.12 \|\| ^24 \|\| >=26`; peer `vite ^6.4 \|\| ^7 \|\| ^8` | MIT | 2026-11-02 | `[VERIFIED]` attested |
| `lucide-react` | `1.69.0` | 01-03 | Small icon set for menu, mail, external link, pause/play | peer `react ^16.5.1 … ^19`; `@types/react *` | ISC | 2026-11-05 | `[VERIFIED]` attested; 1.x release-note check required |
| `motion` | `14.9.1` | 01-04 | Restrained React motion and reduced-motion integration | peer `react ^18 \|\| ^19` (optional) | MIT | 2026-11-04 | `[VERIFIED]` no attestation; official repo |
| `@axe-core/playwright` | `4.14.0` | 01-05 | Automated accessibility scan in Playwright | Node `>=22.12`; peer `playwright-core >=1.0` | MPL-2.0 | 2026-10-15 | `[VERIFIED]` attested; dev-only |

`vitest` is deliberately deferred: 01-01 has no unit tests, and its `test` script is added in 01-02 with the first tests. `motion` and `lucide-react` are not needed for the identity-only tracer. Axe is a release-gate dependency, not a startup dependency.

## Rejected or deferred versions

| Candidate | Why it is not selected | Consequence |
|---|---|---|
| `typescript@7.0.2` (latest) | `typescript-eslint@8.72.1` peer range is `<6.1.0`; using TS 7 would disable type-aware lint or require an unsupported peer override | Pin `5.9.3` |
| `eslint@9.39.5` | Registry marks the 9.x line deprecated: “This version is no longer supported.” | Use `10.14.0` |
| `eslint-plugin-jsx-a11y@6.10.2` | Peer range ends at ESLint 9; no release supports ESLint 10; npm 11 would reject or require `--legacy-peer-deps` | Do not install; axe + Playwright + manual keyboard checks cover accessibility |
| `eslint-plugin-react@7.37.5` | Peer range ends at ESLint 9.7; not required by the plan | Do not install |
| `@types/node@26.6.6` (latest) | Types target Node 26 while this project pins Node 24 | Pin `24.19.2` |
| `npm create vite` scaffold | Generates an unplanned tree and bypasses the approved file/version decisions | Create the small foundation tree manually |

## Compatibility checks

- React `19.3.1` satisfies `react-dom ^19.3.1`, React Router `>=18`, Motion `^19`, and Lucide `^19`.
- Vite `8.3.6` satisfies `@vitejs/plugin-react ^8`, `@tailwindcss/vite` (v5–v8), and Vitest `^8`.
- TypeScript `5.9.3` satisfies `typescript-eslint >=4.8.4 <6.1.0`.
- ESLint `10.14.0` satisfies `@eslint/js ^10`, `typescript-eslint ^10`, `eslint-plugin-react-hooks ^10`, and `eslint-plugin-react-refresh ^9 || ^10`.
- Node `24.21.0` satisfies Vite, Vitest, ESLint, Playwright, React Router, and axe engine floors.
- `@axe-core/playwright@4.14.0` receives `playwright-core@1.64.1` from `@playwright/test@1.64.1`.

## Registry integrity values

Use these to cross-check the generated lockfile. npm will record equivalent integrity; do not hand-author hashes.

<details>
<summary>01-01 packages (sha512)</summary>

```text
react@19.3.1                      sha512-QNhWdt7nrgVWWQG58QuGsAR3jv3Hbe4mb4vz7w2csnHavciZJgda1CPNaldF6eVxv90ud3jUXpKlHL69gO38yw==
react-dom@19.3.1                  sha512-Y0bARz53lhEC1NMCASs0/j+faB/zqt3R8hpvg1e8+61ZVJ4UL0UdC4cBbXfZMcIuhrfgeILTLe+ZeBCavQPtKQ==
react-router-dom@7.18.5           sha512-9HcfDMU6JJ/fp6gJZYGwNE6RknVGS4kBjH1HkNw959mCJi70TVwdipQWv2FEol9uGpi+SZTFtVpJPtEQfayeOw==
vite@8.3.6                        sha512-UI7dK29NnS54Fk+mmo7o+jI6U8Fp7hDl+X5Q1k45WH+d4dSlbLVUETGQ+hfkNgvLQGyoElPj837nZyv4MBc0VA==
@vitejs/plugin-react@6.2.1        sha512-9KyWCij3r0+qLG3Q62vBmv0VyevmYibAtxaCIVK9o0k6CXgaajZRIe8tpfchQcdZArJ5b/7OrIz4W3b2uxVRDA==
tailwindcss@4.3.4                  sha512-PCJZTFFdG+sL3gvnP1Do9o6GbkvH2q0p04xSs3f7cSvmAeK+sttG+/7ncK1fdRwKFfC7n+wDDJaOMBSefkI9ow==
@tailwindcss/vite@4.3.4           sha512-wGukGWb8SVuN7+FJvSS7M5eSJWDIWwVSvUvj1q41eTIhGPsS2DAgFWjA7YURJNwjHSgty59Hz8iMUiyO+YMHBQ==
typescript@5.9.3                  sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==
@types/react@19.3.0               sha512-N0rFCuH9YoxG9/m61l9MfpJKfmLOVU0em7ipIz6TRgSSkvReLB9vL85GB+yr8Bs5leqpvg96JSwF4ZS1s4viQg==
@types/react-dom@19.3.0           sha512-ZI7bU42mZXXKHn/qNLEw2IrbiINU7X5+vfgdixBHkCNpYWXjKgfQ/P+uyGb5CjOLB9UcnTeg3rylQtV2hym44Q==
@types/node@24.19.2               sha512-93d49wCWJkCyN87MxLpNN6KXPCwFw7bVUg79mGUV1OS40JGWwVCr8n61DXCSqz7CV6/VfPkb7xec7uP2M+QHWQ==
eslint@10.14.0                    sha512-T0pNsxkb9IKmtQjhpK3d7nWOpFv+YHuMbTJnSVMoQblF0onvXfErrtp4V1jHtsQPan7dKaGVD0q1WCXnzMF31A==
@eslint/js@10.0.1                 sha512-zeR9k5pd4gxjZ0abRoIaxdc7I3nDktoXZk2qOv9gCNWx3mVwEn32VRhyLaRsDiJjTs0xq/T8mfPtyuXu7GWBcA==
typescript-eslint@8.72.1          sha512-3Li9FfPmQp45nxEtFD1ZCrYFI3cYK5kpyNtmm1H7lMagm8u9sy6PTjy3ytwQZs7KNukOyKFHAZ6z6GjYFeaeXw==
eslint-plugin-react-hooks@7.1.1   sha512-f2I7Gw6JbvCexzIInuSbZpfdQ44D7iqdWX01FKLvrPgqxoE7oMj8clOfto8U6vYiz4yd5oKu39rRSVOe1zRu0g==
eslint-plugin-react-refresh@0.5.7 sha512-XhJSzLljuYD4UjNuFGJu2v7aD3sqNVK12w5/DCUfrNfHWegZo2+TsavNx8MuxMwEquuFAzNbNfXKU0WoZ+YUIg==
globals@17.14.0                   sha512-UtdkTVyAJePQv0J2M9Xe4L0ruNSDV314XiIJsADI2Zf40bcdAonE/D/OhAU8AT99oij9mhLByb+NvA3QWZYgCg==
prettier@3.9.10                   sha512-skGHTH1Yb9QvaTC4hWnRTzEYtCpApF0UMBPz+t/0ZPzP8ihefo/btKd+QA7pUE0fEwA1SbS/NmhyEcstdXOIdA==
@playwright/test@1.64.1           sha512-IaYGml/nSOiZWROfPtuIL7neuu9qDOZ3TNvNljUIrhDMxiGTgPjzj/g9p9RxpS2tSepPDRY+UwAaEeiKtUvIAg==
```

</details>

<details>
<summary>Later-milestone packages (sha512)</summary>

```text
zod@4.6.7                         sha512-g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==
vitest@5.1.0                      sha512-MzmNFnrwa8v8lF1bLxw3UJ4EREwVOVb75VqJZmUDRjJ6EluK/x9th7qTbaeDk41WxE1GxWqmTXcdsfobfH5sOA==
lucide-react@1.69.0               sha512-UTFECm4yEgkgMN0kfLuxWcmlk+4u02Jrqehgk3ZXRx/Ud68OpP7hjkp67bvkBHmIpMaZCIveF1QDYeupO7XmYQ==
motion@14.9.1                     sha512-u58zTNOs6vefAwvPncTJ8vkQm+P08V4+mhNgap8p/mFZjl8+gWp7SG4cMTamebVSgpX6PcDtqzWpZngqKcfd7A==
@axe-core/playwright@4.14.0       sha512-SGUhG5PIHd2eMdpgBF2PyQLOhX+qyDR2PT4cmoS4Qk2ak+jX/rrSvst9l0PGv5WTHolKpUMvVmoHpr4cZgf1RQ==
```

</details>

## Installation boundary

Owner clarification, 2026-11-05: the 19 direct pins and their required transitive dependencies are approved. `eslint-plugin-react-hooks` brings Zod/Babel and Tailwind brings jiti; Zod application integration remains deferred. The reviewed lock has a moderate dev-only minimatch advisory, explicitly accepted for 01-01. See `01-01-EXECUTION.md` for paths and audit evidence. Stop if high/critical findings or unexpected graph changes appear; no overrides, force upgrades, or `npm audit fix`.

After owner approval of this audit **and** explicit authorization to implement 01-01:

1. `npm install --package-lock-only --ignore-scripts` to freeze exact resolution without populating `node_modules`.
2. Inspect `package-lock.json` for exact pins, registry URLs, integrity, and absence of unexpected packages.
3. `npm ci` to populate `node_modules` from the reviewed lockfile. Do not use `npm install <pkg>@latest`.
4. `npm ls --depth=0` must show no invalid or extraneous direct dependencies.
5. `npx playwright install chromium` for 01-01 browser tests. Firefox/WebKit remain a 01-05 concern.
6. `npm audit --omit=dev` and full `npm audit` results are reported, not auto-fixed. `npm audit fix` is not authorized.

Forbidden in this workflow: `npm create vite`, `npm install --force`, `--legacy-peer-deps`, unpinned installs, and package-manager substitution. Do not commit `package-lock.json` without the separately approved commit workflow.

## Residual risks

- `vite@8.3.6` and `lucide-react@1.69.0` were published on 2026-11-05, the audit date. Exact pins, lockfile integrity, and official attestations reduce but do not eliminate same-day release risk. Review release notes before installing.
- `motion@14.9.1`, `typescript@5.9.3`, ESLint 10, Prettier, and several `@types` packages have no registry attestation. They are published by their official repositories/accounts; absence of attestation is recorded rather than treated as a pass.
- Native/optional build packages (`esbuild`/Rolldown binaries, `@tailwindcss/oxide`) may run install scripts. This is expected for Vite/Tailwind, but the lockfile and install output must be reviewed.
- `lucide-react@1.69.0` is a 1.x major. Confirm the named icon exports used by 01-03; if an export changed, use the documented replacement or a local SVG for that icon, never a fabricated asset.
- `@axe-core/playwright` is MPL-2.0 and development-only; it does not ship in the static site.
- No package source code, maintainer account history, or transitive dependency tree was audited in depth. Transitive resolution is verified from the lockfile before `npm ci`.
