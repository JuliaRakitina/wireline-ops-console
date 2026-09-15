import { evaluateAlerts } from '../alerts/rules';
import {
  applyMarkerCorrection,
  assertConfiguration,
  DEFAULT_CONFIG,
  deriveLineSpeed,
  differentialTension,
  pulsesToDepth,
} from '../domain/model';
import type {
  Configuration,
  Direction,
  RunEvent,
  Scenario,
  TelemetrySample,
} from '../domain/types';
import { RingBuffer } from './buffer';

const SYNTHETIC_EPOCH = Date.UTC(2026, 0, 1, 8);
const SCENARIO_NAMES: Record<Scenario, string> = {
  normal: 'Normal descent',
  reverse: 'Pause and reverse',
  snag: 'Snag / overpull',
  loss: 'Sudden tension loss',
  encoder: 'Encoder degradation',
  boundary: 'Boundary approach',
};

function approach(value: number, target: number, amount: number): number {
  return value + Math.sign(target - value) * Math.min(Math.abs(target - value), amount);
}

/** A deterministic signal model, deliberately separate from wall-clock scheduling and React. */
export class Simulator {
  private config: Configuration;
  private randomState: number;
  private trueDepth: number;
  private pulsePosition: number;
  private velocity = 0.7;
  private requestedDirection: 'down' | 'up' = 'down';
  private scenario: Scenario = 'normal';
  private scenarioTime = 0;
  private totalTime = 0;
  private scenarioTension = 8;
  private baseline = 8;
  private correction = 0;
  private sample: TelemetrySample;
  private events = new RingBuffer<RunEvent>(512);
  private nextEvent = 0;
  private pendingDiscontinuity = false;

  constructor(config: Configuration = DEFAULT_CONFIG, seed = 2016, initialDepth = 480) {
    assertConfiguration(config);
    if (!Number.isFinite(initialDepth) || initialDepth < 0 || initialDepth > config.totalDepth) {
      throw new RangeError('Initial depth must be inside the configured well.');
    }
    if (!Number.isSafeInteger(seed)) throw new RangeError('Simulator seed must be a safe integer.');
    this.config = { ...config };
    this.randomState = seed >>> 0;
    this.trueDepth = initialDepth;
    this.pulsePosition = initialDepth * config.pulsesPerMeter;
    const pulses = Math.round(this.pulsePosition);
    const rawDepth = pulsesToDepth(pulses, config.pulsesPerMeter);
    this.correction = initialDepth - rawDepth;
    this.sample = {
      sequence: 0,
      timestamp: SYNTHETIC_EPOCH,
      encoderPulses: pulses,
      rawDepth,
      depth: initialDepth,
      correction: this.correction,
      direction: 'down',
      speed: 0.7,
      tension: 8,
      baseline: 8,
      differential: 0,
      marker: false,
      quality: 'good',
      alerts: [],
      discontinuity: false,
    };
    this.sample.alerts = evaluateAlerts(this.sample, this.config);
  }

  get current(): TelemetrySample {
    return this.sample;
  }

  /** Advances at most one second; normal acquisition uses a fixed 50 ms interval. */
  step(dt = 0.05): TelemetrySample {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1)
      throw new RangeError(
        'A simulation step must be greater than zero and no more than one second.',
      );
    const previous = this.sample;
    const oldTrueDepth = this.trueDepth;
    this.scenarioTime += dt;
    this.totalTime += dt;
    this.updateVelocity(dt);
    this.trueDepth = Math.max(
      0,
      Math.min(this.config.totalDepth, this.trueDepth + this.velocity * dt),
    );
    const physicalTravel = this.trueDepth - oldTrueDepth;
    if (physicalTravel === 0) this.velocity = 0;

