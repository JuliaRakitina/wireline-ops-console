import { useEffect, useState } from 'react';
import { Download, Play, Pause, Save, Clock3, FolderOpen } from 'lucide-react';
import type { SavedRun } from '../domain/types';
import { closestDepthIndex, configurationAt, download, loadRun, toCSV } from '../recording/runs';
import { DepthChart } from '../visualization/DepthChart';
import { depthText, timeText } from '../ui/format';
export function Review({ initialRun }: { initialRun: SavedRun }) {
  const [run, setRun] = useState(initialRun);
  const [index, setIndex] = useState(Math.max(0, initialRun.samples.length - 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState(
    'Current run snapshot · live acquisition continues independently',
  );
  const sample = run.samples[index];
  const configuration = configurationAt(run, sample.timestamp);
  const atEnd = index === run.samples.length - 1;
  const replaying = playing && !atEnd;
  useEffect(() => {
    if (!replaying) return;
    const timer = setInterval(
      () => setIndex((i) => Math.min(run.samples.length - 1, i + speed)),
      200,
    );
    return () => clearInterval(timer);
  }, [replaying, speed, run.samples.length]);
  async function restore() {
    try {
      const saved = await loadRun();
      if (saved) {
        setRun(saved);
        setIndex(saved.samples.length - 1);
        setPlaying(false);
        setMessage('Restored latest saved run from this browser');
      } else setMessage('No saved run yet. Save a run from Live Operations.');
    } catch {
      setMessage('Browser storage unavailable. The current snapshot is still available.');
    }
  }
  return (
    <div className="review-page">
      <div className="review-banner">
        <div>
          <span className="eyebrow">Recorded data / synthetic only</span>
          <h2>Every pass has a history.</h2>
          <p>Inspect by time or depth. Repeated depths retain their chronological visits.</p>
        </div>
        <div className="button-row">
          <button className="button" onClick={() => void restore()}>
            <FolderOpen size={16} /> Load saved run
          </button>
          <button
            className="button"
            onClick={() => download(toCSV(run), 'wireline-synthetic-run.csv')}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            className="button"
            onClick={() =>
              download(
                JSON.stringify(run, null, 2),
                'wireline-synthetic-run.json',
                'application/json',
              )
            }
          >
            <Save size={16} /> Run + metadata
          </button>
        </div>
      </div>
      <section className="panel replay-panel">
        <div className="replay-top">
          <div className="button-row">
            <span className="badge replay">
              <Clock3 size={13} /> REPLAY
            </span>
            <button
              className="button primary"
              onClick={() => {
                if (atEnd) setIndex(0);
                setPlaying(!playing || atEnd);
              }}
              aria-label={playing && !atEnd ? 'Pause replay' : 'Play replay'}
            >
              {playing && !atEnd ? <Pause size={16} /> : <Play size={16} />}{' '}
              {playing && !atEnd ? 'Pause' : 'Play'}
            </button>
            <label className="inline-field">
              Speed
              <select
                aria-label="Replay speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {[1, 2, 4, 8].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <strong className="mono">
            {timeText(sample.timestamp)} <span className="muted">/</span>{' '}
            {depthText(sample.depth, configuration.depthUnit)}
          </strong>
        </div>
        <label className="scrubber">
          <span>
            Run timeline{' '}
            <small>
              {run.samples.length.toLocaleString()} samples ·{' '}
              {((run.samples.at(-1)!.timestamp - run.samples[0].timestamp) / 1000).toFixed(0)}{' '}
              seconds
            </small>
          </span>
          <input
            type="range"
            min={0}
            max={run.samples.length - 1}
            value={index}
            aria-label="Run timeline"
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setPlaying(false);
            }}
          />
        </label>
        <div className="replay-bottom">
          <span role="status">{atEnd && playing ? 'Playback complete' : message}</span>
          <label className="inline-field">
            Seek measured depth (m)
            <input
              type="number"
              step="0.1"
              aria-label="Seek measured depth"
              defaultValue={sample.depth.toFixed(1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setIndex(closestDepthIndex(run.samples, Number(e.currentTarget.value)));
                  setPlaying(false);
                }
              }}
            />
            <small>Enter to seek</small>
          </label>
        </div>
      </section>
      <p className="replay-config">
        Historical settings at this sample · Casing Shoe{' '}
        {depthText(configuration.casingShoe, configuration.depthUnit, 0)} · Total Depth{' '}
        {depthText(configuration.totalDepth, configuration.depthUnit, 0)} · Line tension warning{' '}
        {configuration.tensionWarning.toFixed(1)} kN
      </p>
      <DepthChart
        samples={run.samples.slice(0, index + 1)}
        events={run.events.filter((e) => e.timestamp <= sample.timestamp)}
        configuration={configuration}
        live={false}
        selectedDepth={sample.depth}
        onSelectDepth={(depth) => {
          setIndex(closestDepthIndex(run.samples.slice(0, index + 1), depth));
          setPlaying(false);
        }}
      />
      <section className="panel recorded-events">
        <h3>
          Recorded events <span className="count">{run.events.length}</span>
        </h3>
        <div className="recorded-event-list">
          {run.events
            .slice(-40)
            .reverse()
            .map((e) => (
              <button
                key={e.id}
                className="recorded-event"
                onClick={() => {
                  let i = run.samples.findIndex((s) => s.timestamp >= e.timestamp);
                  if (i < 0) i = run.samples.length - 1;
                  setIndex(i);
                  setPlaying(false);
                }}
              >
                <time>{timeText(e.timestamp)}</time>
                <strong>{e.title}</strong>
                <span>{depthText(e.depth, configuration.depthUnit)}</span>
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}
