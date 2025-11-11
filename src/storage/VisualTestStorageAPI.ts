/**
 * Redis-based storage API for visual test results
 * Handles storage of test runs, images, and real-time events
 *
 * The storage strategy uses Redis for metadata (test status, run summaries, etc.)
 * and filesystem for actual image files to optimize performance and storage costs.
 * Images are stored separately to avoid bloating Redis memory usage while
 * maintaining fast metadata queries and real-time event publishing capabilities.
 */

import {
  createClient,
  type RedisClientOptions,
  type RedisClientType,
} from "redis";
import type {
  NewStoredVisualTest,
  NewVisualTestRun,
  StoryIdentifier,
  VisualTestResult,
  VisualTestRun,
  StoredVisualTestResult,
  VisualTestUpdate,
  PublishMsg,
} from "../types/index.js";
import { v7 as uuidv7 } from "uuid";
import { join } from "path";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";

/**
 * Global event channel for visual tests
 */
const GLOBAL_CHANNEL = "visualtest:events";

/**
 * Generate Redis key for a run
 * @param runId The unique identifier for the test run
 * @returns Redis key string for the run
 */
const runKey = (runId: string) => {
  return `visualrun:${runId}`;
};

/**
 * Generate Redis key for run tests set
 * @param runId The unique identifier for the test run
 * @returns Redis key string for the set of tests in the run
 */
const runTestsSetKey = (runId: string) => {
  return `visualrun:${runId}:tests`;
};
/**
 * Generate Redis key for a specific test
 * @param runId The unique identifier for the test run
 * @param s The story identifier containing storyId, theme, and viewport
 * @returns Redis key string for the specific test
 */
const testKeyFor = (runId: string, s: StoryIdentifier) => {
  const { storyId, theme, viewport } = s;
  return `visualtest:${runId}:${storyId}:${theme}:${viewport.width}x${viewport.height}`;
};

/**
 * Generate Redis channel for a run
 * @param runId The unique identifier for the test run
 * @returns Redis channel string for the run
 */
const runChannel = (runId: string) => {
  return `visualrun:${runId}:channel`;
};

type ImageMetadata = Pick<
  StoredVisualTestResult,
  "baseline" | "current" | "diff"
>;

/**
 * Helper for image storage directories
 */
const getStorageRoot = () =>
  process.env.VITE_VISUAL_TEST_IMAGES_PATH || "./tests/visual-test-images";
const getBaselineDir = () => join(getStorageRoot(), "baselines");
const getRunDir = () => join(getStorageRoot(), "runs");

/**
 * Generate unique image identifier from story identifier
 * @param storyIdentifier The story identifier containing storyId, theme, and viewport
 * @returns A unique string identifier for the image
 */
const getImageId = (storyIdentifier: StoryIdentifier) => {
  const { storyId, theme, viewport } = storyIdentifier;
  return `${storyId}-${theme}-${viewport.width}x${viewport.height}`;
};

/**
 * Get baseline image path for a story
 * @param storyIdentifier The identifier for the story
 * @returns Path to the baseline image file
 */
const getBaselinePath = (storyIdentifier: StoryIdentifier): string => {
  const imageId = getImageId(storyIdentifier);
  return join(getBaselineDir(), `${imageId}.png`);
};

/**
 * Get directory for run images
 * @param runId The unique identifier for the test run
 * @returns Path to the directory for run images
 */
const getRunImageDir = (runId: string) => join(getRunDir(), runId);

/**
 * Get current image path for a test run
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @returns Path to the current image file
 */
const getCurrentPath = (
  runId: string,
  storyIdentifier: StoryIdentifier
): string => {
  const imageId = getImageId(storyIdentifier);
  return join(getRunImageDir(runId), `${imageId}-current.png`);
};

/**
 * Get diff image path for a test run
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @returns Path to the diff image file
 */
const getDiffPath = (
  runId: string,
  storyIdentifier: StoryIdentifier
): string => {
  const imageId = getImageId(storyIdentifier);
  return join(getRunImageDir(runId), `${imageId}-diff.png`);
};

let client: RedisClientType | null = null;

