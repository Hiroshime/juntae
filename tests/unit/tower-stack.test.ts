import { describe, expect, it } from "vitest";
import {
  TOWER_STACK_BLOCK_HEIGHT,
  TOWER_STACK_CRANE_CLEARANCE,
  TOWER_STACK_ROPE_LENGTH,
  calculateTowerStability,
  towerBlockSpec,
  towerOverlap,
  towerRejectionBounce,
  towerStackHeight,
  towerStackScore,
  towerTangentialTransfer,
} from "@/lib/games/tower-stack";

describe("Torre em Equilíbrio", () => {
  it("gera pêndulos reproduzíveis e progressivamente mais difíceis", () => {
    expect(towerBlockSpec(1234, 12)).toEqual(towerBlockSpec(1234, 12));
    expect(towerBlockSpec(1234, 12)).not.toEqual(towerBlockSpec(4321, 12));
    expect(towerBlockSpec(1234, 1).width).toBeGreaterThan(towerBlockSpec(1234, 80).width);
    expect(towerBlockSpec(1234, 1).swingSpeed).toBeLessThan(towerBlockSpec(1234, 80).swingSpeed);
    expect(towerBlockSpec(1234, 500).width).toBe(84);
    expect(towerBlockSpec(1234, 1).direction).toBe(1);
    expect(towerBlockSpec(1234, 2).direction).toBe(-1);
    expect(towerBlockSpec(1234, 3).direction).toBe(1);
  });

  it("afasta o pêndulo e aumenta progressivamente a inércia da queda", () => {
    const verticalClearance =
      TOWER_STACK_CRANE_CLEARANCE - TOWER_STACK_ROPE_LENGTH - TOWER_STACK_BLOCK_HEIGHT / 2;
    expect(verticalClearance).toBeGreaterThan(250);
    expect(towerTangentialTransfer(1)).toBeLessThan(towerTangentialTransfer(80));
    expect(towerTangentialTransfer(500)).toBe(0.16);
    expect(() => towerTangentialTransfer(0)).toThrow("Nível de bloco inválido");
  });

  it("aceita sobreposição parcial enquanto o centro de massa permanece apoiado", () => {
    const tower = [
      { x: 360, width: 244 },
      { x: 404, width: 188 },
      { x: 390, width: 180 },
    ];
    expect(towerOverlap(tower[0], tower[1])).toBeGreaterThan(100);
    expect(calculateTowerStability(tower)).toMatchObject({ stable: true });
    expect(calculateTowerStability(tower).lean).toBeGreaterThan(0);
  });

  it("derruba a torre quando o peso superior sai do apoio", () => {
    expect(
      calculateTowerStability([
        { x: 360, width: 200 },
        { x: 455, width: 180 },
      ]),
    ).toMatchObject({ stable: false, criticalSupport: 0 });
    expect(
      calculateTowerStability([
        { x: 360, width: 200 },
        { x: 550, width: 180 },
      ]),
    ).toMatchObject({ stable: false });
  });

  it("faz blocos rejeitados ricochetearem para fora da torre", () => {
    const rightImpact = towerRejectionBounce(72, -18, 1);
    const repeatedImpact = towerRejectionBounce(60, 40, 3);
    expect(rightImpact.velocityX).toBeGreaterThan(0);
    expect(rightImpact.velocityY).toBeGreaterThan(0);
    expect(rightImpact.angularVelocity).toBeGreaterThan(0);
    expect(repeatedImpact.velocityX).toBeGreaterThan(rightImpact.velocityX);

    const leftImpact = towerRejectionBounce(-45, 30, 1);
    expect(leftImpact.velocityX).toBeLessThan(0);
    expect(leftImpact.angularVelocity).toBeLessThan(0);
    expect(() => towerRejectionBounce(10, 10, 0)).toThrow("Quantidade de impactos inválida");
  });

  it("calcula altura e placar progressivo sem confiar no cliente", () => {
    expect(towerStackScore(0)).toBe(0);
    expect(towerStackScore(1)).toBe(25);
    expect(towerStackScore(3)).toBe(150);
    expect(towerStackHeight(3)).toBe(TOWER_STACK_BLOCK_HEIGHT * 3);
    expect(() => towerStackScore(-1)).toThrow("Quantidade de blocos inválida");
  });
});
