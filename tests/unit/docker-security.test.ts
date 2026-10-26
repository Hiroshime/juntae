import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");

describe("segurança da imagem Docker", () => {
  it("usa uma versão explícita de Node e Alpine em todos os estágios", () => {
    expect(dockerfile).toContain("ARG NODE_IMAGE=node:22.23.3-alpine3.23");
    expect(dockerfile.match(/^FROM \$\{NODE_IMAGE\}/gm)).toHaveLength(3);
    expect(dockerfile).not.toMatch(/^FROM node:22-alpine/gm);
  });

  it("exige a versão corrigida do zlib em todos os estágios", () => {
    expect(dockerfile.match(/'zlib>=1\.3\.2-r1'/g)).toHaveLength(3);
    expect(dockerfile).not.toContain("zlib=1.3.2-r0");
  });

  it("atualiza o Alpine e exige a versão corrigida do musl em todos os estágios", () => {
    expect(dockerfile.match(/apk upgrade --no-cache/g)).toHaveLength(3);
    expect(dockerfile.match(/'musl>=1\.2\.5-r24'/g)).toHaveLength(3);
    expect(dockerfile).not.toContain("musl=1.2.5-r23");
  });
});
