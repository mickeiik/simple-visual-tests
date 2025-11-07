import { defineConfig, defineProject } from "vitest/config";
import { simpleVisualTests } from "./src/vitestAddon";

export default defineConfig({
  envDir: "./",
  plugins: [
    simpleVisualTests({
      url: "redis://localhost:6379",
    }),
  ],
  test: {
    reporters: ["default"],
    projects: [
      defineProject({
        plugins: [
          simpleVisualTests({
            url: "redis://localhost:6379",
          }),
        ],
        test: {
          name: "simple-visual-tests",
          include: ["./visual.spec.ts"],
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
      }),
    ],
  },
});
