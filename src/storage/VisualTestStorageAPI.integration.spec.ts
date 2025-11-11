/**
 * Integration tests for the VisualTestStorageAPI
 * These tests verify the complete functionality of the Redis-based storage API
 * for visual test results, including connection management, run operations,
 * test operations, baseline management, and file operations.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import type {
  NewVisualTestRun,
  StoryIdentifier,
  VisualTestRun,
} from "../types";
import { join } from "path";
import { access, readdir, readFile, rm, unlink } from "fs/promises";

// Image config and helpers
/**
 * Mock storage root directory for test images during integration tests
 */
const MOCK_STORAGE_ROOT = "./spec-image-dir";

/**
 * Creates a fake image buffer for testing purposes
 * @param seed - String to use as the basis for the fake image data
 * @returns Buffer containing fake PNG data
 */
const createTestImageBuffer = (seed: string): Buffer => {
  return Buffer.from(`fake-png-data-${seed}`, "utf-8");
};

/**
 * Type representing the different image types stored by the API
 */
type ImageType = "baseline" | "current" | "diff";

/**
 * Generates the expected path where an image should be stored
 * @param runId - The ID of the test run
 * @param storyIdentifier - The story identifier containing storyId, theme and viewport
 * @param type - The type of image (baseline, current, or diff)
 * @returns The expected file path for the image
 */
const getExpectedImagePath = (
  runId: string,
  { storyId, theme, viewport }: StoryIdentifier,
  type: ImageType
) =>
  join(
    MOCK_STORAGE_ROOT,
    type === "baseline" ? "baselines" : "runs",
    type === "baseline" ? "" : runId,
    `${storyId}-${theme}-${viewport.width}x${viewport.height}${
      type === "baseline" ? "" : `-${type}`
    }.png`
  );

/**
 * Integration tests for the VisualTestStorageAPI
 * These tests use a real Redis container to verify the complete functionality
 * of the storage API including connection management, run operations, test operations,
 * baseline management, and file operations.
 */
