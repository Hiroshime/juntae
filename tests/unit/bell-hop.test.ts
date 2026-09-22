import { describe, expect, it } from "vitest";
import {
  BELL_HOP_WIDTH,
  bellHopMotion,
  bellHopPlatform,
  bellHopPointsForNextBell,
  bellHopScore,
} from "@/lib/games/bell-hop";

describe("Salto dos Sinos", () => {
  it("gera o mesmo percurso para a mesma semente", () => {
    expect(bellHopPlatform(12345, 12)).toEqual(bellHopPlatform(12345, 12));
    expect(bellHopPlatform(12345, 12)).not.toEqual(bellHopPlatform(54321, 12));
  });

  it("mantém os sinos dentro da tela, mais altos e progressivamente menores", () => {
    const first = bellHopPlatform(77, 1);
    const middle = bellHopPlatform(77, 20);
    const high = bellHopPlatform(77, 80);
    const limit = bellHopPlatform(77, 150);
    expect(first.altitude).toBeLessThan(middle.altitude);
    expect(middle.altitude).toBeLessThan(high.altitude);
    expect(first.width).toBeGreaterThan(middle.width);
    expect(middle.width).toBeGreaterThan(high.width);
    expect(high.width).toBeGreaterThan(limit.width);
    expect(limit.width).toBe(36);
    for (const bell of [first, middle, high, limit]) {
      const motion = bellHopMotion(bell.level);
      expect(bell.x - bell.width / 2 - motion.amplitude).toBeGreaterThanOrEqual(26);
      expect(bell.x + bell.width / 2 + motion.amplitude).toBeLessThanOrEqual(BELL_HOP_WIDTH - 26);
    }
  });

  it("aumenta o balanço e a velocidade mesmo depois de os sinos ficarem pequenos", () => {
    expect(bellHopMotion(1).amplitude).toBeLessThan(bellHopMotion(80).amplitude);
    expect(bellHopMotion(1).speed).toBeLessThan(bellHopMotion(80).speed);
    expect(bellHopMotion(500)).toEqual({ amplitude: 38, speed: 1.55 });
    expect(() => bellHopMotion(0)).toThrow("Nível de sino inválido");
  });

  it("aumenta os pontos de cada novo sino e calcula o total no servidor", () => {
    expect(bellHopPointsForNextBell(0)).toBe(10);
    expect(bellHopPointsForNextBell(6)).toBe(70);
    expect(bellHopScore(0)).toBe(0);
    expect(bellHopScore(3)).toBe(60);
    expect(bellHopScore(7)).toBe(280);
    expect(() => bellHopScore(-1)).toThrow("Quantidade de sinos inválida");
  });
});
