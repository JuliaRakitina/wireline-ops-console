import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../src/domain/model';
import { Simulator } from '../src/telemetry/simulator';
import { DepthChart } from '../src/visualization/DepthChart';

function renderReviewChart() {
  const simulator = new Simulator();
  const samples = Array.from({ length: 100 }, () => simulator.step(0.05));
  const selectDepth = vi.fn();
  const rendered = render(
    <DepthChart
      samples={samples}
      events={[]}
      configuration={DEFAULT_CONFIG}
      live={false}
      onSelectDepth={selectDepth}
    />,
  );
  const surface = rendered.container.querySelector('.chart-interaction')!;
  return { surface, selectDepth };
}

describe('chart selection is an explicit operator action', () => {
  it('moves the crosshair on hover without seeking or pausing replay', () => {
    const { surface, selectDepth } = renderReviewChart();
    fireEvent(
      surface,
      new MouseEvent('pointermove', { bubbles: true, clientX: 150, clientY: 140 }),
    );
    expect(screen.getByText('INSPECT')).toBeInTheDocument();
    expect(selectDepth).not.toHaveBeenCalled();
    fireEvent(surface, new MouseEvent('pointerleave', { bubbles: true }));
    expect(selectDepth).not.toHaveBeenCalled();
  });

  it('selects once on an explicit click', () => {
    const { surface, selectDepth } = renderReviewChart();
    fireEvent.click(surface, { clientX: 150, clientY: 140 });
    expect(selectDepth).toHaveBeenCalledExactlyOnceWith(expect.any(Number));
    expect(Number.isFinite(selectDepth.mock.calls[0][0])).toBe(true);
  });

  it('does not turn a drag into a selection', () => {
    const { surface, selectDepth } = renderReviewChart();
    const view = surface.ownerDocument.defaultView!;
    const mouseEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 150, clientY });
      // Vitest's Window proxy is rejected by jsdom's UIEvent constructor.
      Object.defineProperty(event, 'view', { value: view });
      return event;
    };
    fireEvent(surface, mouseEvent('mousedown', 140));
    fireEvent(view, mouseEvent('mousemove', 180));
    fireEvent(view, mouseEvent('mouseup', 180));
    fireEvent.click(surface, { clientX: 150, clientY: 180 });
    expect(screen.getByTestId('chart-mode')).toHaveAttribute('data-mode', 'history');
    expect(selectDepth).not.toHaveBeenCalled();
  });

  it('offers an explicit keyboard selection', () => {
    const { selectDepth } = renderReviewChart();
    const chart = screen.getByTestId('depth-chart');
    fireEvent.keyDown(chart, { key: 'Enter' });
    const domain = chart.getAttribute('data-depth-domain')!.split(',').map(Number);
    expect(selectDepth).toHaveBeenCalledExactlyOnceWith((domain[0] + domain[1]) / 2);
  });
});
