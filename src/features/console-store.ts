import { DEFAULT_CONFIG } from '../domain/model';
import { transition } from '../domain/lifecycle';
import type {
  Configuration,
  ConfigurationRevision,
  Lifecycle,
  RunEvent,
  SavedRun,
  Scenario,
  TelemetrySample,
} from '../domain/types';
import { Simulator } from '../telemetry/simulator';
import { SimulatorSource } from '../telemetry/source';
import { SampleValidator } from '../telemetry/validation';
import { saveRun } from '../recording/runs';

export interface ConsoleSnapshot {
  epoch: number;
  lifecycle: Lifecycle;
  configuration: Configuration;
  sample: TelemetrySample;
  samples: TelemetrySample[];
  events: RunEvent[];
  scenario: Scenario;
  acknowledged: string[];
  savedMessage: string;
}
export class ConsoleStore {
  private simulator: Simulator;
  private source: SimulatorSource;
  private listeners = new Set<() => void>();
  private acquisition: TelemetrySample[] = [];
  private events: RunEvent[] = [];
  private snapshot: ConsoleSnapshot;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private autosaveAt = 0;
  private sampleCount = 0;
  private sequenceId = 0;
  private validator = new SampleValidator();
  private pendingDiscontinuity = false;
  private pendingMarker = false;
  private sourceInterrupted = false;
  private requestedDirection: 'up' | 'down' = 'down';
  private configurationHistory: ConfigurationRevision[] = [
    { timestamp: 0, configuration: { ...DEFAULT_CONFIG } },
  ];
  private pendingQuality: TelemetrySample['quality'] = 'good';
  constructor() {
    this.simulator = new Simulator(DEFAULT_CONFIG, 2016, 460);
    this.source = new SimulatorSource(this.simulator);
    this.preview();
    this.snapshot = {
      epoch: 0,
      lifecycle: { phase: 'ready' },
      configuration: { ...DEFAULT_CONFIG },
      sample: this.simulator.current,
      samples: [...this.acquisition],
      events: [...this.events],
      scenario: 'normal',
      acknowledged: [],
      savedMessage: '',
    };
    this.listen();
  }
  private preview() {
    for (let i = 0; i < 1200; i++) {
      const sample = this.simulator.step(0.05);
      if (i % 4 === 0) this.acquisition.push(sample);
      this.events.push(...this.simulator.drainEvents());
    }
    this.events = this.events.slice(-500);
  }
  private listen() {
    this.source.subscribe((incoming) => {
      const accepted = this.validator.accept(incoming);
      if (!accepted.accepted || !accepted.sample) {
        this.event(
          'Telemetry rejected',
          `Signal quality degraded: ${accepted.reason ?? 'invalid sample'}.`,
          'quality',
        );
        this.publish({ sample: { ...this.snapshot.sample, quality: 'degraded' } });
        return;
      }
      let sample = accepted.sample;
      const interrupted = incoming.quality !== this.simulator.current.quality;
      if (interrupted !== this.sourceInterrupted) {
        this.sourceInterrupted = interrupted;
        this.event(
          interrupted ? 'Stream timing interrupted' : 'Stream delivery recovered',
          interrupted
            ? 'Browser delivery stalled. Depth confidence is reduced until fresh delivery resumes.'
            : 'Fresh source delivery has resumed.',
          'quality',
        );
      }
      const activeKeys = new Set(sample.alerts.map((a) => `${a.id}:${a.severity}`));
      const acknowledged = this.snapshot.acknowledged.filter((key) => activeKeys.has(key));
      // Acknowledgment belongs to an uninterrupted occurrence, even if it clears between frames.
      if (acknowledged.length !== this.snapshot.acknowledged.length) this.publish({ acknowledged });
      this.pendingDiscontinuity ||= sample.discontinuity;
      this.pendingMarker ||= sample.marker;
      if (
        sample.quality === 'stale' ||
        (sample.quality === 'degraded' && this.pendingQuality === 'good')
      )
        this.pendingQuality = sample.quality;
      this.events.push(...this.simulator.drainEvents());
      this.events = this.events.slice(-500);
      this.sampleCount++;
      // 20 Hz acquisition, 5 Hz immutable display/recording snapshots.
      if (this.sampleCount % 4 !== 0) return;
      sample = {
        ...sample,
        discontinuity: this.pendingDiscontinuity,
        marker: this.pendingMarker,
        quality: this.pendingQuality === 'good' ? sample.quality : this.pendingQuality,
      };
      this.pendingDiscontinuity = false;
      this.pendingMarker = false;
      this.pendingQuality = 'good';
      this.acquisition.push(sample);
      if (this.acquisition.length > 12000)
        this.acquisition.splice(0, this.acquisition.length - 12000);
      const lifecycle = this.snapshot.lifecycle;
      this.publish({ sample, samples: [...this.acquisition], events: [...this.events], lifecycle });
      if (sample.timestamp - this.autosaveAt > 15000) {
        this.autosaveAt = sample.timestamp;
        void saveRun(this.run()).catch(() =>
          this.publish({ savedMessage: 'Storage unavailable · CSV export remains available' }),
        );
      }
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<ConsoleSnapshot>) {
    const acknowledged =
      patch.acknowledged ??
      (patch.sample
        ? this.snapshot.acknowledged.filter((key) =>
            patch.sample!.alerts.some((a) => `${a.id}:${a.severity}` === key),
          )
        : this.snapshot.acknowledged);
    this.snapshot = { ...this.snapshot, ...patch, acknowledged };
    this.listeners.forEach((listener) => listener());
  }
  private event(title: string, detail: string, type: RunEvent['type'] = 'operator') {
    this.events.push({
      id: `console-${this.sequenceId++}`,
      timestamp: this.simulator.current.timestamp,
      depth: this.simulator.current.depth,
      type,
      title,
      detail,
    });
    this.events = this.events.slice(-500);
    this.publish({ events: [...this.events] });
  }
  start = () => {
    if (!['ready', 'stopped'].includes(this.snapshot.lifecycle.phase)) return;
    this.publish({ lifecycle: { phase: 'connecting' } });
    this.connectTimer = setTimeout(() => {
      this.event(
        'Acquisition started',
        'Synthetic source connected. 20 Hz acquisition / 5 Hz display.',
      );
      this.publish({ lifecycle: { phase: 'running', direction: this.requestedDirection } });
      this.source.start();
    }, 450);
  };
  pause = () => {
    if (this.snapshot.lifecycle.phase !== 'running') return;
    this.source.pause();
    this.publish({ lifecycle: transition(this.snapshot.lifecycle, { type: 'pause' }) });
    this.event(
      'Run paused',
      'Acquisition and recording paused. Last received measurements remain visible.',
    );
    void this.save();
  };
  resume = () => {
    if (this.snapshot.lifecycle.phase !== 'paused') return;
    this.publish({ lifecycle: transition(this.snapshot.lifecycle, { type: 'resume' }) });
    this.source.start();
    this.event('Run resumed', 'Synthetic acquisition resumed.');
  };
  stop = () => {
    this.source.pause();
    clearTimeout(this.connectTimer);
    this.publish({ lifecycle: { phase: 'stopped' } });
    this.event('Run stopped', 'Recorded buffer retained for review and export.');
    void this.save();
  };
  reverse = () => {
    const direction = this.requestedDirection === 'up' ? 'down' : 'up';
    this.requestedDirection = direction;
    this.simulator.setDirection(direction);
    this.publish({
      scenario: 'normal',
      lifecycle:
        this.snapshot.lifecycle.phase === 'running' || this.snapshot.lifecycle.phase === 'paused'
          ? { phase: this.snapshot.lifecycle.phase, direction }
          : this.snapshot.lifecycle,
    });
    this.flush();
  };
  scenario = (scenario: Scenario) => {
    this.requestedDirection = scenario === 'reverse' || scenario === 'snag' ? 'up' : 'down';
    this.simulator.setScenario(scenario);
    this.publish({
      scenario,
      acknowledged: [],
      lifecycle:
        this.snapshot.lifecycle.phase === 'running' || this.snapshot.lifecycle.phase === 'paused'
          ? { phase: this.snapshot.lifecycle.phase, direction: this.requestedDirection }
          : this.snapshot.lifecycle,
    });
    this.flush();
    if (this.snapshot.lifecycle.phase === 'paused') this.resume();
    else if (['ready', 'stopped'].includes(this.snapshot.lifecycle.phase)) this.start();
  };
  baseline = () => {
    this.simulator.setBaseline();
    this.flush();
  };
  private flush() {
    this.events.push(...this.simulator.drainEvents());
    this.events = this.events.slice(-500);
    this.publish({ sample: this.simulator.current, events: [...this.events] });
  }
  configure = (configuration: Configuration) => {
    this.simulator.configure(configuration);
    const revision = {
      timestamp: this.simulator.current.timestamp + 1,
      configuration: { ...configuration },
    };
    if (this.configurationHistory.at(-1)?.timestamp === revision.timestamp)
      this.configurationHistory.pop();
    this.configurationHistory.push(revision);
    // Keep complete settings provenance for every retained sample, even after many edits.
    if (this.configurationHistory.length > 64) {
      this.configurationHistory = this.configurationHistory.slice(-64);
      this.acquisition = this.acquisition.filter(
        (sample) => sample.timestamp >= this.configurationHistory[0].timestamp,
      );
    }
    this.publish({
      configuration: { ...configuration },
      samples: [...this.acquisition],
      acknowledged: [],
    });
    this.flush();
    this.event('Configuration applied', JSON.stringify(configuration), 'configuration');
  };
  acknowledge = () => {
    this.publish({ acknowledged: this.snapshot.sample.alerts.map((a) => `${a.id}:${a.severity}`) });
    this.event(
      'Alerts acknowledged',
      'Operator has seen current alert severities. Active conditions remain visible.',
    );
  };
  reset = () => {
    this.source.dispose();
    clearTimeout(this.connectTimer);
    this.simulator = new Simulator(DEFAULT_CONFIG, 2016, 460);
    this.source = new SimulatorSource(this.simulator);
    this.validator.reset();
    this.sourceInterrupted = false;
    this.requestedDirection = 'down';
    this.configurationHistory = [{ timestamp: 0, configuration: { ...DEFAULT_CONFIG } }];
    this.pendingDiscontinuity = false;
    this.pendingMarker = false;
    this.pendingQuality = 'good';
    this.acquisition = [];
    this.events = [];
    this.sampleCount = 0;
    this.autosaveAt = 0;
    this.preview();
    this.listen();
    this.publish({
      epoch: this.snapshot.epoch + 1,
      lifecycle: { phase: 'ready' },
      configuration: { ...DEFAULT_CONFIG },
      sample: this.simulator.current,
      samples: [...this.acquisition],
      events: [...this.events],
      scenario: 'normal',
      acknowledged: [],
      savedMessage: '',
    });
  };
  run = (): SavedRun => ({
    version: 1,
    id: 'synthetic-2016',
    name: 'Synthetic run · 2016',
    seed: 2016,
    configuration: { ...this.snapshot.configuration },
    configurationHistory: this.configurationHistory.map((r) => ({
      ...r,
      configuration: { ...r.configuration },
    })),
    samples: [...this.acquisition],
    events: [...this.events],
    savedAt: Date.now(),
  });
  save = async () => {
    try {
      await saveRun(this.run());
      this.publish({ savedMessage: 'Run saved in this browser' });
    } catch {
      this.publish({ savedMessage: 'Storage unavailable · CSV export remains available' });
    }
  };
  dispose = () => {
    this.source.dispose();
    clearTimeout(this.connectTimer);
  };
}
export const consoleStore = new ConsoleStore();
