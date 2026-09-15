import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../src/domain/model';
import { ConsoleStore, consoleStore } from '../src/features/console-store';
import { saveRun } from '../src/recording/runs';
import { Simulator } from '../src/telemetry/simulator';

vi.mock('../src/recording/runs', () => ({ saveRun: vi.fn().mockResolvedValue(undefined) }));

describe('operator store acquisition and workflow integration', () => {
  let store: ConsoleStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    vi.mocked(saveRun).mockClear();
    store = new ConsoleStore();
  });

  afterEach(() => {
    store.dispose();
    consoleStore.dispose();
    vi.useRealTimers();
  });

  function connect() {
    store.start();
    expect(store.getSnapshot().lifecycle.phase).toBe('connecting');
    vi.advanceTimersByTime(450);
    expect(store.getSnapshot().lifecycle.phase).toBe('running');
  }

  it('records five display samples per second from twenty real source acquisitions', () => {
    const initial = store.getSnapshot();
    expect(initial.lifecycle.phase).toBe('ready');
    connect();
    vi.advanceTimersByTime(1000);
    const current = store.getSnapshot();
    expect(current.sample.sequence - initial.sample.sequence).toBe(20);
    expect(current.samples.length - initial.samples.length).toBe(5);
    expect(current.samples.slice(-5).map((sample) => sample.sequence)).toEqual([
      initial.sample.sequence + 4,
      initial.sample.sequence + 8,
      initial.sample.sequence + 12,
      initial.sample.sequence + 16,
      initial.sample.sequence + 20,
    ]);
    expect(vi.mocked(saveRun)).toHaveBeenCalled();
  });

  it('preserves a short marker, correction and degraded-quality indication across downsampling', () => {
    const originalStep = Simulator.prototype.step;
    vi.spyOn(Simulator.prototype, 'step').mockImplementationOnce(function (this: Simulator, dt) {
      return {
        ...originalStep.call(this, dt),
        marker: true,
        discontinuity: true,
        quality: 'degraded',
      };
    });
    connect();
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().sample).toMatchObject({
      marker: true,
      discontinuity: true,
      quality: 'degraded',
    });
    expect(store.getSnapshot().samples.at(-1)).toMatchObject({
      marker: true,
      discontinuity: true,
      quality: 'degraded',
    });
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().sample).toMatchObject({
      marker: false,
      discontinuity: false,
      quality: 'good',
    });
  });

  it('retains the worst quality within a display batch after a real wall-clock stall', () => {
    connect();
    vi.setSystemTime(Date.now() + 1600);
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().sample.quality).toBe('stale');
    expect(store.getSnapshot().sample.discontinuity).toBe(true);
    expect(
      store.getSnapshot().events.some((event) => event.title === 'Stream timing interrupted'),
    ).toBe(true);
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().sample.quality).toBe('degraded');
    vi.advanceTimersByTime(2200);
    expect(store.getSnapshot().sample.quality).toBe('good');
  });

  it('applies settings and baseline immediately while preserving active physical alerts after acknowledgement', () => {
    const depth = store.getSnapshot().sample.depth;
    store.configure({ ...DEFAULT_CONFIG, casingShoe: depth + 2 });
    expect(store.getSnapshot().configuration.casingShoe).toBe(depth + 2);
    expect(
      store.getSnapshot().sample.alerts.find((alert) => alert.id === 'shoe-proximity')?.severity,
    ).toBe('critical');
    expect(store.run().configuration.casingShoe).toBe(depth + 2);
    expect(store.getSnapshot().events.some((event) => event.type === 'configuration')).toBe(true);
    store.acknowledge();
    expect(store.getSnapshot().acknowledged).toContain('shoe-proximity:critical');
    expect(store.getSnapshot().sample.alerts.some((alert) => alert.id === 'shoe-proximity')).toBe(
      true,
    );
    store.baseline();
    expect(store.getSnapshot().sample.differential).toBe(0);
    expect(store.getSnapshot().sample.baseline).toBe(store.getSnapshot().sample.tension);
  });

  it('pauses recording, resumes the same epoch, and prevents duplicate start or resume timers', () => {
    connect();
    store.start();
    vi.advanceTimersByTime(400);
    store.pause();
    expect(store.getSnapshot().lifecycle.phase).toBe('paused');
    const paused = store.getSnapshot();
    vi.advanceTimersByTime(5000);
    expect(store.getSnapshot().sample).toBe(paused.sample);
    expect(store.getSnapshot().samples).toBe(paused.samples);
    store.resume();
    store.resume();
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().lifecycle.phase).toBe('running');
    expect(store.getSnapshot().sample.sequence).toBe(paused.sample.sequence + 4);
    expect(store.getSnapshot().sample.timestamp).toBe(paused.sample.timestamp + 200);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('toggles requested direction twice while paused without confusing the last measured motion', () => {
    connect();
    vi.advanceTimersByTime(200);
    store.pause();
    const pausedSequence = store.getSnapshot().sample.sequence;
    expect(store.getSnapshot().sample.direction).toBe('down');
    store.reverse();
    expect(store.getSnapshot().lifecycle).toEqual({ phase: 'paused', direction: 'up' });
    expect(store.getSnapshot().sample.direction).toBe('down');
    store.reverse();
    expect(store.getSnapshot().lifecycle).toEqual({ phase: 'paused', direction: 'down' });
    expect(store.getSnapshot().sample.sequence).toBe(pausedSequence);
    store.resume();
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().lifecycle).toEqual({ phase: 'running', direction: 'down' });
    expect(store.getSnapshot().sample.direction).toBe('down');
  });

  it('preserves the initial geometry and thresholds alongside timestamped mid-run settings', () => {
    connect();
    vi.advanceTimersByTime(200);
    const before = store.run();
    const lastOriginalTimestamp = store.getSnapshot().sample.timestamp;
    const updated = { ...DEFAULT_CONFIG, totalDepth: 920, casingShoe: 580, tensionWarning: 10 };
    store.configure(updated);
    vi.advanceTimersByTime(200);
    const after = store.run();
    expect(after.configurationHistory).toHaveLength(2);
    expect(after.configurationHistory[0]).toEqual(before.configurationHistory[0]);
    expect(after.configurationHistory[0].configuration).toEqual(DEFAULT_CONFIG);
    expect(after.configurationHistory[1].configuration).toEqual(updated);
    expect(after.configurationHistory[1].timestamp).toBeGreaterThan(lastOriginalTimestamp);
    expect(after.configurationHistory[1].timestamp).toBeLessThanOrEqual(
      after.samples.at(-1)!.timestamp,
    );
    expect(after.configuration).toEqual(updated);
    expect(before.configuration).toEqual(DEFAULT_CONFIG);
    expect(
      before.samples.every((sample) => sample.timestamp < after.configurationHistory[1].timestamp),
    ).toBe(true);
  });

  it('bounds configuration revisions while retaining metadata for every remaining sample', () => {
    connect();
    for (let revision = 0; revision < 70; revision += 1) {
      vi.advanceTimersByTime(200);
      store.configure({ ...DEFAULT_CONFIG, casingShoe: 560 + revision / 10 });
    }
    const run = store.run();
    expect(run.configurationHistory).toHaveLength(64);
    expect(run.configurationHistory.at(-1)!.configuration.casingShoe).toBe(566.9);
    expect(run.samples.length).toBeGreaterThan(0);
    expect(
      run.samples.every((sample) => sample.timestamp >= run.configurationHistory[0].timestamp),
    ).toBe(true);
    expect(
      run.configurationHistory.every(
        (revision, index) =>
          index === 0 || revision.timestamp > run.configurationHistory[index - 1].timestamp,
      ),
    ).toBe(true);
    store.reset();
    expect(store.run().configurationHistory).toHaveLength(1);
    expect(store.run().configurationHistory[0].configuration).toEqual(DEFAULT_CONFIG);
  });

  it('requires fresh acknowledgement when a differential alarm clears at a new baseline and recurs', () => {
    store.scenario('snag');
    vi.advanceTimersByTime(450 + 4000);
    expect(
      store.getSnapshot().sample.alerts.find((alert) => alert.id === 'differential-tension')
        ?.severity,
    ).toBe('critical');
    store.acknowledge();
    expect(store.getSnapshot().acknowledged).toContain('differential-tension:critical');

    store.baseline();
    expect(store.getSnapshot().sample.differential).toBe(0);
    expect(
      store.getSnapshot().sample.alerts.some((alert) => alert.id === 'differential-tension'),
    ).toBe(false);
    expect(store.getSnapshot().acknowledged).not.toContain('differential-tension:critical');

    vi.advanceTimersByTime(4000);
    expect(
      store.getSnapshot().sample.alerts.find((alert) => alert.id === 'differential-tension')
        ?.severity,
    ).toBe('critical');
    expect(store.getSnapshot().acknowledged).not.toContain('differential-tension:critical');
  });

  it('forgets acknowledgement when an alert clears and recurs inside a single display batch', () => {
    store.scenario('snag');
    vi.advanceTimersByTime(450 + 4000);
    store.acknowledge();
    expect(store.getSnapshot().acknowledged).toContain('differential-tension:critical');
    const originalStep = Simulator.prototype.step;
    vi.spyOn(Simulator.prototype, 'step').mockImplementationOnce(function (this: Simulator, dt) {
      const acquired = originalStep.call(this, dt);
      return {
        ...acquired,
        alerts: acquired.alerts.filter((alert) => alert.id !== 'differential-tension'),
      };
    });

    // The first 20 Hz sample clears the condition; the following three restore it.
    vi.advanceTimersByTime(200);
    expect(
      store.getSnapshot().sample.alerts.find((alert) => alert.id === 'differential-tension')
        ?.severity,
    ).toBe('critical');
    expect(store.getSnapshot().acknowledged).not.toContain('differential-tension:critical');
  });

  it('reset disposes the old stream and accepts the restarted deterministic timestamp epoch', () => {
    const initial = store.getSnapshot();
    connect();
    vi.advanceTimersByTime(2000);
    store.reset();
    expect(store.getSnapshot().lifecycle.phase).toBe('ready');
    expect(store.getSnapshot().sample).toEqual(initial.sample);
    expect(store.getSnapshot().samples).toEqual(initial.samples);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot().sample).toEqual(initial.sample);
    connect();
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().sample.sequence).toBe(initial.sample.sequence + 4);
    expect(store.getSnapshot().sample.timestamp).toBe(initial.sample.timestamp + 200);
    expect(store.getSnapshot().sample.quality).toBe('good');
    expect(store.getSnapshot().events.some((event) => event.title === 'Telemetry rejected')).toBe(
      false,
    );
  });

  it('cancels a pending connection on reset and releases all timers on dispose', () => {
    store.start();
    store.reset();
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot().lifecycle.phase).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
    connect();
    vi.advanceTimersByTime(200);
    const snapshot = store.getSnapshot();
    store.dispose();
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a 45-minute store run to 12,000 recording samples and 500 events', () => {
    connect();
    vi.advanceTimersByTime(45 * 60 * 1000);
    const snapshot = store.getSnapshot();
    expect(snapshot.samples).toHaveLength(12_000);
    expect(snapshot.events.length).toBeLessThanOrEqual(500);
    expect(snapshot.sample.sequence).toBe(1200 + 54_000);
    expect(snapshot.samples[0].sequence).toBe(snapshot.sample.sequence - 11_999 * 4);
    expect(snapshot.samples.at(-1)).toEqual(snapshot.sample);
    expect(snapshot.samples.at(-1)!.timestamp - snapshot.samples[0].timestamp).toBe(11_999 * 200);
    expect(vi.mocked(saveRun).mock.calls.length).toBeGreaterThan(150);
  }, 15_000);
});
