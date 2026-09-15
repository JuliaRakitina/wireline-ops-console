import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Configuration } from '../src/features/Configuration';
import { DepthChart } from '../src/visualization/DepthChart';
import { WellSchematic } from '../src/visualization/WellSchematic';
import { DEFAULT_CONFIG } from '../src/domain/model';
import { Simulator } from '../src/telemetry/simulator';

describe('operator components', () => {
  it('rejects impossible geometry and applies one coherent configuration', async () => {
    const user = userEvent.setup();
    const apply = vi.fn();
    render(<Configuration configuration={DEFAULT_CONFIG} onApply={apply} />);
    fireEvent.change(screen.getByLabelText(/Casing Shoe/), { target: { value: '900' } });
    expect(screen.getByRole('button', { name: 'Apply configuration' })).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Casing Shoe/), { target: { value: '510' } });
    fireEvent.change(screen.getByLabelText(/Total Depth/), { target: { value: '700' } });
    await user.click(screen.getByRole('button', { name: 'Apply configuration' }));
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({ ...DEFAULT_CONFIG, casingShoe: 510, totalDepth: 700 });
  });
  it('preserves keyboard inspection across React rerenders then explicitly returns to live', async () => {
    const user = userEvent.setup();
    const simulator = new Simulator();
    const samples = Array.from({ length: 100 }, () => simulator.step(0.05));
    const { rerender } = render(
      <DepthChart samples={samples} events={[]} configuration={DEFAULT_CONFIG} />,
    );
    await user.click(screen.getByRole('button', { name: 'Inspect shallower depths' }));
    const held = screen.getByTestId('depth-chart').getAttribute('data-depth-domain');
    const updated = [...samples, ...Array.from({ length: 200 }, () => simulator.step(0.05))];
    rerender(<DepthChart samples={updated} events={[]} configuration={DEFAULT_CONFIG} />);
    expect(screen.getByTestId('depth-chart')).toHaveAttribute('data-depth-domain', held);
    fireEvent.keyDown(screen.getByTestId('depth-chart'), { key: 'l' });
    expect(screen.getByTestId('chart-mode')).toHaveAttribute('data-mode', 'live');
    expect(screen.getByTestId('depth-chart')).not.toHaveAttribute('data-depth-domain', held);
  });
  it('propagates geometry and display units without changing the physical sample', () => {
    const simulator = new Simulator();
    const sample = simulator.current;
    const { rerender } = render(<WellSchematic configuration={DEFAULT_CONFIG} sample={sample} />);
    expect(screen.getByTestId('schematic-shoe')).toHaveTextContent('560 m');
    rerender(
      <WellSchematic
        configuration={{ ...DEFAULT_CONFIG, casingShoe: 300, totalDepth: 700, depthUnit: 'ft' }}
        sample={sample}
      />,
    );
    expect(screen.getByTestId('schematic-shoe')).toHaveTextContent('984 ft');
    expect(screen.getByTestId('schematic-td')).toHaveTextContent('2297 ft');
    expect(sample.depth).toBe(480);
  });
});
