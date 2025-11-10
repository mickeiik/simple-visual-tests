import type { BrowserCommand, BrowserCommandContext } from "vitest/node";
import type { Viewport } from "../types";

/**
 * Sets the viewport size of the current browser page for visual testing
 *
 * This command provides a clean abstraction over Playwright's setViewportSize
 * method, ensuring consistent viewport management across all visual tests.
 * The viewport size directly affects how elements are rendered and can impact
 * visual comparison results, making this command crucial for reliable tests.
 *
 * Note: Setting the viewport size may trigger page re-layout and re-rendering,
 * which could affect the timing of subsequent operations. Consider adding
 * appropriate waits if layout-dependent elements need time to settle.
 *
 * @param ctx - Vitest browser command context providing access to the page instance
 * @param viewport - Object containing width and height dimensions in pixels
 * @returns Promise that resolves when the viewport size has been successfully set
 *
 * @example
 * // Usage within a test
 * await commands.setViewportSize({ width: 1200, height: 800 });
 */
export const setViewportSize: BrowserCommand<[Viewport]> = async (
  ctx: BrowserCommandContext,
  viewport: Viewport
): Promise<void> => {
  // Validate viewport dimensions to prevent invalid values that could cause browser errors
  // Width and height must be positive numbers to ensure valid viewport configuration
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error(
      `Invalid viewport dimensions: width=${viewport.width}, height=${viewport.height}. Dimensions must be positive numbers.`
    );
  }

  // Set the viewport size on the current page context
  await ctx.page.setViewportSize(viewport);
};
