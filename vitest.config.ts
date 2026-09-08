import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    // Integration files share one PostgreSQL instance. Serial execution avoids
    // false deadlocks between independent tests running serializable transactions.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
