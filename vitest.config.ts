import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "./",
  test: {
    include: [
      "./src/tests/VisualTestStorageAPI.integration.spec.ts",
      "./src/tests/compareSnapshots.spec.ts",
    ],
  },
});