/**
 * Connect to Redis client
 * @param options Redis client configuration options
 * @returns The Redis client instance
 */
const connect = async (options: RedisClientOptions) => {
  if (client) return client;

  client = (await createClient(options)) as RedisClientType;

  client.on("error", (err: unknown) =>
    console.error("Redis Client Error", err)
  );

  await client.connect();

  await ensureImageStorageDirs();

  return client;
};

/**
 * Create image storage directories if they don't exist
 */
const ensureImageStorageDirs = async () => {
  await mkdir(getBaselineDir(), { recursive: true });
  await mkdir(getRunDir(), { recursive: true });
};

/**
 * Create run-specific image directory
 * @param runId The unique identifier for the test run
 */
const ensureRunImageDir = async (runId: string) => {
  const dir = getRunImageDir(runId);
  await mkdir(dir, { recursive: true });
};

/**
 * Save baseline image to filesystem
 * @param storyIdentifier The identifier for the story
 * @param buffer The image buffer to save
 * @returns Path to the saved baseline image
 */
const saveBaseline = async (
  storyIdentifier: StoryIdentifier,
  buffer: Buffer
): Promise<string> => {
  const filePath = getBaselinePath(storyIdentifier);
  await writeFile(filePath, Buffer.from(buffer));
  return filePath;
};

/**
 * Save run image (current or diff) to filesystem
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @param buffer The image buffer to save
 * @param type The type of image: "current" or "diff"
 * @returns Path to the saved image
 */
const saveRunImage = async (
  runId: string,
  storyIdentifier: StoryIdentifier,
  buffer: Buffer,
  type: "current" | "diff"
): Promise<string> => {
  await ensureRunImageDir(runId);

  const filePath =
    type === "current"
      ? getCurrentPath(runId, storyIdentifier)
      : getDiffPath(runId, storyIdentifier);

  await writeFile(filePath, Buffer.from(buffer));
  return filePath;
};

/**
 * Save image to appropriate location based on type
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @param buffer The image buffer to save
 * @param type The type of image: "baseline", "current", or "diff"
 * @returns Path to the saved image
 */
const saveImage = async (
  runId: string,
  storyIdentifier: StoryIdentifier,
  buffer: Buffer,
  type: "baseline" | "current" | "diff"
): Promise<string> => {
  if (type === "baseline") {
    return await saveBaseline(storyIdentifier, buffer);
  } else {
    return await saveRunImage(runId, storyIdentifier, buffer, type);
  }
};

/**
 * Read image from filesystem
 * @param filePath Path to the image file
 * @returns Buffer containing the image data or null if file doesn't exist
 */
const getImage = async (filePath: string): Promise<Buffer | null> => {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return await readFile(filePath);
  } catch (error) {
    console.error(`Failed to read image from ${filePath}:`, error);
    return null;
  }
};

/**
 * Get baseline image from filesystem
 * @param storyIdentifier The identifier for the story
 * @returns Buffer containing the baseline image data or null if not found
 */
const getBaseline = async (
  storyIdentifier: StoryIdentifier
): Promise<Buffer | null> => {
  const baselinePath = getBaselinePath(storyIdentifier);

  return await getImage(baselinePath);
};

/**
 * Delete current and diff images for a test
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 */
const deleteTestImages = async (
  runId: string,
  storyIdentifier: StoryIdentifier
): Promise<void> => {
  const currentPath = getCurrentPath(runId, storyIdentifier);
  const diffPath = getDiffPath(runId, storyIdentifier);

  const fs = await import("fs/promises");

  try {
    await fs.unlink(currentPath);
  } catch (error) {
    // Ignore if doesn't exist
  }

  try {
    await fs.unlink(diffPath);
  } catch (error) {
    // Ignore if doesn't exist
  }
};

/**
 * Delete baseline image for a story
 * @param storyIdentifier The identifier for the story
 */
const deleteBaseline = async (
  storyIdentifier: StoryIdentifier
): Promise<void> => {
  const baselinePath = getBaselinePath(storyIdentifier);

  try {
    const fs = await import("fs/promises");
    await fs.unlink(baselinePath);
  } catch (error) {
    // Ignore if doesn't exist
  }
};

