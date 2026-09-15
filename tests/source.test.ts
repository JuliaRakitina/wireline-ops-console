import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySample } from '../src/domain/types';
import { Simulator } from '../src/telemetry/simulator';
import { SimulatorSource } from '../src/telemetry/source';

describe('scheduled telemetry source', () => {
  const sources: SimulatorSource[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
  });

  afterEach(() => {
    sources.forEach((source) => source.dispose());
    sources.length = 0;
    vi.useRealTimers();
  });

  function observingSource() {
    const simulator = new Simulator();
    const source = new SimulatorSource(simulator);
    const received: TelemetrySample[] = [];
    const unsubscribe = source.subscribe((sample) => received.push(sample));
    sources.push(source);
    return { source, simulator, received, unsubscribe };
  }

  it('delivers exactly 20 acquisitions per second and ignores repeated start calls', () => {
    const { source, received } = observingSource();
    source.start();
    source.start();
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(20);
    expect(received.at(-1)!.sequence).toBe(20);
    expect(received.at(-1)!.timestamp - received[0].timestamp).toBe(950);
    expect(received.every((sample) => sample.quality === 'good')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('pauses without advancing acquisition and resumes without duplicate timers or false staleness', () => {
    const { source, simulator, received } = observingSource();
    source.start();
    vi.advanceTimersByTime(250);
    source.pause();
    source.pause();
    const stoppedAt = simulator.current;
    vi.advanceTimersByTime(10_000);
    expect(received).toHaveLength(5);
    expect(simulator.current).toBe(stoppedAt);
    expect(vi.getTimerCount()).toBe(0);
    source.start();
    source.start();
    vi.advanceTimersByTime(250);
    expect(received).toHaveLength(10);
    expect(simulator.current.timestamp - stoppedAt.timestamp).toBe(250);
    expect(received.at(-1)!.quality).toBe('good');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('releases subscriptions and scheduled work on dispose', () => {
    const { source, simulator, received, unsubscribe } = observingSource();
    source.start();
    vi.advanceTimersByTime(100);
    unsubscribe();
    vi.advanceTimersByTime(100);
    expect(received).toHaveLength(2);
    expect(simulator.current.sequence).toBe(4);
    source.dispose();
    source.dispose();
    vi.advanceTimersByTime(1000);
    expect(simulator.current.sequence).toBe(4);
    expect(received).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('marks a delayed delivery degraded and never fabricates samples during the wall-clock gap', () => {
    const { source, received } = observingSource();
    source.start();
    vi.advanceTimersByTime(50);
    const first = received[0];
    // Moving only Date models a suspended browser: the interval callback has not run.
    vi.setSystemTime(Date.now() + 750);
    vi.advanceTimersByTime(50);
    expect(received).toHaveLength(2);
    const delayed = received[1];
    expect(delayed.sequence).toBe(first.sequence + 1);
    expect(delayed.timestamp - first.timestamp).toBe(50);
    expect(delayed.quality).toBe('degraded');
    expect(delayed.discontinuity).toBe(true);
    expect(delayed.alerts.find((alert) => alert.id === 'stream-delay')?.severity).toBe('warning');
    vi.advanceTimersByTime(1950);
    expect(received.at(-1)!.quality).toBe('degraded');
    vi.advanceTimersByTime(50);
    expect(received.at(-1)!.quality).toBe('good');
    expect(received.at(-1)!.alerts.some((alert) => alert.id === 'stream-delay')).toBe(false);
  });

  it('reports a long scheduling interruption as stale, then degraded, before recovery', () => {
    const { source, received } = observingSource();
    source.start();
    vi.advanceTimersByTime(50);
    vi.setSystemTime(Date.now() + 1600);
    vi.advanceTimersByTime(50);
    expect(received.at(-1)!.quality).toBe('stale');
    expect(received.at(-1)!.discontinuity).toBe(true);
    vi.advanceTimersByTime(50);
    expect(received.at(-1)!.quality).toBe('degraded');
    vi.advanceTimersByTime(2000);
    expect(received.at(-1)!.quality).toBe('good');
  });

  it('preserves underlying encoder degradation after scheduler recovery', () => {
    const { source, simulator, received } = observingSource();
    simulator.setScenario('encoder');
    source.start();
    vi.advanceTimersByTime(50);
    vi.setSystemTime(Date.now() + 750);
    vi.advanceTimersByTime(2100);
    expect(received.at(-1)!.quality).toBe('degraded');
    expect(received.at(-1)!.alerts.some((alert) => alert.id === 'acquisition-quality')).toBe(true);
    expect(received.at(-1)!.alerts.some((alert) => alert.id === 'stream-delay')).toBe(false);
  });
});
