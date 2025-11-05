import type { BrowserCommand, BrowserCommandContext } from "vitest/node";

/**
 * Extends the Vitest browser context with custom fullscreen commands
 * These commands allow controlling the fullscreen state of the preview UI during visual tests
 */
declare module "@vitest/browser/context" {
  interface BrowserCommands {
    /** Requests fullscreen mode for the preview UI element */
    setPreviewFullScreen: () => Promise<void>;
    /** Exits fullscreen mode if currently in fullscreen */
    exitPreviewFullScreen: () => Promise<void>;
  }
}

/**
 * Requests fullscreen mode for the tester UI element
 *
 * Waits for network idle state to ensure all assets are loaded before entering fullscreen,
 * then attempts to make the "tester-ui" element fullscreen. The element must exist in the DOM
 * and the browser must support the Fullscreen API for this to work.
 *
 * @param ctx - The browser command context containing the page instance
 * @returns Promise resolving when fullscreen request is processed (may not be granted)
 * @throws May throw if the page context is invalid or browser doesn't support fullscreen
 */
export const setPreviewFullScreen: BrowserCommand<[]> = async (
  ctx: BrowserCommandContext
): Promise<void> => {
  // Wait for network idle to ensure all assets are loaded before entering fullscreen
  // This prevents visual glitches during fullscreen transition when resources are still loading
  await ctx.page.waitForLoadState("networkidle");

  await ctx.page.evaluate(() => {
    const element = document.getElementById("tester-ui");
    if (!element) {
      // Element not found - this could indicate the UI hasn't rendered yet or has a different ID
      // In visual testing, this represents a failure state that should be caught by tests
      console.warn("tester-ui element not found for fullscreen request");
      return;
    }

    // Attempt to enter fullscreen mode - this may fail if the browser blocks it or
    // if the element is not visible/cannot be made fullscreen
    // The optional chaining handles cases where requestFullscreen doesn't exist in older browsers
    element.requestFullscreen?.().catch((error) => {
      // Fullscreen requests can be denied by browser security policies if not triggered by user interaction
      // This is expected behavior in automated testing environments
      console.warn("Fullscreen request denied:", error);
    });
  });
};

/**
 * Exits fullscreen mode if currently in fullscreen
 *
 * This command calls the browser's exitFullscreen API to return from fullscreen mode.
 * Note that this will only work if the current document is in fullscreen mode and
 * the user initiated the fullscreen state (browsers have security restrictions around this).
 *
 * @param ctx - The browser command context containing the page instance
 * @returns Promise resolving when exit fullscreen request is processed
 * @throws May throw if fullscreen exit is blocked by browser security policies
 */
export const exitPreviewFullScreen: BrowserCommand<[]> = async (
  ctx: BrowserCommandContext
): Promise<void> => {
  await ctx.page.evaluate(() => {
    // Check if document is currently in fullscreen before attempting to exit
    // This prevents errors when trying to exit fullscreen when not in fullscreen mode
    if (document.fullscreenElement) {
      // Use optional chaining in case exitFullscreen is not supported in the current browser
      document.exitFullscreen?.().catch((error) => {
        console.warn("Exit fullscreen failed:", error);
      });
    }
  });
};