/**
 * Disconnect from Redis client
 */
const disconnect = async () => {
  if (!client) return;
  await client.quit();
  client = null;
};

/**
 * Publish event to Redis channels
 * @param eventType The type of event to publish
 * @param runId The unique identifier for the test run
 * @param payload The event payload
 */
const publish = async (eventType: string, runId: string, payload: any) => {
  if (!client) throw new Error("Redis not connected");

  const msg: PublishMsg = {
    type: eventType,
    runId,
    payload,
    timestamp: Date.now(),
  };

  // Publish to both per-run and global channels to support different client subscription patterns
  // Per-run channel: For clients interested in specific test run progress
  // Global channel: For clients monitoring all test activity across runs
  const pipeline = client.multi();
  pipeline.publish(runChannel(runId), JSON.stringify(msg));
  pipeline.publish(GLOBAL_CHANNEL, JSON.stringify(msg));
  await pipeline.exec();
};

/**
 * Start a new visual test run
 * @param testCount The number of tests in this run
 * @returns The new visual test run object
 */
const startRun = async (testCount: number): Promise<NewVisualTestRun> => {
  if (!client) throw new Error("Redis not connected");

  const newRun: NewVisualTestRun = {
    runId: uuidv7(),
    startedAt: Date.now(),
    summary: {
      total: testCount,
      finished: 0,
      passed: 0,
      failed: 0,
      changed: 0,
      skipped: 0,
      new: 0,
    },
    environment: {
      ...getEnvironment(),
    },
  };

  const newRunKey = runKey(newRun.runId);

  const pipeline = client.multi();
  pipeline.json.set(newRunKey, "$", newRun); // JSON visualrun.runId
  pipeline.sAdd("visualruns:index", newRun.runId); // Index
  await pipeline.exec();

  await publish("run:started", newRun.runId, {
    runId: newRun.runId,
    testCount,
  }); // Publish run started event

  return newRun;
};

/**
 * Start a new visual test
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @returns The new stored visual test object
 */
const startTest = async (
  runId: string,
  storyIdentifier: StoryIdentifier
): Promise<NewStoredVisualTest> => {
  if (!client) throw new Error("Redis not connected");

  const key = testKeyFor(runId, storyIdentifier);
  const now = Date.now();

  const expectedBaselinePath = getBaselinePath(storyIdentifier);
  const baselineExists = await existsSync(expectedBaselinePath);

  const baselinePath = baselineExists ? expectedBaselinePath : null;

  const newTest: NewStoredVisualTest = {
    runId,
    storyIdentifier,
    status: "running",
    startedAt: now,
    baseline: baselinePath,
    current: null,
    diff: null,
  };

  const pipeline = client.multi();
  pipeline.json.set(key, "$", newTest);
  pipeline.sAdd(runTestsSetKey(runId), key);
  await pipeline.exec();

  await publish("test:started", runId, {
    runId,
    storyIdentifier,
    status: "running",
  }); // Publish test started event to notify subscribers about new test execution

  return newTest;
};

/**
 * Update test with new data
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @param partial The partial test update data
 */
const updateTest = async (
  runId: string,
  storyIdentifier: StoryIdentifier,
  partial: VisualTestUpdate
) => {
  if (!client) throw new Error("Redis not connected");

  const key = testKeyFor(runId, storyIdentifier);

  // Get existing test data
  const existing = (await client.json.get(
    key
  )) as StoredVisualTestResult | null;

  const imageMetadata: Partial<ImageMetadata> = {};

  if (partial.baseline) {
    imageMetadata.baseline = await saveImage(
      runId,
      storyIdentifier,
      partial.baseline,
      "baseline"
    );
  }
  if (partial.current) {
    imageMetadata.current = await saveImage(
      runId,
      storyIdentifier,
      partial.current,
      "current"
    );
  }
  if (partial.diff) {
    imageMetadata.diff = await saveImage(
      runId,
      storyIdentifier,
      partial.diff,
      "diff"
    );
  }
  const { baseline, current, diff, ...partialWithoutBuffers } = partial;

  const merged: Partial<StoredVisualTestResult> = {
    ...(existing || {}),
    ...partialWithoutBuffers,
    ...imageMetadata,
    runId,
  };

  const pipeline = client.multi();
  pipeline.json.set(key, "$", merged);
  pipeline.sAdd(runTestsSetKey(runId), key);
  await pipeline.exec();

  await publish("test:updated", runId, {
    storyIdentifier: storyIdentifier,
    status: merged.status,
    ...partialWithoutBuffers,
  });
};

