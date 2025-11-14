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

type ImageMetadata = Pick<
  StoredVisualTestResult,
  "baseline" | "current" | "diff"
>;

let storageOnlyApiSingleton: VisualTestStorageAPI | null = null;

export class VisualTestStorageAPI {
  private client: RedisClientType | null = null;
  private readonly imageRoot: string;
  private readonly GLOBAL_CHANNEL = "visualtest:events";
  private readonly redisOptions?: RedisClientOptions;

  constructor(redisOptions?: RedisClientOptions, imageRootPath?: string) {
    this.redisOptions = redisOptions;
    this.imageRoot =
      imageRootPath ||
      process.env.VITE_VISUAL_TEST_IMAGES_PATH ||
      "./tests/visual-test-images";
  }

  // ---------------------------
  // Key / Channel helpers
  // ---------------------------
  /**
   * Generate Redis key for a run
   * @param runId The unique identifier for the test run
   * @returns Redis key string for the run
   */
  private runKey(runId: string) {
    return `visualrun:${runId}`;
  }

  /**
   * Generate Redis key for run tests set
   * @param runId The unique identifier for the test run
   * @returns Redis key string for the set of tests in the run
   */
  private runTestsSetKey(runId: string) {
    return `visualrun:${runId}:tests`;
  }

  /**
   * Generate Redis key for a specific test
   * @param runId The unique identifier for the test run
   * @param s The story identifier containing storyId, theme, and viewport
   * @returns Redis key string for the specific test
   */
  private testKeyFor(runId: string, s: StoryIdentifier) {
    const { storyId, theme, viewport } = s;
    return `visualtest:${runId}:${storyId}:${theme}:${viewport.width}x${viewport.height}`;
  }

  /**
   * Generate Redis channel for a run
   * @param runId The unique identifier for the test run
   * @returns Redis channel string for the run
   */
  private runChannel(runId: string) {
    return `visualrun:${runId}:channel`;
  }

  // ---------------------------
  // Paths & storage helpers
  // ---------------------------
  private getBaselineDir() {
    return join(this.imageRoot, "baselines");
  }

  private getRunDir() {
    return join(this.imageRoot, "runs");
  }

  /**
   * Generate unique image identifier from story identifier
   * @param storyIdentifier The story identifier containing storyId, theme, and viewport
   * @returns A unique string identifier for the image
   */
  private getImageId(storyIdentifier: StoryIdentifier) {
    const { storyId, theme, viewport } = storyIdentifier;

    return `${storyId}-${theme}-${viewport.width}x${viewport.height}`;
  }

  /**
   * Get baseline image path for a story
   * @param storyIdentifier The identifier for the story
   * @returns Path to the baseline image file
   */
  private getBaselinePath(storyIdentifier: StoryIdentifier): string {
    const imageId = this.getImageId(storyIdentifier);

    return join(this.getBaselineDir(), `${imageId}.png`);
  }

  /**
   * Get directory for run images
   * @param runId The unique identifier for the test run
   * @returns Path to the directory for run images
   */
  private getRunImageDir(runId: string) {
    return join(this.getRunDir(), runId);
  }

  /**
   * Get current image path for a test run
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @returns Path to the current image file
   */
  private getCurrentPath(
    runId: string,
    storyIdentifier: StoryIdentifier
  ): string {
    const imageId = this.getImageId(storyIdentifier);

    return join(this.getRunImageDir(runId), `${imageId}-current.png`);
  }

  /**
   * Get diff image path for a test run
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @returns Path to the diff image file
   */
  private getDiffPath(runId: string, storyIdentifier: StoryIdentifier): string {
    const imageId = this.getImageId(storyIdentifier);

    return join(this.getRunImageDir(runId), `${imageId}-diff.png`);
  }

  // ---------------------------
  // Lifecycle
  // ---------------------------
  /**
   * Connect to Redis client
   * @param options Redis client configuration options
   * @returns The Redis client instance
   */
  async connect(options?: RedisClientOptions): Promise<RedisClientType> {
    if (this.client) return this.client;

    const opts = options ?? this.redisOptions;

    if (!opts) {
      throw new Error("Cannot connect to Redis without 'RedisClientOptions'");
    }

    this.client = (await createClient(opts)) as RedisClientType;

    this.client.on("error", (err: unknown) =>
      console.error("Redis Client Error", err)
    );

    await this.client.connect();

    await this.ensureImageStorageDirs();

    return this.client;
  }

