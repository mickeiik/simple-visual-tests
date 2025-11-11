import { defineConfig } from "vitest/config";
import { simpleVisualTests } from "simple-visual-tests/server";

export default defineConfig({
  plugins: [
    simpleVisualTests({ url: "redis://localhost:6379" }, { log: true }),
  ],
  test: {
    reporters: ["default"],
    include: ["tests/visual.spec.ts"],
    name: "simple-visual-tests",
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [
        {
          browser: "chromium",
          headless: true,
        },
      ],
    },
  },
});
