import { useState, useSyncExternalStore } from 'react';
import {
  Activity,
  BookOpen,
  ChevronRight,
  Layers3,
  Radio,
  Settings2,
  Waypoints,
  X,
  ExternalLink,
} from 'lucide-react';
import { consoleStore } from './features/console-store';
import { Live } from './features/Live';
import { Review } from './features/Review';
import { Configuration } from './features/Configuration';
import { Inclinometry } from './visualization/Inclinometry';
import { WellSchematic } from './visualization/WellSchematic';
import type { SavedRun } from './domain/types';
const pages = [
  { id: 'live', name: 'Live Operations', icon: Activity },
  { id: 'review', name: 'Run Review', icon: Layers3 },
  { id: 'well', name: 'Well Profile', icon: Waypoints },
  { id: 'configuration', name: 'Configuration', icon: Settings2 },
] as const;
type Page = (typeof pages)[number]['id'];
export default function App() {
  const state = useSyncExternalStore(consoleStore.subscribe, consoleStore.getSnapshot);
  const [page, setPage] = useState<Page>('live');
  const [reviewRun, setReviewRun] = useState<SavedRun>(() => consoleStore.run());
  const [about, setAbout] = useState(false);
  function navigate(next: Page) {
    if (next === 'review') setReviewRun(consoleStore.run());
    setPage(next);
  }
  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('live');
          }}
          aria-label="Wireline home"
        >
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M8 6v15l8 6 8-6V6M16 3v20" />
            </svg>
          </span>
          <span>
            wireline<span className="brand-descriptor">OPERATIONS CONSOLE</span>
          </span>
        </a>
        <div className="header-right">
          <span className="demo-badge">
            <Radio size={13} /> SYNTHETIC DEMO
          </span>
          <button className="about-button" onClick={() => setAbout(true)}>
            The engineering story <ChevronRight size={15} />
          </button>
          <span className="avatar" aria-label="Julia Rakitina">
            JR
          </span>
        </div>
      </header>
      <div className="nav-strip">
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p.id}
              aria-current={page === p.id ? 'page' : undefined}
              className={page === p.id ? 'nav-item selected' : 'nav-item'}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={16} />
              {p.name}
            </button>
          ))}
        </nav>
        <span className="system-note">
          LOCAL SOURCE <span /> NO EQUIPMENT CONNECTED
        </span>
      </div>
      <div className="workspace" id="workspace">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              WORKSPACE <ChevronRight size={11} /> DEMONSTRATION RUN
            </div>
            <h1>{pages.find((p) => p.id === page)?.name}</h1>
          </div>
          <div className="run-identity">
            <strong>
              WL–2016 <span>/</span> DEMO RUN
            </strong>
            <span>
              Deterministic seed 2016 <span className="identity-dot">·</span>{' '}
              {state.scenario === 'normal'
                ? 'Normal descent'
                : state.scenario === 'snag'
                  ? 'Snag / overpull'
                  : state.scenario === 'loss'
                    ? 'Sudden tension loss'
                    : state.scenario === 'encoder'
                      ? 'Encoder degradation'
                      : state.scenario === 'boundary'
                        ? 'Boundary approach'
                        : 'Pause and reverse'}
            </span>
          </div>
        </div>
        {page === 'live' && <Live state={state} onReview={() => navigate('review')} />}
        {page === 'review' && <Review key={reviewRun.savedAt} initialRun={reviewRun} />}
        {page === 'configuration' && (
          <Configuration configuration={state.configuration} onApply={consoleStore.configure} />
        )}
        {page === 'well' && (
          <div className="profile-page">
            <section className="panel full-well">
              <div className="panel-heading">
                <h3>Well construction</h3>
                <span className="badge neutral">SCHEMATIC</span>
              </div>
              <WellSchematic configuration={state.configuration} sample={state.sample} />
              <p className="info-note">
                One geometry model drives the schematic, depth-track annotations, and proximity
                alerts.
              </p>
            </section>
            <Inclinometry configuration={state.configuration} />
          </div>
        )}
        <footer className="app-footer">
          <span>Built from field experience. Reimagined for the browser.</span>
          <button className="text-button" onClick={() => setAbout(true)}>
            Julia Rakitina <ExternalLink size={12} />
          </button>
          <span className="footer-disclaimer">
            Synthetic data · Educational model · Not certified for field control
          </span>
        </footer>
      </div>
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            className="story-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAbout(false);
              if (e.key === 'Tab') {
                const controls = e.currentTarget.querySelectorAll<HTMLElement>('button,a');
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              autoFocus
              className="icon-button close-dialog"
              aria-label="Close engineering story"
              onClick={() => setAbout(false)}
            >
              <X />
            </button>
            <span className="eyebrow">2015–2016 → Today</span>
            <h2 id="story-title">From sensor to screen.</h2>
            <p className="story-lead">
              A modern continuation of a system Julia Rakitina designed, implemented, and
              field-tested.
            </p>
            <div className="story-line">
              <strong>01 / The physical problem</strong>
              <p>
                Digitize a wireline logging winch unit: turn cable movement, line tension, and
                magnetic depth markers into measurements an operator can trust.
              </p>
            </div>
            <div className="story-line">
              <strong>02 / The foundational system</strong>
              <p>
                Julia's work covered sensors, acquisition, calibration, monitoring, recording, and
                visualization. Field tests exposed missed encoder pulses at high rates in the
                original Arduino acquisition layer.
              </p>
            </div>
            <div className="story-line">
              <strong>03 / The architecture endured</strong>
              <p>
                The foundational architecture later evolved to LabJack-based acquisition and modern
                tablet software and was commercialized in 2026. This demo is a clean-room
                reimplementation with synthetic data; it is not connected to that production system.
              </p>
            </div>
            <a
              className="button primary story-link"
              href="https://dev.to/julia_rakitina/the-chart-that-had-to-grow-downward-20h3"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={16} /> Read “The chart that had to grow downward”{' '}
              <ExternalLink size={14} />
            </a>
          </section>
        </div>
      )}
    </>
  );
}