  /**
   * Disconnect from Redis client
   */
  async disconnect() {
    if (!this.client) return;

    await this.client.quit();
    this.client = null;
  }

  // ---------------------------
  // FS helpers
  // ---------------------------
  /**
   * Create image storage directories if they don't exist
   */
  private async ensureImageStorageDirs() {
    await mkdir(this.getBaselineDir(), { recursive: true });
    await mkdir(this.getRunDir(), { recursive: true });
  }

  /**
   * Create run-specific image directory
   * @param runId The unique identifier for the test run
   */
  private async ensureRunImageDir(runId: string) {
    const dir = this.getRunImageDir(runId);
    await mkdir(dir, { recursive: true });
  }

  /**
   * Save baseline image to filesystem
   * @param storyIdentifier The identifier for the story
   * @param buffer The image buffer to save
   * @returns Path to the saved baseline image
   */
  private async saveBaseline(
    storyIdentifier: StoryIdentifier,
    buffer: Buffer
  ): Promise<string> {
    const filePath = this.getBaselinePath(storyIdentifier);
    await writeFile(filePath, Buffer.from(buffer));
    return filePath;
  }

  /**
   * Save run image (current or diff) to filesystem
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @param buffer The image buffer to save
   * @param type The type of image: "current" or "diff"
   * @returns Path to the saved image
   */
  private async saveRunImage(
    runId: string,
    storyIdentifier: StoryIdentifier,
    buffer: Buffer,
    type: "current" | "diff"
  ): Promise<string> {
    await this.ensureRunImageDir(runId);
    const filePath =
      type === "current"
        ? this.getCurrentPath(runId, storyIdentifier)
        : this.getDiffPath(runId, storyIdentifier);
    await writeFile(filePath, Buffer.from(buffer));
    return filePath;
  }

  /**
   * Save image to appropriate location based on type
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @param buffer The image buffer to save
   * @param type The type of image: "baseline", "current", or "diff"
   * @returns Path to the saved image
   */
  async saveImage(
    runId: string,
    storyIdentifier: StoryIdentifier,
    buffer: Buffer,
    type: "baseline" | "current" | "diff"
  ): Promise<string> {
    if (type === "baseline") return this.saveBaseline(storyIdentifier, buffer);
    return this.saveRunImage(
      runId,
      storyIdentifier,
      buffer,
      type === "current" ? "current" : "diff"
    );
  }

