/**
 * Browser-specific entry point for simple-visual-tests
 *
 * This module exports only browser-compatible functionality, avoiding
 * Node.js dependencies like Redis that cause issues in browser environments.
 *
 * Import from "simple-visual-tests/browser" when using in browser contexts.
 */

import { navigateStoryFrame } from "./src/matcher/navigateStoryFrame.js";
import type { StoryIdentifier, Theme } from "./src/types/index.js";

export { navigateStoryFrame, type StoryIdentifier, type Theme };
