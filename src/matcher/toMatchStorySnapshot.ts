import { getCurrentTest } from "vitest/suite";
import { commands } from "@vitest/browser/context";
import type {
  ComparisonResult,
  StoryIdentifier,
  VisualTestResult,
} from "../types";
import { expect } from "vitest";

/**
 * Extend Vitest's expect API with a custom matcher for visual regression testing
 */
declare module "vitest" {
  interface Assertion {
    /**
     * Custom matcher to compare a story's visual snapshot against a baseline
     * @param options Configuration options for the visual comparison
     */
    toMatchStorySnapshot: (
      options?: Partial<{
        threshold: number;
        maxDiffPercentage: number;
        frameLocator: string;
        locator: string;
      }>
    ) => Promise<{
      pass: boolean;
      message: () => string;
    }>;
  }
  interface TaskMeta {
    visualTestResult: VisualTestResult;
    storyIdentifier: StoryIdentifier;
  }
}

/**
 * Custom matcher that compares a visual snapshot of a story against a baseline image
 *
 * The matcher works in three modes:
 * 1. When VITE_UPDATE_VISUAL_SNAPSHOTS=true, creates new baseline images
 * 2. When no baseline exists, creates a new baseline and passes the test
 * 3. When baseline exists, compares current snapshot with baseline and reports differences
 *
 * @param storyIdentifier Unique identifier for the story being tested
 * @param options Configuration for the visual comparison
 * @returns Promise with pass/fail status and diagnostic message
 */
const toMatchStorySnapshot: (
  storyIdentifier: StoryIdentifier,
  options: {
    threshold?: number;
    maxDiffPercentage?: number;
    frameLocator?: string;
    locator?: string;
  }
) => Promise<{ pass: boolean; message: () => string }> = async (
  storyIdentifier,
  {
    threshold = 0.1, // Default pixel intensity difference threshold (0.1 = 10% difference allowed per pixel)
    maxDiffPercentage = 1, // Default maximum percentage of pixels that can differ (1% = 1% of total pixels)
    frameLocator = "#visualTestFrame", // Default frame locator for Storybook iframe
    locator = "html", // Default element selector (entire HTML document)
  }
) => {
  // Get the current test context to store visual test results
  const currentTest = getCurrentTest();

  if (currentTest === null || !currentTest) {
    throw Error("Trying toMatchStorySnapshot outside of test context");
  }

  // Initialize visual test result metadata with default values
  const testResultMetadata: VisualTestResult = {
    storyIdentifier,
    status: "passed",
    baseline: null,
    current: null,
    diff: null,
    diffRatio: null,
    message: `VisualTestResultMetadata initialized for '${JSON.stringify(
      storyIdentifier
    )}'`,
  };

  // Capture the current visual snapshot of the story
  const current = await commands.takeSnapshot(frameLocator, locator);

  // If we're in update mode (VITE_UPDATE_VISUAL_SNAPSHOTS=true), create a new baseline and return success
  // This mode is used when intentionally updating baseline images rather than running regression tests
  if (import.meta.env.VITE_UPDATE_VISUAL_SNAPSHOTS === "true") {
    testResultMetadata.status = "new";
    testResultMetadata.baseline = current;
    testResultMetadata.message = `Created new baseline image for '${JSON.stringify(
      storyIdentifier
    )}'`;
    currentTest.meta.visualTestResult = testResultMetadata;

    return {
      pass: true,
      message: () => testResultMetadata.message,
    };
  }

  // Try to retrieve the existing baseline image for this story
  const baseline = await commands.getBaseline(storyIdentifier);

  // If no baseline exists, create one and return success
  if (baseline === null) {
    testResultMetadata.status = "new";
    testResultMetadata.baseline = current;
    testResultMetadata.message = `Created new baseline image for '${JSON.stringify(
      storyIdentifier
    )}'`;
    currentTest.meta.visualTestResult = testResultMetadata;

    return {
      pass: true,
      message: () => testResultMetadata.message,
    };
  }

  // Store the current snapshot in the test result metadata
  testResultMetadata.current = current;

  // Compare the current snapshot with the baseline using the specified thresholds
  const comparisonResult: ComparisonResult = await commands.compareSnapshots(
    baseline,
    current,
    { threshold, maxDiffPercentage }
  );

  // Update the test result metadata with comparison results
  testResultMetadata.diff = comparisonResult.diff;
  testResultMetadata.diffRatio = comparisonResult.diffRatio;
  testResultMetadata.message = comparisonResult.message;

  // Update status to failed if the comparison didn't match
  if (!comparisonResult.matches) {
    testResultMetadata.status = "failed";
  }

  // Store the visual test result in the current test's metadata
  currentTest.meta.visualTestResult = testResultMetadata;

  // Return the comparison result with pass/fail status
  return {
    pass: comparisonResult.matches,
    message: () => testResultMetadata.message,
  };
};

// Extend Vitest's expect API with our custom visual snapshot matcher
expect.extend({ toMatchStorySnapshot });
