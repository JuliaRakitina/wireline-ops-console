# Performance and visual verification

## Sampling and storage contract

- Simulator: **20 Hz**, fixed 50 ms steps. No invented catch-up backlog after a blocked browser timer.
- Store/UI/measurement recording: **5 Hz**, one immutable snapshot per four acquisitions. Pure alert evaluation and event collection remain at 20 Hz.
- Marker/correction flags and the worst quality seen in each display batch survive downsampling. Acknowledgments expire on a raw condition clear, even between frames.
- Samples: at most **12,000**, approximately 40 minutes at 5 Hz; events at most **500**; configuration revisions at most **64**. When the revision cap is exceeded, samples preceding the oldest retained revision are removed to preserve valid historical configuration.
- D3 uses a fixed group/path per enabled track. Nominal trace sampling targets 2,400 points, with discontinuity points additionally retained; the source buffer still bounds the worst case. Event rendering is limited to 80 visible events. No per-sample DOM node accumulation.
- IndexedDB: one latest bounded snapshot, automatic saves about every 15 seconds of simulation time, plus explicit save/pause/stop. A full raw historian would require a different storage design.

## Verified sustained runs

The unit/integration suite advances the simulator for **30 simulated minutes at 20 Hz** and the actual source/store integration for **45 simulated minutes (54,000 acquisition callbacks)** using a fake clock. The latter asserts exactly 12,000 retained samples and at most 500 events. These check bounded behavior; they are not 45 wall-clock minutes of browser soak testing.

A separate Chromium run used real browser timers for **60.3 seconds** at **1440×900**. Its captured evidence is [performance-results.json](performance-results.json):

| Observation                                            | Result               |
| ------------------------------------------------------ | -------------------- |
| DOM nodes, start → end                                 | 552 → 558            |
| Inspect-history + Back-to-Live pair, four observations | 89 / 72 / 49 / 81 ms |
| Browser page errors                                    | 0                    |
| Display samples at completion, including pre-roll      | 603                  |
| Chromium reported JS heap, start → end                 | 29.4 MB → 29.4 MB    |

The heap API is coarse/quantized and includes the development runtime. These numbers establish a responsive short run on this development machine, not a cross-device latency guarantee or proof of no memory leak. The few additional DOM nodes represent visible marker/grid changes. Longer browser soak tests, mobile device profiling and a production transport are future verification work.

To reproduce with the dev server running:

```sh
node scripts/benchmark-browser.mjs
```

## Browser and visual QA

Playwright Chromium runs the real application and captures synthetic-only screenshots. Browser-clock control makes scenario transitions repeatable; it does not replace the separate real-time measurement above.

| View / condition                        | Evidence                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Live operation, 1440×900                | [Desktop](screenshots/live-desktop.png)                                             |
| Held viewport while live data continues | [History](screenshots/history-desktop.png)                                          |
| Warning before critical                 | [Warning](screenshots/warning-desktop.png)                                          |
| Stationary tool with critical overpull  | [Critical](screenshots/critical-desktop.png)                                        |
| Encoder loss and magnetic reference     | [Degraded](screenshots/degraded-desktop.png)                                        |
| Geometry and thresholds applied         | [Configuration](screenshots/configuration-desktop.png)                              |
| Time/depth playback and export          | [Review](screenshots/review-desktop.png)                                            |
| Well construction and survey prototype  | [Well Profile](screenshots/well-profile-desktop.png)                                |
| Landscape tablet, 1180×820              | [Live](screenshots/live-tablet.png), [Profile](screenshots/well-profile-tablet.png) |
| Narrow screen, 390×844                  | [Live](screenshots/live-mobile.png), [Profile](screenshots/well-profile-mobile.png) |

Screenshots are full-page captures at those viewport widths/heights, so file height may exceed viewport height. They were visually inspected, not merely generated. The review corrected duplicate well headings, insufficient mobile schematic width, low-contrast secondary text, and alert placement below the initial viewport. The main critical state now has an immediate textual status near run controls and an alert panel above the schematic.

Real wheel/drag and keyboard inspection are tested. E2E assertions verify preserved depth domains during live arrival, explicit return-to-live, independent X domains, clipped paths, and no page-level horizontal overflow at tablet/mobile sizes. Dense plots have their own horizontal scrolling on narrow screens. Hover never stops replay; selection is an explicit action.

Automated axe checks cover WCAG A/AA rules on all four primary screens. They complement keyboard and visual review; they do not constitute a full accessibility audit. Reduced motion is respected and alert audio starts disabled.
