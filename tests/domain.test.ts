import { describe, expect, it } from 'vitest';
import { evaluateAlerts } from '../src/alerts/rules';
import { transition } from '../src/domain/lifecycle';
import {
  applyMarkerCorrection,
  DEFAULT_CONFIG,
  deriveLineSpeed,
  differentialTension,
  pulsesToDepth,
  validateConfiguration,
} from '../src/domain/model';
import type { Lifecycle, TelemetrySample } from '../src/domain/types';
import { RingBuffer } from '../src/telemetry/buffer';
import { Simulator } from '../src/telemetry/simulator';
import { SampleValidator } from '../src/telemetry/validation';

function sample(patch: Partial<TelemetrySample> = {}): TelemetrySample {
  return { ...new Simulator().current, ...patch };
}

function advance(simulator: Simulator, seconds: number): TelemetrySample[] {
  return Array.from({ length: Math.round(seconds * 20) }, () => simulator.step());
}

describe('encoder travel, speed and magnetic depth references', () => {
  it('converts signed pulses using the configured calibration', () => {
    expect(pulsesToDepth(12_800, 400)).toBe(32);
    expect(pulsesToDepth(-1_000, 500)).toBe(-2);
    expect(() => pulsesToDepth(100, 0)).toThrow();
    expect(() => pulsesToDepth(Number.NaN, 400)).toThrow();
  });

  it('derives signed line speed from raw travel and elapsed seconds', () => {
    expect(deriveLineSpeed(100, 101.5, 2)).toBe(0.75);
    expect(deriveLineSpeed(100, 98, 2)).toBe(-1);
    expect(deriveLineSpeed(100, 100, 2)).toBe(0);
    expect(() => deriveLineSpeed(1, 2, 0)).toThrow();
  });

  it('applies a reference without rewriting raw encoder depth', () => {
    expect(applyMarkerCorrection(498.25, 500)).toEqual({
      depth: 500,
      correction: 1.75,
      discontinuity: true,
    });
    expect(applyMarkerCorrection(501.23, 500, -1.22).discontinuity).toBe(false);
    expect(() => applyMarkerCorrection(1, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('keeps a large marker correction out of the line-speed derivative', () => {
    const simulator = new Simulator(DEFAULT_CONFIG, 2016, 498);
    simulator.setScenario('encoder');
    let previous = simulator.current;
    let corrected: TelemetrySample | undefined;
    for (const next of advance(simulator, 5)) {
      if (next.marker) {
        corrected = next;
        expect(next.depth).toBe(500);
        expect(next.correction).toBeGreaterThan(0.5);
        expect(next.speed).toBeCloseTo((next.rawDepth - previous.rawDepth) / 0.05);
        expect(next.speed).toBeLessThan(0.6);
        expect(next.discontinuity).toBe(true);
        expect(next.quality).toBe('degraded');
      }
      previous = next;
    }
    expect(corrected).toBeDefined();
    expect(
      simulator
        .drainEvents()
        .some(
          (event) =>
            event.type === 'marker' && event.detail.includes('Acquisition remains degraded'),
        ),
    ).toBe(true);
  });

  it('detects a marker again on the uphole pass without erasing history', () => {
    const simulator = new Simulator(DEFAULT_CONFIG, 2016, 498);
    const descent = advance(simulator, 5);
    simulator.setDirection('up');
    const ascent = advance(simulator, 10);
    expect(descent.some((point) => point.marker && point.depth === 500)).toBe(true);
    expect(ascent.some((point) => point.marker && point.depth === 500)).toBe(true);
    expect(ascent.at(-1)!.direction).toBe('up');
    expect(ascent.at(-1)!.depth).toBeLessThan(descent.at(-1)!.depth);
  });
});

describe('operator-defined differential tension and explainable alerts', () => {
  it('uses current line tension minus the operator baseline, including negative change', () => {
    expect(differentialTension(11.25, 8)).toBe(3.25);
    expect(differentialTension(5, 8)).toBe(-3);
    expect(differentialTension(8, 8)).toBe(0);
  });

  it('sets a baseline at the current load and logs the operator action', () => {
    const simulator = new Simulator();
    simulator.setScenario('snag');
    advance(simulator, 3);
    const currentLoad = simulator.current.tension;
    expect(simulator.current.differential).toBeGreaterThan(3);
    simulator.setBaseline();
    expect(simulator.current.baseline).toBe(currentLoad);
    expect(simulator.current.differential).toBe(0);
    expect(simulator.current.alerts.some((alert) => alert.id === 'line-tension')).toBe(true);
    expect(
      simulator.drainEvents().some((event) => event.title === 'Differential baseline set'),
    ).toBe(true);
    expect(simulator.step().differential).toBeCloseTo(simulator.current.tension - currentLoad);
  });

  it.each([
    [2.99, undefined],
    [3, 'warning'],
    [5.99, 'warning'],
    [6, 'critical'],
    [-2.99, undefined],
    [-3, 'warning'],
    [-6, 'critical'],
  ])('classifies signed differential %s at inclusive boundaries', (differential, severity) => {
    const alerts = evaluateAlerts(sample({ differential: Number(differential) }), DEFAULT_CONFIG);
    expect(alerts.find((alert) => alert.id === 'differential-tension')?.severity).toBe(severity);
  });

  it.each([
    [11.99, undefined],
    [12, 'warning'],
    [15.99, 'warning'],
    [16, 'critical'],
  ])('classifies absolute tension %s at inclusive boundaries', (tension, severity) => {
    expect(
      evaluateAlerts(sample({ tension: Number(tension) }), DEFAULT_CONFIG).find(
        (alert) => alert.id === 'line-tension',
      )?.severity,
    ).toBe(severity);
  });

  it('detects a rapid loss independently of a simultaneous depth correction', () => {
    const previous = sample({ tension: 8, timestamp: 1_000 });
    const current = sample({ tension: 7.5, timestamp: 1_050, discontinuity: true });
    expect(
      evaluateAlerts(current, DEFAULT_CONFIG, previous).find((alert) => alert.id === 'loss-of-load')
        ?.severity,
    ).toBe('critical');
    expect(
      evaluateAlerts(sample({ tension: 7.9, timestamp: 1_050 }), DEFAULT_CONFIG, previous).some(
        (alert) => alert.id === 'loss-of-load',
      ),
    ).toBe(false);
  });

  it('keeps a loss-of-load alert active at the synthetic low-load floor', () => {
    const alerts = evaluateAlerts(sample({ tension: 1.4 }), DEFAULT_CONFIG);
    expect(alerts.find((alert) => alert.id === 'loss-of-load')?.detail).toContain(
      'does not identify a cause',
    );
  });

  it('only warns for boundaries in the direction of approach and preserves proximity at rest', () => {
    expect(
      evaluateAlerts(sample({ depth: 840, direction: 'down' }), DEFAULT_CONFIG).some(
        (alert) => alert.id === 'td-proximity',
      ),
    ).toBe(true);
    expect(
      evaluateAlerts(sample({ depth: 840, direction: 'up' }), DEFAULT_CONFIG).some(
        (alert) => alert.id === 'td-proximity',
      ),
    ).toBe(false);
    expect(
      evaluateAlerts(sample({ depth: 2, direction: 'up' }), DEFAULT_CONFIG).find(
        (alert) => alert.id === 'surface-proximity',
      )?.severity,
    ).toBe('critical');
    expect(
      evaluateAlerts(sample({ depth: 2, direction: 'down' }), DEFAULT_CONFIG).some(
        (alert) => alert.id === 'surface-proximity',
      ),
    ).toBe(false);
    expect(
      evaluateAlerts(sample({ depth: 550, direction: 'down' }), DEFAULT_CONFIG).some(
        (alert) => alert.id === 'shoe-proximity',
      ),
    ).toBe(true);
    expect(
      evaluateAlerts(sample({ depth: 570, direction: 'down' }), DEFAULT_CONFIG).some(
        (alert) => alert.id === 'shoe-proximity',
      ),
    ).toBe(false);
    expect(
      evaluateAlerts(sample({ depth: 570, direction: 'up' }), DEFAULT_CONFIG).some(
        (alert) => alert.id === 'shoe-proximity',
      ),
    ).toBe(true);
    expect(
      evaluateAlerts(sample({ depth: 558, direction: 'stationary' }), DEFAULT_CONFIG).find(
        (alert) => alert.id === 'shoe-proximity',
      )?.severity,
    ).toBe('critical');
  });

  it('keeps the surface alarm critical when a sensor reports an uphole overshoot', () => {
    expect(
      evaluateAlerts(sample({ depth: -0.5, direction: 'up' }), DEFAULT_CONFIG).find(
        (alert) => alert.id === 'surface-proximity',
      )?.severity,
    ).toBe('critical');
    expect(
      evaluateAlerts(sample({ depth: -0.5, direction: 'stationary' }), DEFAULT_CONFIG).find(
        (alert) => alert.id === 'surface-proximity',
      )?.severity,
    ).toBe('critical');
  });
});

describe('deterministic physical scenarios', () => {
  it('produces identical samples and events from equal seeds and controls', () => {
    const first = new Simulator(DEFAULT_CONFIG, 42);
    const second = new Simulator(DEFAULT_CONFIG, 42);
    expect(advance(first, 2)).toEqual(advance(second, 2));
    first.setScenario('encoder');
    second.setScenario('encoder');
    expect(advance(first, 8)).toEqual(advance(second, 8));
    expect(first.drainEvents()).toEqual(second.drainEvents());
    expect(advance(new Simulator(DEFAULT_CONFIG, 43), 2)).not.toEqual(
      advance(new Simulator(DEFAULT_CONFIG, 42), 2),
    );
  });

  it('descends smoothly with plausible load, regular markers and no initial alerts', () => {
    const simulator = new Simulator(DEFAULT_CONFIG, 2016, 460);
    const points = advance(simulator, 60);
    expect(points.at(-1)!.depth).toBeCloseTo(502, 1);
    expect(
      points.every((point) => point.direction === 'down' && point.speed > 0.6 && point.speed < 0.8),
    ).toBe(true);
    expect(
      points.every(
        (point) => point.tension > 7.8 && point.tension < 8.2 && point.alerts.length === 0,
      ),
    ).toBe(true);
    expect(points.filter((point) => point.marker).length).toBe(8);
  });

  it('decelerates, pauses, then reverses without a false loss-of-load alarm', () => {
    const simulator = new Simulator();
    simulator.setScenario('reverse');
    const points = advance(simulator, 7);
    expect(points[0].speed).toBeGreaterThan(0);
    expect(points.slice(40, 70).every((point) => point.direction === 'stationary')).toBe(true);
    expect(points.at(-1)!.speed).toBeLessThan(-0.5);
    expect(
      points.every((point) => !point.alerts.some((alert) => alert.id === 'loss-of-load')),
    ).toBe(true);
  });

  it('snag slows the tool and produces warning before critical within eight seconds', () => {
    const simulator = new Simulator();
    simulator.setScenario('snag');
    const points = advance(simulator, 8);
    const warning = points.findIndex((point) =>
      point.alerts.some((alert) => alert.severity === 'warning'),
    );
    const critical = points.findIndex((point) =>
      point.alerts.some((alert) => alert.severity === 'critical'),
    );
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(critical).toBeGreaterThan(warning);
    expect(points.at(-1)!.speed).toBe(0);
    expect(points.at(-1)!.tension).toBeGreaterThan(DEFAULT_CONFIG.tensionCritical);
    const alertEvents = simulator.drainEvents().filter((event) => event.type === 'alert');
    expect(alertEvents.some((event) => event.severity === 'warning')).toBe(true);
    expect(alertEvents.some((event) => event.severity === 'critical')).toBe(true);
  });

  it('detects sudden tension loss quickly and describes possible rather than certain causes', () => {
    const simulator = new Simulator();
    simulator.setScenario('loss');
    const first = simulator.step();
    expect(first.alerts.find((alert) => alert.id === 'loss-of-load')?.severity).toBe('critical');
    advance(simulator, 2);
    expect(simulator.current.tension).toBeLessThan(2);
    expect(simulator.current.alerts.find((alert) => alert.id === 'loss-of-load')?.detail).toContain(
      'Possible',
    );
  });

  it('restores a selected normal preset with a logged discontinuity and unchanged baseline', () => {
    const simulator = new Simulator();
    simulator.setScenario('snag');
    advance(simulator, 8);
    const baseline = simulator.current.baseline;
    simulator.setScenario('normal');
    expect(simulator.current.tension).toBe(8);
    expect(simulator.step().alerts.some((alert) => alert.id === 'loss-of-load')).toBe(false);
    expect(simulator.current.baseline).toBe(baseline);
    expect(simulator.drainEvents().some((event) => event.title === 'Synthetic load restored')).toBe(
      true,
    );
  });

  it('makes the boundary preset jump explicit and keeps speed coherent', () => {
    const simulator = new Simulator();
    simulator.setScenario('boundary');
    expect(simulator.current.depth).toBe(
      DEFAULT_CONFIG.totalDepth - DEFAULT_CONFIG.warningDistance + 1,
    );
    expect(simulator.current.discontinuity).toBe(true);
    expect(simulator.step().speed).toBeCloseTo(0.7);
    expect(simulator.current.alerts.find((alert) => alert.id === 'td-proximity')?.severity).toBe(
      'warning',
    );
    advance(simulator, 13);
    expect(simulator.current.alerts.find((alert) => alert.id === 'td-proximity')?.severity).toBe(
      'critical',
    );
    expect(
      simulator.drainEvents().some((event) => event.title === 'Synthetic depth repositioned'),
    ).toBe(true);
  });
});

describe('configuration integrity and immediate rule propagation', () => {
  it('rejects missing settings and malformed imported configuration objects', () => {
    expect(validateConfiguration({ depthUnit: 'm' })).not.toEqual([]);
    expect(validateConfiguration({ ...DEFAULT_CONFIG, lossRate: undefined })).not.toEqual([]);
    expect(validateConfiguration({ ...DEFAULT_CONFIG, depthUnit: undefined })).not.toEqual([]);
    expect(validateConfiguration(null)).not.toEqual([]);
    expect(validateConfiguration([])).not.toEqual([]);
    expect(validateConfiguration('synthetic')).not.toEqual([]);
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const incomplete: Record<string, unknown> = { ...DEFAULT_CONFIG };
      delete incomplete[key];
      expect(validateConfiguration(incomplete), `missing ${key}`).not.toEqual([]);
    }
  });

  it('rejects impossible geometry and unordered thresholds', () => {
    expect(validateConfiguration(DEFAULT_CONFIG)).toEqual([]);
    expect(validateConfiguration({ ...DEFAULT_CONFIG, casingShoe: 900 }).length).toBeGreaterThan(0);
    expect(
      validateConfiguration({ ...DEFAULT_CONFIG, criticalDistance: 20 }).length,
    ).toBeGreaterThan(0);
    expect(
      validateConfiguration({ ...DEFAULT_CONFIG, tensionCritical: 10 }).length,
    ).toBeGreaterThan(0);
    expect(
      validateConfiguration({ ...DEFAULT_CONFIG, pulsesPerMeter: Number.NaN }).length,
    ).toBeGreaterThan(0);
  });

  it('updates boundary alerts immediately when well geometry changes', () => {
    const simulator = new Simulator();
    expect(simulator.current.alerts).toEqual([]);
    simulator.configure({ ...DEFAULT_CONFIG, casingShoe: 482 });
    expect(simulator.current.alerts.find((alert) => alert.id === 'shoe-proximity')?.severity).toBe(
      'critical',
    );
    simulator.configure({ ...DEFAULT_CONFIG, casingShoe: 600 });
    expect(simulator.current.alerts.some((alert) => alert.id === 'shoe-proximity')).toBe(false);
  });

  it('rebases changed encoder calibration without an artificial depth or speed jump', () => {
    const simulator = new Simulator();
    advance(simulator, 1);
    const depth = simulator.current.depth;
    simulator.configure({ ...DEFAULT_CONFIG, pulsesPerMeter: 800 });
    expect(simulator.current.depth).toBe(depth);
    expect(simulator.current.discontinuity).toBe(true);
    expect(simulator.step().speed).toBeCloseTo(0.7);
    expect(simulator.current.depth - depth).toBeCloseTo(0.035);
  });

  it('repositions explicitly if new Total Depth would exclude the current synthetic tool', () => {
    const simulator = new Simulator();
    simulator.configure({ ...DEFAULT_CONFIG, totalDepth: 400, casingShoe: 300 });
    expect(simulator.current.depth).toBe(400);
    expect(simulator.current.discontinuity).toBe(true);
    expect(simulator.step().speed).toBe(0);
    expect(
      simulator
        .drainEvents()
        .some((event) => event.title === 'Synthetic tool repositioned to Total Depth'),
    ).toBe(true);
  });
});

describe('explicit lifecycle transitions', () => {
  it('connects, starts, pauses, reverses while paused, resumes and stops', () => {
    let state: Lifecycle = { phase: 'idle' };
    state = transition(state, { type: 'connect' });
    expect(state.phase).toBe('connecting');
    state = transition(state, { type: 'ready' });
    expect(state.phase).toBe('ready');
    state = transition(state, { type: 'start' });
    expect(state).toEqual({ phase: 'running', direction: 'down' });
    state = transition(state, { type: 'pause' });
    expect(state.phase).toBe('paused');
    state = transition(state, { type: 'reverse' });
    expect(state).toEqual({ phase: 'paused', direction: 'up' });
    state = transition(state, { type: 'resume' });
    expect(state).toEqual({ phase: 'running', direction: 'up' });
    state = transition(state, { type: 'stop' });
    expect(state.phase).toBe('stopped');
    state = transition(state, { type: 'connect' });
    expect(state.phase).toBe('connecting');
  });

  it('does not accept impossible transitions and requires reconnection after a fault', () => {
    const idle: Lifecycle = { phase: 'idle' };
    expect(transition(idle, { type: 'resume' })).toBe(idle);
    const fault = transition(
      { phase: 'running', direction: 'up' },
      { type: 'fault', reason: 'Invalid source stream' },
    );
    expect(transition(fault, { type: 'start' })).toBe(fault);
    expect(transition(fault, { type: 'reset' })).toEqual(idle);
  });
});

describe('acquisition validation and bounded retention', () => {
  it('rejects malformed, duplicate and out-of-order samples without poisoning the latest sample', () => {
    const validator = new SampleValidator();
    expect(validator.accept(sample({ sequence: 10, timestamp: 1_000 })).accepted).toBe(true);
    expect(validator.accept(sample({ sequence: 10, timestamp: 1_050 })).reason).toBe('duplicate');
    expect(validator.accept(sample({ sequence: 9, timestamp: 950 })).reason).toBe('out-of-order');
    expect(
      validator.accept(sample({ sequence: 11, timestamp: 1_050, depth: Number.NaN })).reason,
    ).toBe('malformed');
    expect(validator.accept(null).reason).toBe('malformed');
    expect(validator.accept({}).reason).toBe('malformed');
    expect(validator.accept(sample({ sequence: 11, timestamp: 1_050 })).accepted).toBe(true);
  });

  it('makes a timestamp gap degraded and disconnected geometry explicit, then detects staleness', () => {
    const validator = new SampleValidator();
    validator.accept(sample({ sequence: 1, timestamp: 1_000 }));
    const gap = validator.accept(sample({ sequence: 2, timestamp: 2_000 }));
    expect(gap).toMatchObject({
      accepted: true,
      quality: 'degraded',
      reason: 'timestamp-gap',
      sample: { discontinuity: true, quality: 'degraded' },
    });
    expect(validator.checkStale(3_501)).toBe('stale');
    validator.reset();
    expect(validator.accept(sample({ sequence: 0, timestamp: 1_000 })).accepted).toBe(true);
  });

  it('evicts oldest entries in chronological order and releases references on clear', () => {
    const buffer = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((value) => buffer.push(value));
    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
    buffer.clear();
    expect(buffer.toArray()).toEqual([]);
    buffer.push(6);
    expect(buffer.toArray()).toEqual([6]);
    expect(() => new RingBuffer(0)).toThrow();
  });

  it('remains finite and bounded across a 30-minute, 20 Hz acquisition run', () => {
    const simulator = new Simulator();
    const buffer = new RingBuffer<TelemetrySample>(12_000);
    const validator = new SampleValidator();
    let accepted = 0;
    for (let index = 0; index < 36_000; index += 1) {
      if (index === 10_000) simulator.setDirection('up');
      if (index === 20_000) simulator.setScenario('encoder');
      const point = simulator.step();
      if (validator.accept(point).accepted) accepted += 1;
      buffer.push(point);
    }
    expect(accepted).toBe(36_000);
    expect(buffer.size).toBe(12_000);
    expect(buffer.toArray()[0].sequence).toBe(24_001);
    expect(buffer.toArray().at(-1)!.sequence).toBe(36_000);
    expect(simulator.drainEvents().length).toBeLessThanOrEqual(512);
    expect(simulator.current.timestamp - new Simulator().current.timestamp).toBe(1_800_000);
    expect(simulator.current.depth).toBeLessThanOrEqual(DEFAULT_CONFIG.totalDepth + 0.05);
  });
});
