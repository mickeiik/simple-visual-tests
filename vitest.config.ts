import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "./",
  test: {
    include: [
      "./src/storage/RedisPubSub.integration.spec.ts",
      "./src/storage/VisualTestStorageAPI.integration.spec.ts",
      "./src/commands/compareSnapshots.spec.ts",
      "./templates/helpers/loadStories.spec.ts",
      "./templates/helpers/getViewportConfig.spec.ts",
    ],
  },
});
