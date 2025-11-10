import type { StoryIndexEntry } from "storybook/internal/types";

// Load stories from storybook index
async function loadStories(): Promise<StoryIndexEntry[]> {
  const baseURL = import.meta.env.VITE_STORYBOOK_URL || "http://localhost:6006";

  const response = await fetch(`${baseURL}/index.json`);

  if (!response.ok) {
    throw new Error(`Failed to fetch stories: ${response.statusText}`);
  }
  const data: { v: number; entries: Record<string, StoryIndexEntry> } =
    await response.json();

  return Object.values(data.entries).filter(
    (entry: StoryIndexEntry) => entry.type === "story"
  );
}

export { loadStories };
