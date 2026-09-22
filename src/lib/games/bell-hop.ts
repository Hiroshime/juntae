export const BELL_HOP_WIDTH = 720;
export const BELL_HOP_HEIGHT = 760;
export const BELL_HOP_MAX_BELLS = 5_000;

export type BellHopPlatform = {
  level: number;
  x: number;
  altitude: number;
  width: number;
};

export type BellHopMotion = {
  amplitude: number;
  speed: number;
};

function randomUnit(seed: number, index: number, salt: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

export function bellHopPlatform(seed: number, level: number): BellHopPlatform {
  if (!Number.isInteger(level) || level < 1) throw new Error("Nível de sino inválido.");
  const width = Math.max(36, 152 - (level - 1) * 1.12);
  const margin = 26 + width / 2 + bellHopMotion(level).amplitude;
  const progressiveAltitude =
    level <= 201
      ? Math.round(0.06 * level * (level - 1))
      : Math.round(0.06 * 201 * 200 + (level - 201) * 24);
  return {
    level,
    x: margin + randomUnit(seed, level, 0x51f15e) * (BELL_HOP_WIDTH - margin * 2),
    altitude: level * 104 + progressiveAltitude + Math.round(randomUnit(seed, level, 0xb311) * 18),
    width,
  };
}

export function bellHopMotion(level: number): BellHopMotion {
  if (!Number.isInteger(level) || level < 1) throw new Error("Nível de sino inválido.");
  return {
    amplitude: Math.min(38, 6 + level * 0.34),
    speed: Math.min(1.55, 0.72 + level * 0.009),
  };
}

export function bellHopScore(bellsHit: number) {
  if (!Number.isInteger(bellsHit) || bellsHit < 0 || bellsHit > BELL_HOP_MAX_BELLS)
    throw new Error("Quantidade de sinos inválida.");
  return 5 * bellsHit * (bellsHit + 1);
}

export function bellHopPointsForNextBell(bellsHit: number) {
  if (!Number.isInteger(bellsHit) || bellsHit < 0) throw new Error("Pontuação inválida.");
  return (bellsHit + 1) * 10;
}
