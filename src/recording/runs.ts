import { validateConfiguration } from '../domain/model';
import { SampleValidator } from '../telemetry/validation';
import type { SavedRun, TelemetrySample } from '../domain/types';

const databaseName = 'wireline-synthetic-runs';
const storeName = 'runs';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Browser storage is unavailable. Export still works.'));
  });
}
export async function saveRun(run: SavedRun): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(run, 'latest');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save run. Export a local copy.'));
      transaction.onabort = transaction.onerror;
    });
  } finally {
    db.close();
  }
}
export async function loadRun(): Promise<SavedRun | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get('latest');
      request.onsuccess = () => resolve(isSavedRun(request.result) ? request.result : null);
      request.onerror = () => reject(new Error('Saved run could not be read.'));
    });
  } finally {
    db.close();
  }
}
export function isSavedRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<SavedRun>;
  try {
    if (
      run.version !== 1 ||
      typeof run.id !== 'string' ||
      typeof run.name !== 'string' ||
      !Number.isSafeInteger(run.seed) ||
      !Number.isFinite(run.savedAt) ||
      !run.configuration ||
      validateConfiguration(run.configuration).length > 0 ||
      !Array.isArray(run.configurationHistory) ||
      run.configurationHistory.length === 0 ||
      run.configurationHistory.length > 64 ||
      !run.configurationHistory.every(
        (r, i) =>
          r &&
          Number.isFinite(r.timestamp) &&
          validateConfiguration(r.configuration).length === 0 &&
          (i === 0 || r.timestamp > run.configurationHistory![i - 1].timestamp),
      ) ||
      !Array.isArray(run.events) ||
      run.events.length > 500 ||
      !run.events.every(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.title === 'string' &&
          typeof e.detail === 'string' &&
          ['operator', 'marker', 'alert', 'quality', 'configuration'].includes(e.type) &&
          (e.severity === undefined || ['warning', 'critical'].includes(e.severity)) &&
          Number.isFinite(e.depth) &&
          Number.isFinite(e.timestamp),
      ) ||
      !Array.isArray(run.samples) ||
      run.samples.length === 0 ||
      run.samples.length > 12000
    )
      return false;
    if (run.configurationHistory[0].timestamp > run.samples[0].timestamp) return false;
    const validator = new SampleValidator();
    return run.samples.every((s) => validator.accept(s).accepted);
  } catch {
    return false;
  }
}
const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};
export function toCSV(run: SavedRun): string {
  const header =
    'timestamp_utc,sequence,encoder_pulses,raw_depth_m,measured_depth_m,correction_m,direction,line_speed_m_s,line_tension_kN,baseline_kN,differential_tension_kN,magnetic_marker,quality,discontinuity,active_alerts';
  const rows = run.samples.map((s) =>
    [
      new Date(s.timestamp).toISOString(),
      s.sequence,
      s.encoderPulses,
      s.rawDepth.toFixed(4),
      s.depth.toFixed(4),
      s.correction.toFixed(4),
      s.direction,
      s.speed.toFixed(4),
      s.tension.toFixed(4),
      s.baseline.toFixed(4),
      s.differential.toFixed(4),
      Number(s.marker),
      s.quality,
      Number(s.discontinuity),
      s.alerts.map((a) => `${a.id}:${a.severity}`).join('|'),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\r\n') + '\r\n';
}
export function download(content: string, filename: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Chronological, so repeated depths preserve their separate visits. */
export function closestDepthIndex(samples: TelemetrySample[], depth: number): number {
  let index = 0;
  samples.forEach((s, i) => {
    if (Math.abs(s.depth - depth) <= Math.abs(samples[index].depth - depth)) index = i;
  });
  return index;
}

export function configurationAt(run: SavedRun, timestamp: number) {
  return (
    [...run.configurationHistory].reverse().find((revision) => revision.timestamp <= timestamp)
      ?.configuration ?? run.configurationHistory[0].configuration
  );
}
