import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/domain/model';
import type { SavedRun, TelemetrySample } from '../src/domain/types';
import { closestDepthIndex, configurationAt, isSavedRun, toCSV } from '../src/recording/runs';
import { Simulator } from '../src/telemetry/simulator';

function syntheticRun(): SavedRun {
  const simulator = new Simulator(DEFAULT_CONFIG, 2016, 480);
  const samples = Array.from({ length: 12 }, () => simulator.step(0.05));
  simulator.setBaseline();
  return {
    version: 1,
    id: 'synthetic-recording-test',
    name: 'Synthetic recording test',
    seed: 2016,
    configuration: { ...DEFAULT_CONFIG, depthUnit: 'ft' },
    configurationHistory: [{ timestamp: 0, configuration: { ...DEFAULT_CONFIG, depthUnit: 'ft' } }],
    samples,
    events: simulator.drainEvents(),
    savedAt: samples.at(-1)!.timestamp,
  };
}

// Independent small CSV reader: verifies field boundaries and escaping, not the
// exporter implementation. Test input includes a comma, quote, and line break.
function readCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (character === '\r' && !quoted && csv[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('synthetic run export', () => {
  it('exports explicit canonical units even when display units are feet', () => {
    const run = syntheticRun();
    run.samples[0] = {
      ...run.samples[0],
      rawDepth: 480,
      depth: 481.25,
      correction: 1.25,
      speed: -0.65,
      tension: 6.25,
      baseline: 8,
      differential: -1.75,
      direction: 'up',
      marker: true,
      quality: 'degraded',
      discontinuity: true,
    };
    const [header, first, ...remaining] = readCSV(toCSV(run));
    expect(header).toEqual([
      'timestamp_utc',
      'sequence',
      'encoder_pulses',
      'raw_depth_m',
      'measured_depth_m',
      'correction_m',
      'direction',
      'line_speed_m_s',
      'line_tension_kN',
      'baseline_kN',
      'differential_tension_kN',
      'magnetic_marker',
      'quality',
      'discontinuity',
      'active_alerts',
    ]);
    expect(first).toEqual([
      new Date(run.samples[0].timestamp).toISOString(),
      '1',
      String(run.samples[0].encoderPulses),
      '480.0000',
      '481.2500',
      '1.2500',
      'up',
      '-0.6500',
      '6.2500',
      '8.0000',
      '-1.7500',
      '1',
      'degraded',
      '1',
      '',
    ]);
    expect(remaining).toHaveLength(run.samples.length - 1);
    expect([first, ...remaining].every((row) => row.length === header.length)).toBe(true);
  });

  it('retains repeated depths and sequence order rather than merging separate visits', () => {
    const run = syntheticRun();
    run.samples = run.samples
      .slice(0, 3)
      .map((sample, index) => ({ ...sample, depth: 480, tension: 8 + index, differential: index }));
    const rows = readCSV(toCSV(run)).slice(1);
    expect(rows.map((row) => row[1])).toEqual(['1', '2', '3']);
    expect(rows.map((row) => row[4])).toEqual(['480.0000', '480.0000', '480.0000']);
    expect(rows.map((row) => row[8])).toEqual(['8.0000', '9.0000', '10.0000']);
  });

  it('escapes text in an alert identifier without creating extra CSV fields or rows', () => {
    const run = syntheticRun();
    const id = 'synthetic,"quoted"\nalert';
    run.samples[0] = {
      ...run.samples[0],
      alerts: [
        {
          id,
          severity: 'warning',
          title: 'Synthetic test warning',
          detail: 'Only generated test data.',
        },
      ],
    };
    const rows = readCSV(toCSV(run));
    expect(rows).toHaveLength(run.samples.length + 1);
    expect(rows[1]).toHaveLength(rows[0].length);
    expect(rows[1].at(-1)).toBe(`${id}:warning`);
  });

  it('keeps configuration and operator event text in a JSON metadata roundtrip', () => {
    const run = syntheticRun();
    run.events.push({
      id: 'synthetic-note',
      timestamp: run.samples[0].timestamp,
      depth: 480,
      type: 'operator',
      title: 'Synthetic "note", recorded',
      detail: 'First line\nSecond line: baseline = 8 kN.',
    });
    const restored: unknown = JSON.parse(JSON.stringify(run));
    expect(isSavedRun(restored)).toBe(true);
    expect(restored).toEqual(run);
  });
});

describe('saved-run validation', () => {
  it('accepts a generated, bounded run and rejects unsupported schema versions', () => {
    const run = syntheticRun();
    expect(isSavedRun(run)).toBe(true);
    expect(isSavedRun({ ...run, version: 2 })).toBe(false);
    expect(isSavedRun(null)).toBe(false);
  });

  it('rejects empty or invalid configuration rather than restoring unsafe settings', () => {
    const run = syntheticRun();
    expect(isSavedRun({ ...run, configuration: {} })).toBe(false);
    expect(
      isSavedRun({
        ...run,
        configuration: { ...run.configuration, casingShoe: run.configuration.totalDepth + 1 },
      }),
    ).toBe(false);
    expect(
      isSavedRun({ ...run, configuration: { ...run.configuration, depthUnit: 'unknown' } }),
    ).toBe(false);
  });

  it('rejects non-finite samples and invalid signal metadata', () => {
    const run = syntheticRun();
    for (const patch of [
      { depth: Number.NaN },
      { speed: Infinity },
      { marker: 'yes' },
      { discontinuity: 1 },
      { quality: 'trusted' },
      { direction: 'sideways' },
      { sequence: -1 },
      { alerts: [{}] },
    ]) {
      expect(isSavedRun({ ...run, samples: [{ ...run.samples[0], ...patch }] })).toBe(false);
    }
  });

  it('rejects corrupted events without throwing during browser restore', () => {
    const run = syntheticRun();
    for (const event of [
      null,
      42,
      {},
      { ...run.events[0], type: 'unknown' },
      { ...run.events[0], detail: undefined },
    ]) {
      expect(() => isSavedRun({ ...run, events: [event] })).not.toThrow();
      expect(isSavedRun({ ...run, events: [event] })).toBe(false);
    }
  });

  it('enforces retained-window limits and requires at least one sample', () => {
    const run = syntheticRun();
    expect(isSavedRun({ ...run, samples: [] })).toBe(false);
    expect(
      isSavedRun({
        ...run,
        samples: Array.from({ length: 12_001 }, (_, index) => ({
          ...run.samples[0],
          sequence: index,
          timestamp: run.samples[0].timestamp + index * 50,
        })),
      }),
    ).toBe(false);
    expect(
      isSavedRun({
        ...run,
        events: Array.from({ length: 501 }, (_, index) => ({
          ...run.events[0],
          id: `synthetic-${index}`,
        })),
      }),
    ).toBe(false);
  });
});

describe('depth seeking', () => {
  function atDepths(depths: number[]): TelemetrySample[] {
    const sample = syntheticRun().samples[0];
    return depths.map((depth, index) => ({
      ...sample,
      depth,
      sequence: index,
      timestamp: sample.timestamp + index * 200,
    }));
  }

  it('selects the latest equally close chronological visit', () => {
    const samples = atDepths([480, 481, 482, 481, 480]);
    expect(closestDepthIndex(samples, 481)).toBe(3);
    expect(closestDepthIndex(samples, 480.5)).toBe(4);
  });

  it('chooses the nearest retained depth when the target is outside the window', () => {
    const samples = atDepths([480, 481, 482]);
    expect(closestDepthIndex(samples, 100)).toBe(0);
    expect(closestDepthIndex(samples, 900)).toBe(2);
  });
});

it('reconstructs configuration at the selected sample instead of applying the final settings retroactively', () => {
  const run = syntheticRun();
  const timestamp = run.samples[5].timestamp;
  run.configurationHistory.push({
    timestamp,
    configuration: { ...DEFAULT_CONFIG, casingShoe: 600, tensionWarning: 10 },
  });
  expect(configurationAt(run, run.samples[2].timestamp).casingShoe).toBe(DEFAULT_CONFIG.casingShoe);
  expect(configurationAt(run, timestamp).casingShoe).toBe(600);
  expect(configurationAt(run, timestamp).tensionWarning).toBe(10);
});
