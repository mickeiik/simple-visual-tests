import type {
  StoryIndexEntry,
  IndexEntry,
  StoryIndex,
} from "storybook/internal/types";

/**
 * Fetches and filters Storybook stories from the `/index.json` endpoint.
 *
 * This function retrieves the Storybook index, filters for story entries,
 * and optionally filters by specific story IDs provided via environment variables `VITE_STORY_IDS` as colon separated list.
 *
 * @returns Promise resolving to an array of `StoryIndexEntry` objects representing stories
 * @throws Error if the stories endpoint is unreachable or all requested story IDs are invalid
 *
 * @example
 * VITE_STORY_IDS=storyId1;storyId2;storyId3
 */
const loadStories = async (): Promise<StoryIndexEntry[]> => {
  // Use custom Storybook URL from environment or default to localhost:6006
  const baseURL = import.meta.env.VITE_STORYBOOK_URL ?? "http://localhost:6006";
  const response = await fetch(`${baseURL}/index.json`);

  if (!response.ok) {
    throw new Error(`Failed to fetch stories: ${response.statusText}`);
  }

  const data: StoryIndex = await response.json();
  // Extract only story entries from the index, excluding documentation pages
  const stories = Object.values(data.entries).filter(
    (entry: IndexEntry) => entry.type === "story"
  );

  const requestedStoryIds = getRequestedStoryIds();
  if (!requestedStoryIds) {
    return stories;
  }

  // Filter stories to only include those with IDs specified in environment variable
  const filteredStories = stories.filter((story: StoryIndexEntry) =>
    requestedStoryIds.has(story.id)
  );
  validateStoryIds(requestedStoryIds, filteredStories);

  return filteredStories;
};

/**
 * Extracts and processes story IDs from the VITE_STORY_IDS environment variable.
 *
 * This function parses a colon-separated string of story IDs from the environment variable,
 * trims whitespace from each ID, and filters out empty entries. Returns null if the
 * environment variable is not set or is empty after processing.
 *
 * @returns Set of story IDs to filter by, or null if no valid IDs are found
 */
const getRequestedStoryIds = (): Set<string> | null => {
  const envVar = import.meta.env.VITE_STORY_IDS;
  if (!envVar) {
    return null;
  }

  // Split colon-separated IDs, trim whitespace, and remove empty entries
  const requestedStoryIds = envVar
    .split(";")
    .map((id: string) => id.trim())
    .filter((id: string) => id !== "");

  // Return null if no valid IDs remain after filtering
  return requestedStoryIds.length > 0 ? new Set(requestedStoryIds) : null;
};

/**
 * Validates that requested story IDs exist in the fetched stories and provides feedback on missing IDs.
 *
 * This function checks which of the requested story IDs are not present in the fetched stories array.
 * If all requested IDs are missing, it throws an error to prevent running tests with no valid stories.
 * If some IDs are missing, it logs a warning to inform the user while still proceeding with available stories.
 *
 * @param requestedStoryIds - Set of story IDs requested via environment variable
 * @param stories - Array of stories fetched from the Storybook index
 * @throws Error if all requested story IDs are not found in the fetched stories
 */
const validateStoryIds = (
  requestedStoryIds: Set<string>,
  stories: StoryIndexEntry[]
): void => {
  // Create a set of found story IDs
  const foundStoryIds = new Set(
    stories.map((story: StoryIndexEntry) => story.id)
  );
  // Determine which requested IDs are missing from the fetched stories
  const missingStoryIds = [...requestedStoryIds].filter(
    (id: string) => !foundStoryIds.has(id)
  );

  // Fail fast if all requested stories are missing
  if (
    missingStoryIds.length === requestedStoryIds.size &&
    requestedStoryIds.size > 0
  ) {
    throw new Error(
      `All requested story IDs not found: ${missingStoryIds.join(
        ", "
      )} (requested: ${requestedStoryIds.size}, found: ${stories.length})`
    );
  }

  // Warn about missing stories
  if (missingStoryIds.length > 0) {
    console.warn(
      `Some requested story IDs not found: ${missingStoryIds.join(
        ", "
      )} (requested: ${requestedStoryIds.size}, found: ${stories.length})`
    );
  }
};

export { loadStories };
