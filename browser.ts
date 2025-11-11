/**
 * Type augmentations for browser commands, matcher, TaskMeta and Env variables.
 */
import type { BrowserCommands } from "@vitest/browser/context";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
    /**
     * Compares two PNG image buffers pixel by pixel to detect visual differences
     *
     * This function performs a pixel-level comparison between two images, calculating
     * the percentage of different pixels and generating a visual diff image. The
     * comparison accounts for minor variations using a threshold value to determine
     * what constitutes a significant difference.
     *
     * @param lSnapshot - The baseline/left image snapshot as a Buffer
     * @param rSnapshot - The actual/right image snapshot as a Buffer
     * @param options - Configuration for the comparison
     * @param options.threshold - Pixel intensity difference threshold (0-1), values below this are considered equal
     * @param options.maxDiffPercentage - Maximum allowed difference percentage before images are considered different
     * @returns Promise resolving to a ComparisonResult with matches status, message, diff image and ratio
     *
     * @throws {Error} If images cannot be parsed as valid PNGs
     * @throws {Error} If pixelmatch encounters an unexpected error during comparison
     */
    compareSnapshots: (
      lSnapshot: Buffer,
      rSnapshot: Buffer,
      options: { threshold: number; maxDiffPercentage: number }
    ) => Promise<ComparisonResult>;

    /**
     * Retrieves the baseline image for a given story identifier
     *
     * This command is used by browser tests to fetch previously established
     * baseline images for visual comparison. The baseline represents the
     * "expected" visual state of a component/story that tests should match against.
     *
     * @param storyIdentifier - The identifier containing storyId, theme, and viewport dimensions that uniquely identifies which baseline image to retrieve
     * @returns A promise that resolves to the baseline image buffer or null if not found. Returns null when no baseline has been established for this specific story configuration
     */
    getBaseline: (storyIdentifier: StoryIdentifier) => Promise<Buffer | null>;

    /**
     * Requests fullscreen mode for the tester UI element
     *
     * Waits for network idle state to ensure all assets are loaded before entering fullscreen,
     * then attempts to make the "tester-ui" element fullscreen. The element must exist in the DOM
     * and the browser must support the Fullscreen API for this to work.
     *
     * @returns Promise resolving when fullscreen request is processed
     * @throws May throw if the page context is invalid or browser doesn't support fullscreen
     */
    setPreviewFullScreen: () => Promise<void>;

    /**
     * Exits fullscreen mode if currently in fullscreen
     *
     * This command calls the browser's exitFullscreen API to return from fullscreen mode.
     * Note that this will only work if the current document is in fullscreen mode and
     * the user initiated the fullscreen state (browsers have security restrictions around this).
     *
     * @returns Promise resolving when exit fullscreen request is processed
     * @throws May throw if fullscreen exit is blocked by browser security policies
     */
    exitPreviewFullScreen: () => Promise<void>;

    /**
     * Sets the viewport size of the current browser page
     *
     * This command is essential for visual regression testing as it allows
     * controlling the browser dimensions to ensure consistent screenshot
     * comparisons across different screen sizes and device types.
     *
     * @param viewport - Object containing width and height dimensions in pixels
     * @returns Promise that resolves when viewport size is set
     *
     * @example
     * // Set viewport to mobile size
     * await commands.setViewportSize({ width: 375, height: 667 });
     *
     * @example
     * // Set viewport to desktop size
     * await commands.setViewportSize({ width: 1920, height: 1080 });
     *
     * @throws {Error} If the browser page is not available or viewport dimensions are invalid
     */
    setViewportSize: (viewport: Viewport) => Promise<void>;

    /**
     * Takes a snapshot of a specific element within a frame in the Vitest browser UI iframe
     *
     * This command is designed for visual regression testing where we need to capture
     * a specific element within Storybook's iframe structure. The approach uses
     * bounding box clipping to focus on the target element while maintaining
     * full-page context for proper rendering.
     *
     * @param frameLocator - CSS selector for the frame containing the target element (e.g., "#visualTestFrame")
     * @param locator - CSS selector for the specific element to capture (e.g., "html" for entire document)
     * @returns A Buffer containing the screenshot of the element
     *
     * @throws {Error} If the element is not found or has no visible bounding box
     * @throws {TimeoutError} If page load state doesn't reach "networkidle" within timeout
     *
     * @example
     * // Capture the entire story content within Storybook iframe
     * const snapshot = await commands.takeSnapshot("#visualTestFrame", "html");
     *
     * @example
     * // Capture a specific component within the story
     * const snapshot = await commands.takeSnapshot("#visualTestFrame", ".my-component");
     */
    takeSnapshot: (frameLocator: string, locator: string) => Promise<Buffer>;

    subscribeToBrowserConsole: () => Promise<void>;
    startTrace: () => Promise<void>;
    endTrace: (savePath?: string) => Promise<void>;
  }
}

import type { Assertion } from "vitest";
declare module "vitest" {
  interface Assertion {
    /**
     * Custom matcher that compares a visual snapshot of a story against a baseline image
     *
     * The matcher works in three modes:
     * 1. When VITE_UPDATE_VISUAL_SNAPSHOTS=true, creates new baseline images
     * 2. When no baseline exists, creates a new baseline and passes the test
     * 3. When baseline exists, compares current snapshot with baseline and reports differences
     *
     * @param options Configuration for the visual comparison
     * @param options.threshold Pixel intensity difference threshold (Default 0.1 = 10% difference allowed per pixel)
     * @param options.maxDiffPercentage Maximum percentage of pixels that can differ (Default 1 = 1% of total pixels)
     * @param options.frameLocator Frame locator for Storybook preview iframe (Default `#visualTestFrame` injected via `testerHtmlPath` vitest browser config)
     * @param options.locator Element selector to screenshot inside `frameLocator` (Default entire HTML document `html`)
     * @returns Promise with pass/fail status and diagnostic message
     */
    toMatchStorySnapshot: (
      options?: Partial<{
        threshold?: number;
        maxDiffPercentage?: number;
        frameLocator?: string;
        locator?: string;
      }>
    ) => Promise<{
      pass: boolean;
      message: () => string;
    }>;
  }
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
 * Browser-specific entry point for simple-visual-tests
 *
 * Import from "simple-visual-tests/browser" when using in browser contexts.
 */
import type {
  ComparisonResult,
  StoryIdentifier,
  Theme,
  Viewport,
  VisualTestResult,
} from "./src/types/index.js";

import { navigateStoryFrame } from "./src/matcher/navigateStoryFrame.js";

export {
  navigateStoryFrame,
  type StoryIdentifier,
  type Theme,

  /**
   * Force preserve `import type { BrowserCommands } from "@vitest/browser/context";` and `import type { Assertion } from "vitest";`
   * in build output for module augmentation to work
   */
  type BrowserCommands,
  type Assertion,
};
