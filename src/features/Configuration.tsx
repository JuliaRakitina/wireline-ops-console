import { useState } from 'react';
import { Check, SlidersHorizontal, Ruler, ShieldCheck, Radio } from 'lucide-react';
import type { Configuration as Config } from '../domain/types';
import { validateConfiguration } from '../domain/model';
export function Configuration({
  configuration,
  onApply,
}: {
  configuration: Config;
  onApply: (c: Config) => void;
}) {
  const [draft, setDraft] = useState({ ...configuration });
  const [applied, setApplied] = useState(false);
  const errors = validateConfiguration(draft);
  function field(key: keyof Config, label: string, unit: string, step = 1) {
    return (
      <label className="form-field" key={key}>
        <span>
          {label}
          <small>{unit}</small>
        </span>
        <input
          type="number"
          step={step}
          value={draft[key]}
          onChange={(e) => {
            setDraft({ ...draft, [key]: Number(e.target.value) });
            setApplied(false);
          }}
        />
      </label>
    );
  }
  return (
    <form
      className="settings-page"
      onSubmit={(e) => {
        e.preventDefault();
        if (errors.length === 0) {
          onApply(draft);
          setApplied(true);
        }
      }}
    >
      <div className="section-intro">
        <div>
          <span className="eyebrow">A single source of truth</span>
          <h2>Configure the operation</h2>
          <p>Geometry, acquisition calibration, and alert limits propagate together.</p>
        </div>
        <SlidersHorizontal size={30} />
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h3>
            <Ruler size={19} /> Well geometry
          </h3>
          <p>
            Depth values are entered in metres. Display units do not change the underlying
            measurements.
          </p>
          {field('casingShoe', 'Casing Shoe', 'm')}
          {field('totalDepth', 'Total Depth', 'm')}
          {field('warningDistance', 'Boundary warning distance', 'm')}
          {field('criticalDistance', 'Boundary critical distance', 'm')}
          <label className="form-field">
            <span>Display depth units</span>
            <select
              value={draft.depthUnit}
              onChange={(e) => {
                setDraft({ ...draft, depthUnit: e.target.value as 'm' | 'ft' });
                setApplied(false);
              }}
            >
              <option value="m">Metres (m)</option>
              <option value="ft">Feet (ft)</option>
            </select>
          </label>
        </section>
        <section className="panel settings-panel">
          <h3>
            <Radio size={19} /> Acquisition
          </h3>
          <p>
            Encoder calibration converts counted pulses into raw cable travel. Magnetic markers
            provide a known reference.
          </p>
          {field('pulsesPerMeter', 'Encoder calibration', 'pulses / m')}
          {field('markerInterval', 'Magnetic marker spacing', 'm', 0.1)}
          <div className="formula">
            Raw depth = pulses ÷ pulses per metre
            <br />
            Measured depth = raw depth + correction
          </div>
          <p className="info-note">
            Calibration changes retain the current depth reference and are recorded as configuration
            events. Corrections never become line speed.
          </p>
        </section>
        <section className="panel settings-panel">
          <h3>
            <ShieldCheck size={19} /> Alert thresholds
          </h3>
          <p>
            Warnings precede critical limits. Acknowledging an alert does not clear its physical
            condition.
          </p>
          {field('tensionWarning', 'Line tension warning', 'kN', 0.1)}
          {field('tensionCritical', 'Line tension critical', 'kN', 0.1)}
          {field('differentialWarning', 'Differential warning magnitude', 'kN', 0.1)}
          {field('differentialCritical', 'Differential critical magnitude', 'kN', 0.1)}
          {field('lossRate', 'Sudden tension loss rate', 'kN / s', 0.1)}
        </section>
      </div>
      <div className="settings-actions">
        <div role="status">
          {errors.length > 0 ? (
            <ul className="validation-errors">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : applied ? (
            <span className="success-text">
              <Check size={16} /> Configuration applied to charts, well, and alerts.
            </span>
          ) : (
            <span>
              Changes are logged with the run. Existing samples retain their original values.
            </span>
          )}
        </div>
        <button className="button primary" type="submit" disabled={errors.length > 0}>
          Apply configuration
        </button>
      </div>
    </form>
  );
}
