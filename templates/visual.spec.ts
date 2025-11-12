import { commands } from "@vitest/browser/context";
import type { StoryIndexEntry } from "storybook/internal/types";
import { afterAll, beforeAll, describe, test } from "vitest";

import {
  navigateStoryFrame,
  getViewportConfig,
  loadStories,
  parsePxSizeToNumber,
  setViewport,
  type StoryIdentifier,
  type Theme,
} from "simple-visual-tests/browser";

import type { ViewportMap } from "storybook/internal/viewport";

/**
 * Visual regression test suite that iterates through all stories, themes, and viewports
 * Creates a comprehensive test matrix for visual testing across different configurations
 */
describe("basic", async () => {
  // Load stories and viewports from storybook instance at `localhost:6006` or `VITE_STORYBOOK_URL` ENV variable
  let stories: StoryIndexEntry[] = await loadStories();
  let testedViewports: ViewportMap = await getViewportConfig();
  let initialDOMRect: DOMRect; // Will capture initial viewport for restoration after tests

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

        test(`should match snapshot for ${storyId} on '${storybookViewport.name}' with '${theme}' theme`, async ({
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
