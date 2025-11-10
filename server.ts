/**
 * Typescript module augmentations for vitest TaskMeta and Env variables.
 */

import type { StoryIdentifier, VisualTestResult } from "./src/types/index.js";

import type { TaskMeta } from "vitest";
declare module "vitest" {
  interface TaskMeta {
    visualTestResult: VisualTestResult;
    storyIdentifier: StoryIdentifier;
  }
}
interface ImportMetaEnv {
  readonly VITE_UPDATE_VISUAL_SNAPSHOTS: string;
  readonly VITE_STORYBOOK_URL: string;
  readonly VITE_VISUAL_TEST_IMAGES_PATH: string;
}

//@ts-expect-error 'ImportMeta' is declared but never used.ts - Module augmentation
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Server-specific entry point for simple-visual-tests
 *
 * This module exports only server-compatible functionality, including
 * Redis-based storage API and other Node.js specific features.
 *
 * Import from "simple-visual-tests/server" when using in server contexts.
 */

import * as StorageAPI from "./src/storage/VisualTestStorageAPI.js";
import { VisualTestReporter } from "./src/reporter/VisualTestReporter.js";
import { simpleVisualTests } from "./src/vitestAddon.js";

export {
  StorageAPI,
  VisualTestReporter,
  simpleVisualTests,
  /**
   * Force preserve `import type { TaskMeta } from "vitest";` in build output for module augmentation to work
   */
  type TaskMeta,
};
