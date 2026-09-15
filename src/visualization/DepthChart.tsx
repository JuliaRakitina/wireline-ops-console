import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { axisLeft, axisTop } from 'd3-axis';
import { scaleLinear } from 'd3-scale';
import { pointer, select } from 'd3-selection';
import { line } from 'd3-shape';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import type { Configuration, RunEvent, TelemetrySample } from '../domain/types';
import {
  inspectViewport,
  nearestSampleAtDepth,
  resolveViewport,
  returnToLive,
  zoomDepthDomain,
  type DepthDomain,
  type Viewport,
} from './viewport';
import './visualization.css';

type TrackId = 'tension' | 'differential' | 'speed';
interface Track {
  id: TrackId;
  label: string;
  color: string;
  unit: string;
  domain: [number, number];
  enabled: boolean;
}
interface DepthChartProps {
  samples: TelemetrySample[];
  events: RunEvent[];
  configuration: Configuration;
  live?: boolean;
  selectedDepth?: number;
  onSelectDepth?: (depth: number) => void;
}

const CHART_HEIGHT = 310;
const PLOT_TOP = 60;
const PLOT_BOTTOM = CHART_HEIGHT - 17;
const LEFT = 62;
const RIGHT = 12;
const GAP = 13;
const initialTracks: Track[] = [
  {
    id: 'tension',
    label: 'Line Tension',
    color: '#087f7a',
    unit: 'kN',
    domain: [0, 20],
    enabled: true,
  },
  {
    id: 'differential',
    label: 'Differential Tension',
    color: '#7952a6',
    unit: 'kN',
    domain: [-8, 8],
    enabled: true,
  },
  {
    id: 'speed',
    label: 'Line Speed',
    color: '#52667e',
    unit: 'm/min',
    domain: [-60, 60],
    enabled: true,
  },
];

function valueForTrack(sample: TelemetrySample, track: TrackId, factor: number): number {
  return track === 'speed' ? sample.speed * 60 * factor : sample[track];
}

