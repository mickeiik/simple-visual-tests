/**
 * Vite plugin that configures visual regression testing capabilities for the application.
 * This plugin integrates visual testing commands and reporters into the Vite test environment.
 *
 * @fileoverview
 * This file exports a Vite plugin factory that sets up visual testing infrastructure
 * using Redis for storage and a custom VisualTestReporter for test results.
 */

import {
  setViewportSize,
  setPreviewFullScreen,
  exitPreviewFullScreen,
  takeSnapshot,
  compareSnapshots,
  getBaseline,
} from "./commands";
import type { RedisClientOptions } from "redis";
import type { PluginOption } from "vite";
import VisualTestReporter, {
  type VisualTestReporterOptions,
} from "./reporter/VisualTestReporter";

/**
 * Creates a Vite plugin configuration for visual regression testing.
 *
 * This plugin registers custom commands for visual testing (snapshot capture, comparison, etc.)
 * and configures the VisualTestReporter to handle test results with Redis-based storage.
 *
 * @param redisClientOptions - Configuration options for connecting to Redis, used for storing and retrieving visual test data
 * @param visualTestReporterOptions - Optional configuration for the visual test reporter, such as output formatting or storage settings
 * @returns An array containing the Vite plugin configuration with visual testing capabilities
 *
 * @example
 * ```ts
 * // In your vite.config.ts
 * import { defineConfig } from 'vite';
 * import { simpleVisualTests } from './src/vitestAddon';
 *
 * export default defineConfig({
 *   plugins: [
 *     ...simpleVisualTests(
 *       { url: 'redis://localhost:6379' },
 *       { outputDir: './visual-test-results' }
 *     )
 *   ]
 * });
 * ```
 */
export const simpleVisualTests = (
  redisClientOptions: RedisClientOptions,
  visualTestReporterOptions?: VisualTestReporterOptions
): PluginOption[] => [
  {
    name: "simple-visual-tests",
    /**
     * Configures the Vite test environment with visual testing capabilities.
     *
     * This config function adds the VisualTestReporter to handle test results,
     * registers the setup file for custom matchers, and exposes visual testing
     * commands to the browser test environment.
     *
     * @param config - The existing Vite configuration object
     * @param param1 - Vite environment context containing command information
     * @param param1.command - The current Vite command (build, serve, etc.)
     */
    config: (config, { command }) => {
      return {
        test: {
          reporters: [
            // Initialize the visual test reporter with Redis connection and optional settings
            new VisualTestReporter(
              redisClientOptions,
              visualTestReporterOptions
            ),
          ],
          // Register the custom matcher for snapshot comparison
          setupFiles: ["./src/matcher/toMatchStorySnapshot.ts"],
          browser: {
            // Path to the HTML file used for browser testing environment
            testerHtmlPath: "./index.html",
            // Expose visual testing commands to the browser environment
            commands: {
              takeSnapshot,
              getBaseline,
              compareSnapshots,
              setViewportSize,
              setPreviewFullScreen,
              exitPreviewFullScreen,
            },
          },
        },
      };
    },
  },
];
