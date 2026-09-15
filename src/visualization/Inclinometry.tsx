import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { axisBottom, axisLeft, axisTop } from 'd3-axis';
import { scaleLinear } from 'd3-scale';
import { pointer, select } from 'd3-selection';
import { line } from 'd3-shape';
import type { Configuration } from '../domain/types';
import { createSyntheticSurvey, SECTION_AZIMUTH, type SurveyStation } from './survey';
import './visualization.css';

export function Inclinometry({ configuration }: { configuration: Configuration }) {
  const id = `survey-${useId().replaceAll(':', '')}`;
  const groupRef = useRef<SVGGElement>(null);
  const [stationIndex, setStationIndex] = useState(24);
  const stations = useMemo(
    () => createSyntheticSurvey(configuration.totalDepth),
    [configuration.totalDepth],
  );
  const selected = stations[stationIndex];
  const factor = configuration.depthUnit === 'ft' ? 3.28084 : 1;

  useEffect(() => {
    if (!groupRef.current) return;
    const root = select(groupRef.current);
    const y = scaleLinear().domain([0, configuration.totalDepth]).range([56, 344]);
    const trajectoryY = scaleLinear().domain([0, configuration.totalDepth]).range([56, 344]);
    const panels = [
      {
        key: 'inclination',
        label: 'Inclination / deviation',
        unit: 'degrees',
        left: 62,
        width: 178,
        domain: [0, 35],
        value: (station: SurveyStation) => station.inclination,
        color: '#087f7a',
      },
      {
        key: 'azimuth',
        label: 'Azimuth',
        unit: 'degrees',
        left: 278,
        width: 178,
        domain: [0, 360],
        value: (station: SurveyStation) => station.azimuth,
        color: '#7952a6',
      },
      {
        key: 'section',
        label: 'Vertical section',
        unit: configuration.depthUnit,
        left: 515,
        width: 178,
        domain: [0, Math.max(30, Math.ceil(stations.at(-1)!.section / 50) * 50) * factor],
        value: (station: SurveyStation) => station.section * factor,
        color: '#52667e',
      },
    ];
    root
      .selectAll<SVGDefsElement, null>('defs')
      .data([null])
      .join('defs')
      .selectAll('clipPath')
      .data(panels)
      .join('clipPath')
      .attr('id', (panel) => `${id}-${panel.key}`)
      .selectAll('rect')
      .data((panel) => [panel])
      .join('rect')
      .attr('x', 0)
      .attr('y', 56)
      .attr('width', (panel) => panel.width)
      .attr('height', 288);
    root
      .selectAll<SVGGElement, null>('g.survey-depth-axis')
      .data([null])
      .join('g')
      .attr('class', 'survey-depth-axis')
      .attr('transform', 'translate(54,0)')
      .call(
        axisLeft(y)
          .ticks(6)
          .tickFormat((depth) => (Number(depth) * factor).toFixed(0))
          .tickSize(0)
          .tickPadding(8),
      )
      .call((axis) => axis.select('.domain').remove());
    root
      .selectAll('text.survey-depth-unit')
      .data([null])
      .join('text')
      .attr('class', 'survey-depth-unit')
      .attr('x', 47)
      .attr('y', 42)
      .attr('text-anchor', 'end')
      .text(`MD ${configuration.depthUnit}`);
    const groups = root
      .selectAll<SVGGElement, (typeof panels)[number]>('g.survey-panel')
      .data(panels, (panel) => panel.key)
      .join('g')
      .attr('class', 'survey-panel')
      .attr('transform', (panel) => `translate(${panel.left},0)`);
    groups.each(function render(panel) {
      const group = select(this);
      const x = scaleLinear().domain(panel.domain).range([0, panel.width]);
      const ordinate = (station: SurveyStation) =>
        panel.key === 'section' ? trajectoryY(station.vertical) : y(station.depth);
      group
        .selectAll('text.survey-panel-title')
        .data([null])
        .join('text')
        .attr('class', 'survey-panel-title')
        .attr('y', 15)
        .text(panel.label);
      group
        .selectAll<SVGGElement, null>('g.survey-x-axis')
        .data([null])
        .join('g')
        .attr('class', 'survey-x-axis')
        .attr('transform', 'translate(0,50)')
        .call(
          axisTop(x)
            .ticks(4)
            .tickFormat((value) => `${value}${panel.key === 'section' ? '' : '°'}`)
            .tickSize(3),
        )
        .call((axis) => axis.select('.domain').remove());
      const plot = group
        .selectAll('g.survey-clipped')
        .data([null])
        .join('g')
        .attr('class', 'survey-clipped')
        .attr('clip-path', `url(#${id}-${panel.key})`);
      plot
        .selectAll('rect.survey-paper')
        .data([null])
        .join('rect')
        .attr('class', 'survey-paper')
        .attr('width', panel.width)
        .attr('y', 56)
        .attr('height', 288);
      plot
        .selectAll('line.survey-grid-y')
        .data(y.ticks(6))
        .join('line')
        .attr('class', 'survey-grid-y')
        .attr('x1', 0)
        .attr('x2', panel.width)
        .attr('y1', y)
        .attr('y2', y);
      plot
        .selectAll('line.survey-grid-x')
        .data(x.ticks(4))
        .join('line')
        .attr('class', 'survey-grid-x')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', 56)
        .attr('y2', 344);
      plot
        .selectAll('path.survey-path')
        .data([stations])
        .join('path')
        .attr('class', 'survey-path')
        .attr('stroke', panel.color)
        .attr(
          'd',
          line<SurveyStation>()
            .x((station) => x(panel.value(station)))
            .y(ordinate),
        );
      plot
        .selectAll('circle.survey-station')
        .data(stations.filter((_, index) => index % 4 === 0))
        .join('circle')
        .attr('class', 'survey-station')
        .attr('r', 2.5)
        .attr('fill', panel.color)
        .attr('cx', (station) => x(panel.value(station)))
        .attr('cy', ordinate);
      plot
        .selectAll('line.survey-selection')
        .data([selected])
        .join('line')
        .attr('class', 'survey-selection')
        .attr('x1', 0)
        .attr('x2', panel.width)
        .attr('y1', ordinate)
        .attr('y2', ordinate);
      plot
        .selectAll('circle.selected-station')
        .data([selected])
        .join('circle')
        .attr('class', 'selected-station')
        .attr('r', 5)
        .attr('stroke', panel.color)
        .attr('cx', (station) => x(panel.value(station)))
        .attr('cy', ordinate);
      group
        .selectAll('text.survey-axis-note')
        .data([null])
        .join('text')
        .attr('class', 'survey-axis-note')
        .attr('x', panel.width / 2)
        .attr('y', 372)
        .attr('text-anchor', 'middle')
        .text(
          panel.key === 'section' ? `Horizontal departure (${panel.unit})` : 'Measured Depth ↓',
        );
      group
        .selectAll('rect.survey-hit-area')
        .data([null])
        .join('rect')
        .attr('class', 'survey-hit-area')
        .attr('x', 0)
        .attr('y', 56)
        .attr('width', panel.width)
        .attr('height', 288)
        .attr('fill', 'transparent')
        .on('pointermove', function onMove(event: PointerEvent) {
          const [, pixelY] = pointer(event, this);
          const depth = y.invert(pixelY);
          let nearest = 0;
          let distance = Infinity;
          stations.forEach((station, index) => {
            const delta = Math.abs(
              (panel.key === 'section' ? station.vertical : station.depth) - depth,
            );
            if (delta < distance) {
              nearest = index;
              distance = delta;
            }
          });
          setStationIndex(nearest);
        });
      if (panel.key === 'section') {
        group
          .selectAll<SVGGElement, null>('g.vertical-axis')
          .data([null])
          .join('g')
          .attr('class', 'vertical-axis')
          .call(
            axisLeft(trajectoryY)
              .ticks(6)
              .tickFormat((depth) => (Number(depth) * factor).toFixed(0))
              .tickSize(0)
              .tickPadding(7),
          )
          .call((axis) => axis.select('.domain').remove());
        group
          .selectAll('text.vertical-axis-label')
          .data([null])
          .join('text')
          .attr('class', 'vertical-axis-label')
          .attr('x', -6)
          .attr('y', 42)
          .attr('text-anchor', 'end')
          .text('TVD');
        group
          .selectAll<SVGGElement, null>('g.section-bottom-axis')
          .data([null])
          .join('g')
          .attr('class', 'section-bottom-axis')
          .attr('transform', 'translate(0,344)')
          .call(
            axisBottom(x)
              .ticks(4)
              .tickSize(3)
              .tickFormat(() => ''),
          );
      }
    });
  }, [configuration.totalDepth, configuration.depthUnit, stations, selected, factor, id]);

  return (
    <section className="inclinometry" aria-label="Synthetic inclinometry prototype">
      <div className="inclinometry__heading">
        <div>
          <h2>A well has a direction, too.</h2>
          <p>Inclination, azimuth and the trajectory they describe.</p>
        </div>
        <span className="prototype-badge">SYNTHETIC · PROTOTYPE</span>
      </div>
      <div className="survey-scroll">
        <svg
          viewBox="0 0 715 390"
          role="img"
          aria-label="Synthetic inclination and azimuth versus Measured Depth, with a synchronized vertical section trajectory"
        >
          <g ref={groupRef} />
        </svg>
      </div>
      <label className="survey-slider">
        Inspect survey station{' '}
        <strong>
          {stationIndex + 1} / {stations.length}
        </strong>
        <input
          type="range"
          min="0"
          max={stations.length - 1}
          value={stationIndex}
          onChange={(event) => setStationIndex(Number(event.target.value))}
          aria-label="Selected survey station"
        />
      </label>
      <div className="survey-readouts">
        <span>
          Measured Depth
          <strong>
            {(selected.depth * factor).toFixed(1)} <small>{configuration.depthUnit}</small>
          </strong>
        </span>
        <span>
          Inclination
          <strong>
            {selected.inclination.toFixed(1)}
            <small>°</small>
          </strong>
        </span>
        <span>
          Azimuth
          <strong>
            {selected.azimuth.toFixed(1)}
            <small>°</small>
          </strong>
        </span>
        <span>
          True Vertical Depth
          <strong>
            {(selected.vertical * factor).toFixed(1)} <small>{configuration.depthUnit}</small>
          </strong>
        </span>
      </div>
      <p className="survey-note">
        41 synthetic stations · Balanced-tangential integration · Section azimuth {SECTION_AZIMUTH}
        °. The historical inclinometry work was a visualization prototype; its instrument
        integration was not field complete.
      </p>
    </section>
  );
}