    // Fractional counts accumulate before rounding, avoiding a pulse-rate-dependent drift.
    // A degraded acquisition intentionally loses 35% of encoder pulses.
    const captureRatio = this.scenario === 'encoder' ? 0.65 : 1;
    this.pulsePosition += physicalTravel * this.config.pulsesPerMeter * captureRatio;
    const encoderPulses = Math.round(this.pulsePosition);
    const rawDepth = pulsesToDepth(encoderPulses, this.config.pulsesPerMeter);
    const speed = deriveLineSpeed(previous.rawDepth, rawDepth, dt);
    let discontinuity = this.pendingDiscontinuity;
    this.pendingDiscontinuity = false;

    const markerDepth = this.crossedMarker(oldTrueDepth, this.trueDepth);
    if (markerDepth !== undefined) {
      const adjusted = applyMarkerCorrection(rawDepth, markerDepth, this.correction);
      this.correction = adjusted.correction;
      discontinuity ||= adjusted.discontinuity;
    }
    const direction: Direction = Math.abs(speed) < 0.005 ? 'stationary' : speed > 0 ? 'down' : 'up';
    const tension = this.nextTension();
    const next: TelemetrySample = {
      sequence: previous.sequence + 1,
      timestamp: SYNTHETIC_EPOCH + Math.round(this.totalTime * 1000),
      encoderPulses,
      rawDepth,
      depth: rawDepth + this.correction,
      correction: this.correction,
      direction,
      speed,
      tension,
      baseline: this.baseline,
      differential: differentialTension(tension, this.baseline),
      marker: markerDepth !== undefined,
      quality: this.scenario === 'encoder' ? 'degraded' : 'good',
      alerts: [],
      discontinuity,
    };
    next.alerts = evaluateAlerts(next, this.config, previous);
    this.sample = next;
    if (markerDepth !== undefined)
      this.event(
        'marker',
        'Magnetic depth reference',
        `Known synthetic marker at ${markerDepth.toFixed(2)} m. Raw ${rawDepth.toFixed(2)} m; correction ${this.correction >= 0 ? '+' : ''}${this.correction.toFixed(3)} m. ${next.quality === 'degraded' ? 'Acquisition remains degraded.' : 'Acquisition healthy.'}`,
      );
    this.logTransitions(previous, next);
    return next;
  }

  setScenario(scenario: Scenario): void {
    if (!Object.hasOwn(SCENARIO_NAMES, scenario))
      throw new RangeError('Unknown simulator scenario.');
    const previous = this.sample;
    if (
      (this.scenario === 'snag' || this.scenario === 'loss') &&
      scenario !== 'snag' &&
      scenario !== 'loss'
    ) {
      // Selecting another preset is a deliberate synthetic load reset, not a measured loss.
      this.sample = {
        ...this.sample,
        tension: 8,
        differential: differentialTension(8, this.baseline),
        discontinuity: true,
      };
      this.pendingDiscontinuity = true;
      this.event(
        'operator',
        'Synthetic load restored',
        'The new preset restores the nominal 8 kN load. This is a logged simulation discontinuity; the operator baseline is preserved.',
      );
    }
    this.scenario = scenario;
    this.scenarioTime = 0;
    this.scenarioTension = Math.max(8, this.sample.tension);
    this.requestedDirection = scenario === 'snag' || scenario === 'reverse' ? 'up' : 'down';
    if (scenario === 'boundary') {
      // A preset jump is an explicit test setup, never presented as encoder movement.
      const depth = this.config.totalDepth - this.config.warningDistance + 1;
      this.trueDepth = depth;
      this.pulsePosition = depth * this.config.pulsesPerMeter;
      this.correction = 0;
      this.velocity = 0.7;
      const pulses = Math.round(this.pulsePosition);
      const rawDepth = pulsesToDepth(pulses, this.config.pulsesPerMeter);
      this.sample = {
        ...this.sample,
        encoderPulses: pulses,
        rawDepth,
        depth: rawDepth,
        correction: 0,
        speed: 0,
        direction: 'stationary',
        marker: false,
        discontinuity: true,
      };
      this.sample.alerts = evaluateAlerts(this.sample, this.config);
      this.pendingDiscontinuity = true;
      this.event(
        'operator',
        'Synthetic depth repositioned',
        `Boundary preset moved the tool to ${depth.toFixed(1)} m. This discontinuity is excluded from line-speed calculation.`,
      );
    }
    this.event(
      'operator',
      `Scenario: ${SCENARIO_NAMES[scenario]}`,
      scenario === 'snag'
        ? 'Upward movement requested. The synthetic tool slows as load rises; warning precedes critical overpull.'
        : scenario === 'loss'
          ? 'Inject a rapid load decrease. The alert describes possible causes without selecting a diagnosis.'
          : scenario === 'encoder'
            ? 'Simulate 35% missed encoder pulses. Magnetic markers provide visible depth references while acquisition remains degraded.'
            : 'Deterministic synthetic scenario selected. Operator baseline remains unchanged.',
    );
    this.sample = { ...this.sample, alerts: evaluateAlerts(this.sample, this.config) };
    this.logTransitions(previous, this.sample);
  }

  setBaseline(): void {
    const previous = this.sample;
    this.baseline = this.sample.tension;
    this.sample = { ...this.sample, baseline: this.baseline, differential: 0 };
    this.sample.alerts = evaluateAlerts(this.sample, this.config);
    this.event(
      'operator',
      'Differential baseline set',
      `Operator reference = ${this.baseline.toFixed(2)} kN. Signed differential tension = current line tension minus this reference.`,
    );
    this.logTransitions(previous, this.sample);
  }

  setDirection(direction: 'up' | 'down'): void {
    const previous = this.sample;
    if (this.scenario === 'snag' || this.scenario === 'loss') {
      this.sample = {
        ...this.sample,
        tension: 8,
        differential: differentialTension(8, this.baseline),
        discontinuity: true,
      };
      this.pendingDiscontinuity = true;
      this.event(
        'operator',
        'Synthetic load restored',
        'Changing direction exits the injected load scenario and restores nominal load; the operator baseline is preserved.',
      );
    }
    this.requestedDirection = direction;
    this.scenario = 'normal';
    this.scenarioTime = 0;
    this.sample = { ...this.sample, alerts: evaluateAlerts(this.sample, this.config) };
    this.logTransitions(previous, this.sample);
    this.event(
      'operator',
      'Direction requested',
      direction === 'up'
        ? 'Retrieve cable uphole; velocity changes continuously through zero.'
        : 'Lower cable downhole; velocity changes continuously through zero.',
    );
  }

  configure(configuration: Configuration): void {
    assertConfiguration(configuration);
    const previous = this.sample;
    if (configuration.pulsesPerMeter !== this.config.pulsesPerMeter) {
      this.pulsePosition = previous.rawDepth * configuration.pulsesPerMeter;
      const pulses = Math.round(this.pulsePosition);
      const rawDepth = pulsesToDepth(pulses, configuration.pulsesPerMeter);
      this.correction = previous.depth - rawDepth;
      this.sample = {
        ...previous,
        encoderPulses: pulses,
        rawDepth,
        correction: this.correction,
        discontinuity: true,
      };
      this.pendingDiscontinuity = true;
      this.event(
        'configuration',
        'Encoder calibration reference updated',
        `Calibration ${configuration.pulsesPerMeter} pulses/m. A new count reference preserves current measured depth; future travel uses the new calibration.`,
      );
    }
    if (configuration.totalDepth < this.trueDepth) {
      this.trueDepth = configuration.totalDepth;
      this.pulsePosition = this.trueDepth * configuration.pulsesPerMeter;
      this.correction = 0;
      this.velocity = 0;
      const pulses = Math.round(this.pulsePosition);
      const rawDepth = pulsesToDepth(pulses, configuration.pulsesPerMeter);
      this.sample = {
        ...this.sample,
        encoderPulses: pulses,
        rawDepth,
        depth: rawDepth,
        correction: 0,
        speed: 0,
        direction: 'stationary',
        discontinuity: true,
      };
      this.pendingDiscontinuity = true;
      this.event(
        'configuration',
        'Synthetic tool repositioned to Total Depth',
        'The new well geometry is shallower than the current position. A logged simulation discontinuity keeps the tool inside the well.',
      );
    }
    this.config = { ...configuration };
    this.sample = { ...this.sample, alerts: evaluateAlerts(this.sample, this.config) };
    this.logTransitions(previous, this.sample);
  }

  drainEvents(): RunEvent[] {
    const events = this.events.toArray();
    this.events.clear();
    return events;
  }

  private updateVelocity(dt: number): void {
    const time = this.scenarioTime;
    if (this.scenario === 'reverse') {
      const target = time < 2 ? 0 : time < 4 ? 0 : -0.65;
      this.velocity = approach(this.velocity, target, dt * 0.5);
    } else if (this.scenario === 'snag') {
      this.velocity =
        time < 1
          ? approach(this.velocity, -0.25, dt * 1.5)
          : time < 3
            ? -0.25 * Math.exp(-3 * (time - 1))
            : 0;
    } else {
      const target = this.requestedDirection === 'down' ? 0.7 : -0.65;
      this.velocity = approach(this.velocity, target, dt * 0.5);
    }
  }

  private nextTension(): number {
    const ripple = Math.sin(this.totalTime * 0.64) * 0.1 + Math.sin(this.totalTime * 1.7) * 0.035;
    const noise = (this.random() - 0.5) * 0.035;
    if (this.scenario === 'snag')
      return Math.min(21, this.scenarioTension + this.scenarioTime * 1.65) + noise;
    if (this.scenario === 'loss')
      return Math.max(1.35, this.scenarioTension - this.scenarioTime * 10) + noise;
    return 8 + ripple + noise + (0.5 * Math.max(0, -this.velocity)) / 0.65;
  }

  private crossedMarker(previousDepth: number, depth: number): number | undefined {
    const interval = this.config.markerInterval;
    if (depth > previousDepth) {
      const marker = (Math.floor(previousDepth / interval) + 1) * interval;
      return marker <= depth ? marker : undefined;
    }
    if (depth < previousDepth) {
      const marker = (Math.ceil(previousDepth / interval) - 1) * interval;
      return marker >= depth ? marker : undefined;
    }
    return undefined;
  }

  private logTransitions(previous: TelemetrySample, next: TelemetrySample): void {
    if (previous.quality !== next.quality)
      this.event(
        'quality',
        next.quality === 'good' ? 'Acquisition recovered' : 'Acquisition degraded',
        next.quality === 'good'
          ? 'Encoder acquisition is healthy. The last magnetic correction remains applied.'
          : 'Suspect measured depth: encoder pulses are being lost. Await a magnetic depth reference.',
      );
    for (const alert of next.alerts) {
      const prior = previous.alerts.find((item) => item.id === alert.id);
      if (prior?.severity !== alert.severity)
        this.event('alert', alert.title, alert.detail, alert.severity);
    }
    for (const prior of previous.alerts) {
      if (!next.alerts.some((alert) => alert.id === prior.id))
        this.event(
          'alert',
          `Cleared: ${prior.title}`,
          'The observed condition no longer meets its configured threshold.',
        );
    }
  }

  private event(
    type: RunEvent['type'],
    title: string,
    detail: string,
    severity?: RunEvent['severity'],
  ): void {
    this.events.push({
      id: `sim-${this.nextEvent++}`,
      timestamp: this.sample.timestamp,
      depth: this.sample.depth,
      type,
      title,
      detail,
      ...(severity ? { severity } : {}),
    });
  }

  private random(): number {
    // Mulberry32; no clock input, network input, or real operational measurements.
    let value = (this.randomState += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.randomState >>>= 0;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}
