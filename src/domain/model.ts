import type { Configuration } from './types';

export const DEFAULT_CONFIG: Configuration = Object.freeze({
  totalDepth: 850,
  casingShoe: 560,
  warningDistance: 12,
  criticalDistance: 3,
  pulsesPerMeter: 400,
  markerInterval: 5,
  tensionWarning: 12,
  tensionCritical: 16,
  differentialWarning: 3,
  differentialCritical: 6,
  lossRate: 4,
  depthUnit: 'm',
});

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

/** Encoder counts may be signed; calibration is always a positive pulses/metre. */
export function pulsesToDepth(pulses: number, pulsesPerMeter: number): number {
  requireFinite(pulses, 'Encoder pulses');
  requireFinite(pulsesPerMeter, 'Encoder calibration');
  if (pulsesPerMeter <= 0) throw new RangeError('Encoder calibration must be positive.');
  return pulses / pulsesPerMeter;
}

/** Signed cable speed: positive downhole, negative uphole. Never use corrected depth here. */
export function deriveLineSpeed(
  previousRawDepth: number,
  rawDepth: number,
  elapsedSeconds: number,
): number {
  requireFinite(previousRawDepth, 'Previous raw depth');
  requireFinite(rawDepth, 'Raw depth');
  requireFinite(elapsedSeconds, 'Elapsed time');
  if (elapsedSeconds <= 0) throw new RangeError('Elapsed time must be positive.');
  return (rawDepth - previousRawDepth) / elapsedSeconds;
}

export function differentialTension(tension: number, baseline: number): number {
  requireFinite(tension, 'Line tension');
  requireFinite(baseline, 'Differential baseline');
  return tension - baseline;
}

export interface DepthCorrection {
  depth: number;
  correction: number;
  discontinuity: boolean;
}

/** A known synthetic marker establishes an absolute depth reference without changing pulses. */
export function applyMarkerCorrection(
  rawDepth: number,
  referenceDepth: number,
  previousCorrection = 0,
): DepthCorrection {
  requireFinite(rawDepth, 'Raw depth');
  requireFinite(referenceDepth, 'Marker reference');
  requireFinite(previousCorrection, 'Previous correction');
  const correction = referenceDepth - rawDepth;
  return {
    depth: referenceDepth,
    correction,
    discontinuity: Math.abs(correction - previousCorrection) > 0.05,
  };
}

export function validateConfiguration(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['Configuration must be a complete settings object.'];
  }
  const config = value as Configuration;
  const numericFields = (Object.keys(DEFAULT_CONFIG) as Array<keyof Configuration>).filter(
    (key) => key !== 'depthUnit',
  );
  if (
    numericFields.some(
      (key) =>
        !Object.hasOwn(config, key) ||
        typeof config[key] !== 'number' ||
        !Number.isFinite(config[key]),
    )
  ) {
    errors.push('All required numeric settings must be present and finite numbers.');
    return errors;
  }
  if (config.totalDepth <= 0 || config.totalDepth > 20_000)
    errors.push('Total Depth must be between 0 and 20,000 m.');
  if (config.casingShoe <= 0 || config.casingShoe >= config.totalDepth)
    errors.push('Casing Shoe must be below surface and above Total Depth.');
  if (config.criticalDistance <= 0 || config.warningDistance <= config.criticalDistance)
    errors.push('Warning distance must exceed a positive critical distance.');
  if (config.warningDistance >= config.totalDepth / 2)
    errors.push('Warning distance must be less than half Total Depth.');
  if (config.pulsesPerMeter < 1 || config.pulsesPerMeter > 1_000_000)
    errors.push('Encoder calibration must be between 1 and 1,000,000 pulses/m.');
  if (config.markerInterval < 1 || config.markerInterval > config.totalDepth)
    errors.push('Marker interval must be between 1 m and Total Depth.');
  if (config.tensionWarning <= 0 || config.tensionCritical <= config.tensionWarning)
    errors.push('Line-tension critical threshold must exceed a positive warning threshold.');
  if (config.differentialWarning <= 0 || config.differentialCritical <= config.differentialWarning)
    errors.push('Differential critical threshold must exceed a positive warning threshold.');
  if (config.lossRate <= 0) errors.push('Loss-of-load rate must be positive.');
  if (config.depthUnit !== 'm' && config.depthUnit !== 'ft')
    errors.push('Depth unit must be m or ft.');
  return errors;
}

export function assertConfiguration(config: Configuration): void {
  const errors = validateConfiguration(config);
  if (errors.length) throw new RangeError(errors.join(' '));
}
