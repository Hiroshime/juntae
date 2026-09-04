import { describe, expect, it } from "vitest";
import { changelog } from "@/content/changelog";
import { appInfo } from "@/lib/app-info";

describe("application information", () => {
  it("mantém a versão atual no topo do changelog", () => {
    expect(changelog[0]?.version).toBe(appInfo.version);
  });

  it("mantém versões únicas e datas válidas", () => {
    expect(new Set(changelog.map((release) => release.version)).size).toBe(changelog.length);
    for (const release of changelog) {
      expect(release.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.highlights.length).toBeGreaterThan(0);
    }
  });

  it("publica apenas links HTTPS para os repositórios", () => {
    expect(appInfo.repositories.github.url).toMatch(/^https:\/\//);
    expect(appInfo.repositories.dockerHub.url).toMatch(/^https:\/\//);
  });
});
