export interface SurveyStation {
  depth: number;
  inclination: number;
  azimuth: number;
  vertical: number;
  north: number;
  east: number;
  section: number;
}

const radians = (angle: number) => (angle * Math.PI) / 180;
export const SECTION_AZIMUTH = 145;

/** A deterministic prototype survey, integrated with the balanced-tangential method. */
export function createSyntheticSurvey(totalDepth: number): SurveyStation[] {
  const result: SurveyStation[] = [];
  const intervals = 40;
  for (let index = 0; index <= intervals; index += 1) {
    const portion = index / intervals;
    const station: SurveyStation = {
      depth: totalDepth * portion,
      inclination:
        2 + (24 * (1 - Math.cos(portion * Math.PI))) / 2 + 2 * Math.sin(portion * Math.PI * 2),
      azimuth: SECTION_AZIMUTH + 20 * Math.sin(portion * Math.PI * 1.4),
      vertical: 0,
      north: 0,
      east: 0,
      section: 0,
    };
    const previous = result.at(-1);
    if (previous) {
      const distance = station.depth - previous.depth;
      const i = radians(station.inclination);
      const p = radians(previous.inclination);
      station.vertical = previous.vertical + (distance * (Math.cos(i) + Math.cos(p))) / 2;
      station.north =
        previous.north +
        (distance *
          (Math.sin(i) * Math.cos(radians(station.azimuth)) +
            Math.sin(p) * Math.cos(radians(previous.azimuth)))) /
          2;
      station.east =
        previous.east +
        (distance *
          (Math.sin(i) * Math.sin(radians(station.azimuth)) +
            Math.sin(p) * Math.sin(radians(previous.azimuth)))) /
          2;
      station.section =
        station.north * Math.cos(radians(SECTION_AZIMUTH)) +
        station.east * Math.sin(radians(SECTION_AZIMUTH));
    }
    result.push(station);
  }
  return result;
}
