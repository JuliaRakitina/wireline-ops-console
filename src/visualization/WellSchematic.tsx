import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import type { Configuration, TelemetrySample } from '../domain/types';
import './visualization.css';

interface WellSchematicProps {
  configuration: Configuration;
  sample?: TelemetrySample;
  compact?: boolean;
}

export function WellSchematic({ configuration, sample, compact = false }: WellSchematicProps) {
  const patternId = `cement-${useId().replaceAll(':', '')}`;
  const height = compact ? 240 : 430;
  const top = 34;
  const bottom = height - 27;
  const y = scaleLinear().domain([0, configuration.totalDepth]).range([top, bottom]).clamp(true);
  const shoeY = y(configuration.casingShoe);
  // Only callouts move. The well geometry and the leader's origin retain the exact depth.
  const shoeLabelY = Math.max(top + 48, Math.min(bottom - 46, shoeY));
  const showCasedLabel = shoeLabelY - top >= 98;
  const showOpenHoleLabel = bottom - shoeLabelY >= 58;
  const toolY = y(sample?.depth ?? 0);
  const factor = configuration.depthUnit === 'ft' ? 3.28084 : 1;
  const formatDepth = (depth: number) =>
    `${(depth * factor).toFixed(0)} ${configuration.depthUnit}`;
  const openHoleSegments = Array.from({ length: 19 }, (_, index) => {
    const partY = shoeY + ((bottom - shoeY) * index) / 18;
    return `${index % 2 ? 43 : 47},${partY}`;
  }).join(' ');
  const openHoleRight = Array.from({ length: 19 }, (_, index) => {
    const partY = shoeY + ((bottom - shoeY) * index) / 18;
    return `${index % 2 ? 99 : 95},${partY}`;
  }).join(' ');
  const direction =
    sample?.direction === 'up'
      ? '↑ Retrieving'
      : sample?.direction === 'down'
        ? '↓ Lowering'
        : '— Stationary';

  return (
    <section
      className={`well-schematic ${compact ? 'well-schematic--compact' : ''}`}
      aria-label="Well schematic"
    >
      <div className="well-tool-readout">
        <span>Tool position</span>
        <strong>
          {sample ? (sample.depth * factor).toFixed(2) : '—'}{' '}
          <small>{configuration.depthUnit}</small>
        </strong>
        <span>{direction}</span>
      </div>
      <svg
        viewBox={`0 0 290 ${height}`}
        role="img"
        aria-label={`Surface, Casing Shoe at ${formatDepth(configuration.casingShoe)}, Total Depth ${formatDepth(configuration.totalDepth)}; tool at ${sample ? formatDepth(sample.depth) : 'surface'}`}
      >
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line x1="0" x2="0" y1="0" y2="6" stroke="#b8c3ba" strokeWidth="2" />
          </pattern>
        </defs>
        <rect
          x="32"
          y={top}
          width="78"
          height={shoeY - top}
          fill={`url(#${patternId})`}
          opacity="0.65"
        />
        <rect
          x="47"
          y={top}
          width="48"
          height={shoeY - top}
          fill="#f7faf6"
          stroke="#697b70"
          strokeWidth="2"
        />
        <rect x="47" y={shoeY} width="48" height={bottom - shoeY} fill="#f4f0e5" />
        <polyline points={openHoleSegments} fill="none" stroke="#a6a58e" strokeWidth="1.5" />
        <polyline points={openHoleRight} fill="none" stroke="#a6a58e" strokeWidth="1.5" />
        {[0, configuration.casingShoe, configuration.totalDepth].map((depth) => (
          <g key={depth}>
            <rect
              x="35"
              width="72"
              y={y(Math.max(0, depth - configuration.warningDistance))}
              height={Math.max(
                2,
                y(Math.min(configuration.totalDepth, depth + configuration.warningDistance)) -
                  y(Math.max(0, depth - configuration.warningDistance)),
              )}
              fill="#e8b755"
              opacity="0.24"
            />
            <rect
              x="35"
              width="72"
              y={y(Math.max(0, depth - configuration.criticalDistance))}
              height={Math.max(
                1,
                y(Math.min(configuration.totalDepth, depth + configuration.criticalDistance)) -
                  y(Math.max(0, depth - configuration.criticalDistance)),
              )}
              fill="#bd6b38"
              opacity="0.22"
            />
          </g>
        ))}
        <line x1="19" x2="124" y1={top} y2={top} stroke="#6b7d71" strokeWidth="2" />
        <path
          d={`M59,${top}v-13h24v13 M65,${top - 13}v-7h12v7`}
          fill="#f0f4eb"
          stroke="#405a4d"
          strokeWidth="2"
        />
        <line x1="110" x2="134" y1={top} y2={top} stroke="#8c9b8f" />
        <text x="141" y={top - 2} className="well-label">
          Surface / wellhead
        </text>
        <text x="141" y={top + 15} className="well-value">
          0 {configuration.depthUnit}
        </text>
        {showCasedLabel && (
          <>
            <text x="141" y={top + (shoeLabelY - top) * 0.48} className="well-interval-label">
              Cased and
            </text>
            <text x="141" y={top + (shoeLabelY - top) * 0.48 + 16} className="well-interval-label">
              cemented interval
            </text>
          </>
        )}
        <path
          d={`M42,${shoeY - 5}L47,${shoeY + 3}H95L100,${shoeY - 5}`}
          fill="none"
          stroke="#9b7025"
          strokeWidth="3"
        />
        <path
          d={`M101,${shoeY}H117L134,${shoeLabelY}`}
          fill="none"
          stroke="#a98a4b"
          strokeDasharray="3 3"
        />
        <text x="141" y={shoeLabelY - 3} className="well-label">
          Casing Shoe
        </text>
        <text x="141" y={shoeLabelY + 14} className="well-value" data-testid="schematic-shoe">
          {formatDepth(configuration.casingShoe)}
        </text>
        {showOpenHoleLabel && (
          <text
            x="141"
            y={shoeLabelY + (bottom - shoeLabelY) * 0.52}
            className="well-interval-label"
          >
            Open-hole interval
          </text>
        )}
        <path
          d={`M44,${bottom - 4}Q71,${bottom + 9}98,${bottom - 4}`}
          fill="none"
          stroke="#77806b"
          strokeWidth="2"
        />
        <line x1="102" x2="134" y1={bottom} y2={bottom} stroke="#8c9b8f" />
        <text x="141" y={bottom - 3} className="well-label">
          Total Depth
        </text>
        <text x="141" y={bottom + 14} className="well-value" data-testid="schematic-td">
          {formatDepth(configuration.totalDepth)}
        </text>
        {sample && (
          <g>
            <line
              x1="71"
              x2="71"
              y1={top - 8}
              y2={toolY}
              stroke={sample.quality === 'good' ? '#254c3a' : '#a96b16'}
              strokeWidth="1.5"
              strokeDasharray={sample.quality === 'good' ? undefined : '4 3'}
            />
            <line
              x1="34"
              x2="110"
              y1={toolY}
              y2={toolY}
              stroke="#087f7a"
              strokeDasharray="2 3"
              opacity="0.6"
            />
            <rect
              x="65.5"
              y={Math.max(top, Math.min(bottom - 20, toolY - 10))}
              width="11"
              height="22"
              rx="4"
              fill="#174e3c"
              stroke="#fff"
              strokeWidth="1.4"
            />
            <circle
              cx="71"
              cy={Math.max(top + 8, Math.min(bottom - 10, toolY))}
              r="2"
              fill="#d3e39d"
            />
            {sample.direction !== 'stationary' && (
              <path
                d={
                  sample.direction === 'down'
                    ? `M115,${toolY - 7}v14m-4,-4l4,4l4,-4`
                    : `M115,${toolY + 7}v-14m-4,4l4,-4l4,4`
                }
                fill="none"
                stroke="#087f7a"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}
      </svg>
      {(!showCasedLabel || !showOpenHoleLabel) && (
        <div className="well-interval-legend">
          {!showCasedLabel && (
            <p>
              <span>Cased and cemented interval</span>
              <strong>0–{formatDepth(configuration.casingShoe)}</strong>
            </p>
          )}
          {!showOpenHoleLabel && (
            <p>
              <span>Open-hole interval</span>
              <strong>
                {formatDepth(configuration.casingShoe)}–{formatDepth(configuration.totalDepth)}
              </strong>
            </p>
          )}
        </div>
      )}
      <div className="well-legend">
        <span>
          <i /> Warning bands
        </span>
        <span>±{formatDepth(configuration.warningDistance)}</span>
      </div>
      {sample?.quality !== undefined && sample.quality !== 'good' && (
        <p className="well-quality">△ Position uses {sample.quality} acquisition</p>
      )}
    </section>
  );
}
