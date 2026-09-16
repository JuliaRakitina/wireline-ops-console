# Design

## Source of truth

Status: Active. Refreshed: 2026-09-16. Surfaces: Live Operations, Run Review, Well Profile, Configuration. Evidence: Julia's product brief and original-system account; the legacy behavior map records archive findings. This is a new repository with no inherited UI assets. The decisions below guide the implemented product.

## Brand

Restrained, precise, human industrial software. Trust comes from visible units, raw/corrected measurements, explicit signal quality, and explainable alerts. Avoid decorative machinery, sci-fi effects, radial-gauge grids, and generic dashboard cards.

## Product goals

Make the physical operation understandable in sixty seconds; reward inspection of the streaming chart and safety model. Success means users can provoke, interpret, and acknowledge an event. This is an educational simulator, never equipment control.

## Personas and jobs

Wireline operator: monitor motion and load, inspect history without losing place. Engineering reviewer: understand data ownership, quality, and failure behavior. Recruiter: discover Julia's end-to-end authorship.

## Information architecture

Persistent compact navigation; page title and synthetic-run identity; live state and primary controls; a central line-tension needle gauge between depth/speed and signed differential tension; large depth tracks; well and alert sidebar. Review, profile, and settings stay one click away.

## Design principles

Depth is spatial and increases downward. Measurement confidence is part of the measurement. Pausing acquisition and inspecting history are separate actions. Prefer precise text over ornamental controls. Keep chart space dominant, accepting vertical scrolling on small displays.

## Visual language

Warm off-white canvas, white plotting paper, dark forest chrome, moss/lime accent reserved for selection. Teal tension, violet differential tension, slate speed. Amber and red alerts include symbols and explicit severity. System sans typography plus tabular monospace values. An 8-pixel spacing rhythm, fine borders, 6–12px corners, almost no shadows. No stock or generated artwork. Motion only for stream status and respects reduced motion.

## Components

Typed depth chart owns its D3 subtree; React owns composition and controls. Shared buttons, state badges, panel headings, field labels, metric cells, and event rows. Styles and design tokens live in src/styles.css; visualization styles may remain in dedicated CSS. States include idle, connecting, running, paused, stopped, replay, degraded, warning, and critical.

### Instantaneous load and depth history

The original operator interface included a large needle indicator for absolute line tension, with configurable scale, units, and threshold zones; Julia recalls its central placement and requested its inclusion in the modern main screen. A central needle gauge now provides immediate load monitoring above the depth tracks. Its exact numeric reading, units, warning/critical limits, and signal/last-reading state stay visible. The scale is derived from configured limits and stays fixed as samples arrive; readings outside its range retain their exact value and an explicit range message. Sudden tension loss stays critical even with a low needle angle. Differential tension remains a separate signed reading on the right, with its operator baseline and limits. On narrow screens, depth/speed share a row and the gauge and differential panel stack below.

## Accessibility

Target WCAG AA contrast, visible keyboard focus, semantic navigation and controls. All important numbers and alert explanations available as text. Chart has keyboard inspection and explicit zoom/history buttons. Alert acknowledgment never hides the active condition. Sound opt-in with visual equivalent. No hover-only safety information.

## Responsive behavior

Desktop 1440×900 first; landscape tablet 1180×820. Sidebar collapses below main chart; narrow screen wraps navigation and measurements. Dense tracks may scroll within their own container. Touch users have explicit zoom and inspection controls.

## Interaction states

Ready screen includes a synthetic preview and Start Run. Connecting has a short labeled transition. Paused keeps traces visible. Empty saved review explains recording. Invalid settings use inline messages. Storage failure keeps export available. Signal faults retain last trusted data and explain uncertainty.

## Content voice

English, compact, specific. Use Measured Depth, Casing Shoe, Total Depth, Line Tension, Differential Tension, Magnetic Depth Marker. Never imply a diagnosis from loss of load. A prototype label stays visible on inclinometry.

## Implementation constraints

React, strict TypeScript, Vite, focused D3 modules, plain CSS with tokens. Bounded acquisition and recording, visual publish at a lower rate. Desktop/tablet/mobile screenshot QA plus domain and user-flow tests. No external runtime services or fonts.

## Open questions

None blocking. Publication and licensing remain Julia's decisions after local review.
