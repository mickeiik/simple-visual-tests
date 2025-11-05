import type { BrowserCommand, BrowserCommandContext } from "vitest/node";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
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
  }
}

/**
 * Captures a visual snapshot of a specific element within a nested frame structure
 *
 * This implementation addresses the complexity of Storybook's iframe-based rendering
 * where visual tests need to capture content within nested iframes. The approach:
 * 1. Waits for network idle to ensure all assets are loaded
 * 2. Uses frameLocator to navigate to the correct iframe
 * 3. Locates the target element within that frame
 * 4. Calculates the element's bounding box in the parent page coordinates
 * 5. Takes a clipped screenshot using full-page mode to maintain context
 *
 * The fullPage: true with clip approach is used instead of element-only screenshots
 * to ensure consistent rendering context and avoid issues with absolute positioning
 * that can occur with direct element screenshots.
 *
 * @param ctx - Vitest browser command context providing access to the page and frame
 * @param frameLocator - Selector for the frame containing the target element
 * @param locator - Selector for the target element within the frame
 * @returns Promise resolving to a Buffer containing the PNG screenshot
 */
export const takeSnapshot: BrowserCommand<[string, string]> = async (
  ctx: BrowserCommandContext,
  frameLocator: string,
  locator: string
): Promise<Buffer> => {
  // Wait for all network requests to complete before taking screenshot
  // This ensures all assets (images, fonts, async content) are loaded
  // for consistent and reliable visual comparisons
  await ctx.page.waitForLoadState("networkidle");

  // Get the current frame context to access nested iframes
  const frame = await ctx.frame();

  // Locate the target element within the specified frame and get its bounding box
  // The bounding box provides the exact coordinates and dimensions needed for clipping
  const box = await frame
    .frameLocator(frameLocator)
    .locator(locator)
    .boundingBox();

  // Validate that the element exists and has visible dimensions
  // This prevents errors when trying to screenshot non-existent or zero-sized elements
  if (!box) {
    throw new Error(
      `Element not found or has no visible bounding box: ${locator} in frame ${frameLocator}`
    );
  }

  // Take a full-page screenshot with clipping to capture the specific element
  // Using fullPage: true ensures all content is rendered properly, while the clip
  // option focuses on the target element's area for the visual comparison
  return await ctx.page.screenshot({
    animations: "disabled", // Disable animations to ensure consistent screenshots across runs
    fullPage: true, // Capture full page to maintain proper rendering context and avoid clipping issues
    clip: {
      // Use floor to ensure integer pixel values as Playwright expects whole numbers
      // This prevents sub-pixel rendering issues that could cause visual inconsistencies
      x: Math.floor(box.x),
      y: Math.floor(box.y),
      width: Math.floor(box.width),
      height: Math.floor(box.height),
    },
    scale: "css", // Use CSS scaling to maintain proper proportions and avoid device pixel ratio issues
  });
};
