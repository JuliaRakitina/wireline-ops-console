import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowDownUp,
  AlertTriangle,
  Check,
  CircleCheck,
  CircleDot,
  Crosshair,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  Save,
  Square,
  Volume2,
  VolumeX,
  Radio,
  Waves,
} from 'lucide-react';
import type { Scenario } from '../domain/types';
import { consoleStore, type ConsoleSnapshot } from './console-store';
import { DepthChart } from '../visualization/DepthChart';
import { WellSchematic } from '../visualization/WellSchematic';
import { TensionGauge } from '../visualization/TensionGauge';
import { depthText, depthValue, signed, timeText } from '../ui/format';

const scenarios: { id: Scenario; name: string; description: string }[] = [
  {
    id: 'normal',
    name: 'Normal descent',
    description: 'Steady downhole travel and regular magnetic references.',
  },
  {
    id: 'reverse',
    name: 'Pause and reverse',
    description: 'Decelerate, hold, then retrieve. The same depth, a different pass.',
  },
  {
    id: 'snag',
    name: 'Snag / overpull',
    description: 'Attempted retrieval slows while line tension rises.',
  },
  {
    id: 'loss',
    name: 'Sudden tension loss',
    description: 'Rapid load reduction. Several physical causes are possible.',
  },
  {
    id: 'encoder',
    name: 'Encoder degradation',
    description: 'Missed pulses make depth suspect; markers establish a reference.',
  },
  {
    id: 'boundary',
    name: 'Boundary approach',
    description: 'Relocate near Total Depth to demonstrate proximity limits.',
  },
];
export function Live({ state, onReview }: { state: ConsoleSnapshot; onReview: () => void }) {
  const [scenario, setScenario] = useState<Scenario>('snag');
  const [sound, setSound] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const { sample, configuration, lifecycle } = state;
  const running = lifecycle.phase === 'running';
  const paused = lifecycle.phase === 'paused';
  const critical = sample.alerts.some((a) => a.severity === 'critical');
  const criticalKey = sample.alerts
    .filter(
      (a) => a.severity === 'critical' && !state.acknowledged.includes(`${a.id}:${a.severity}`),
    )
    .map((a) => a.id)
    .join(',');
  useEffect(() => {
    if (!sound || !audioContext || !criticalKey) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
    return () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [criticalKey, sound, audioContext]);
  const marker = state.events.filter((e) => e.type === 'marker').at(-1);
  return (
    <>
      <div className="operation-bar">
        <div className="connection-state">
          <span className={`status-orb ${running ? 'on' : ''}`} />
          <strong>
            {lifecycle.phase === 'connecting'
              ? 'Connecting to simulator'
              : running
                ? sample.direction === 'up'
                  ? 'Retrieving · uphole'
                  : sample.direction === 'stationary'
                    ? 'Running · stationary'
                    : 'Logging · downhole'
                : paused
                  ? 'Acquisition paused'
                  : lifecycle.phase === 'stopped'
                    ? 'Run stopped'
                    : 'Ready to acquire'}
          </strong>
          <span className="subtle-divider" />
          {sample.alerts.length > 0 && (
            <a href="#active-alerts" className={`top-alert ${critical ? 'critical' : 'warning'}`}>
              ▲ {sample.alerts.length} {critical ? 'critical alert' : 'warning'}
              {sample.alerts.length > 1 ? 's' : ''}
            </a>
          )}
          <span className={sample.quality === 'good' ? 'signal-good' : 'signal-degraded'}>
            <Radio size={14} />
            {sample.quality === 'good'
              ? 'Signal good'
              : sample.quality === 'stale'
                ? 'Telemetry stale'
                : 'Depth confidence degraded'}
          </span>
        </div>
        <div className="button-row">
          {running ? (
            <button className="button" onClick={consoleStore.pause}>
              <Pause size={15} /> Pause
            </button>
          ) : paused ? (
            <button className="button primary" onClick={consoleStore.resume}>
              <Play size={15} /> Resume
            </button>
          ) : (
            <button
              className="button primary"
              disabled={lifecycle.phase === 'connecting'}
              onClick={consoleStore.start}
            >
              <Play size={15} /> Start run
            </button>
          )}
          <button className="button" onClick={consoleStore.reverse} disabled={!running && !paused}>
            <ArrowDownUp size={15} /> Reverse
          </button>
          <button
            className="icon-button"
            aria-label="Stop run"
            title="Stop run"
            disabled={!running && !paused}
            onClick={consoleStore.stop}
          >
            <Square size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Reset deterministic run"
            title="Reset deterministic run"
            onClick={consoleStore.reset}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <section className="metrics" aria-label="Live measurements">
        <div className="motion-metrics">
          <div className="metric">
            <div className="metric-label">
              <span>Measured Depth</span>
              <ArrowDown size={16} />
            </div>
            <div className="metric-value" data-testid="measured-depth">
              {depthValue(sample.depth, configuration.depthUnit).toFixed(2)}
              <small>{configuration.depthUnit}</small>
            </div>
            <div className="metric-caption">
              Raw {depthText(sample.rawDepth, configuration.depthUnit, 2)} <span>·</span> correction{' '}
              {signed(depthValue(sample.correction, configuration.depthUnit))}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">
              <span>Line Speed</span>
              {sample.direction === 'up' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </div>
            <div className="metric-value">
              {Math.abs(depthValue(sample.speed * 60, configuration.depthUnit)).toFixed(1)}
              <small>{configuration.depthUnit}/min</small>
            </div>
            <div className="metric-caption">
              {paused
                ? 'Last received · acquisition paused'
                : sample.direction === 'up'
                  ? '↑ Uphole / retrieving'
                  : sample.direction === 'stationary'
                    ? 'Stationary'
                    : '↓ Downhole / lowering'}
            </div>
          </div>
        </div>
        <div className="tension-instrument">
          <TensionGauge sample={sample} configuration={configuration} phase={lifecycle.phase} />
        </div>
        <div className="metric differential">
          <div className="metric-label">
            <span>Differential Tension</span>
            <Waves size={16} />
          </div>
          <div className="metric-value">
            {signed(sample.differential)}
            <small>kN</small>
          </div>
          <div className="metric-caption">
            Baseline {sample.baseline.toFixed(2)} kN{' '}
            <button className="text-button" onClick={consoleStore.baseline}>
              <Crosshair size={12} /> Set baseline
            </button>
          </div>
          <div className="differential-reference">
            <span>Current tension − operator baseline</span>
            <div className="differential-limits">
              <span>
                △ Warning <strong>±{configuration.differentialWarning.toFixed(1)} kN</strong>
              </span>
              <span>
                ▲ Critical <strong>±{configuration.differentialCritical.toFixed(1)} kN</strong>
              </span>
            </div>
          </div>
        </div>
      </section>
      <div className="operations-grid">
        <main className="chart-column">
          <DepthChart
            key={state.epoch}
            samples={state.samples}
            events={state.events}
            configuration={configuration}
            live={true}
          />
          <section className="scenario-lab">
            <div className="scenario-icon">
              <FlaskConical size={21} />
            </div>
            <div className="scenario-copy">
              <h3>Put the system under pressure.</h3>
              <p>{scenarios.find((s) => s.id === scenario)?.description}</p>
            </div>
            <label className="sr-only" htmlFor="scenario">
              Scenario
            </label>
            <select
              id="scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as Scenario)}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="button primary" onClick={() => consoleStore.scenario(scenario)}>
              Inject scenario <ArrowDownUp size={14} />
            </button>
          </section>
          <section className="panel event-panel">
            <div className="panel-heading">
              <h3>
                <Activity size={16} /> Event log{' '}
                <span className="count">{state.events.length}</span>
              </h3>
              <span className="muted">Latest first · {configuration.depthUnit}</span>
            </div>
            <div className="event-list">
              {state.events.length === 0 ? (
                <p className="empty">Events appear as the run progresses.</p>
              ) : (
                state.events
                  .slice(-5)
                  .reverse()
                  .map((e) => (
                    <div className={`event-row ${e.severity ?? ''}`} key={e.id}>
                      <time>{timeText(e.timestamp)}</time>
                      <span className="event-symbol">
                        {e.type === 'alert' ? (
                          <AlertTriangle size={14} />
                        ) : e.type === 'marker' ? (
                          <CircleDot size={14} />
                        ) : (
                          <Activity size={14} />
                        )}
                      </span>
                      <strong>{e.title}</strong>
                      <span className="event-depth mono">
                        {depthValue(e.depth, configuration.depthUnit).toFixed(1)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </section>
        </main>
        <aside className="operations-aside">
          <section className="panel well-panel">
            <div className="panel-heading">
              <h3>Well profile</h3>
              <span className="badge neutral">SYNTHETIC</span>
            </div>
            <WellSchematic configuration={configuration} sample={sample} compact />
            <div className="well-summary">
              <span>To Total Depth</span>
              <strong>
                {depthText(configuration.totalDepth - sample.depth, configuration.depthUnit)}
              </strong>
            </div>
          </section>
          <section
            id="active-alerts"
            className={`panel alerts-panel ${critical ? 'has-critical' : sample.alerts.length ? 'has-warning' : ''}`}
            aria-label="Active alerts"
          >
            <div className="panel-heading">
              <h3>
                {sample.alerts.length ? <AlertTriangle size={16} /> : <CircleCheck size={16} />}{' '}
                {sample.alerts.length ? 'Active alerts' : 'Within operating limits'}
              </h3>
              <button
                className="icon-button"
                aria-label={sound ? 'Mute alert sound' : 'Enable alert sound'}
                title={sound ? 'Mute alert sound' : 'Enable alert sound'}
                onClick={() => {
                  if (!audioContext) {
                    const audio = new AudioContext();
                    void audio.resume();
                    setAudioContext(audio);
                  }
                  setSound(!sound);
                }}
              >
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
            <div aria-live="polite" className="alert-list">
              {sample.alerts.length ? (
                sample.alerts.map((a) => (
                  <div className={`alert-item ${a.severity}`} key={a.id}>
                    <span className="alert-severity">
                      {a.severity === 'critical' ? '▲ CRITICAL' : '△ WARNING'}
                      {state.acknowledged.includes(`${a.id}:${a.severity}`) ? ' · ACK' : ''}
                    </span>
                    <strong>{a.title}</strong>
                    <p>{a.detail}</p>
                  </div>
                ))
              ) : (
                <p className="quiet-message">
                  No active alerts.
                  <br />
                  Monitoring load, motion, and boundaries.
                </p>
              )}
            </div>
            {sample.alerts.length > 0 && (
              <button className="button acknowledge" onClick={consoleStore.acknowledge}>
                <Check size={14} /> Acknowledge alerts
              </button>
            )}
            <div className="sound-caption">
              Sound {sound ? 'enabled' : 'off'} · visual alerts always active
            </div>
          </section>
          <section className="panel marker-panel">
            <div className="panel-heading">
              <h3>
                <CircleDot size={16} /> Magnetic reference
              </h3>
            </div>
            <strong className="marker-value">
              {marker ? depthText(marker.depth, configuration.depthUnit) : 'Awaiting marker'}
            </strong>
            <p>
              {marker ? 'Last detected marker' : 'Known cable references'} · every{' '}
              {depthText(configuration.markerInterval, configuration.depthUnit, 0)}
            </p>
            <div className="reference-detail">
              <span>Encoder</span>
              <span className="mono">{sample.encoderPulses.toLocaleString()} pulses</span>
            </div>
          </section>
        </aside>
      </div>
      <div className="recording-footer">
        <span>
          <span className={`recording-dot ${running ? 'active' : ''}`} />
          {running ? 'Recording locally' : paused ? 'Recording paused' : 'Synthetic preview'}{' '}
          <span className="muted">
            · {state.samples.length.toLocaleString()} samples · 20 Hz acquisition / 5 Hz display
          </span>
        </span>
        <div className="button-row">
          <span className="save-message" role="status">
            {state.savedMessage}
          </span>
          <button className="text-button" onClick={() => void consoleStore.save()}>
            <Save size={14} /> Save run
          </button>
          <button className="text-button" onClick={onReview}>
            Review & export →
          </button>
        </div>
      </div>
    </>
  );
}