/**
 * Complete a visual test
 * @param runId The unique identifier for the test run
 * @param result The visual test result
 * @returns The updated run object or null if run not found
 */
const finishTest = async (
  runId: string,
  result: Pick<
    VisualTestResult,
    | "storyIdentifier"
    | "status"
    | "baseline"
    | "current"
    | "diff"
    | "diffRatio"
    | "message"
  >
) => {
  if (!client) throw new Error("Redis not connected");
  const key = testKeyFor(runId, result.storyIdentifier);
  const finishedAt = Date.now();

  const existing = (await client.json.get(
    key
  )) as StoredVisualTestResult | null;

  const imageMetadata: ImageMetadata = {
    baseline: result.baseline
      ? await saveImage(
          runId,
          result.storyIdentifier,
          result.baseline,
          "baseline"
        )
      : existing?.baseline || null,
    current: result.current
      ? await saveImage(
          runId,
          result.storyIdentifier,
          result.current,
          "current"
        )
      : null,
    diff: result.diff
      ? await saveImage(runId, result.storyIdentifier, result.diff, "diff")
      : null,
  };

  const { baseline, current, diff, ...resultWithoutBuffers } = result;

  const finalObj: StoredVisualTestResult = {
    ...(existing || { startedAt: finishedAt }),
    ...resultWithoutBuffers,
    ...imageMetadata,
    runId,
    finishedAt,
  };

  const pipeline = client.multi();
  pipeline.json.set(key, "$", finalObj); // Data
  pipeline.sAdd(runTestsSetKey(runId), key); // Index
  await pipeline.exec();

  // update run summary
  const runK = runKey(runId);
  const runObj = (await client.json.get(runK)) as VisualTestRun | null;

  if (runObj && runObj.summary) {
    runObj.summary.finished++;
    await client.json.numIncrBy(runK, "summary.finished", 1);

    if (finalObj.status === "passed") {
      runObj.summary.passed++;
      await client.json.numIncrBy(runK, "summary.passed", 1);
    }
    if (finalObj.status === "failed") {
      runObj.summary.failed++;
      await client.json.numIncrBy(runK, "summary.failed", 1);
    }
    if (finalObj.status === "new") {
      runObj.summary.new++;
      await client.json.numIncrBy(runK, "summary.new", 1);
    }

    await publish("test:finished", runId, {
      storyIdentifier: result.storyIdentifier,
      status: finalObj.status,
      diffRatio: finalObj.diffRatio ?? null,
    });

    // Also publish run summary update to keep subscribers informed of overall progress
    await publish("run:summary", runId, { summary: runObj.summary });
  } else {
    // If missing run metadata, still publish test finished to maintain event consistency
    await publish("test:finished", runId, {
      storyIdentifier: result.storyIdentifier,
      status: finalObj.status,
      diffRatio: finalObj.diffRatio ?? null,
    });
  }

  return runObj;
};

/**
 * Complete a visual test run
 * @param runId The unique identifier for the test run
 * @param reason The reason for finishing the run (default: "passed")
 * @returns The completed visual test run object
 */
