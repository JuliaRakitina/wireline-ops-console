# Interview guide

## Five-minute explanation

### 0:00–0:45 — The physical problem

“This is a modern reimplementation of a wireline monitoring system I originally designed, implemented, and field-tested in 2015–2016. A logging unit lowers a downhole instrument on a cable and retrieves it. The operator needs to know where the tool is, how quickly the cable is moving, what load the cable carries, and whether those signals are trustworthy.

“My original scope crossed the hardware/software boundary: sensor selection and acquisition, encoder-derived depth and speed, tension, magnetic depth markers, calibration, operator alerts, recording, and visualization. This version is a local synthetic demonstrator of those relationships.”

### 0:45–1:40 — The chart is a domain model

“The main chart is indexed by measured depth, so depth grows downward. Tension and speed have different physical units; each gets its own horizontal scale, while every track shares the vertical depth axis. D3 handles the scales, axes, line geometry, clipping, and depth interaction; React handles the surrounding application.

“The interesting interaction is what happens when a new measurement arrives while I inspect an earlier interval. New data must not take my viewport away. Follow-live and inspection are explicit states. I can move or zoom the depth window, continue receiving telemetry, and choose Back to Live when I am ready. Reversing the tool also revisits depths, so depth cannot be the unique key for a measurement.”

### 1:40–2:30 — Explainability matters

“Differential tension is deliberately simple: the operator sets a baseline, and the displayed value is current absolute tension minus that baseline. It is signed, so a rise and a loss of load are both legible. I can inject a snag scenario and show the load rise from warning to critical as upward motion stalls.

“I keep raw encoder depth separate from corrected measured depth. A magnetic marker is an explicit reference event with a logged correction. A correction changes our position estimate; it must not be mistaken for cable speed. Acquisition quality is visible beside the measurements.”

### 2:30–3:20 — Architecture and engineering tradeoffs

“The simulator uses a seeded, fixed-step model at 20 Hz, while the external store publishes React snapshots at 5 Hz. That separates measurement acquisition from screen updates. The retained sample and event windows are bounded, so the demo does not accumulate history indefinitely. IndexedDB stores one latest run for review after a refresh, and CSV exports the retained chronology.

“The source abstraction makes a future stream adapter possible without changing chart or domain logic. I did not add a server that the product does not need. A real hardware integration would require a transport and command contract, operational validation, and a separate safety review.”

### 3:20–4:10 — Failure is part of the product

“During original field testing, the Arduino acquisition layer could miss encoder pulses at high pulse rates. That identified a hardware acquisition bottleneck. The later descendant moved to LabJack acquisition and modern tablet software while keeping the foundational operating principles. It was commercialized in 2026; I distinguish my authorship of the original architecture and implementation from later rewrites.

“This demo makes that lesson visible through the encoder-degradation scenario. It labels suspect depth and shows a marker reference correction. The loss-of-load alert also describes the observation instead of pretending to diagnose a broken cable.”

### 4:10–5:00 — Show evidence and limits

“The tests target the domain boundaries and the user interaction that is easy to break: pulse conversion, speed, signed baseline delta, threshold transitions, correction jumps, state transitions, bounded history, and preserving the inspected viewport. Browser tests and screenshots cover the operator path and responsive layouts. I can show the verification results rather than ask you to trust the animation.

“All data here is deterministic and synthetic. The inclinometry view is explicitly a prototype extension; I do not claim the historical inclinometer reached the same field-complete integration as the core system. This project is an explainable portfolio model, not certified field-control software.”

## Likely questions and answer points

| Question                                                | Concise answer points                                                                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why D3 rather than a ready-made chart library?          | Shared downward depth, independent X units, controlled clipping, and retained user viewport are central requirements. Focused D3 modules give direct ownership of those behaviors.                                               |
| How do React and D3 avoid conflicting DOM writes?       | React owns composition and controls; the chart integration owns its drawing subtree and interaction handlers. Data arrives through typed props/snapshots.                                                                        |
| Why does the chart grow downward?                       | Measured Depth describes travel from the wellhead into the borehole. The visual convention reflects the operator's physical task, not the default shape of a time series.                                                        |
| What happens when data arrives during zoom?             | The data updates, but the inspected depth domain remains user-owned. Back to Live is an explicit transition that restores automatic following.                                                                                   |
| Why is depth not the sample identifier?                 | Pauses and reversals produce several observations at the same depth. Sequence and time preserve visits and load changes.                                                                                                         |
| What exactly is differential tension?                   | Current absolute line tension minus an operator-selected tension baseline. It is a signed change from one sensor's reference reading.                                                                                            |
| What is the difference between raw and corrected depth? | Raw depth comes from encoder pulses and calibration. Corrected depth adds an explicit reference offset. Both are retained so uncertainty and adjustments remain inspectable.                                                     |
| How can a marker correction avoid a false speed spike?  | Derive movement speed from pulse/raw-travel changes over elapsed time, not from a corrected-depth jump. Flag and log discontinuities.                                                                                            |
| Why separate lifecycle and signal quality?              | Running/paused describes acquisition control; good/degraded/stale describes confidence in measurements. Combining them into one enumeration creates unnecessary states and hides valid combinations.                             |
| Is acknowledgment the same as clearing an alert?        | No. It records operator awareness. The condition stays visible while its rule remains active; escalation requires fresh attention.                                                                                               |
| What happens over a long run?                           | The retained measurement window caps at 12,000 samples and the event window at 500. Oldest entries expire; no claim of an unlimited historian. Cite the measured run duration in the performance note.                           |
| Why retain 5 Hz when acquisition runs at 20 Hz?         | It reduces snapshot and drawing work while retaining meaningful operator history. Event processing continues at acquisition rate. Raw-waveform analysis would require a separate lossless recorder.                              |
| Why no backend?                                         | This portfolio's useful requirements are satisfied locally. A backend would become justified for authenticated equipment streams, multi-user operations, or durable fleet-wide retention.                                        |
| Is the simulator physically exact?                      | No. It produces coherent direction/load/reference scenarios with known simplifications. Thresholds and correction rules are educational and are not operationally certified.                                                     |
| Can the loss-of-load alert diagnose a line break?       | No. It observes a rapid load reduction that can have several causes. The UI deliberately describes the signal and possible interpretations.                                                                                      |
| Did you write the later commercial system?              | The supported claim is authorship of the original architecture and field-tested implementation. Do not claim every later rewrite without evidence.                                                                               |
| Was inclinometer hardware field integrated?             | Not to the same completed level as the core depth/tension system. The modern survey module is labeled synthetic/prototype.                                                                                                       |
| How was sensitive legacy material handled?              | Read-only selective inspection, no wholesale copying, no real datasets, no production constants or secrets, deterministic synthetic fixtures, and a repository/history scan before release.                                      |
| What would you change for real operations?              | Reviewed hardware/transport semantics, clock and calibration traceability, equipment-specific validation, durable raw recording, explicit command acknowledgments, operational fault policy, and independent safety engineering. |

## Suggested live demonstration

Start a run, set the differential baseline, and inspect an older chart interval while depth continues changing. Return to live, inject a snag, and explain warning versus critical and acknowledgment. Then show encoder degradation, the raw/corrected depth split, and a saved run in Review. Finish with the well profile and its explicit prototype survey label.

Use the current [field scenario guide](field-scenarios.md) for exact controls and recovery behavior. Use actual verification results in the README when discussing testing; do not imply that a synthetic test proves real-world safety.
