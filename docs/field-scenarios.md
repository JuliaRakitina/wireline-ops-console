# Synthetic field scenarios

These presets illustrate operator observations. They are not field procedures, equipment operating limits, or a diagnostic model. Every value and event comes from the deterministic simulator.

## A 60-second product tour

1. Start the ready run in **Live Operations**. Watch depth grow downward and set the differential baseline.
2. Use a chart pan/zoom control to inspect history. Wait a few seconds: the viewport remains held while acquisition continues. Choose **Back to Live**.
3. Inject **Snag / overpull**. Watch speed approach zero and tension move through warning to critical; acknowledge the alert and see that the condition remains visible.
4. Inject **Encoder degradation**. Compare raw and corrected depth, observe a marker reference, and note that a reference correction does not clear degraded acquisition.
5. Open **Run Review** for chronology and CSV, then **Well Profile** for well geometry and the explicitly labeled synthetic survey prototype.

For an isolated repeatable demonstration, reset before each preset and use the default settings. The default seed is 2016; equal seeds, configuration, fixed simulation steps, and commands produce equal telemetry. Browser scheduling affects wall-clock duration, not the model's step sequence.

## Presets and expected observations

### Normal descent

**Do:** Reset, then start or select **Normal descent**.

**Observe:** Downhole motion approaches +0.7 m/s (42 m/min), absolute tension stays around 8 kN with a small deterministic ripple, and magnetic references occur at the configured interval, initially 5 m. Differential tension remains near its 8 kN starting baseline. With the default starting interval, boundary and load alerts are inactive.

**Explain:** Positive speed means cable is being paid out. This model intentionally omits cable stretch, friction curves, and instrument-specific loading.

**Recovery:** Selecting this preset after a load scenario explicitly restores nominal synthetic load and logs that discontinuity. It preserves the operator baseline; if that reference is no longer appropriate, deliberately set a new one. It does not guarantee no boundary alert when the tool is already near a boundary.

### Pause and reverse

**Do:** From a moving run select **Pause and reverse**.

**Observe:** Velocity decelerates at 0.5 m/s² toward zero, stays stationary until roughly four scenario seconds, then approaches −0.65 m/s. The chart revisits depths on retrieval; both visits remain in chronological history. Retrieval adds a modest modeled load increment.

**Explain:** This is a **physical motion scenario**, not the toolbar's acquisition pause. The acquisition-pause control stops acquisition and recording and retains the last reading. A scenario's stationary cable continues to produce measurements and can still change load.

**Recovery:** Select **Normal descent** or request a direction change. Velocity passes continuously through zero; the past trace is preserved.

### Snag / overpull

**Do:** Reset, set the baseline near nominal load, and select **Snag / overpull**.

**Observe:** The operator requests upward motion. The tool briefly moves upward, then stalls by approximately three scenario seconds. Load rises about 1.65 kN each second toward a 21 kN cap. With a nominal baseline and default thresholds, differential warning occurs near 1.8 seconds and differential critical near 3.6 seconds; absolute tension also crosses its separate warning and critical limits. Alert transitions appear in the event history and depth event rail.

**Explain:** Load rise combined with stalled motion is consistent with tool sticking or snag/overpull. The alert describes an observation and possible cause, not a certified diagnosis. The plot can show increasing tension at nearly unchanged depth.

**Recovery:** Acknowledge to record awareness; the physical condition remains active. Select **Normal descent**, request another direction, or reset to exit the injection. Restoring nominal load is an explicit simulator operation, not a suggested real-world response to a snag.

### Sudden tension loss

**Do:** Select **Sudden tension loss** from a nominal run.

**Observe:** Tension falls approximately 10 kN/s toward a 1.35 kN floor. A critical loss-of-load alert appears when the fall rate exceeds the default 4 kN/s limit. The synthetic 2 kN low-load rule keeps the condition visible after the initial falling edge. Signed differential tension becomes negative.

**Explain:** Slack line, a dropped tool, or line break are possible interpretations. This signal alone does not distinguish them. The 2 kN floor is an illustrative fixed demo rule, not a field operating limit.

**Recovery:** Acknowledgment does not restore load. Selecting **Normal descent** or resetting restores the synthetic load and logs the change; the baseline remains unchanged unless explicitly reset.

### Encoder degradation

**Do:** Select **Encoder degradation** and allow a magnetic reference to pass.

**Observe:** The encoder captures 65% of simulated physical travel. Derived raw depth and line speed under-report movement, and acquisition becomes visibly degraded. At each known marker, the reference establishes an explicit corrected-depth offset. Raw depth remains available; sufficiently large corrections break the plotted path. The quality warning stays active after the marker.

**Explain:** A correct reference at one point does not repair lost pulse acquisition. This scenario makes the historical Arduino pulse-rate limitation legible without copying a hardware driver or claiming to reproduce its exact failure curve.

**Recovery:** Select **Normal descent** to restore full pulse capture. The most recent correction remains applied, and acquisition recovery is logged. Reset returns the entire run to its deterministic starting reference.

### Boundary approach

**Do:** Select **Boundary approach** with the default settings.

**Observe:** An explicit scenario setup moves the synthetic tool to `TD − warningDistance + 1 m`, initially 839 m, and logs the discontinuity. It begins 11 m from the 850 m TD, inside the 12 m warning band. At normal descent speed it reaches the 3 m critical band about 11.4 simulation seconds later. The same TD and bands appear in the schematic and alerts.

**Explain:** The setup jump is not cable motion and does not produce a speed spike. Surface proximity is relevant on retrieval; Casing Shoe proximity is directional, according to the side from which the tool approaches. Stationary boundary conditions remain visible.

**Recovery:** Request retrieval to move away from TD, or reset. Changing configuration recomputes boundaries. Acknowledgment alone cannot remove proximity.

## Configuration and review demonstrations

- Change Casing Shoe or TD in **Configuration**, then verify the schematic, depth-chart reference lines when within the visible interval, and alert distances all use the new values.
- Change calibration and inspect the logged reference update. Current corrected depth remains continuous; new travel uses the new calibration.
- Change display units: depth and speed convert for presentation; CSV columns retain m, m/s, and kN.
- Save a run and use **Run Review** to scrub by time or depth and play at different speeds. Hover inspects without pausing replay; a chart click seeks within the displayed history. The depth-seek field searches the whole retained run and chooses the latest equally close visit; time review distinguishes earlier revisits. Historical chart annotations use the configuration effective at the selected sample.
- Export CSV for the bounded retained window. Pauses and reversals preserve chronological visits rather than collapsing all samples at one depth.

## Synthetic/prototype inclinometry

The **Well Profile** survey shows inclination/deviation and azimuth against Measured Depth with a derived illustrative trajectory. Hover/selection shares a depth across the survey views. It is generated data and a visualization extension, not evidence that a physical inclinometer was fully integrated into the original field system.

## Deliberate limits

Thresholds and timings change when configuration or baseline changes. The simplified model assumes known magnetic-marker identities and does not model every sensor fault, cable dynamic, or borehole geometry. The retained measurement and event windows are bounded; old history expires. See [domain-model.md](domain-model.md), [architecture.md](architecture.md), and [provenance-and-safety.md](provenance-and-safety.md) for the precise scope.