const finishRun = async (
  runId: string,
  reason: VisualTestRun["reason"] = "passed"
): Promise<VisualTestRun> => {
  if (!client) throw new Error("Redis not connected");

  const key = runKey(runId);
  const now = Date.now();

  const runObj = (await client.json.get(key)) as VisualTestRun | null;

  if (runObj) {
    runObj.finishedAt = now;
    runObj.reason = reason;
    if (runObj.startedAt) runObj.duration = now - runObj.startedAt;

    const pipeline = client.multi();
    pipeline.json.set(key, "$", runObj);
    await pipeline.exec();

    await publish("run:finished", runId, {
      runId,
      reason,
      summary: runObj.summary,
    });

    await publish("run:summary", runId, { summary: runObj.summary });

    return runObj;
  } else {
    // Create minimal run summary if missing
    const run: VisualTestRun = {
      runId,
      startedAt: now,
      finishedAt: now,
      duration: 0,
      reason,
      summary: {
        total: 0,
        finished: 0,
        passed: 0,
        failed: 0,
        changed: 0,
        skipped: 0,
        new: 0,
      },
      environment: {
        ...getEnvironment(),
      },
    };

    const pipeline = client.multi();
    pipeline.json.set(key, "$", run);
    pipeline.sAdd("visualruns:index", runId);
    await pipeline.exec();

    await publish("run:finished", runId, {
      runId,
      reason,
      summary: run.summary,
    });

    return run;
  }
};

/**
 * Accept a new baseline
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 */
const acceptBaseline = async (
  runId: string,
  storyIdentifier: StoryIdentifier
) => {
  if (!client) throw new Error("Redis not connected");

  const key = testKeyFor(runId, storyIdentifier);
  const test = (await client.json.get(key)) as StoredVisualTestResult | null;

  if (!test) throw new Error("Test not found");
  if (!test.current) throw new Error("No current image to promote");

  const currentBuffer = await getImage(test.current);
  if (!currentBuffer) throw new Error("Current image not found on filesystem");

  const newBaselinePath = await saveBaseline(storyIdentifier, currentBuffer);

  test.baseline = newBaselinePath;
  test.diff = null;
  test.diffRatio = null;
  test.status = "passed";

  const pipeline = client.multi();
  pipeline.json.set(key, "$", test);
  await pipeline.exec();

  await publish("baseline:accepted", runId, { storyIdentifier });
};

/**
 * Get run data
 * @param runId The unique identifier for the test run
 * @returns The visual test run object or null if not found
 */
const getRun = async (runId: string): Promise<VisualTestRun | null> => {
  if (!client) throw new Error("Redis not connected");

  return (await client.json.get(runKey(runId))) as VisualTestRun | null;
};

/**
 * Get test data
 * @param runId The unique identifier for the test run
 * @param storyIdentifier The identifier for the story
 * @returns The stored visual test result or null if not found
 */
const getTest = async (
  runId: string,
  storyIdentifier: StoryIdentifier
): Promise<StoredVisualTestResult | null> => {
  if (!client) throw new Error("Redis not connected");

  const key = testKeyFor(runId, storyIdentifier);

  return (await client.json.get(key)) as StoredVisualTestResult | null;
};

/**
 * Get a list of tests for a run
 * @param runId The unique identifier for the test run
 * @returns Array of stored visual test results for the run
 */
const listTestsForRun = async (runId: string) => {
  if (!client) throw new Error("Redis not connected");

  const members = await client.sMembers(runTestsSetKey(runId));

  if (!members || members.length === 0) return [];

  const pipeline = client.multi();
  for (const m of members) pipeline.json.get(m);
  const res = await pipeline.exec();

  // pipeline.exec returns array of results; filter nulls
  return (res || []).filter(Boolean) as unknown as StoredVisualTestResult[];
};

/**
 * Get all saved runs
 * @returns Array of all visual test runs
 */
const listAllRuns = async () => {
  if (!client) throw new Error("Redis not connected");

  const ids = await client.sMembers("visualruns:index");

  if (!ids || ids.length === 0) return [];

  const pipeline = client.multi();
  for (const id of ids) pipeline.json.get(runKey(id));
  const res = await pipeline.exec();

  return (res || []).filter(Boolean) as unknown as VisualTestRun[];
};

/**
 * Helper to get the test environment
 * @returns Environment information for the test run
 */
const getEnvironment = (): VisualTestRun["environment"] => {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    ci: process.env.CI === "true",
  };
};

export {
  connect,
  disconnect,
  startRun,
  startTest,
  updateTest,
  finishTest,
  finishRun,
  acceptBaseline,
  getRun,
  getTest,
  listTestsForRun,
  listAllRuns,
  saveImage,
  getImage,
  getBaseline,
  deleteTestImages,
  deleteBaseline,
};