  /**
   * Read image from filesystem
   * @param filePath Path to the image file
   * @returns Buffer containing the image data or null if file doesn't exist
   */
  async getImage(filePath: string): Promise<Buffer | null> {
    try {
      if (!existsSync(filePath)) return null;
      return await readFile(filePath);
    } catch (error) {
      console.error(`Failed to read image from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Read current image for runId from filesystem
   * @param runId Target runId
   * @param storyIdentifier The storyIdentifier for which to get the current image
   * @returns Buffer containing the image data or null if file doesn't exist
   */
  async getCurrentImage(
    runId: string,
    storyIdentifier: StoryIdentifier
  ): Promise<Buffer | null> {
    const currentPath = this.getCurrentPath(runId, storyIdentifier);
    return this.getImage(currentPath);
  }

  /**
   * Read diff image for runId from filesystem
   * @param runId Target runId
   * @param storyIdentifier The storyIdentifier for which to get the diff image
   * @returns Buffer containing the image data or null if file doesn't exist
   */
  async getDiffImage(
    runId: string,
    storyIdentifier: StoryIdentifier
  ): Promise<Buffer | null> {
    const diffPath = this.getDiffPath(runId, storyIdentifier);
    return this.getImage(diffPath);
  }

  /**
   * Get baseline image from filesystem
   * @param storyIdentifier The identifier for the story
   * @returns Buffer containing the baseline image data or null if not found
   */
  async getBaseline(storyIdentifier: StoryIdentifier): Promise<Buffer | null> {
    const baselinePath = this.getBaselinePath(storyIdentifier);
    return this.getImage(baselinePath);
  }

  /**
   * Delete current and diff images for a test
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   */
  async deleteTestImages(
    runId: string,
    storyIdentifier: StoryIdentifier
  ): Promise<void> {
    const currentPath = this.getCurrentPath(runId, storyIdentifier);
    const diffPath = this.getDiffPath(runId, storyIdentifier);

    const fs = await import("fs/promises");

    try {
      await fs.unlink(currentPath);
    } catch (e) {
      /* ignore */
    }
    try {
      await fs.unlink(diffPath);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Delete baseline image for a story
   * @param storyIdentifier The identifier for the story
   */
  async deleteBaseline(storyIdentifier: StoryIdentifier): Promise<void> {
    const baselinePath = this.getBaselinePath(storyIdentifier);
    try {
      const fs = await import("fs/promises");
      await fs.unlink(baselinePath);
    } catch (error) {
      // ignore
    }
  }

  // ---------------------------
  // Pub/Sub
  // ---------------------------
  /**
   * Publish event to Redis channels
   * @param eventType The type of event to publish
   * @param runId The unique identifier for the test run
   * @param payload The event payload
   */
  private async publish(eventType: string, runId: string, payload: any) {
    if (!this.client) throw new Error("Redis not connected");

    const msg: PublishMsg = {
      type: eventType,
      runId,
      payload,
      timestamp: Date.now(),
    };

    const pipeline = this.client.multi();
    pipeline.publish(this.runChannel(runId), JSON.stringify(msg));
    pipeline.publish(this.GLOBAL_CHANNEL, JSON.stringify(msg));
    await pipeline.exec();
  }

  // ---------------------------
  // Run lifecycle methods
  // ---------------------------
  /**
   * Start a new visual test run
   * @param testCount The number of tests in this run
   * @returns The new visual test run object
   */
  async startRun(testCount: number): Promise<NewVisualTestRun> {
    if (!this.client) throw new Error("Redis not connected");

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
      environment: { ...this.getEnvironment() },
    };

    const newRunKey = this.runKey(newRun.runId);
    const pipeline = this.client.multi();
    pipeline.json.set(newRunKey, "$", newRun);
    pipeline.sAdd("visualruns:index", newRun.runId);
    await pipeline.exec();

    await this.publish("run:started", newRun.runId, {
      runId: newRun.runId,
      testCount,
    });

    return newRun;
  }

  /**
   * Complete a visual test run
   * @param runId The unique identifier for the test run
   * @param reason The reason for finishing the run (default: "passed")
   * @returns The completed visual test run object
   */
  async finishRun(
    runId: string,
    reason: VisualTestRun["reason"] = "passed"
  ): Promise<VisualTestRun> {
    if (!this.client) throw new Error("Redis not connected");

    const key = this.runKey(runId);
    const now = Date.now();

    const runObj = (await this.client.json.get(key)) as VisualTestRun | null;

    if (runObj) {
      runObj.finishedAt = now;
      runObj.reason = reason;
      if (runObj.startedAt) runObj.duration = now - runObj.startedAt;

      const pipeline = this.client.multi();
      pipeline.json.set(key, "$", runObj);
      await pipeline.exec();

      await this.publish("run:finished", runId, {
        runId,
        reason,
        summary: runObj.summary,
      });
      await this.publish("run:summary", runId, { summary: runObj.summary });

      return runObj;
    } else {
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
        environment: { ...this.getEnvironment() },
      };

      const pipeline = this.client.multi();
      pipeline.json.set(key, "$", run);
      pipeline.sAdd("visualruns:index", runId);
      await pipeline.exec();

      await this.publish("run:finished", runId, {
        runId,
        reason,
        summary: run.summary,
      });

      return run;
    }
  }

  // ---------------------------
  // Test lifecycle methods
  // ---------------------------
  /**
   * Start a new visual test
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @returns The new stored visual test object
   */
  async startTest(
    runId: string,
    storyIdentifier: StoryIdentifier
  ): Promise<NewStoredVisualTest> {
    if (!this.client) throw new Error("Redis not connected");

    const key = this.testKeyFor(runId, storyIdentifier);
    const now = Date.now();

    const expectedBaselinePath = this.getBaselinePath(storyIdentifier);
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

    const pipeline = this.client.multi();
    pipeline.json.set(key, "$", newTest);
    pipeline.sAdd(this.runTestsSetKey(runId), key);
    await pipeline.exec();

    await this.publish("test:started", runId, {
      runId,
      storyIdentifier,
      status: "running",
    });

    return newTest;
  }

  /**
   * Update test with new data
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @param partial The partial test update data
   */
  async updateTest(
    runId: string,
    storyIdentifier: StoryIdentifier,
    partial: VisualTestUpdate
  ) {
    if (!this.client) throw new Error("Redis not connected");

    const key = this.testKeyFor(runId, storyIdentifier);
    const existing = (await this.client.json.get(
      key
    )) as StoredVisualTestResult | null;

    const imageMetadata: Partial<ImageMetadata> = {};

    if (partial.baseline) {
      imageMetadata.baseline = await this.saveImage(
        runId,
        storyIdentifier,
        partial.baseline,
        "baseline"
      );
    }
    if (partial.current) {
      imageMetadata.current = await this.saveImage(
        runId,
        storyIdentifier,
        partial.current,
        "current"
      );
    }
    if (partial.diff) {
      imageMetadata.diff = await this.saveImage(
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

    const pipeline = this.client.multi();
    pipeline.json.set(key, "$", merged);
    pipeline.sAdd(this.runTestsSetKey(runId), key);
    await pipeline.exec();

    await this.publish("test:updated", runId, {
      storyIdentifier,
      status: merged.status,
      ...partialWithoutBuffers,
    });
  }

  /**
   * Complete a visual test
   * @param runId The unique identifier for the test run
   * @param result The visual test result
   * @returns The updated run object or null if run not found
   */
  async finishTest(
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
  ) {
    if (!this.client) throw new Error("Redis not connected");

    const key = this.testKeyFor(runId, result.storyIdentifier);
    const finishedAt = Date.now();

    const existing = (await this.client.json.get(
      key
    )) as StoredVisualTestResult | null;

    const imageMetadata: ImageMetadata = {
      baseline: result.baseline
        ? await this.saveImage(
            runId,
            result.storyIdentifier,
            result.baseline,
            "baseline"
          )
        : existing?.baseline || null,
      current: result.current
        ? await this.saveImage(
            runId,
            result.storyIdentifier,
            result.current,
            "current"
          )
        : null,
      diff: result.diff
        ? await this.saveImage(
            runId,
            result.storyIdentifier,
            result.diff,
            "diff"
          )
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

    const pipeline = this.client.multi();
    pipeline.json.set(key, "$", finalObj);
    pipeline.sAdd(this.runTestsSetKey(runId), key);
    await pipeline.exec();

    // update run summary
    const runK = this.runKey(runId);
    const runObj = (await this.client.json.get(runK)) as VisualTestRun | null;

    if (runObj && runObj.summary) {
      runObj.summary.finished++;
      await this.client.json.numIncrBy(runK, "summary.finished", 1);

      if (finalObj.status === "passed") {
        runObj.summary.passed++;
        await this.client.json.numIncrBy(runK, "summary.passed", 1);
      }
      if (finalObj.status === "failed") {
        runObj.summary.failed++;
        await this.client.json.numIncrBy(runK, "summary.failed", 1);
      }
      if (finalObj.status === "new") {
        runObj.summary.new++;
        await this.client.json.numIncrBy(runK, "summary.new", 1);
      }

      await this.publish("test:finished", runId, {
        storyIdentifier: result.storyIdentifier,
        status: finalObj.status,
        diffRatio: finalObj.diffRatio ?? null,
      });
      await this.publish("run:summary", runId, { summary: runObj.summary });
    } else {
      await this.publish("test:finished", runId, {
        storyIdentifier: result.storyIdentifier,
        status: finalObj.status,
        diffRatio: finalObj.diffRatio ?? null,
      });
    }

    return runObj;
  }

  /**
   * Accept a new baseline
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   */
  async acceptBaseline(runId: string, storyIdentifier: StoryIdentifier) {
    if (!this.client) throw new Error("Redis not connected");

    const key = this.testKeyFor(runId, storyIdentifier);
    const test = (await this.client.json.get(
      key
    )) as StoredVisualTestResult | null;

    if (!test) throw new Error("Test not found");
    if (!test.current) throw new Error("No current image to promote");

    const currentBuffer = await this.getImage(test.current);
    if (!currentBuffer)
      throw new Error("Current image not found on filesystem");

    const newBaselinePath = await this.saveBaseline(
      storyIdentifier,
      currentBuffer
    );

    test.baseline = newBaselinePath;
    test.diff = null;
    test.diffRatio = null;
    test.status = "passed";

    const pipeline = this.client.multi();
    pipeline.json.set(key, "$", test);
    await pipeline.exec();

    await this.publish("baseline:accepted", runId, { storyIdentifier });
  }

  // ---------------------------
  // Queries
  // ---------------------------
  /**
   * Get run data
   * @param runId The unique identifier for the test run
   * @returns The visual test run object or null if not found
   */
  async getRun(runId: string): Promise<VisualTestRun | null> {
    if (!this.client) throw new Error("Redis not connected");

    return (await this.client.json.get(
      this.runKey(runId)
    )) as VisualTestRun | null;
  }

  /**
   * Get test data
   * @param runId The unique identifier for the test run
   * @param storyIdentifier The identifier for the story
   * @returns The stored visual test result or null if not found
   */
  async getTest(
    runId: string,
    storyIdentifier: StoryIdentifier
  ): Promise<StoredVisualTestResult | null> {
    if (!this.client) throw new Error("Redis not connected");

    const key = this.testKeyFor(runId, storyIdentifier);

    return (await this.client.json.get(key)) as StoredVisualTestResult | null;
  }

  /**
   * Get a list of tests for a run
   * @param runId The unique identifier for the test run
   * @returns Array of stored visual test results for the run
   */
  async listTestsForRun(runId: string): Promise<StoredVisualTestResult[]> {
    if (!this.client) throw new Error("Redis not connected");

    const members = await this.client.sMembers(this.runTestsSetKey(runId));

    if (!members || members.length === 0) return [];

    const pipeline = this.client.multi();
    for (const m of members) pipeline.json.get(m);
    const res = await pipeline.exec();

    return (res || []).filter(Boolean) as unknown as StoredVisualTestResult[];
  }

  /**
   * Get all saved runs
   * @returns Array of all visual test runs
   */
  async listAllRuns(): Promise<VisualTestRun[]> {
    if (!this.client) throw new Error("Redis not connected");

    const ids = await this.client.sMembers("visualruns:index");

    if (!ids || ids.length === 0) return [];

    const pipeline = this.client.multi();
    for (const id of ids) pipeline.json.get(this.runKey(id));
    const res = await pipeline.exec();

    return (res || []).filter(Boolean) as unknown as VisualTestRun[];
  }

  /**
   * Helper to get the test environment
   * @returns Environment information for the test run
   */
  private getEnvironment(): VisualTestRun["environment"] {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      ci: process.env.CI === "true",
    };
  }

  /**
   * Static method to get a singleton instance of the VisualTestStorageAPI without redis connection.
   * Enables vitest server commands to get baselines from the Filesystem.
   *
   * (Ultimately the bridge/orchestrator is going to take full authority on storage
   * and send the runner what it needs to run tests 'baselines.zip')
   *
   * @param imageRootPath
   * @returns
   */
  static getFileStorageOnlyApi(imageRootPath?: string): VisualTestStorageAPI {
    if (storageOnlyApiSingleton) {
      return storageOnlyApiSingleton;
    }

    const imageRootDirectory =
      imageRootPath ||
      process.env.VITE_VISUAL_TEST_IMAGES_PATH ||
      "./tests/visual-test-images";

    storageOnlyApiSingleton = new VisualTestStorageAPI(
      undefined,
      imageRootDirectory
    );

    return storageOnlyApiSingleton;
  }
}
