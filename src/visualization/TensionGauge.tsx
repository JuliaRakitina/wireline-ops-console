import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { arc } from 'd3-shape';
import { evaluateAlerts } from '../alerts/rules';
import type { Configuration, Lifecycle, TelemetrySample } from '../domain/types';
import './tension-gauge.css';

interface TensionGaugeProps {
  sample: TelemetrySample;
  configuration: Configuration;
  phase: Lifecycle['phase'];
}

const START_ANGLE = (-110 * Math.PI) / 180;
const END_ANGLE = (110 * Math.PI) / 180;
const CENTER_X = 150;
const CENTER_Y = 110;

function pointAt(angle: number, radius: number): [number, number] {
  return [CENTER_X + Math.sin(angle) * radius, CENTER_Y - Math.cos(angle) * radius];
}

function readingContext(phase: Lifecycle['phase'], stale: boolean): string {
  if (stale) return 'Stale · last reading';
  switch (phase) {
    case 'running':
      return 'Live reading';
    case 'paused':
      return 'Paused · last reading';
    case 'connecting':
      return 'Connecting · last reading';
    case 'faulted':
      return 'Faulted · last reading';
    case 'stopped':
      return 'Stopped · last reading';
    default:
      return 'Ready · last reading';
  }
}

/** The needle is an immediate projection of absolute tension, never the baseline delta. */
export function TensionGauge({ sample, configuration, phase }: TensionGaugeProps) {
  const id = useId();
  const validReading = Number.isFinite(sample.tension);
  // Settings establish the display scale. Readings never expand it and conceal a spike.
  const headroom = configuration.tensionCritical * 1.25;
  const scaleTarget = Number.isFinite(headroom)
    ? Math.max(1, headroom)
    : configuration.tensionCritical;
  const niceMaximum = scaleLinear().domain([0, scaleTarget]).nice(4).domain()[1];
  const fullScale = Number.isFinite(niceMaximum) ? niceMaximum : configuration.tensionCritical;
  const angle = scaleLinear().domain([0, fullScale]).range([START_ANGLE, END_ANGLE]).clamp(true);
  const currentRules = evaluateAlerts(sample, configuration);
  // The sample preserves the time-derivative loss rule; a single reading cannot rederive it.
  const lossAlert =
    sample.alerts.find((alert) => alert.id === 'loss-of-load') ??
    currentRules.find((alert) => alert.id === 'loss-of-load');
  const tensionAlert = currentRules.find((alert) => alert.id === 'line-tension');
  const relevantAlert = lossAlert ?? tensionAlert;
  const severity = validReading ? (relevantAlert?.severity ?? 'normal') : 'unavailable';
  const context = validReading
    ? readingContext(phase, sample.quality === 'stale')
    : 'Reading unavailable';
  const status = !validReading
    ? 'No finite tension sample'
    : lossAlert
      ? 'Critical · loss of load'
      : tensionAlert?.severity === 'critical'
        ? 'Critical · overpull'
        : tensionAlert?.severity === 'warning'
          ? 'Warning · high line tension'
          : 'Within tension limits';
  const overRange = validReading && sample.tension > fullScale;
  const underRange = validReading && sample.tension < 0;
  const numericText = validReading ? sample.tension.toFixed(2) : '—';
  const needleAngle = validReading ? (angle(sample.tension) * 180) / Math.PI : 0;
  const zones = [
    { id: 'normal', from: 0, to: configuration.tensionWarning },
    { id: 'warning', from: configuration.tensionWarning, to: configuration.tensionCritical },
    { id: 'critical', from: configuration.tensionCritical, to: fullScale },
  ];
  const ticks = scaleLinear().domain([0, fullScale]).ticks(4);

  return (
    <section
      className={`tension-gauge tension-gauge--${severity}`}
      data-testid="tension-gauge"
      data-severity={severity}
      data-full-scale={fullScale}
      aria-label="Absolute Line Tension gauge"
    >
      <header className="tension-gauge__header">
        <h2>Absolute Line Tension</h2>
        <span className="tension-gauge__context">{context}</span>
      </header>
      <div className="tension-gauge__visual">
        <svg viewBox="0 0 300 160" role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>Absolute Line Tension: {numericText} kN</title>
          <desc id={`${id}-description`}>
            Scale 0 to {fullScale} kN. Warning at {configuration.tensionWarning} kN; critical at{' '}
            {configuration.tensionCritical} kN. {context}. {status}.
            {overRange
              ? ` Over-range: needle stops at ${fullScale} kN; numeric reading remains exact.`
              : underRange
                ? ' Below scale: needle stops at zero.'
                : ''}
          </desc>
          <g transform={`translate(${CENTER_X},${CENTER_Y})`}>
            {zones.map((zone) => (
              <path
                key={zone.id}
                className={`tension-gauge__zone tension-gauge__zone--${zone.id}`}
                data-zone={zone.id}
                data-from={zone.from}
                data-to={zone.to}
                d={
                  arc()({
                    innerRadius: 73,
                    outerRadius: 81,
                    startAngle: angle(zone.from),
                    endAngle: angle(zone.to),
                  }) ?? undefined
                }
              />
            ))}
          </g>
          {ticks.map((value) => {
            const [x1, y1] = pointAt(angle(value), 84);
            const [x2, y2] = pointAt(angle(value), 89);
            const [x, y] = pointAt(angle(value), 101);
            return (
              <g key={value} className="tension-gauge__graduation">
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <text x={x} y={y} dominantBaseline="middle" textAnchor="middle">
                  {value}
                </text>
              </g>
            );
          })}
          {[
            { id: 'warning', value: configuration.tensionWarning, label: 'Warning threshold' },
            { id: 'critical', value: configuration.tensionCritical, label: 'Critical threshold' },
          ].map((threshold) => {
            const [x1, y1] = pointAt(angle(threshold.value), 70);
            const [x2, y2] = pointAt(angle(threshold.value), 85);
            return (
              <line
                key={threshold.id}
                className={`tension-gauge__threshold tension-gauge__threshold--${threshold.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
              >
                <title>
                  {threshold.label}: {threshold.value} kN
                </title>
              </line>
            );
          })}
          {validReading && (
            <g transform={`translate(${CENTER_X},${CENTER_Y})`}>
              <g
                className="tension-gauge__needle"
                data-testid="tension-gauge-needle"
                data-angle={needleAngle}
                data-clamped={overRange || underRange}
                transform={`rotate(${needleAngle})`}
              >
                <path d="M0,-67 L2.2,-7 L2.2,8 L-2.2,8 L-2.2,-7 Z" />
              </g>
              <circle className="tension-gauge__hub" r="6" />
              <circle className="tension-gauge__hub-center" r="2" />
            </g>
          )}
        </svg>
        <output
          className="tension-gauge__reading"
          aria-label="Absolute tension value"
          aria-live="off"
        >
          <span data-testid="tension-gauge-value">{numericText}</span>
          <small>kN</small>
        </output>
      </div>
      <div className="tension-gauge__status">
        <span aria-hidden="true">{severity === 'normal' ? '○' : '▲'}</span> {status}
        {overRange && <strong className="tension-gauge__range">Over-range</strong>}
        {underRange && <strong className="tension-gauge__range">Below scale</strong>}
      </div>
      <div className="tension-gauge__limits">
        <span>
          <i className="tension-gauge__limit-key--warning" aria-hidden="true" />
          Warning <strong>{configuration.tensionWarning.toFixed(1)}</strong>
        </span>
        <span>
          <i className="tension-gauge__limit-key--critical" aria-hidden="true" />
          Critical <strong>{configuration.tensionCritical.toFixed(1)}</strong> <span>kN</span>
        </span>
      </div>
    </section>
  );
}
