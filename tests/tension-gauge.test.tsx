import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/domain/model';
import type { TelemetrySample } from '../src/domain/types';
import { TensionGauge } from '../src/visualization/TensionGauge';

function sample(changes: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    sequence: 1,
    timestamp: 1000,
    depth: 480,
    rawDepth: 480,
    encoderPulses: 192000,
    correction: 0,
    direction: 'down',
    speed: 0.7,
    tension: 8,
    baseline: 8,
    differential: 0,
    marker: false,
    quality: 'good',
    alerts: [],
    discontinuity: false,
    ...changes,
  };
}

describe('absolute line tension gauge', () => {
  it('keeps geometry finite when an accepted finite threshold overflows optional headroom', () => {
    const { container } = render(
      <TensionGauge
        sample={sample({ tension: 1e308 })}
        configuration={{
          ...DEFAULT_CONFIG,
          tensionWarning: 1e308,
          tensionCritical: Number.MAX_VALUE,
        }}
        phase="running"
      />,
    );
    expect(
      Number.isFinite(Number(screen.getByTestId('tension-gauge').getAttribute('data-full-scale'))),
    ).toBe(true);
    expect(
      Number.isFinite(
        Number(screen.getByTestId('tension-gauge-needle').getAttribute('data-angle')),
      ),
    ).toBe(true);
    expect(container.querySelector('svg')!.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('uses absolute tension independently of the operator differential baseline', () => {
    const { rerender } = render(
      <TensionGauge
        sample={sample({ tension: 10, baseline: 8, differential: 2 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    const angle = screen.getByTestId('tension-gauge-needle').getAttribute('data-angle');
    expect(screen.getByTestId('tension-gauge-value')).toHaveTextContent('10.00');
    rerender(
      <TensionGauge
        sample={sample({ tension: 10, baseline: 15, differential: -5 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge-needle')).toHaveAttribute('data-angle', angle);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Absolute Line Tension: 10.00 kN/);
  });

  it('changes warning and critical states exactly at configured thresholds', () => {
    const { rerender } = render(
      <TensionGauge
        sample={sample({ tension: 11.99 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'normal');
    rerender(
      <TensionGauge
        sample={sample({ tension: 12 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'warning');
    expect(screen.getByText('Warning · high line tension')).toBeInTheDocument();
    rerender(
      <TensionGauge
        sample={sample({ tension: 16 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'critical');
    expect(screen.getByText('Critical · overpull')).toBeInTheDocument();
  });

  it('keeps a fixed configured scale and shows actual over-range tension while clamping the needle', () => {
    const { rerender } = render(
      <TensionGauge sample={sample()} configuration={DEFAULT_CONFIG} phase="running" />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-full-scale', '20');
    rerender(
      <TensionGauge
        sample={sample({ tension: 30 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-full-scale', '20');
    expect(screen.getByTestId('tension-gauge-value')).toHaveTextContent('30.00');
    expect(screen.getByTestId('tension-gauge-needle')).toHaveAttribute('data-clamped', 'true');
    expect(
      Number(screen.getByTestId('tension-gauge-needle').getAttribute('data-angle')),
    ).toBeCloseTo(110);
    expect(screen.getByText('Over-range')).toBeInTheDocument();
  });

  it('updates threshold geometry and full scale from settings', () => {
    const { container, rerender } = render(
      <TensionGauge
        sample={sample({ tension: 11 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    const oldArc = container.querySelector('[data-zone="warning"]')!.getAttribute('d');
    rerender(
      <TensionGauge
        sample={sample({ tension: 11 })}
        configuration={{ ...DEFAULT_CONFIG, tensionWarning: 10, tensionCritical: 20 }}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-full-scale', '25');
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'warning');
    const zone = container.querySelector('[data-zone="warning"]')!;
    expect(zone).toHaveAttribute('data-from', '10');
    expect(zone).toHaveAttribute('data-to', '20');
    expect(zone.getAttribute('d')).not.toBe(oldArc);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Warning at 10 kN; critical at 20 kN/);
  });

  it('shows loss of load as critical even when the needle is in the low zone', () => {
    const loss = {
      id: 'loss-of-load',
      severity: 'critical' as const,
      title: 'Sudden tension loss',
      detail: 'Rapid load reduction.',
    };
    const { rerender } = render(
      <TensionGauge
        sample={sample({ tension: 6, alerts: [loss] })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'critical');
    expect(screen.getByText('Critical · loss of load')).toBeInTheDocument();
    expect(
      Number(screen.getByTestId('tension-gauge-needle').getAttribute('data-angle')),
    ).toBeLessThan(0);
    rerender(
      <TensionGauge
        sample={sample({ tension: 2 })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'critical');
  });

  it('labels paused, ready and stale values as retained readings', () => {
    const { rerender } = render(
      <TensionGauge sample={sample()} configuration={DEFAULT_CONFIG} phase="paused" />,
    );
    expect(screen.getByText('Paused · last reading')).toBeInTheDocument();
    rerender(<TensionGauge sample={sample()} configuration={DEFAULT_CONFIG} phase="ready" />);
    expect(screen.getByText('Ready · last reading')).toBeInTheDocument();
    rerender(
      <TensionGauge
        sample={sample({ quality: 'stale' })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByText('Stale · last reading')).toBeInTheDocument();
    expect(screen.getByTestId('tension-gauge-value')).toHaveTextContent('8.00');
  });

  it('does not mistake depth encoder degradation for invalid line tension', () => {
    render(
      <TensionGauge
        sample={sample({ quality: 'degraded' })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByText('Live reading')).toBeInTheDocument();
    expect(screen.getByTestId('tension-gauge')).toHaveAttribute('data-severity', 'normal');
    expect(screen.getByTestId('tension-gauge-value')).toHaveTextContent('8.00');
  });

  it('withholds the needle when the tension is non-finite', () => {
    render(
      <TensionGauge
        sample={sample({ tension: Number.NaN })}
        configuration={DEFAULT_CONFIG}
        phase="running"
      />,
    );
    expect(screen.getByText('Reading unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('tension-gauge-needle')).not.toBeInTheDocument();
    expect(screen.getByTestId('tension-gauge-value')).toHaveTextContent('—');
  });
});
