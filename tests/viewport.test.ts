import { describe, expect, it } from 'vitest';
import type { TelemetrySample } from '../src/domain/types';
import {
  constrainDomain,
  followDepthDomain,
  inspectViewport,
  nearestSampleAtDepth,
  resolveViewport,
  returnToLive,
  zoomDepthDomain,
  type Viewport,
} from '../src/visualization/viewport';
import { createSyntheticSurvey } from '../src/visualization/survey';

function sample(
  depth: number,
  sequence: number,
  changes: Partial<TelemetrySample> = {},
): TelemetrySample {
  return {
    sequence,
    timestamp: sequence * 1000,
    depth,
    rawDepth: depth,
    encoderPulses: depth * 100,
    correction: 0,
    direction: 'down',
    speed: 0.7,
    tension: 8,
    baseline: 8,
    differential: 0,
    marker: false,
    quality: 'good',
    alerts: [],
    discontinuity: false,
    ...changes,
  };
}

describe('depth viewport operator ownership', () => {
  it('depth grows downward and leaves room ahead of the current direction', () => {
    expect(followDepthDomain(480, 'down', 60)).toEqual([432, 492]);
    expect(followDepthDomain(480, 'up', 60)).toEqual([468, 528]);
  });

  it('preserves the inspected viewport through continued telemetry, reversal and correction', () => {
    const inspected: Viewport = inspectViewport([410, 445], 10_000);
    const domain = resolveViewport(inspected, sample(440, 10));
    for (let sequence = 11; sequence <= 600; sequence += 1) {
      const current = sample(440 + sequence, sequence, {
        direction: sequence > 40 ? 'up' : 'down',
        discontinuity: sequence === 150,
      });
      expect(resolveViewport(inspected, current)).toBe(domain);
    }
    expect(domain).toEqual([410, 445]);
    expect(inspected).toEqual({ mode: 'history', domain: [410, 445], inspectedAt: 10_000 });
  });

  it('returns to the latest sample without resetting the operator zoom span', () => {
    const inspected = inspectViewport([100, 130], 1000);
    const returned = returnToLive(inspected);
    expect(returned).toEqual({ mode: 'live', span: 30 });
    expect(resolveViewport(returned, sample(700, 50))).toEqual([676, 706]);
    expect(resolveViewport(returned, sample(710, 60))).toEqual([686, 716]);
    expect(resolveViewport(returned, sample(709, 61, { direction: 'up' }))).toEqual([703, 733]);
  });

  it('holds the same follow orientation when a retrieving cable stops', () => {
    const viewport: Viewport = { mode: 'live', span: 60 };
    expect(resolveViewport(viewport, sample(480, 1, { direction: 'up' }))).toEqual(
      resolveViewport(viewport, sample(480, 2, { direction: 'stationary', speed: 0 }), 'up'),
    );
  });

  it('keeps a useful span at surface and clamps extreme zoom gestures', () => {
    expect(constrainDomain([-40, 20])).toEqual([0, 60]);
    expect(zoomDepthDomain([100, 160], 0)).toEqual([129, 131]);
    expect(
      zoomDepthDomain([100, 160], 1_000_000)[1] - zoomDepthDomain([100, 160], 1_000_000)[0],
    ).toBe(2000);
    expect(zoomDepthDomain([100, 160], 0.5)).toEqual([115, 145]);
  });

  it('selects the latest visit to a depth even when an older sample is marginally closer', () => {
    const descending = [sample(400, 1), sample(400.49, 2), sample(401, 3)];
    const ascending = [
      sample(400.8, 4, { tension: 14, direction: 'up' }),
      sample(400.3, 5, { tension: 15, direction: 'up' }),
    ];
    expect(nearestSampleAtDepth([...descending, ...ascending], 400.5)?.sequence).toBe(5);
  });

  it('selects the latest stationary observation and never interpolates across a correction jump', () => {
    const observations = [
      sample(100, 1),
      sample(101, 2),
      sample(110, 3, { discontinuity: true }),
      sample(110, 4),
    ];
    expect(nearestSampleAtDepth(observations, 110)?.sequence).toBe(4);
    expect(nearestSampleAtDepth(observations, 103)?.sequence).toBe(2);
    expect(nearestSampleAtDepth([], 100)).toBeUndefined();
  });
});

describe('synthetic survey geometry', () => {
  it('is deterministic and distinguishes Measured Depth from True Vertical Depth', () => {
    const survey = createSyntheticSurvey(900);
    expect(survey).toEqual(createSyntheticSurvey(900));
    expect(survey).toHaveLength(41);
    expect(survey[0]).toMatchObject({ depth: 0, vertical: 0, section: 0 });
    const end = survey.at(-1)!;
    expect(end.depth).toBe(900);
    expect(end.vertical).toBeLessThan(end.depth);
    expect(end.section).toBeGreaterThan(100);
    expect(end.inclination).toBeCloseTo(26);
  });

  it('propagates Total Depth while retaining the synthetic angular profile', () => {
    const short = createSyntheticSurvey(600);
    const long = createSyntheticSurvey(1200);
    expect(long[20].inclination).toBe(short[20].inclination);
    expect(long[20].azimuth).toBe(short[20].azimuth);
    expect(long[20].vertical).toBeCloseTo(short[20].vertical * 2);
    expect(long[20].section).toBeCloseTo(short[20].section * 2);
  });
});
