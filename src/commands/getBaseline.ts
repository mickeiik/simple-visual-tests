import type { BrowserCommand, BrowserCommandContext } from "vitest/node";
import type { StoryIdentifier } from "../types";
import { getBaseline as getBaselineAPI } from "../storage/VisualTestStorageAPI";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
    /**
     * Retrieves the baseline image for a given story identifier
     *
     * This command is used by browser tests to fetch previously established
     * baseline images for visual comparison. The baseline represents the
     * "expected" visual state of a component/story that tests should match against.
     *
     * @param storyIdentifier - The identifier containing storyId, theme, and viewport dimensions
     *                        that uniquely identifies which baseline image to retrieve
     * @returns A promise that resolves to the baseline image buffer or null if not found
     *          Returns null when no baseline has been established for this specific story configuration
     */
    getBaseline: (storyIdentifier: StoryIdentifier) => Promise<Buffer | null>;
  }
}

/**
 * Browser command implementation for retrieving baseline images
 *
 * This command serves as the bridge between browser-side tests and the storage API,
 * allowing tests to fetch baseline images that were previously established during
 * the "accept" phase of visual testing. The command uses the Vitest browser command
 * pattern to execute storage operations within the browser context while maintaining
 * the separation of concerns between browser and node environments.
 *
 * The command delegates to the storage API which handles the actual filesystem
 * operations and path resolution based on the story identifier. This ensures
 * consistent path generation and error handling across the application.
 */
export const getBaseline: BrowserCommand<[StoryIdentifier]> = async (
  //@ts-expect-error 'ctx' is declared but its value is never read - BrowserCommandContext is required for type compatibility but not used in this function
  ctx: BrowserCommandContext,
  storyIdentifier: StoryIdentifier
): Promise<Buffer | null> => {
  // Delegates to the storage API which handles filesystem operations
  // and path resolution based on the story identifier. The storage API
  // manages the complexity of generating consistent file paths and
  // handling potential filesystem errors or missing files gracefully.
  return await getBaselineAPI(storyIdentifier);
};
