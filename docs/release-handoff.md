# Release notes

Julia reviewed the product and approved publishing `JuliaRakitina/wireline-ops-console` in her personal GitHub account. Hosted deployment is pending. No open-source license has been added.

## Deliverable

Wireline Operations Console is a runnable React/TypeScript/D3 product with deterministic telemetry, six physical scenarios, explicit quality, a central absolute-tension needle gauge, operator differential baselines, explainable alerts, independent depth-track scales, held historical viewports, well geometry, prototype survey visualization, recording/replay and CSV/metadata export.

Start after installing dependencies:

```sh
pnpm dev
```

The app is at `http://127.0.0.1:5173`. Keep the development server running while using the local demo. Installation: `pnpm install --frozen-lockfile`.

## Verification

| Command                              | Result                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| `pnpm typecheck`                     | PASS — strict TypeScript                                    |
| `pnpm lint`                          | PASS — zero warnings                                        |
| `pnpm format:check`                  | PASS                                                        |
| `pnpm test`                          | PASS — 97 tests across 8 files                              |
| `pnpm build`                         | PASS — static production bundle                             |
| `pnpm test:e2e`                      | PASS — 9 Chromium tests, including automated WCAG AA checks |
| `pnpm scan:safety`                   | PASS — no findings in scanned working-tree content          |
| `node scripts/benchmark-browser.mjs` | PASS — 60.3-second real-time browser run, no page errors    |

The suite verifies 45 simulated minutes of the actual source/store integration, 12,000 retained samples and bounded events. This differs from the one-minute browser soak. See [performance evidence](performance.md) for exact measurements and [provenance](provenance-and-safety.md) for scan scope and limits. The verification workflow runs on pushes and pull requests; its current status is available in the repository's Actions tab.

## Review these artifacts

- [Live workspace](screenshots/live-desktop.png)
- [Critical overpull](screenshots/critical-desktop.png)
- [Historical inspection](screenshots/history-desktop.png)
- [Well and survey prototype](screenshots/well-profile-desktop.png)
- [Mobile layout](screenshots/live-mobile.png)
- [Five-minute interview narrative and technical Q&A](interview-guide.md)

## Honest limits

All physics and data are synthetic; this is not certified equipment-control software. Retention is approximately 40 minutes at 5 Hz, one browser snapshot, 500 events and 64 configuration revisions. Very frequent settings edits can shorten the sample window. No physical inclinometer integration or production transport is claimed. LAS export is omitted until pass selection/resampling semantics are deliberately implemented. Chromium was tested; broad device/browser certification is not claimed.

## Repository metadata

**Name:** `wireline-ops-console`

**Description:** Real-time wireline operations console with React, TypeScript and D3. Synthetic telemetry, depth-indexed inspection, explainable alerts and replay.

**Topics:** `react`, `typescript`, `d3`, `real-time`, `data-visualization`, `telemetry`, `industrial-ui`, `simulation`, `vitest`, `playwright`, `portfolio`, `wireline`.

## Remaining release decisions

1. Julia decides whether to grant a license. No license is assumed.
2. With deployment approval, choose the static host, configure its deployment, verify the deployed app, and replace the README's live-demo placeholder.
3. Pin the repository to the personal profile when its presentation is ready.

No production key, real dataset or customer information is required for these steps.
