export const TOWER_STACK_WIDTH = 720;
export const TOWER_STACK_HEIGHT = 760;
export const TOWER_STACK_BLOCK_HEIGHT = 52;
export const TOWER_STACK_LIVES = 3;
export const TOWER_STACK_MAX_BLOCKS = 1_000;
export const TOWER_STACK_CRANE_CLEARANCE = 440;
export const TOWER_STACK_ROPE_LENGTH = 142;

export type TowerBlock = {
  x: number;
  width: number;
};

export type TowerStability = {
  stable: boolean;
  lean: number;
  criticalSupport: number | null;
};

export type TowerBlockSpec = {
  level: number;
  width: number;
  swingSpeed: number;
  swingAmplitude: number;
  direction: 1 | -1;
  colorIndex: number;
};

export type TowerRejectionBounce = {
  velocityX: number;
  velocityY: number;
  angularVelocity: number;
};

function randomUnit(seed: number, index: number, salt: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

export function towerBlockSpec(seed: number, level: number): TowerBlockSpec {
  if (!Number.isInteger(level) || level < 1) throw new Error("Nível de bloco inválido.");
  return {
    level,
    width: Math.max(84, 188 - (level - 1) * 1.45),
    swingSpeed: Math.min(3.8, 1.38 + level * 0.045 + randomUnit(seed, level, 0x4c11) * 0.2),
    swingAmplitude: Math.min(310, 220 + level * 1.8),
    direction: level % 2 === 1 ? 1 : -1,
    colorIndex: Math.floor(randomUnit(seed, level, 0x7a31) * 5),
  };
}

export function towerTangentialTransfer(level: number) {
  if (!Number.isInteger(level) || level < 1) throw new Error("Nível de bloco inválido.");
  return Math.min(0.16, 0.045 + level * 0.002);
}

export function towerRejectionBounce(
  offset: number,
  currentVelocityX: number,
  impactCount: number,
): TowerRejectionBounce {
  if (!Number.isFinite(offset) || !Number.isFinite(currentVelocityX))
    throw new Error("Impacto de bloco inválido.");
  if (!Number.isInteger(impactCount) || impactCount < 1)
    throw new Error("Quantidade de impactos inválida.");
  const direction = offset === 0 ? (currentVelocityX >= 0 ? 1 : -1) : offset > 0 ? 1 : -1;
  const outwardSpeed = Math.min(320, 165 + impactCount * 36);
  return {
    velocityX: direction * Math.max(outwardSpeed, Math.abs(currentVelocityX) * 0.7),
    velocityY: Math.min(320, 190 + impactCount * 24),
    angularVelocity: direction * Math.min(4.2, 1.8 + impactCount * 0.38),
  };
}

export function towerStackScore(blocksPlaced: number) {
  if (!Number.isInteger(blocksPlaced) || blocksPlaced < 0 || blocksPlaced > TOWER_STACK_MAX_BLOCKS)
    throw new Error("Quantidade de blocos inválida.");
  return (25 * blocksPlaced * (blocksPlaced + 1)) / 2;
}

export function towerStackHeight(blocksPlaced: number) {
  if (!Number.isInteger(blocksPlaced) || blocksPlaced < 0 || blocksPlaced > TOWER_STACK_MAX_BLOCKS)
    throw new Error("Quantidade de blocos inválida.");
  return blocksPlaced * TOWER_STACK_BLOCK_HEIGHT;
}

export function towerOverlap(left: TowerBlock, right: TowerBlock) {
  const leftEdge = Math.max(left.x - left.width / 2, right.x - right.width / 2);
  const rightEdge = Math.min(left.x + left.width / 2, right.x + right.width / 2);
  return Math.max(0, rightEdge - leftEdge);
}

export function calculateTowerStability(blocks: readonly TowerBlock[]): TowerStability {
  if (blocks.length < 2) return { stable: true, lean: 0, criticalSupport: null };
  let maxLean = 0;
  let criticalSupport: number | null = null;

  for (let supportIndex = blocks.length - 2; supportIndex >= 0; supportIndex -= 1) {
    const support = blocks[supportIndex];
    const upperBlocks = blocks.slice(supportIndex + 1);
    const totalMass = upperBlocks.reduce((sum, block) => sum + block.width, 0);
    const centerOfMass =
      upperBlocks.reduce((sum, block) => sum + block.x * block.width, 0) / totalMass;
    const halfSupport = support.width / 2;
    const lean = Math.abs(centerOfMass - support.x) / halfSupport;
    if (lean > maxLean) {
      maxLean = lean;
      criticalSupport = supportIndex;
    }
    if (lean >= 0.94 || towerOverlap(support, blocks[supportIndex + 1]) < 10) {
      return { stable: false, lean, criticalSupport: supportIndex };
    }
  }

  return { stable: true, lean: maxLean, criticalSupport };
}
