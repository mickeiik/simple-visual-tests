import type { BrowserCommand, BrowserCommandContext } from "vitest/node";

/**
 * Subscribes to browser console messages and forwards them to the Node.js console
 * This is useful for debugging browser-side code during visual tests by capturing
 * console.log, console.error, console.warn, etc. messages from the browser context
 *
 * @param ctx - The browser command context containing the Playwright page instance
 * @returns A promise that resolves when subscription is established
 *
 * @example
 * // In a test setup file
 * await commands.subscribeToBrowserConsole()
 * // Now browser console messages will appear in the test output
 */
export const subscribeToBrowserConsole: BrowserCommand<[]> = async (
  ctx: BrowserCommandContext
): Promise<void> => {
  // Listen for console events from the browser page
  // This captures all console messages (log, error, warn, info, etc.) from the browser context
  ctx.page.on("console", async (msg) => {
    try {
      const values = [];
      // Extract values from console message arguments
      // Each argument needs to be converted from browser context to Node.js context via jsonValue()
      for (const arg of msg.args()) {
        values.push(await arg.jsonValue());
      }
      // Output the captured values to Node.js console with the appropriate log level
      switch (msg.type()) {
        case "error":
          console.error(...values);
          break;
        case "warning":
          console.warn(...values);
          break;
        case "info":
          console.info(...values);
          break;
        case "debug":
          console.debug(...values);
          break;
        default:
          console.log(...values);
      }
    } catch (error) {
      // Handle potential errors during argument conversion
      // This prevents the subscription from breaking if an argument can't be converted
      console.error("Error processing browser console message:", error);
    }
  });
  // Confirm subscription by logging a message in the browser context
  await ctx.page.evaluate(() =>
    console.log("Subscribed to browser console messages")
  );
};
