import type { BrowserCommand, BrowserCommandContext } from "vitest/node";
import type { StoryIdentifier } from "../types/index.js";
import { VisualTestStorageAPI } from "../storage/VisualTestStorageAPI";

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
  const storageApi = VisualTestStorageAPI.getFileStorageOnlyApi();

  // Delegates to the storage API which handles filesystem operations
  // and path resolution based on the story identifier. The storage API
  // manages the complexity of generating consistent file paths and
  // handling potential filesystem errors or missing files gracefully.
  return await storageApi.getBaseline(storyIdentifier);
};
