/** Prototype RMS thresholds, not calibrated dB or a validated shouting classifier. */
export const SHOUT_SETTINGS = {
  SHOUT_THRESHOLD: 0.12,
  SHOUT_MIN_DURATION_MS: 350,
  SHOUT_RELEASE_THRESHOLD: 0.08,
  SHOUT_RELEASE_DURATION_MS: 300,
  MAX_SAMPLE_GAP_MS: 400,
} as const;
export function createShoutingDetector(settings = SHOUT_SETTINGS) {
  let count = 0, shouting = false;
  let highSince: number | null = null, lowSince: number | null = null, previous: number | null = null;
  let continuous = true;
  return {
    sample(level: number, at: number) {
      if (!Number.isFinite(level) || level < 0 || level > 1 || !Number.isFinite(at) || (previous !== null && at <= previous)) {
        return { shouting_count: count, is_shouting: shouting, continuous };
      }
      if (previous !== null && at - previous > settings.MAX_SAMPLE_GAP_MS) {
        highSince = null; lowSince = null; continuous = false;
      }
      previous = at;
      if (!shouting) {
        if (level >= settings.SHOUT_THRESHOLD) {
          highSince ??= at;
          if (at - highSince >= settings.SHOUT_MIN_DURATION_MS) { shouting = true; count++; highSince = null; }
        } else highSince = null;
      } else {
        if (level <= settings.SHOUT_RELEASE_THRESHOLD) {
          lowSince ??= at;
          if (at - lowSince >= settings.SHOUT_RELEASE_DURATION_MS) { shouting = false; lowSince = null; }
        } else lowSince = null;
      }
      return { shouting_count: count, is_shouting: shouting, continuous };
    },
  };
}