function signed(value: number, digits = 2): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function DepthChart({
  samples,
  events,
  configuration,
  live = true,
  selectedDepth,
  onSelectDepth,
}: DepthChartProps) {
  const plotId = useId().replaceAll(':', '').replaceAll('«', '').replaceAll('»', '');
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const interactionRef = useRef<SVGRectElement>(null);
  const [width, setWidth] = useState(750);
  const [viewport, setViewport] = useState<Viewport>({ mode: 'live', span: 60 });
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [cursorDepth, setCursorDepth] = useState<number | undefined>();
  const [scalesOpen, setScalesOpen] = useState(false);
  const last = samples.at(-1);
  const lastMovingDirection = useMemo(() => {
    for (let index = samples.length - 1; index >= 0; index -= 1) {
      if (samples[index].direction !== 'stationary') return samples[index].direction;
    }
    return 'down' as const;
  }, [samples]);
  const domain = useMemo(
    () => resolveViewport(viewport, last, lastMovingDirection),
    [viewport, last, lastMovingDirection],
  );
  const domainRef = useRef<DepthDomain>(domain);
  const lastRef = useRef(last);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const selectDepthRef = useRef(onSelectDepth);
  const enabledTracks = useMemo(() => tracks.filter((track) => track.enabled), [tracks]);
  const factor = configuration.depthUnit === 'ft' ? 3.28084 : 1;
  const focusDepth = cursorDepth ?? selectedDepth;
  const inspectedSample = useMemo(
    () => (focusDepth === undefined ? last : nearestSampleAtDepth(samples, focusDepth)),
    [samples, focusDepth, last],
  );
  const span = domain[1] - domain[0];
  const trackWidth =
    (width - LEFT - RIGHT - GAP * (enabledTracks.length - 1)) / enabledTracks.length;

  useEffect(() => {
    domainRef.current = domain;
    lastRef.current = last;
    selectDepthRef.current = onSelectDepth;
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) =>
      setWidth(Math.max(470, Math.round(entry.contentRect.width))),
    );
    resize.observe(element);
    return () => resize.disconnect();
  }, []);

  function inspect(nextDomain: DepthDomain) {
    setViewport(inspectViewport(nextDomain, last?.timestamp ?? 0));
  }

  function pan(amount: number) {
    inspect([domain[0] + span * amount, domain[1] + span * amount]);
  }

  function changeDomain(id: TrackId, bound: 0 | 1, value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || value.trim() === '') return;
    setTracks((previous) =>
      previous.map((track) => {
        if (track.id !== id) return track;
        const next: [number, number] = [...track.domain];
        next[bound] = track.id === 'speed' ? numeric / factor : numeric;
        return next[1] > next[0] ? { ...track, domain: next } : track;
      }),
    );
  }

  // React owns the SVG scaffold. D3 exclusively owns this group and its descendants.
  useEffect(() => {
    if (!contentRef.current) return;
    const root = select(contentRef.current);
    const y = scaleLinear().domain(domain).range([PLOT_TOP, PLOT_BOTTOM]);
    const depthTicks = y.ticks(7);
    const plotHeight = PLOT_BOTTOM - PLOT_TOP;
    const defs = root.selectAll<SVGDefsElement, null>('defs').data([null]).join('defs');
    defs
      .selectAll<SVGClipPathElement, Track>('clipPath.track-clip')
      .data(enabledTracks, (track) => track.id)
      .join('clipPath')
      .attr('class', 'track-clip')
      .attr('id', (track) => `${plotId}-${track.id}`)
      .selectAll('rect')
      .data([null])
      .join('rect')
      .attr('x', 0)
      .attr('y', PLOT_TOP)
      .attr('width', trackWidth)
      .attr('height', plotHeight);
    defs
      .selectAll('clipPath.event-clip')
      .data([null])
      .join('clipPath')
      .attr('class', 'event-clip')
      .attr('id', `${plotId}-events`)
      .selectAll('rect')
      .data([null])
      .join('rect')
      .attr('x', LEFT - 13)
      .attr('y', PLOT_TOP)
      .attr('width', 10)
      .attr('height', plotHeight);

    root
      .selectAll<SVGGElement, null>('g.depth-axis')
      .data([null])
      .join('g')
      .attr('class', 'depth-axis')
      .attr('transform', `translate(${LEFT - 19},0)`)
      .call(
        axisLeft(y)
          .tickValues(depthTicks)
          .tickSize(0)
          .tickPadding(7)
          .tickFormat((value) => (Number(value) * factor).toFixed(0)),
      )
      .call((axis) => axis.select('.domain').remove());
    root
      .selectAll('text.depth-unit')
      .data([null])
      .join('text')
      .attr('class', 'depth-unit')
      .attr('x', LEFT - 24)
      .attr('y', 39)
      .attr('text-anchor', 'end')
      .text(configuration.depthUnit);

    const groups = root
      .selectAll<SVGGElement, Track>('g.telemetry-track')
      .data(enabledTracks, (track) => track.id)
      .join('g')
      .attr('class', 'telemetry-track')
      .attr('data-track', (track) => track.id)
      .attr('transform', (_, index) => `translate(${LEFT + index * (trackWidth + GAP)},0)`);

    // At most 2,400 points per trace. Keep acquisition order so reverse visits remain visible.
    const stride = Math.max(1, Math.ceil(samples.length / 2400));
    const points = samples.filter(
      (sample, index) =>
        index % stride === 0 || index === samples.length - 1 || sample.discontinuity,
    );
    const visibleEvents = events
      .filter((event) => event.depth >= domain[0] && event.depth <= domain[1])
      .slice(-80);
    const boundaries = [
      { depth: configuration.casingShoe, label: 'CASING SHOE' },
      { depth: configuration.totalDepth, label: 'TOTAL DEPTH' },
    ].filter((boundary) => boundary.depth >= domain[0] && boundary.depth <= domain[1]);

    groups.each(function renderTrack(track, index) {
      const group = select(this);
      const xDomain = track.domain.map((bound) => bound * (track.id === 'speed' ? factor : 1));
      const x = scaleLinear().domain(xDomain).range([0, trackWidth]);
      group
        .selectAll('rect.plot-paper')
        .data([null])
        .join('rect')
        .attr('class', 'plot-paper')
        .attr('y', PLOT_TOP)
        .attr('width', trackWidth)
        .attr('height', plotHeight);
      group
        .selectAll('text.track-label')
        .data([null])
        .join('text')
        .attr('class', 'track-label')
        .attr('x', 0)
        .attr('y', 16)
        .attr('fill', track.color)
        .text(track.id === 'differential' && trackWidth < 205 ? 'Differential' : track.label);
      group
        .selectAll('text.track-unit')
        .data([null])
        .join('text')
        .attr('class', 'track-unit')
        .attr('x', trackWidth)
        .attr('y', 16)
        .attr('text-anchor', 'end')
        .text(track.id === 'speed' ? `${configuration.depthUnit}/min` : track.unit);
      group
        .selectAll<SVGGElement, null>('g.track-axis')
        .data([null])
        .join('g')
        .attr('class', 'track-axis')
        .attr('transform', `translate(0,${PLOT_TOP - 5})`)
        .call(axisTop(x).ticks(4).tickSize(3).tickPadding(6))
        .call((axis) => axis.select('.domain').remove());

      const clipped = group
        .selectAll('g.clipped-track')
        .data([null])
        .join('g')
        .attr('class', 'clipped-track')
        .attr('clip-path', `url(#${plotId}-${track.id})`);
      clipped
        .selectAll('line.depth-grid')
        .data(depthTicks)
        .join('line')
        .attr('class', 'depth-grid')
        .attr('x1', 0)
        .attr('x2', trackWidth)
        .attr('y1', (depth) => y(depth))
        .attr('y2', (depth) => y(depth));
      clipped
        .selectAll('line.value-grid')
        .data(x.ticks(4))
        .join('line')
        .attr('class', 'value-grid')
        .attr('x1', (value) => x(value))
        .attr('x2', (value) => x(value))
        .attr('y1', PLOT_TOP)
        .attr('y2', PLOT_BOTTOM);
      clipped
        .selectAll('line.zero-reference')
        .data(track.id !== 'tension' ? [0] : [])
        .join('line')
        .attr('class', 'zero-reference')
        .attr('x1', x(0))
        .attr('x2', x(0))
        .attr('y1', PLOT_TOP)
        .attr('y2', PLOT_BOTTOM);
      const threshold =
        track.id === 'tension' ? configuration.tensionWarning : configuration.differentialWarning;
      clipped
        .selectAll('line.threshold-reference')
        .data(
          track.id === 'speed'
            ? []
            : track.id === 'differential'
              ? [-threshold, threshold]
              : [threshold],
        )
        .join('line')
        .attr('class', 'threshold-reference')
        .attr('x1', (value) => x(value))
        .attr('x2', (value) => x(value))
        .attr('y1', PLOT_TOP)
        .attr('y2', PLOT_BOTTOM);
      clipped
        .selectAll('line.boundary-reference')
        .data(boundaries)
        .join('line')
        .attr('class', 'boundary-reference')
        .attr('x1', 0)
        .attr('x2', trackWidth)
        .attr('y1', (boundary) => y(boundary.depth))
        .attr('y2', (boundary) => y(boundary.depth));
      clipped
        .selectAll('text.boundary-label')
        .data(index === 0 ? boundaries : [])
        .join('text')
        .attr('class', 'boundary-label')
        .attr('x', 5)
        .attr('y', (boundary) => y(boundary.depth) - 6)
        .text((boundary) => boundary.label);
      clipped
        .selectAll('line.marker-reference')
        .data(visibleEvents.filter((event) => event.type === 'marker'))
        .join('line')
        .attr('class', 'marker-reference')
        .attr('x1', 0)
        .attr('x2', trackWidth)
        .attr('y1', (event) => y(event.depth))
        .attr('y2', (event) => y(event.depth));

      const path = line<TelemetrySample>()
        .defined((sample, sampleIndex) => {
          if (
            !Number.isFinite(sample.depth) ||
            !Number.isFinite(valueForTrack(sample, track.id, factor)) ||
            sample.discontinuity
          )
            return false;
          const previous = points[sampleIndex - 1];
          return (
            !previous ||
            Math.abs(sample.depth - previous.depth) <
              Math.max(
                4,
                (Math.abs(sample.speed) * (sample.timestamp - previous.timestamp)) / 1000 + 2,
              )
          );
        })
        .x((sample) => x(valueForTrack(sample, track.id, factor)))
        .y((sample) => y(sample.depth));
      clipped
        .selectAll('path.telemetry-line')
        .data([points])
        .join('path')
        .attr('class', 'telemetry-line')
        .attr('stroke', track.color)
        .attr('d', path);
      clipped
        .selectAll('circle.latest-point')
        .data(last ? [last] : [])
        .join('circle')
        .attr('class', 'latest-point')
        .attr('cx', (sample) => x(valueForTrack(sample, track.id, factor)))
        .attr('cy', (sample) => y(sample.depth))
        .attr('r', 3.5)
        .attr('fill', track.color);
      clipped
        .selectAll('line.depth-cursor')
        .data(focusDepth === undefined ? [] : [focusDepth])
        .join('line')
        .attr('class', 'depth-cursor')
        .attr('x1', 0)
        .attr('x2', trackWidth)
        .attr('y1', (depth) => y(depth))
        .attr('y2', (depth) => y(depth));
      clipped
        .selectAll('circle.cursor-point')
        .data(focusDepth !== undefined && inspectedSample ? [inspectedSample] : [])
        .join('circle')
        .attr('class', 'cursor-point')
        .attr('cx', (sample) => x(valueForTrack(sample, track.id, factor)))
        .attr('cy', (sample) => y(sample.depth))
        .attr('r', 4)
        .attr('stroke', track.color);
    });

    root
      .selectAll<SVGGElement, null>('g.event-rail')
      .data([null])
      .join('g')
      .attr('class', 'event-rail')
      .attr('clip-path', `url(#${plotId}-events)`)
      .selectAll<SVGPathElement, RunEvent>('path')
      .data(
        visibleEvents.filter((event) => event.type === 'marker' || event.type === 'alert'),
        (event) => event.id,
      )
      .join('path')
      .attr('transform', (event) => `translate(${LEFT - 8},${y(event.depth)})`)
      .attr('d', (event) => (event.type === 'marker' ? 'M0,-4L4,0L0,4L-4,0Z' : 'M0,-5L4,3L-4,3Z'))
      .attr('fill', (event) =>
        event.type === 'marker' ? '#087f7a' : event.severity === 'critical' ? '#b73834' : '#ab6a08',
      )
      .selectAll('title')
      .data((event) => [event])
      .join('title')
      .text(
        (event) =>
          `${event.title} · ${(event.depth * factor).toFixed(1)} ${configuration.depthUnit}`,
      );
  }, [
    samples,
    events,
    configuration,
    enabledTracks,
    plotId,
    domain,
    focusDepth,
    inspectedSample,
    factor,
    last,
    trackWidth,
  ]);

  // Delta transforms use the current frozen domain, rather than a reset-on-render zoom scale.
  useEffect(() => {
    if (!interactionRef.current) return;
    const element = interactionRef.current;
    const area = select(element);
    transformRef.current = zoomIdentity;
    const behavior = zoom<SVGRectElement, unknown>()
      .extent([
        [LEFT, PLOT_TOP],
        [width - RIGHT, PLOT_BOTTOM],
      ])
      .scaleExtent([0.025, 500])
      .clickDistance(4)
      .filter(
        (event: Event) =>
          event.type !== 'dblclick' && (!(event instanceof MouseEvent) || event.button === 0),
      );
    area.call(behavior).call(behavior.transform, zoomIdentity);
    behavior.on('zoom', (event: { transform: ZoomTransform }) => {
      const previous = transformRef.current;
      const next = event.transform;
      const k = next.k / previous.k;
      const dy = next.y - k * previous.y;
      const current = domainRef.current;
      const scale = scaleLinear().domain(current).range([PLOT_TOP, PLOT_BOTTOM]);
      const nextDomain: DepthDomain = [
        scale.invert((PLOT_TOP - dy) / k),
        scale.invert((PLOT_BOTTOM - dy) / k),
      ];
      const nextViewport = inspectViewport(nextDomain, lastRef.current?.timestamp ?? 0);
      if (nextViewport.mode === 'history') domainRef.current = nextViewport.domain;
      transformRef.current = next;
      setViewport(nextViewport);
    });
    area
      .on('pointermove.inspect', (event: PointerEvent) => {
        if (event.buttons) return;
        const [, pixelY] = pointer(event, element.ownerSVGElement);
        const depth = scaleLinear()
          .domain(domainRef.current)
          .range([PLOT_TOP, PLOT_BOTTOM])
          .invert(pixelY);
        setCursorDepth(depth);
      })
      .on('click.inspect', (event: MouseEvent) => {
        if (event.defaultPrevented) return;
        const [, pixelY] = pointer(event, element.ownerSVGElement);
        const depth = scaleLinear()
          .domain(domainRef.current)
          .range([PLOT_TOP, PLOT_BOTTOM])
          .invert(pixelY);
        setCursorDepth(depth);
        selectDepthRef.current?.(depth);
      })
      .on('pointerleave.inspect', () => setCursorDepth(undefined));
    return () => {
      area.on('.zoom', null).on('.inspect', null);
    };
  }, [width]);

  const lagSeconds =
    viewport.mode === 'history' && last
      ? Math.max(0, Math.round((last.timestamp - viewport.inspectedAt) / 1000))
      : 0;
  const lagDepth = last ? Math.max(0, domain[0] - last.depth, last.depth - domain[1]) * factor : 0;

  return (
    <section className="depth-chart" aria-label="Depth-indexed telemetry">
      <div className="depth-chart__heading">
        <div>
          <h2>Depth tracks</h2>
          <p>One depth axis. Three independent signals.</p>
        </div>
        <span className={`chart-mode ${viewport.mode === 'live' ? 'chart-mode--live' : ''}`}>
          <span aria-hidden="true">{viewport.mode === 'live' ? '●' : '↕'}</span>{' '}
          {viewport.mode === 'live'
            ? live
              ? 'Following live'
              : 'Following replay'
            : 'Inspecting history'}
        </span>
      </div>
      <div className="chart-toolbar">
        <div className="chart-track-toggles" aria-label="Visible tracks">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              aria-pressed={track.enabled}
              disabled={track.enabled && enabledTracks.length === 1}
              onClick={() =>
                setTracks((previous) =>
                  previous.map((item) =>
                    item.id === track.id ? { ...item, enabled: !item.enabled } : item,
                  ),
                )
              }
            >
              <span className="track-dot" style={{ background: track.color }} />
              {track.id === 'differential'
                ? 'Differential'
                : track.id === 'tension'
                  ? 'Tension'
                  : 'Speed'}
            </button>
          ))}
        </div>
        <div className="chart-controls">
          <button
            type="button"
            aria-label="Inspect shallower depths"
            title="Inspect shallower depths"
            onClick={() => pan(-0.3)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Inspect deeper depths"
            title="Inspect deeper depths"
            onClick={() => pan(0.3)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Zoom in depth chart"
            title="Zoom in"
            onClick={() => inspect(zoomDepthDomain(domain, 0.7))}
          >
            ＋
          </button>
          <button
            type="button"
            aria-label="Zoom out depth chart"
            title="Zoom out"
            onClick={() => inspect(zoomDepthDomain(domain, 1.4))}
          >
            −
          </button>
          <button
            type="button"
            aria-expanded={scalesOpen}
            onClick={() => setScalesOpen(!scalesOpen)}
          >
            Scales
          </button>
        </div>
      </div>
      {scalesOpen && (
        <div className="chart-scale-editor">
          {tracks.map((track) => (
            <fieldset key={track.id}>
              <legend>
                {track.label} ·{' '}
                {track.id === 'speed' ? `${configuration.depthUnit}/min` : track.unit}
              </legend>
              {([0, 1] as const).map((bound) => (
                <label key={bound}>
                  {bound === 0 ? 'Min' : 'Max'}
                  <input
                    type="number"
                    step="any"
                    aria-label={`${track.label} ${bound === 0 ? 'minimum' : 'maximum'}`}
                    value={Number(
                      (track.domain[bound] * (track.id === 'speed' ? factor : 1)).toFixed(2),
                    )}
                    onChange={(event) => changeDomain(track.id, bound, event.target.value)}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <div className="chart-history-bar" data-testid="chart-mode" data-mode={viewport.mode}>
        {viewport.mode === 'history' ? (
          <>
            <span>
              Viewport held · {lagSeconds}s since inspection
              {lagDepth > 0.1
                ? ` · ${lagDepth.toFixed(1)} ${configuration.depthUnit} from latest`
                : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setViewport(returnToLive(viewport));
                setCursorDepth(undefined);
              }}
            >
              Back to {live ? 'Live' : 'Replay'} ↘
            </button>
          </>
        ) : (
          <>
            <span>↓ Depth increases downward</span>
            <span>Drag to inspect · scroll to zoom{onSelectDepth ? ' · click to select' : ''}</span>
          </>
        )}
      </div>
      <div className="chart-scroll-container">
        <div
          className="depth-chart__surface"
          ref={containerRef}
          tabIndex={0}
          role="region"
          aria-label={`Interactive depth chart. Arrow keys pan; plus and minus zoom; L returns to live.${onSelectDepth ? ' Enter selects the cursor or center depth.' : ''}`}
          data-testid="depth-chart"
          data-depth-domain={`${domain[0].toFixed(3)},${domain[1].toFixed(3)}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              pan(event.key === 'ArrowUp' ? -0.2 : 0.2);
            }
            if (event.key === '+' || event.key === '=') {
              event.preventDefault();
              inspect(zoomDepthDomain(domain, 0.7));
            }
            if (event.key === '-') {
              event.preventDefault();
              inspect(zoomDepthDomain(domain, 1.4));
            }
            if (event.key.toLowerCase() === 'l') setViewport(returnToLive(viewport));
            if (event.key === 'Enter' && onSelectDepth) {
              event.preventDefault();
              onSelectDepth(focusDepth ?? (domain[0] + domain[1]) / 2);
            }
          }}
        >
          <svg
            width={width}
            height={CHART_HEIGHT}
            role="img"
            aria-label="Line tension, differential tension and line speed against increasing measured depth"
          >
            <g ref={contentRef} />
            <rect
              ref={interactionRef}
              x={LEFT}
              y={PLOT_TOP}
              width={width - LEFT - RIGHT}
              height={PLOT_BOTTOM - PLOT_TOP}
              fill="transparent"
              className="chart-interaction"
              aria-hidden="true"
            />
          </svg>
          {samples.length === 0 && (
            <div className="chart-empty">
              Awaiting telemetry<span>Start a synthetic run to draw the depth tracks.</span>
            </div>
          )}
        </div>
      </div>
      <div className="chart-readout" aria-live="off">
        <span>
          {focusDepth === undefined ? 'LATEST' : 'INSPECT'}{' '}
          <strong>
            {inspectedSample ? (inspectedSample.depth * factor).toFixed(2) : '—'}{' '}
            {configuration.depthUnit}
          </strong>
        </span>
        <span className="readout-tension">
          T <strong>{inspectedSample?.tension.toFixed(2) ?? '—'} kN</strong>
        </span>
        <span className="readout-differential">
          ΔT <strong>{inspectedSample ? signed(inspectedSample.differential) : '—'} kN</strong>
        </span>
        <span>
          V{' '}
          <strong>
            {inspectedSample ? signed(inspectedSample.speed * 60 * factor, 1) : '—'}{' '}
            {configuration.depthUnit}/min
          </strong>
        </span>
      </div>
      <div className="chart-footnote">
        <span>
          ◆ Magnetic Depth Marker <span className="event-key-alert">▲ Alert</span>{' '}
          <span className="event-key-threshold">┊ Warning threshold</span>
        </span>
        <span>Latest visit at selected depth</span>
      </div>
    </section>
  );
}
