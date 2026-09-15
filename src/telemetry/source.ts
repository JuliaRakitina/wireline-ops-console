import type { TelemetrySample, TelemetrySource } from '../domain/types';
import { Simulator } from './simulator';
/** Fixed simulation steps avoid pretending a delayed browser timer acquired missing data. */
export class SimulatorSource implements TelemetrySource {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastDelivery = 0;
  private degradedUntil = 0;
  private listeners = new Set<(sample: TelemetrySample) => void>();
  constructor(readonly simulator: Simulator) {}
  subscribe(listener: (sample: TelemetrySample) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  start() {
    if (this.timer) return;
    this.lastDelivery = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const delay = now - this.lastDelivery;
      this.lastDelivery = now;
      if (delay > 500) this.degradedUntil = now + 2000;
      const acquired = this.simulator.step(0.05);
      const sample: TelemetrySample =
        now < this.degradedUntil
          ? {
              ...acquired,
              quality: delay > 1500 ? 'stale' : 'degraded',
              discontinuity: true,
              alerts: [
                ...acquired.alerts,
                {
                  id: 'stream-delay',
                  severity: 'warning',
                  title: 'Telemetry delivery interrupted',
                  detail:
                    'Browser scheduling paused the synthetic stream. No missing samples were invented; depth confidence is reduced.',
                },
              ],
            }
          : acquired;
      this.listeners.forEach((listener) => listener(sample));
    }, 50);
  }
  pause() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
  dispose() {
    this.pause();
    this.listeners.clear();
  }
}
