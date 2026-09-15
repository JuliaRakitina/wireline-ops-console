import type { Quality, TelemetrySample } from '../domain/types';

export interface SampleAcceptance {
  accepted: boolean;
  quality: Quality;
  reason?: 'malformed' | 'duplicate' | 'out-of-order' | 'timestamp-gap';
  sample?: TelemetrySample;
}

/** Keeps one sample of state. Reconnect creates a new stream epoch via reset(). */
export class SampleValidator {
  private latest?: TelemetrySample;
  constructor(
    readonly gapMilliseconds = 500,
    readonly staleMilliseconds = 1500,
  ) {
    if (gapMilliseconds <= 0 || staleMilliseconds <= gapMilliseconds) {
      throw new RangeError('Stale duration must exceed a positive gap duration.');
    }
  }

  accept(value: unknown): SampleAcceptance {
    if (!isFiniteSample(value))
      return { accepted: false, quality: 'degraded', reason: 'malformed' };
    if (this.latest) {
      if (value.sequence === this.latest.sequence || value.timestamp === this.latest.timestamp) {
        return { accepted: false, quality: 'degraded', reason: 'duplicate' };
      }
      if (value.sequence < this.latest.sequence || value.timestamp < this.latest.timestamp) {
        return { accepted: false, quality: 'degraded', reason: 'out-of-order' };
      }
      if (value.timestamp - this.latest.timestamp > this.gapMilliseconds) {
        const sample: TelemetrySample = { ...value, quality: 'degraded', discontinuity: true };
        this.latest = sample;
        return { accepted: true, quality: 'degraded', reason: 'timestamp-gap', sample };
      }
    }
    this.latest = value;
    return { accepted: true, quality: value.quality, sample: value };
  }

  checkStale(now: number): Quality {
    return !this.latest || now - this.latest.timestamp > this.staleMilliseconds
      ? 'stale'
      : this.latest.quality;
  }

  reset(): void {
    this.latest = undefined;
  }
}

function isFiniteSample(value: unknown): value is TelemetrySample {
  if (typeof value !== 'object' || value === null) return false;
  const sample = value as Partial<TelemetrySample>;
  const numbers: Array<keyof TelemetrySample> = [
    'sequence',
    'timestamp',
    'encoderPulses',
    'rawDepth',
    'depth',
    'correction',
    'speed',
    'tension',
    'baseline',
    'differential',
  ];
  if (!numbers.every((key) => typeof sample[key] === 'number' && Number.isFinite(sample[key])))
    return false;
  if (!Number.isSafeInteger(sample.sequence) || !Number.isSafeInteger(sample.encoderPulses))
    return false;
  if (sample.sequence! < 0 || sample.tension! < 0 || sample.baseline! < 0) return false;
  if (!['up', 'down', 'stationary'].includes(sample.direction ?? '')) return false;
  if (!['good', 'degraded', 'stale'].includes(sample.quality ?? '')) return false;
  if (typeof sample.marker !== 'boolean' || typeof sample.discontinuity !== 'boolean') return false;
  return (
    Array.isArray(sample.alerts) &&
    sample.alerts.every(
      (alert) =>
        typeof alert === 'object' &&
        alert !== null &&
        typeof alert.id === 'string' &&
        typeof alert.title === 'string' &&
        typeof alert.detail === 'string' &&
        (alert.severity === 'warning' || alert.severity === 'critical'),
    )
  );
}
