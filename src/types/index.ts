/**
 * @file Type definitions for visual testing system
 *
 * This module defines the core data structures used throughout the visual testing system.
 * These types provide type safety and documentation for test results, runs, comparisons,
 * and storage operations. The system is designed to handle visual regression testing
 * with support for different themes, viewports, and execution environments.
 */

/**
 * Theme type for light/dark mode
 *
 * Represents the two supported UI themes in the visual testing system.
 * Used to ensure consistent theme-based rendering across all story snapshots.
 */
export type Theme = "light" | "dark";

/**
 * Identifier for a specific story with theme and viewport
 *
 * Creates a unique reference to a specific story rendering configuration.
 * The combination of storyId, theme, and viewport dimensions ensures that
 * each visual test targets the exact same rendering conditions for consistency.
 *
 * @property {string} storyId - Unique identifier for the story component
 * @property {"light" | "dark"} theme - Theme context for rendering
 * @property {Viewport} viewport - Dimensions for the rendering viewport
 */
export type StoryIdentifier = {
  storyId: string;
  theme: "light" | "dark";
  viewport: {
    width: number;
    height: number;
  };
};

/**
 * Metadata for database entries with timestamps
 *
 * Standardized timing metadata for tracking test execution lifecycle.
 * Used across various entities to maintain consistent timing information.
 *
 * @property {number} startedAt - Unix timestamp when the operation started
 * @property {number} finishedAt - Unix timestamp when the operation completed
 */
export type DbEntryMetadata = {
  startedAt: number;
  finishedAt: number;
};

/**
 * New visual test in storage with running status
 *
 * Represents a newly created visual test that is currently executing.
 * The status is hardcoded to "running" to ensure proper state management
 * during test execution, preventing premature result processing.
 *
 * Uses Pick to maintain consistency with StoredVisualTestResult while
 * enforcing the running state constraint.
 */
export type NewStoredVisualTest = Pick<
  StoredVisualTestResult,
  "runId" | "storyIdentifier" | "startedAt" | "baseline" | "current" | "diff"
> & { status: "running" };

/**
 * Partial update for visual test results
 *
 * Allows selective updates to visual test results without requiring
 * the immutable fields (storyIdentifier, timestamps) to be provided.
 * This supports incremental result updates during test execution.
 *
 * @note Excludes storyIdentifier, startedAt, and finishedAt to maintain data integrity
 * @note storyIdentifier and timestamps are immutable once a test is created to ensure
 *       consistent tracking and prevent data corruption during distributed execution
 */
export type VisualTestUpdate = Partial<
  Omit<VisualTestResult, "storyIdentifier" | "startedAt" | "finishedAt">
>;

/**
 * Visual test result stored in database
 *
 * Database representation of visual test results where image buffers are stored
 * as binary files in the filesystem, with Redis storing the paths to these files.
 * This approach optimizes storage efficiency and performance by keeping large
 * binary data out of the database while maintaining referential integrity.
 *
 * @property {string} runId - Unique identifier for the test run
 * @property {string | null} baseline - File path to baseline image in filesystem
 * @property {string | null} current - File path to current test image in filesystem
 * @property {string | null} diff - File path to difference image in filesystem
 */
export type StoredVisualTestResult = Omit<
  VisualTestResult,
  "baseline" | "current" | "diff"
> & {
  runId: string;
  baseline: string | null;
  current: string | null;
  diff: string | null;
} & DbEntryMetadata;

/**
 * Result of a visual test comparison
 *
 * Contains the complete result of a single visual test comparison.
 * Includes both the raw image data and computed metrics for analysis.
 *
 * @property {Buffer | null} baseline - Original baseline image for comparison
 * @property {Buffer | null} current - Current test image to compare against baseline
 * @property {Buffer | null} diff - Generated difference image highlighting changes
 * @property {number | null} diffRatio - Quantitative measure of visual difference (0-1 scale)
 * @property {string} message - Human-readable description of test outcome
 */
export type VisualTestResult = {
  storyIdentifier: StoryIdentifier;
  status: "running" | "passed" | "failed" | "new";
  baseline: Buffer | null;
  current: Buffer | null;
  diff: Buffer | null;
  diffRatio: number | null;
  message: string;
};

/**
 * New visual test run data
 *
 * Represents the initial state of a visual test run before execution begins.
 * Contains essential metadata needed to track and identify the test run.
 *
 * @note Uses Pick to ensure consistency with VisualTestRun while only including
 * initialization-relevant fields
 * @note The duration and reason fields are not included since they're computed
 * after execution completes, ensuring proper lifecycle management
 */
export type NewVisualTestRun = Pick<
  VisualTestRun,
  "runId" | "startedAt" | "summary" | "environment"
>;

/**
 * Information about a visual test run
 *
 * Comprehensive tracking data for an entire visual test execution session.
 * Maintains aggregated statistics for reporting and monitoring purposes.
 *
 * @property {string} runId - Unique identifier for this test run session
 * @property {number} duration - Total execution time in milliseconds
 * @property {"passed" | "interrupted" | "failed"} reason - Final run outcome classification
 * @property {object} summary - Aggregated test results statistics
 * @property {object} environment - Execution environment metadata for reproducibility
 *
 * @note The summary provides quick access to test run health without querying individual results
 * @note The reason field indicates whether all tests completed successfully ("passed"), where interrupted ("interrupted") or had failures ("failed")
 */
export type VisualTestRun = {
  runId: string;
  duration: number;
  reason: "passed" | "interrupted" | "failed";
  summary: {
    total: number;
    finished: number;
    passed: number;
    failed: number;
    changed: number;
    skipped: number;
    new: number;
  };
  environment: { nodeVersion: string; platform: string; ci: boolean };
} & DbEntryMetadata;

/**
 * Result of image comparison
 *
 * Encapsulates the output of image difference analysis operations.
 * Provides both boolean result and quantitative metrics for flexible test logic.
 *
 * @property {boolean} matches - Whether images are considered visually equivalent
 * @property {string} message - Detailed explanation of comparison outcome
 * @property {Buffer | null} diff - Visual representation of differences between images
 * @property {number | null} diffRatio - Numerical measure of difference magnitude (0-1 scale)
 */
export type ComparisonResult = {
  matches: boolean;
  message: string;
  diff: Buffer | null;
  diffRatio: number | null;
};

/**
 * Viewport dimensions
 *
 * Defines the rendering area for visual tests to ensure consistent screenshots.
 * Critical for reproducible visual testing across different environments.
 *
 * @property {number} width - Viewport width in pixels
 * @property {number} height - Viewport height in pixels
 */
export type Viewport = { width: number; height: number };

export type PublishMsg = {
  type: string;
  runId: string;
  payload: any;
  timestamp: number;
};
