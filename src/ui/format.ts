export const depthValue = (value: number, unit: 'm' | 'ft') =>
  value * (unit === 'ft' ? 3.280839895 : 1);
export const depthText = (value: number, unit: 'm' | 'ft', digits = 1) =>
  `${depthValue(value, unit).toFixed(digits)} ${unit}`;
export const signed = (value: number, digits = 2) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
export const timeText = (timestamp: number) => new Date(timestamp).toISOString().slice(11, 19);
