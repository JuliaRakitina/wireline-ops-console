import type { Direction, TelemetrySample } from '../domain/types';

export type DepthDomain = readonly [number, number];
export type Viewport =
  { mode: 'live'; span: number } | { mode: 'history'; domain: DepthDomain; inspectedAt: number };

/** Keep the full requested span; plotting beyond TD makes boundary approaches legible. */
export function constrainDomain(domain: DepthDomain): DepthDomain {
  const span = Math.max(2, Math.min(2_000, domain[1] - domain[0]));
  const top = Math.max(0, domain[0]);
  return [top, top + span];
}

export function followDepthDomain(depth: number, direction: Direction, span = 60): DepthDomain {
  const lead = direction === 'up' ? 0.2 : 0.8;
  return constrainDomain([depth - span * lead, depth + span * (1 - lead)]);
}

/** Acquisition never mutates an inspected domain. Only operator intent changes it. */
export function resolveViewport(
  viewport: Viewport,
  sample?: TelemetrySample,
  lastMovingDirection: Direction = 'down',
): DepthDomain {
  if (viewport.mode === 'history') return viewport.domain;
  const direction =
    sample?.direction === 'stationary' ? lastMovingDirection : (sample?.direction ?? 'down');
  return followDepthDomain(sample?.depth ?? 0, direction, viewport.span);
}

export function inspectViewport(domain: DepthDomain, timestamp: number): Viewport {
  return { mode: 'history', domain: constrainDomain(domain), inspectedAt: timestamp };
}

export function returnToLive(viewport: Viewport): Viewport {
  return {
    mode: 'live',
    span: viewport.mode === 'live' ? viewport.span : viewport.domain[1] - viewport.domain[0],
  };
}

export function zoomDepthDomain(domain: DepthDomain, factor: number, anchor = 0.5): DepthDomain {
  const span = Math.max(2, Math.min(2_000, (domain[1] - domain[0]) * factor));
  const pivot = domain[0] + (domain[1] - domain[0]) * anchor;
  return constrainDomain([pivot - span * anchor, pivot + span * (1 - anchor)]);
}

/** Select the most recent passage through a depth, then the closer observed endpoint. */
export function nearestSampleAtDepth(samples: readonly TelemetrySample[], depth: number) {
  for (let index = samples.length - 1; index > 0; index -= 1) {
    const current = samples[index];
    const previous = samples[index - 1];
    if (current.discontinuity) continue;
    if (
      depth >= Math.min(current.depth, previous.depth) &&
      depth <= Math.max(current.depth, previous.depth)
    ) {
      return Math.abs(current.depth - depth) <= Math.abs(previous.depth - depth)
        ? current
        : previous;
    }
  }
  let nearest: TelemetrySample | undefined;
  let distance = Infinity;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    const candidateDistance = Math.abs(sample.depth - depth);
    if (candidateDistance < distance) {
      nearest = sample;
      distance = candidateDistance;
    }
  }
  return nearest;
}