describe("VisualTestStorageAPI - Integration Tests", () => {
  let container: StartedRedisContainer;
  let redisUrl: string;
  let storageAPI: typeof import("../storage/VisualTestStorageAPI");

  /**
   * Setup before all tests: start Redis container, import storage API module,
   * and establish initial connection to Redis
   */
  beforeAll(async () => {
    // Mock storage root env variable before important storage module
    vi.stubEnv("VITE_VISUAL_TEST_IMAGES_PATH", MOCK_STORAGE_ROOT);
    storageAPI = await import("../storage/VisualTestStorageAPI");

    // Start Redis container
    container = await new RedisContainer("redis:8")
      .withExposedPorts(6379)
      .start();
    redisUrl = container.getConnectionUrl();

    // Connect to Redis
    await storageAPI.connect({ url: redisUrl });
  });

  /**
   * Cleanup after all tests: flush Redis data, disconnect, stop container,
   * remove test image directory, and restore environment variables
   */
  afterAll(async () => {
    const client = await storageAPI.connect({ url: redisUrl });
    await client.flushAll();
    await storageAPI.disconnect();
    await container.stop({ removeVolumes: true });
    await rm(MOCK_STORAGE_ROOT, { recursive: true });
    vi.unstubAllEnvs();
  });

  /**
   * Reset Redis state and test image directory before each test
   * to ensure test isolation
   */
  beforeEach(async () => {
    const client = await storageAPI.connect({ url: redisUrl });
    await client.flushAll();
    await storageAPI.disconnect();
    await rm(MOCK_STORAGE_ROOT, { recursive: true });
    await storageAPI.connect({ url: redisUrl });
  });

  /**
   * Tests for connection management functionality
   * Verifies that the API can properly connect to Redis, reuse connections,
   * and handle disconnection/reconnection
   */
  describe("Connection Management", () => {
    /**
     * Tests that the API can establish a connection to the Redis container
     */
    it("should connect to Redis container", async () => {
      await storageAPI.disconnect();
      const client = await storageAPI.connect({ url: redisUrl });
      expect(client).toBeDefined();
    });

    /**
     * Tests that the API reuses existing connections instead of creating new ones
     */
    it("should reuse existing connection", async () => {
      const client1 = await storageAPI.connect({ url: redisUrl });
      const client2 = await storageAPI.connect({ url: redisUrl });
      expect(client1).toBe(client2);
    });

    /**
     * Tests that the API can disconnect and then reconnect successfully
     */
    it("should disconnect and reconnect successfully", async () => {
      await storageAPI.disconnect();
      await expect(
        storageAPI.connect({ url: redisUrl })
      ).resolves.toBeDefined();
    });
  });

  /**
   * Tests for run operations
   * Verifies that test runs can be started, listed, and finalized properly
   */
  describe("Run Operations", () => {
    /**
     * Tests that a new run can be initialized and properly persisted to Redis
     */
    it("should initialize a new run and persist to Redis", async () => {
      const newRun = await storageAPI.startRun(0);

      // Verify run was saved
      const savedRun = await storageAPI.getRun(newRun.runId);

      expect(savedRun).toBeDefined();
      expect(savedRun!.runId).toBe(newRun.runId);
      expect(savedRun!.startedAt).toBeDefined();
    });

    /**
     * Tests that all runs can be listed from Redis
     */
    it("should list all runs", async () => {
      const run1 = await storageAPI.startRun(0);
      const run2 = await storageAPI.startRun(0);

      const runs = await storageAPI.listAllRuns();

      expect(runs.length).toEqual(2);

      expect(runs[0].runId).toEqual(run1.runId);
      expect(runs[0].startedAt).toBeDefined();

      expect(runs[1].runId).toEqual(run2.runId);
      expect(runs[1].startedAt).toBeDefined();
    });

    /**
     * Tests that a run can be finalized with end time and duration
     */
    it("should finalize run with end time and duration", async () => {
      const newRun = await storageAPI.startRun(0);

      await storageAPI.finishRun(newRun.runId, "passed");

      const finishedRun = await storageAPI.getRun(newRun.runId);

      expect(finishedRun).toBeDefined();
      expect(finishedRun?.runId).toEqual(newRun.runId);
      expect(finishedRun?.startedAt).toBeDefined();

      expect(finishedRun?.finishedAt).toBeDefined();
      expect(finishedRun?.reason).toBe("passed");
      expect(finishedRun?.duration).toBeGreaterThan(0);
    });

    /**
     * Tests that runs can be finished with different reasons (passed, failed)
     */
    it("should handle finish run with different reasons", async () => {
      const reasons: Array<VisualTestRun["reason"]> = ["passed", "failed"];

      for (const reason of reasons) {
        const newRun = await storageAPI.startRun(0);
        await storageAPI.finishRun(newRun.runId, reason);

        const finishedRun = await storageAPI.getRun(newRun.runId);
        expect(finishedRun?.reason).toBe(reason);
      }
    });
  });

  /**
   * Tests for test operations
   * Verifies that individual visual tests can be started, updated, finished,
   * and listed properly within a test run
   */
  describe("Test Operations", () => {
    /**
     * Mock story identifier used across multiple tests in this section
     */
    const mockStoryIdentifier: StoryIdentifier = {
      storyId: "button-primary",
      theme: "dark",
      viewport: { width: 1920, height: 1080 },
    };

    let newRun: NewVisualTestRun;

    /**
     * Create a new test run before each test in this section
     */
    beforeEach(async () => {
      newRun = await storageAPI.startRun(0);
    });

    /**
     * Tests that a test can be started and marked as running in the storage
     */
    it("should start a test and mark it as running", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const savedTest = await storageAPI.getTest(
        newRun.runId,
        mockStoryIdentifier
      );

      expect(savedTest).toBeDefined();
      expect(savedTest?.runId).toBe(newRun.runId);
      expect(savedTest?.storyIdentifier).toEqual(mockStoryIdentifier);
      expect(savedTest?.status).toBe("running");
      expect(savedTest?.startedAt).toBeDefined();
    });

    /**
     * Tests that a test can be updated with partial data (e.g., diff ratio and current image)
     */
    it("should update test with partial data", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const mockImageBuffer = createTestImageBuffer("current");
      // Update with new data
      await storageAPI.updateTest(newRun.runId, mockStoryIdentifier, {
        diffRatio: 0.05,
        current: mockImageBuffer,
      });

      const updatedTest = await storageAPI.getTest(
        newRun.runId,
        mockStoryIdentifier
      );

      const expectedCreateCurrentPath = getExpectedImagePath(
        newRun.runId,
        mockStoryIdentifier,
        "current"
      );

      expect(updatedTest?.diffRatio).toBe(0.05);
      expect(updatedTest?.current).toBe(expectedCreateCurrentPath);
      expect(updatedTest?.status).toBe("running"); // Status preserved from start
      await expect(access(expectedCreateCurrentPath)).resolves.not.toThrow();
    });

    /**
     * Tests that a test can be updated with full data including status, images, diff ratio and message
     */
    it("should update test with full data", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const mockCurrent = createTestImageBuffer("current");
      const mockDiff = createTestImageBuffer("diff");
      const expectedCurrentPath = getExpectedImagePath(
        newRun.runId,
        mockStoryIdentifier,
        "current"
      );
      const expectedDiffPath = getExpectedImagePath(
        newRun.runId,
        mockStoryIdentifier,
        "diff"
      );

      // Update with new data
      await storageAPI.updateTest(newRun.runId, mockStoryIdentifier, {
        status: "failed",
        current: mockCurrent,
        diff: mockDiff,
        diffRatio: 0.05,
        message: "Test Message",
      });

      const updatedTest = await storageAPI.getTest(
        newRun.runId,
        mockStoryIdentifier
      );

      expect(updatedTest?.status).toBe("failed");
      expect(updatedTest?.current).toBe(expectedCurrentPath);
      await expect(access(expectedCurrentPath)).resolves.not.toThrow();
      expect(updatedTest?.diff).toBe(expectedDiffPath);
      await expect(access(expectedDiffPath)).resolves.not.toThrow();
      expect(updatedTest?.diffRatio).toBe(0.05);
      expect(updatedTest?.message).toBe("Test Message");
    });

    /**
     * Tests that a test can be finished with final status and results
     * including updating the run summary
     */
    it("should finish test with final status", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const mockBaseline = createTestImageBuffer("baseline");
      const mockCurrent = createTestImageBuffer("current");
      const expectedBaselinePath = getExpectedImagePath(
        newRun.runId,
        mockStoryIdentifier,
        "baseline"
      );
      const expectedCurrentPath = getExpectedImagePath(
        newRun.runId,
        mockStoryIdentifier,
        "current"
      );

      const result: Parameters<typeof storageAPI.finishTest>[1] = {
        storyIdentifier: mockStoryIdentifier,
        status: "passed",
        baseline: mockBaseline,
        current: mockCurrent,
        diff: null,
        diffRatio: 0.1,
        message: "Test passed",
      };

      await storageAPI.finishTest(newRun.runId, result);

      const finishedTest = await storageAPI.getTest(
        newRun.runId,
        mockStoryIdentifier
      );

      expect(finishedTest).toBeDefined();
      expect(finishedTest?.status).toBe(result.status);
      expect(finishedTest?.baseline).toBe(expectedBaselinePath);
      await expect(access(expectedBaselinePath)).resolves.not.toThrow();
      expect(finishedTest?.current).toBe(expectedCurrentPath);
      await expect(access(expectedCurrentPath)).resolves.not.toThrow();
      expect(finishedTest?.diff).toBe(null);
      expect(finishedTest?.diffRatio).toBe(result.diffRatio);
      expect(finishedTest?.message).toBe(result.message);
      expect(finishedTest?.finishedAt).toBeDefined();

      const run = await storageAPI.getRun(newRun.runId);

      expect(run?.summary).toEqual({
        changed: 0,
        passed: 1,
        failed: 0,
        new: 0,
        skipped: 0,
        total: 0,
        finished: 1,
      });
    });

    /**
     * Tests that all tests for a run can be listed properly
     */
    it("should list all tests for a run", async () => {
      const identifiers: StoryIdentifier[] = [
        {
          storyId: "button-1",
          theme: "light",
          viewport: { width: 1920, height: 1080 },
        },
        {
          storyId: "button-2",
          theme: "dark",
          viewport: { width: 1920, height: 1080 },
        },
        {
          storyId: "card-1",
          theme: "light",
          viewport: { width: 1280, height: 720 },
        },
      ];

      for (const identifier of identifiers) {
        await storageAPI.startTest(newRun.runId, identifier);
      }

      const tests = await storageAPI.listTestsForRun(newRun.runId);

      expect(tests).toHaveLength(3);
      expect(tests.map((t) => t.storyIdentifier)).toEqual(
        expect.arrayContaining(identifiers)
      );
    });

    /**
     * Tests that different viewport sizes are handled correctly in test storage
     */
    it("should handle different viewport sizes correctly", async () => {
      const viewports = [
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
        { width: 768, height: 1024 },
      ];

      for (const viewport of viewports) {
        const identifier: StoryIdentifier = {
          storyId: "responsive-test",
          theme: "light",
          viewport,
        };

        await storageAPI.startTest(newRun.runId, identifier);
      }

      const tests = await storageAPI.listTestsForRun(newRun.runId);

      expect(tests).toHaveLength(3);
      expect(tests.map((t) => t.storyIdentifier.viewport)).toEqual(
        expect.arrayContaining(viewports)
      );
    });
  });

  /**
   * Tests for run summary updates
   * Verifies that the run summary is properly updated when tests pass, fail, or have other statuses
   */
  describe("Run Summary Updates", () => {
    let run: NewVisualTestRun;

    /**
     * Create a new test run before each test in this section
     */
    beforeEach(async () => {
      run = await storageAPI.startRun(0);
    });

    /**
     * Tests that the run summary is updated correctly when a test passes
     */
    it("should update run summary when test passes", async () => {
      const identifier: StoryIdentifier = {
        storyId: "test-1",
        theme: "light",
        viewport: { width: 1920, height: 1080 },
      };

      await storageAPI.startTest(run.runId, identifier);

      await storageAPI.finishTest(run.runId, {
        storyIdentifier: identifier,
        status: "passed",
        baseline: createTestImageBuffer("baseline"),
        current: createTestImageBuffer("current"),
        diff: null,
        diffRatio: null,
        message: "My Message",
      });

      const updatedRun = await storageAPI.getRun(run.runId);
      expect(updatedRun?.summary?.total).toBe(0);
      expect(updatedRun?.summary?.finished).toBe(1);
      expect(updatedRun?.summary?.passed).toBe(1);
      expect(updatedRun?.summary?.failed).toBe(0);
    });

    /**
     * Tests that the run summary is updated correctly when a test fails
     */
    it("should update run summary when test fails", async () => {
      const identifier: StoryIdentifier = {
        storyId: "test-2",
        theme: "light",
        viewport: { width: 1920, height: 1080 },
      };

      await storageAPI.startTest(run.runId, identifier);

      await storageAPI.finishTest(run.runId, {
        storyIdentifier: identifier,
        status: "failed",
        baseline: createTestImageBuffer("baseline"),
        current: createTestImageBuffer("current"),
        diff: createTestImageBuffer("diff"),
        diffRatio: 2,
        message: "My Failed Message",
      });

      const updatedRun = await storageAPI.getRun(run.runId);
      expect(updatedRun?.summary?.total).toBe(0);
      expect(updatedRun?.summary?.finished).toBe(1);
      expect(updatedRun?.summary?.passed).toBe(0);
      expect(updatedRun?.summary?.failed).toBe(1);
    });

    /**
     * Tests that the run summary correctly tracks multiple test statuses (passed, failed, new)
     */
    it("should track multiple test statuses correctly", async () => {
      const tests = [
        { id: "test-1", status: "passed" as const },
        { id: "test-2", status: "passed" as const },
        { id: "test-3", status: "failed" as const },
        { id: "test-4", status: "new" as const },
      ];

      for (const test of tests) {
        const identifier: StoryIdentifier = {
          storyId: test.id,
          theme: "light",
          viewport: { width: 1920, height: 1080 },
        };

        await storageAPI.startTest(run.runId, identifier);

        await storageAPI.finishTest(run.runId, {
          storyIdentifier: identifier,
          status: test.status,
          baseline: createTestImageBuffer("baseline"),
          current: createTestImageBuffer("current"),
          diff: null,
          diffRatio: null,
          message: "My Message",
        });
      }

      const updatedRun = await storageAPI.getRun(run.runId);
      expect(updatedRun?.summary?.total).toBe(0);
      expect(updatedRun?.summary?.finished).toBe(4);
      expect(updatedRun?.summary?.passed).toBe(2);
      expect(updatedRun?.summary?.failed).toBe(1);
      expect(updatedRun?.summary?.new).toBe(1);
    });
  });

  /**
   * Tests for baseline management
   * Verifies that baseline images can be retrieved, accepted, and managed properly
   */
  describe("Baseline Management", () => {
    const mockStoryIdentifier: StoryIdentifier = {
      storyId: "baseline-test",
      theme: "dark",
      viewport: { width: 1920, height: 1080 },
    };
    let run: NewVisualTestRun;

    /**
     * Create a new test run before each test in this section
     */
    beforeEach(async () => {
      run = await storageAPI.startRun(0);
    });

    /**
     * Tests that an existing baseline is retrieved when starting a new test
     */
    it("should retrieve existing baseline for new test", async () => {
      const baselinePath = await storageAPI.saveImage(
        run.runId,
        mockStoryIdentifier,
        createTestImageBuffer("baseline"),
        "baseline"
      );

      const newTest = await storageAPI.startTest(
        run.runId,
        mockStoryIdentifier
      );

      expect(newTest.baseline).toEqual(baselinePath);
    });

    /**
     * Tests that accepting a baseline updates the test status and replaces the baseline image
     */
    it("should accept baseline and update test status", async () => {
      await storageAPI.startTest(run.runId, mockStoryIdentifier);

      const mockBaseline = createTestImageBuffer("baseline");
      const mockCurrent = createTestImageBuffer("current");
      const mockDiff = createTestImageBuffer("diff");

      await storageAPI.finishTest(run.runId, {
        storyIdentifier: mockStoryIdentifier,
        status: "failed",
        baseline: mockBaseline,
        current: mockCurrent,
        diff: mockDiff,
        diffRatio: 0.15,
        message: "Finished",
      });

      // Accept the new baseline
      await storageAPI.acceptBaseline(run.runId, mockStoryIdentifier);

      const updatedTest = await storageAPI.getTest(
        run.runId,
        mockStoryIdentifier
      );

      const expectedBaselinePath = getExpectedImagePath(
        run.runId,
        mockStoryIdentifier,
        "baseline"
      );
      expect(updatedTest?.baseline).toBe(expectedBaselinePath);
      await expect(readFile(expectedBaselinePath)).resolves.toStrictEqual(
        mockCurrent
      );
      expect(updatedTest?.diff).toBeNull();
      expect(updatedTest?.diffRatio).toBeNull();
      expect(updatedTest?.status).toBe("passed");
    });

    /**
     * Tests that attempting to accept a baseline for a non-existent test throws an error
     */
    it("should throw error when accepting baseline for non-existent test", async () => {
      const nonExistentIdentifier: StoryIdentifier = {
        storyId: "does-not-exist",
        theme: "light",
        viewport: { width: 1920, height: 1080 },
      };

      await expect(
        storageAPI.acceptBaseline(run.runId, nonExistentIdentifier)
      ).rejects.toThrow("Test not found");
    });
  });

  /**
   * Tests for complex scenarios
   * Verifies that the API can handle complete test run workflows and concurrent operations
   */
  describe("Complex Scenarios", () => {
    /**
     * Tests the complete workflow of a test run from start to finish
     * including multiple tests with different statuses
     */
    it("should handle complete test run workflow", async () => {
      // 1. Start run
      const run = await storageAPI.startRun(3);
      const runId = run.runId;

      // 2. Run multiple tests
      const tests = [
        {
          identifier: {
            storyId: "button-primary",
            theme: "light" as const,
            viewport: { width: 1920, height: 1080 },
          },
          finalStatus: "passed" as const,
        },
        {
          identifier: {
            storyId: "button-secondary",
            theme: "dark" as const,
            viewport: { width: 1920, height: 1080 },
          },
          finalStatus: "failed" as const,
        },
        {
          identifier: {
            storyId: "card-component",
            theme: "light" as const,
            viewport: { width: 1280, height: 720 },
          },
          finalStatus: "new" as const,
        },
      ];

      for (const test of tests) {
        await storageAPI.startTest(runId, test.identifier);

        await storageAPI.finishTest(runId, {
          storyIdentifier: test.identifier,
          status: test.finalStatus,
          baseline: createTestImageBuffer("baseline"),
          current: createTestImageBuffer("current"),
          diff: null,
          diffRatio: null,
          message: "Finished Test",
        });
      }

      // 3. Finalize run
      await storageAPI.finishRun(runId, "passed");

      // 4. Verify final state
      const finalRun = await storageAPI.getRun(runId);
      expect(finalRun?.summary?.total).toBe(3);
      expect(finalRun?.summary?.finished).toBe(3);
      expect(finalRun?.summary?.passed).toBe(1);
      expect(finalRun?.summary?.failed).toBe(1);
      expect(finalRun?.summary?.new).toBe(1);
      expect(finalRun?.finishedAt).toBeDefined();
      expect(finalRun?.duration).toBeGreaterThan(0);

      const allTests = await storageAPI.listTestsForRun(runId);
      expect(allTests).toHaveLength(3);
      expect(allTests.map((t) => t.storyIdentifier)).toEqual(
        expect.arrayContaining(tests.map((t) => t.identifier))
      );
    });

    /**
     * Tests that the API can handle concurrent test updates correctly
     * without data corruption or race conditions
     */
    it("should handle concurrent test updates correctly", async () => {
      const run = await storageAPI.startRun(5);
      const runId = run.runId;

      const identifiers = Array.from({ length: 5 }, (_, i) => ({
        storyId: `concurrent-test-${i}`,
        theme: "light" as const,
        viewport: { width: 1920, height: 1080 },
      }));

      // Start all tests concurrently
      await Promise.all(
        identifiers.map((identifier) => {
          storageAPI.startTest(runId, identifier);
        })
      );

      // Finish all tests concurrently
      await Promise.all(
        identifiers.map((identifier) =>
          storageAPI.finishTest(runId, {
            storyIdentifier: identifier,
            status: "passed",
            baseline: createTestImageBuffer("baseline"),
            current: createTestImageBuffer("current"),
            diff: null,
            diffRatio: null,
            message: "Message",
          })
        )
      );

      const tests = await storageAPI.listTestsForRun(runId);
      expect(tests).toHaveLength(5);

      const finalRun = await storageAPI.getRun(runId);

      expect(finalRun?.summary?.total).toBe(5);
      expect(finalRun?.summary?.finished).toBe(5);
      expect(finalRun?.summary?.passed).toBe(5);
    });
  });

  /**
   * Tests for file operations
   * Verifies that images can be saved, retrieved, and deleted properly
   */
  describe("File Operations", () => {
    let run: NewVisualTestRun;

    /**
     * Create a new test run before each test in this section
     */
    beforeEach(async () => {
      run = await storageAPI.startRun(0);
    });

    /**
     * Tests for image saving functionality
     * Verifies that baseline, current, and diff images can be saved correctly
     */
    describe("Save Image", () => {
      for (const imageType of ["baseline", "current", "diff"]) {
        /**
         * Tests that each type of image (baseline, current, diff) can be saved correctly
         */
        it(`should save ${imageType} image`, async () => {
          const mockIdentifier: StoryIdentifier = {
            storyId: `mock-story-id-${imageType}`,
            theme: "dark",
            viewport: {
              width: 1920,
              height: 1080,
            },
          };
          const mockImage = createTestImageBuffer(imageType);

          const expectedSavedImagePath = getExpectedImagePath(
            run.runId,
            mockIdentifier,
            imageType as ImageType
          );

          const savedImagePath = await storageAPI.saveImage(
            run.runId,
            mockIdentifier,
            mockImage,
            imageType as ImageType
          );

          expect(savedImagePath).toEqual(expectedSavedImagePath);
          await expect(access(savedImagePath)).resolves.not.toThrow();
          await expect(readFile(savedImagePath)).resolves.toStrictEqual(
            mockImage
          );
        });
      }
    });

    /**
     * Tests that an image buffer can be retrieved from a file path
     */
    it("should get image buffer from filePath", async () => {
      const mockImage = createTestImageBuffer("mock");
      const savedImagePath = await storageAPI.saveImage(
        run.runId,
        {
          storyId: `mock-story-id`,
          theme: "dark",
          viewport: { width: 1920, height: 1080 },
        },
        mockImage,
        "baseline"
      );

      await expect(storageAPI.getImage(savedImagePath)).resolves.toEqual(
        mockImage
      );
    });

    /**
     * Tests that trying to get a non-existent image returns null
     */
    it("should return null when trying to get an image that does not exist", async () => {
      const mockFilePath = `${MOCK_STORAGE_ROOT}/baselines/baseline.png`;

      await expect(storageAPI.getImage(mockFilePath)).resolves.toBe(null);
    });

    /**
     * Tests that baseline existence can be properly checked
     */
    it("should properly check if baseline exists or not", async () => {
      const mockBaseline = createTestImageBuffer("baseline");
      const mockStoryIdentifier: StoryIdentifier = {
        storyId: "mock-story-id",
        theme: "light",
        viewport: {
          width: 1920,
          height: 1080,
        },
      };

      await expect(storageAPI.getBaseline(mockStoryIdentifier)).resolves.toBe(
        null
      );

      await storageAPI.saveImage(
        run.runId,
        mockStoryIdentifier,
        mockBaseline,
        "baseline"
      );

      await expect(
        storageAPI.getBaseline(mockStoryIdentifier)
      ).resolves.toEqual(mockBaseline);
    });

    /**
     * Tests that current and diff images can be deleted for a specific story identifier
     */
    it("should delete current and diff images for storyIdentifier of run ", async () => {
      const mockIdentifier: StoryIdentifier = {
        storyId: `mock-story-id-1`,
        theme: "dark",
        viewport: {
          width: 1920,
          height: 1080,
        },
      };
      const mockCurrent = createTestImageBuffer("current");
      const mockDiff = createTestImageBuffer("diff");

      const savedCurrentPath = await storageAPI.saveImage(
        run.runId,
        mockIdentifier,
        mockCurrent,
        "current"
      );

      const savedDiffPath = await storageAPI.saveImage(
        run.runId,
        mockIdentifier,
        mockDiff,
        "diff"
      );

      await expect(access(savedCurrentPath)).resolves.not.toThrow();
      await expect(access(savedDiffPath)).resolves.not.toThrow();

      await storageAPI.deleteTestImages(run.runId, mockIdentifier);

      await expect(access(savedCurrentPath)).rejects.toThrow();
      await expect(access(savedDiffPath)).rejects.toThrow();
    });

    /**
     * Tests that baseline images can be deleted for a specific story identifier
     */
    it("should delete baseline of storyIdentifier ", async () => {
      const mockIdentifier: StoryIdentifier = {
        storyId: `mock-story-id-2`,
        theme: "light",
        viewport: {
          width: 1920,
          height: 1080,
        },
      };
      const mockBaseline = createTestImageBuffer("baseline");

      const savedBaselinePath = await storageAPI.saveImage(
        run.runId,
        mockIdentifier,
        mockBaseline,
        "baseline"
      );

      await expect(access(savedBaselinePath)).resolves.not.toThrow();

      await storageAPI.deleteBaseline(mockIdentifier);

      await expect(access(savedBaselinePath)).rejects.toThrow();
    });
  });

  /**
   * Tests for data persistence
   * Verifies that data persists across Redis restarts using RDB and AOF persistence
   */
  describe(`Data Persistence`, () => {
    /**
     * Tests that data persists to Redis dump files and can be retrieved after restart
     */
    it(`should persist data to 'dump.rdb`, async () => {
      const redisPersistencePath = join(__dirname, "redis-test-data");

      const launchRedisWithPersistence = async (port: number) => {
        const container = await new RedisContainer("redis:8")
          .withPersistence(redisPersistencePath) //Redis config set 'save 1 1' (export to .rdb every second if at least one change has been made)
          .withExposedPorts(port)
          .start();

        // Set 'appendfsync always' as that is probably fine for us to use in production (AOF append only persistence on every db query)
        await container.executeCliCmd("config", [
          "set",
          "appendfsync",
          "always",
        ]); // Check that the config is set correctly with : `res = await container.executeCliCmd("config", ["get","appendfsync"]);

        return container;
      };

      const stopContainer = async (container: StartedRedisContainer) => {
        return await container.stop({
          remove: true,
          removeVolumes: true,
        });
      };

      //Spine up redis
      const firstRedisInstance = await launchRedisWithPersistence(6378);

      // Connect, create some data, disconnect and stop/remove the redis instance
      await storageAPI.disconnect();
      await storageAPI.connect({ url: firstRedisInstance.getConnectionUrl() });
      const newRun = await storageAPI.startRun(0);
      await storageAPI.disconnect();
      await stopContainer(firstRedisInstance);

      // Spine up a second clean instance
      const secondRedisInstance = await launchRedisWithPersistence(6377);

      // Connect and try to retrieve data created by the first instance
      await storageAPI.connect({ url: secondRedisInstance.getConnectionUrl() });
      const persistedRun = await storageAPI.getRun(newRun.runId);
      await storageAPI.disconnect();
      await stopContainer(secondRedisInstance);

      //Cleanup: Delete everything except '.gitkeep' files (theses directories are prepared to avoid permissions issues when redis creates them)
      (await readdir(`${redisPersistencePath}`, { recursive: true })).map(
        async (file) =>
          file.includes(".gitkeep") ||
          (file !== "appendonlydir" &&
            (await unlink(`${redisPersistencePath}/${file}`)))
      );

      await storageAPI.connect({ url: redisUrl });

      expect(persistedRun).toStrictEqual(newRun);
    });
  });

  /**
   * Tests for edge cases
   * Verifies proper handling of non-existent data and empty collections
   */
  describe("Edge Cases", () => {
    /**
     * Tests that getting a non-existent run returns null
     */
    it("should return null for non-existent run", async () => {
      const result = await storageAPI.getRun("non-existent-run");
      expect(result).toBeNull();
    });

    /**
     * Tests that getting a non-existent test returns null
     */
    it("should return null for non-existent test", async () => {
      const identifier: StoryIdentifier = {
        storyId: "does-not-exist",
        theme: "light",
        viewport: { width: 1920, height: 1080 },
      };

      const result = await storageAPI.getTest("non-existent-run", identifier);
      expect(result).toBeNull();
    });

    /**
     * Tests that listing tests for a run with no tests returns an empty array
     */
    it("should return empty array when listing tests for run with no tests", async () => {
      const runId = "empty-run";
      await storageAPI.startRun(0);

      const tests = await storageAPI.listTestsForRun(runId);
      expect(tests).toEqual([]);
    });
  });

  /**
   * Tests for error handling
   * Verifies that appropriate errors are thrown when operations are performed without connection
   */
  describe("Error Handling", () => {
    /**
     * Tests that operations throw an error when called without an active Redis connection
     */
    it("should throw error when operations are called without connection", async () => {
      await storageAPI.disconnect();

      await expect(storageAPI.startRun(0)).rejects.toThrow(
        "Redis not connected"
      );
    });
  });
});
