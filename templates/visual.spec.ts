import { commands, page } from "@vitest/browser/context";
import type { StoryIndexEntry } from "storybook/internal/types";
import { afterAll, beforeAll, describe, test } from "vitest";
import type { ViewportMap } from "storybook/viewport";
import {
  navigateStoryFrame,
  type StoryIdentifier,
  type Theme,
} from "simple-visual-tests/browser";

// Extend vitest TaskMeta to include story identifier
declare module "vitest" {
  interface TaskMeta {
    storyIdentifier: StoryIdentifier;
  }
}

/**
 * Visual regression test suite that iterates through all stories, themes, and viewports
 * Creates a comprehensive test matrix for visual testing across different configurations
 */
describe("basic", async () => {
  // Load stories and viewports
  let stories: StoryIndexEntry[] = await loadStories();
  let storybookViewports = await getStorybookViewports();
  let initialDOMRect: DOMRect;

  // Set default viewport if storybook viewports are not available
  // Use Storybook's configured viewports, or fall back to a default desktop viewport
  // This ensures tests run consistently even if Storybook viewport addon isn't configured
  let testedViewports: ViewportMap =
    storybookViewports === null
      ? {
          desktop: {
            name: "Desktop",
            styles: {
              width: "1440px",
              height: "900px",
            },
          },
        }
      : storybookViewports;
  const themes = ["light", "dark"] as Theme[];

  beforeAll(async () => {
    // Set full screen mode and capture initial viewport
    await commands.setPreviewFullScreen();
    initialDOMRect = document.documentElement.getBoundingClientRect();
  });

  afterAll(async () => {
    // Exit full screen mode and restore initial viewport
    await commands.exitPreviewFullScreen();
    await setViewport(initialDOMRect.width, initialDOMRect.height);
  });

  // Test each story with different themes and viewports
  for (const entry of stories) {
    const storyId = entry.id;

    for (const theme of themes) {
      for (const [, storybookViewport] of Object.entries(testedViewports)) {
        const viewportSize = {
          width: parsePxSizeToNumber(storybookViewport.styles.width),
          height: parsePxSizeToNumber(storybookViewport.styles.height),
        };

        test(`should match screenshot for ${storyId} in ${storybookViewport.name} with ${theme} theme`, async ({
          task,
          expect,
        }) => {
          // Create story identifier for snapshot comparison
          const storyIdentifier: StoryIdentifier = {
            storyId,
            theme: theme,
            viewport: viewportSize,
          };

          task.meta.storyIdentifier = storyIdentifier;

          // Navigate to story and set viewport
          await navigateStoryFrame(storyId, theme);
          await setViewport(viewportSize.width, viewportSize.height);

          // Take and compare screenshot
          await expect(storyIdentifier).toMatchStorySnapshot({});
        });
      }
    }
  }
});

// Convert px string to number
const parsePxSizeToNumber = (pxString: string) => {
  return Number.parseInt(pxString.replace("px", ""));
};

// Set both Playwright and Vitest viewports
const setViewport = async (width: number, height: number) => {
  await commands.setViewportSize({ width, height }); // Playwright page viewport - controls the browser window size
  await page.viewport(width, height); // Vitest iframe 'viewport' - controls the iframe container size for Storybook
};

// Load stories from storybook index
async function loadStories(): Promise<StoryIndexEntry[]> {
  const baseURL = import.meta.env.VITE_STORYBOOK_URL || "http://localhost:6006";

  const response = await fetch(`${baseURL}/index.json`);

  if (!response.ok) {
    throw new Error(`Failed to fetch stories: ${response.statusText}`);
  }
  const data: { v: number; entries: Record<string, StoryIndexEntry> } =
    await response.json();

  return Object.values(data.entries)
    .filter((entry: StoryIndexEntry) => entry.type === "story")
    .slice(0, 1); // Limit to first story for demo purposes - remove this in production to test all stories
}

// Get storybook viewports from iframe
const getStorybookViewports = async (
  storybookIframeId: string = "visualTestFrame"
) => {
  const storybookIframe = document.getElementById(
    storybookIframeId
  ) as HTMLIFrameElement | null;

  if (storybookIframe === null) {
    throw new Error(
      `Could not find storybook preview iframe of id '${storybookIframeId}'`
    );
  }

  const baseURL = import.meta.env.VITE_STORYBOOK_URL || "http://localhost:6006";
  const iframeUrl = `${baseURL}/iframe.html`;

  storybookIframe.src = iframeUrl;

  return await new Promise<ViewportMap | null>((res) => {
    window.addEventListener("message", (event) => {
      if (event.origin !== baseURL) return;

      const parsedData = JSON.parse(event.data);

      if (parsedData.type === "STORYBOOK_VIEWPORTS") {
        res(parsedData.viewports);
      }
    });

    setTimeout(() => res(null), 1000); // Return null if storybook did not send viewports after 1 second
  });
};
