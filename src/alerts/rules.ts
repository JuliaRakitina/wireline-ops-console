import type { Alert, Configuration, Severity, TelemetrySample } from '../domain/types';

function threshold(value: number, warning: number, critical: number): Severity | undefined {
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return undefined;
}

/** Pure rules. Acknowledgement and sound never alter the physical alert state. */
export function evaluateAlerts(
  sample: TelemetrySample,
  config: Configuration,
  previous?: TelemetrySample,
): Alert[] {
  const alerts: Alert[] = [];
  const tensionSeverity = threshold(sample.tension, config.tensionWarning, config.tensionCritical);
  if (tensionSeverity)
    alerts.push({
      id: 'line-tension',
      severity: tensionSeverity,
      title: tensionSeverity === 'critical' ? 'Critical overpull' : 'High line tension',
      detail: `${sample.tension.toFixed(2)} kN · ${tensionSeverity} threshold ${tensionSeverity === 'critical' ? config.tensionCritical : config.tensionWarning} kN. Possible tool sticking; inspect motion and load.`,
    });

  const differentialSeverity = threshold(
    Math.abs(sample.differential),
    config.differentialWarning,
    config.differentialCritical,
  );
  if (differentialSeverity)
    alerts.push({
      id: 'differential-tension',
      severity: differentialSeverity,
      title:
        sample.differential >= 0
          ? 'Differential tension increase'
          : 'Differential tension decrease',
      detail: `${sample.differential >= 0 ? '+' : ''}${sample.differential.toFixed(2)} kN from the operator baseline of ${sample.baseline.toFixed(2)} kN.`,
    });

  const elapsed = previous ? (sample.timestamp - previous.timestamp) / 1000 : 0;
  const lossRate = previous && elapsed > 0 ? (previous.tension - sample.tension) / elapsed : 0;
  // 2 kN is an explicit simulator-only low-load floor, not a field operating limit.
  if (lossRate >= config.lossRate || sample.tension <= 2)
    alerts.push({
      id: 'loss-of-load',
      severity: 'critical',
      title: 'Sudden tension loss',
      detail:
        lossRate >= config.lossRate
          ? `Load fell ${lossRate.toFixed(1)} kN/s (limit ${config.lossRate} kN/s). Possible slack line, dropped tool or line break; the signal alone does not identify a cause.`
          : 'Load remains below the synthetic low-load floor of 2 kN. Possible slack line, dropped tool or line break; the signal alone does not identify a cause.',
    });

  if (sample.quality !== 'good')
    alerts.push({
      id: 'acquisition-quality',
      severity: 'warning',
      title: sample.quality === 'stale' ? 'Telemetry stale' : 'Encoder acquisition degraded',
      detail:
        sample.quality === 'stale'
          ? 'No recent valid sample. The last observed depth is not a current position.'
          : 'Missed encoder pulses or a data gap make depth uncertain. A magnetic reference adjusts depth; it does not repair acquisition quality.',
    });

  const boundary = (id: string, title: string, distance: number) => {
    if (distance < 0) return;
    const severity =
      distance <= config.criticalDistance
        ? 'critical'
        : distance <= config.warningDistance
          ? 'warning'
          : undefined;
    if (severity)
      alerts.push({
        id,
        severity,
        title,
        detail: `${distance.toFixed(1)} m remaining · ${severity} proximity band ${severity === 'critical' ? config.criticalDistance : config.warningDistance} m.`,
      });
  };
  if (sample.direction !== 'down')
    boundary('surface-proximity', 'Approaching surface', Math.max(0, sample.depth));
  if (sample.direction !== 'up')
    boundary(
      'td-proximity',
      'Approaching Total Depth',
      Math.max(0, config.totalDepth - sample.depth),
    );
  if (sample.direction === 'down' && sample.depth <= config.casingShoe) {
    boundary('shoe-proximity', 'Approaching Casing Shoe', config.casingShoe - sample.depth);
  } else if (sample.direction === 'up' && sample.depth >= config.casingShoe) {
    boundary('shoe-proximity', 'Approaching Casing Shoe', sample.depth - config.casingShoe);
  } else if (sample.direction === 'stationary') {
    boundary('shoe-proximity', 'Near Casing Shoe', Math.abs(config.casingShoe - sample.depth));
  }
  return alerts.sort(
    (a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'),
  );
}
