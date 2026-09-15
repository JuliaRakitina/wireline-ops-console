/** Canonical domain units: metres, seconds, metres/second and kilonewtons. */
export type Direction = 'down' | 'up' | 'stationary';
export type Quality = 'good' | 'degraded' | 'stale';
export type Severity = 'warning' | 'critical';
export type Scenario = 'normal' | 'reverse' | 'snag' | 'loss' | 'encoder' | 'boundary';
export interface Configuration {
  totalDepth: number;
  casingShoe: number;
  warningDistance: number;
  criticalDistance: number;
  pulsesPerMeter: number;
  markerInterval: number;
  tensionWarning: number;
  tensionCritical: number;
  differentialWarning: number;
  differentialCritical: number;
  lossRate: number;
  depthUnit: 'm' | 'ft';
}
export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}
export interface TelemetrySample {
  sequence: number;
  timestamp: number;
  encoderPulses: number;
  rawDepth: number;
  depth: number;
  correction: number;
  direction: Direction;
  speed: number;
  tension: number;
  baseline: number;
  differential: number;
  marker: boolean;
  quality: Quality;
  alerts: Alert[];
  discontinuity: boolean;
}
export interface RunEvent {
  id: string;
  timestamp: number;
  depth: number;
  type: 'operator' | 'marker' | 'alert' | 'quality' | 'configuration';
  severity?: Severity;
  title: string;
  detail: string;
}
export type Lifecycle =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'ready' }
  | { phase: 'running'; direction: 'down' | 'up' }
  | { phase: 'paused'; direction: 'down' | 'up' }
  | { phase: 'stopped' }
  | { phase: 'faulted'; reason: string };
export type LifecycleAction =
  | { type: 'connect' }
  | { type: 'ready' }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reverse' }
  | { type: 'stop' }
  | { type: 'fault'; reason: string }
  | { type: 'reset' };
export interface ConfigurationRevision {
  timestamp: number;
  configuration: Configuration;
}
export interface SavedRun {
  version: 1;
  id: string;
  name: string;
  seed: number;
  configuration: Configuration;
  configurationHistory: ConfigurationRevision[];
  samples: TelemetrySample[];
  events: RunEvent[];
  savedAt: number;
}
export interface TelemetrySource {
  subscribe(listener: (sample: TelemetrySample) => void): () => void;
  start(): void;
  pause(): void;
  dispose(): void;
}
