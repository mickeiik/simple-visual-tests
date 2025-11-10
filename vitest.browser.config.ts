import { defineConfig } from "vitest/config";
import { simpleVisualTests } from "./src/vitestAddon";

export default defineConfig({
  envDir: "./",
  plugins: [
    simpleVisualTests({
      url: "redis://localhost:6379",
    }),
  ],
  test: {
    include: ["templates/visual.spec.ts"],
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
