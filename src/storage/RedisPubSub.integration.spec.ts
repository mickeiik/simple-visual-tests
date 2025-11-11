/**
 * Integration tests for Redis publish/subscribe functionality
 * These tests verify the complete pub/sub capabilities of the VisualTestStorageAPI
 * including event publishing to both per-run and global channels, subscription handling,
 * and real-time event notifications.
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
import type { NewVisualTestRun, PublishMsg, StoryIdentifier } from "../types";
import { rm } from "fs/promises";
import { createClient, type RedisClientType } from "redis";

// Image config and helpers
/**
 * Mock storage root directory for test images during integration tests
 */
const MOCK_STORAGE_ROOT = "./src/tests/spec-image-dir";

// Timeout constants
const DEFAULT_MESSAGE_TIMEOUT = 5000; // 5 seconds
const MESSAGE_POLLING_INTERVAL = 10; // 10ms polling

/**
 * Creates a fake image buffer for testing purposes
 * @param seed - String to use as the basis for the fake image data
 * @returns Buffer containing fake PNG data
 */
const createTestImageBuffer = (seed: string): Buffer => {
  return Buffer.from(`fake-png-data-${seed}`, "utf-8");
};

// Utility functions for better test management
type SubscriptionCleanup = () => Promise<void>;

/**
 * Helper function to subscribe to Redis channels with proper cleanup
 * @param client Redis client to subscribe with
 * @param channels Channels to subscribe to
 * @param messageHandler Handler for incoming messages
 * @returns Array of received messages and cleanup function
 */
const subscribeWithCleanup = async (
  client: RedisClientType,
  channels: string | string[],
  messageHandler?: (message: PublishMsg, channel: string) => void
): Promise<[PublishMsg[], SubscriptionCleanup]> => {
  const messages: PublishMsg[] = [];
  const channelList = Array.isArray(channels) ? channels : [channels];
  const cleanupFns: (() => void)[] = [];

  for (const channel of channelList) {
    const handler = (message: string) => {
      const parsedMessage = JSON.parse(message) as PublishMsg;
      messages.push(parsedMessage);
      if (messageHandler) {
        messageHandler(parsedMessage, channel);
      }
    };

    await client.subscribe(channel, handler);
    cleanupFns.push(() => client.unsubscribe(channel));
  }

  const cleanup = async () => {
    for (const fn of cleanupFns) {
      fn();
    }
  };

  return [messages, cleanup];
};

/**
 * Wait for a specific number of messages to be received
 * @param messages Array to monitor for messages
 * @param expectedCount Expected number of messages
 * @param timeoutMs Maximum time to wait in milliseconds
 */
const waitForMessages = (
  messages: PublishMsg[],
  expectedCount: number,
  timeoutMs: number = DEFAULT_MESSAGE_TIMEOUT
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (messages.length >= expectedCount) {
        resolve();
      } else if (Date.now() - startTime > timeoutMs) {
        reject(
          new Error(
            `Timeout waiting for ${expectedCount} messages. Got ${messages.length}`
          )
        );
      } else {
        setTimeout(check, MESSAGE_POLLING_INTERVAL);
      }
    };
    check();
  });
};

/**
 * Integration tests for Redis publish/subscribe functionality
 * These tests verify that events are properly published to Redis channels
 * and can be received by subscribers.
 */
describe("Redis Publish/Subscribe - Integration Tests", () => {
  let container: StartedRedisContainer;
  let redisUrl: string;
  let storageAPI: typeof import("../storage/VisualTestStorageAPI");
  let publisherClient: RedisClientType;
  let subscriberClient: RedisClientType;

  /**
   * Setup before all tests: start Redis container, import storage API module,
   * and establish initial connection to Redis
   */
  beforeAll(async () => {
    // Mock storage root env variable before importing storage module
    vi.stubEnv("VITE_VISUAL_TEST_IMAGES_PATH", MOCK_STORAGE_ROOT);
    storageAPI = await import("../storage/VisualTestStorageAPI");

    // Start Redis container
    container = await new RedisContainer("redis:8")
      .withExposedPorts(6379)
      .start();
    redisUrl = container.getConnectionUrl();

    // Connect to Redis
    await storageAPI.connect({ url: redisUrl });

    // Create separate publisher and subscriber clients for pub/sub testing
    publisherClient = createClient({ url: redisUrl });
    subscriberClient = createClient({ url: redisUrl });
    await publisherClient.connect();
    await subscriberClient.connect();
  });

  /**
   * Cleanup after all tests: flush Redis data, disconnect, stop container,
   * remove test image directory, and restore environment variables
   */
  afterAll(async () => {
    const client = await storageAPI.connect({ url: redisUrl });
    await client.flushAll();
    await storageAPI.disconnect();
    await publisherClient?.destroy();
    await subscriberClient?.destroy();
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
   * Tests for basic publish functionality
   * Verifies that the API can publish events to Redis channels
   */
  describe("Publish Events", () => {
    /**
     * Tests that events can be published to Redis channels
     */
    it("should publish events to Redis channels", async () => {
      // Subscribe to the global events channel to capture all events
      const [globalChannelMessages, cleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Start a run which will trigger the run:started event
        const testRun = await storageAPI.startRun(1);

        // Wait for messages to be received
        await waitForMessages(globalChannelMessages, 1);

        // Verify that events were published
        expect(globalChannelMessages.length).toBeGreaterThan(0);

        // Verify at least one run:started event was published
        const runStartedEvents = globalChannelMessages.filter(
          (msg) => msg.type === "run:started"
        );
        expect(runStartedEvents.length).toBeGreaterThan(0);
        expect(runStartedEvents[0].runId).toBe(testRun.runId);
      } finally {
        await cleanup();
      }
    });

    /**
     * Tests that events are published with correct message format
     */
    it("should publish events with correct message format", async () => {
      const eventType = "run:started";
      const payload = { testCount: 5 };

      // Subscribe to the channel to capture the message
      const [receivedMessages, cleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Start a run which will trigger the run:started event
        const testRun = await storageAPI.startRun(payload.testCount);

        // Wait for messages to be received
        await waitForMessages(receivedMessages, 1);

        // Verify the message format
        const runStartedMessage = receivedMessages.find(
          (msg) => msg.type === eventType
        );
        expect(runStartedMessage).toBeDefined();
        expect(runStartedMessage!.type).toBe(eventType);
        expect(runStartedMessage!.runId).toBe(testRun.runId);
        expect(runStartedMessage!.payload.runId).toBe(testRun.runId);
        expect(runStartedMessage!.payload.testCount).toBe(payload.testCount);
        expect(runStartedMessage!.timestamp).toBeTypeOf("number");
        expect(runStartedMessage!.timestamp).toBeLessThanOrEqual(Date.now());
      } finally {
        await cleanup();
      }
    });

    /**
     * Tests that events are published to both per-run and global channels
     */
    it("should publish to both per-run and global channels", async () => {
      const mockStoryIdentifier: StoryIdentifier = {
        storyId: "test-story",
        theme: "light",
        viewport: { width: 1024, height: 768 },
      };

      // Start a run first to get a valid runId
      const testRun = await storageAPI.startRun(1);

      // Subscribe to both channels to capture messages
      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${testRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Start a test which will trigger the test:started event
        await storageAPI.startTest(testRun.runId, mockStoryIdentifier);

        // Wait for messages to be received on both channels
        await Promise.all([
          waitForMessages(runChannelMessages, 1),
          waitForMessages(globalChannelMessages, 1),
        ]);

        // Verify both channels received the message
        const runStartedMsg = runChannelMessages.find(
          (msg) => msg.type === "test:started"
        );
        const globalStartedMsg = globalChannelMessages.find(
          (msg) => msg.type === "test:started"
        );

        expect(runStartedMsg).toBeDefined();
        expect(globalStartedMsg).toBeDefined();

        expect(runStartedMsg!.type).toBe("test:started");
        expect(globalStartedMsg!.type).toBe("test:started");
        expect(runStartedMsg!.runId).toBe(testRun.runId);
        expect(globalStartedMsg!.runId).toBe(testRun.runId);
        expect(runStartedMsg!.payload.status).toBe("running");
        expect(globalStartedMsg!.payload.status).toBe("running");
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });
  });

  /**
   * Tests for event publishing during actual operations
   * Verifies that events are published during real test operations
   */
  describe("Event Publishing During Operations", () => {
    const mockStoryIdentifier: StoryIdentifier = {
      storyId: "button-primary",
      theme: "dark",
      viewport: { width: 1920, height: 1080 },
    };

    let newRun: NewVisualTestRun;

    beforeEach(async () => {
      newRun = await storageAPI.startRun(1);
    });

    /**
     * Tests that run:started event is published when starting a run
     */
    it("should publish run:started event when starting a run", async () => {
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Start a new run (which should trigger run:started event)
        const anotherRun = await storageAPI.startRun(2);

        // Wait for messages to be received
        await waitForMessages(globalChannelMessages, 1);

        // Verify run:started event was published
        const runStartedGlobal = globalChannelMessages.find(
          (msg) => msg.type === "run:started"
        );
        expect(runStartedGlobal).toBeDefined();
        expect(runStartedGlobal!.type).toBe("run:started");
        expect(runStartedGlobal!.runId).toBe(anotherRun.runId);
        expect(runStartedGlobal!.payload.runId).toBe(anotherRun.runId);
        expect(runStartedGlobal!.payload.testCount).toBe(2);
      } finally {
        await globalCleanup();
      }
    });

    /**
     * Tests that test:started event is published when starting a test
     */
    it("should publish test:started event when starting a test", async () => {
      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${newRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Start a test (which should trigger test:started event)
        await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

        // Wait for messages to be received
        await Promise.all([
          waitForMessages(runChannelMessages, 1),
          waitForMessages(globalChannelMessages, 1),
        ]);

        // Verify test:started event was published
        const testStartedRun = runChannelMessages.find(
          (msg) => msg.type === "test:started"
        );
        const testStartedGlobal = globalChannelMessages.find(
          (msg) => msg.type === "test:started"
        );

        expect(testStartedRun).toBeDefined();
        expect(testStartedGlobal).toBeDefined();
        expect(testStartedRun!.type).toBe("test:started");
        expect(testStartedGlobal!.type).toBe("test:started");
        expect(testStartedRun!.runId).toBe(newRun.runId);
        expect(testStartedGlobal!.runId).toBe(newRun.runId);
        expect(testStartedRun!.payload.status).toBe("running");
        expect(testStartedGlobal!.payload.status).toBe("running");
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });

    /**
     * Tests that test:updated event is published when updating a test
     */
    it("should publish test:updated event when updating a test", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${newRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Update the test (which should trigger test:updated event)
        await storageAPI.updateTest(newRun.runId, mockStoryIdentifier, {
          status: "passed",
          diffRatio: 0.05,
        });

        // Wait for messages to be received
        await Promise.all([
          waitForMessages(runChannelMessages, 1),
          waitForMessages(globalChannelMessages, 1),
        ]);

        // Verify test:updated event was published
        const testUpdatedRun = runChannelMessages.find(
          (msg) => msg.type === "test:updated"
        );
        const testUpdatedGlobal = globalChannelMessages.find(
          (msg) => msg.type === "test:updated"
        );

        expect(testUpdatedRun).toBeDefined();
        expect(testUpdatedGlobal).toBeDefined();
        expect(testUpdatedRun!.type).toBe("test:updated");
        expect(testUpdatedGlobal!.type).toBe("test:updated");
        expect(testUpdatedRun!.payload.status).toBe("passed");
        expect(testUpdatedRun!.payload.diffRatio).toBe(0.05);
        expect(testUpdatedGlobal!.payload.status).toBe("passed");
        expect(testUpdatedGlobal!.payload.diffRatio).toBe(0.05);
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });

    /**
     * Tests that test:finished event is published when finishing a test
     */
    it("should publish test:finished event when finishing a test", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${newRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Finish the test (which should trigger test:finished event)
        await storageAPI.finishTest(newRun.runId, {
          storyIdentifier: mockStoryIdentifier,
          status: "passed",
          baseline: createTestImageBuffer("baseline"),
          current: createTestImageBuffer("current"),
          diff: null,
          diffRatio: 0.05,
          message: "Test passed",
        });

        // Wait for messages to be received
        await Promise.all([
          waitForMessages(runChannelMessages, 2), // test:finished + run:summary
          waitForMessages(globalChannelMessages, 2), // test:finished + run:summary
        ]);

        // Verify test:finished event was published
        const testFinishedRun = runChannelMessages.find(
          (msg) => msg.type === "test:finished"
        );
        const testFinishedGlobal = globalChannelMessages.find(
          (msg) => msg.type === "test:finished"
        );

        expect(testFinishedRun).toBeDefined();
        expect(testFinishedGlobal).toBeDefined();
        expect(testFinishedRun!.type).toBe("test:finished");
        expect(testFinishedGlobal!.type).toBe("test:finished");
        expect(testFinishedRun!.payload.status).toBe("passed");
        expect(testFinishedGlobal!.payload.status).toBe("passed");
        expect(testFinishedRun!.payload.diffRatio).toBe(0.05);
        expect(testFinishedGlobal!.payload.diffRatio).toBe(0.05);
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });

    /**
     * Tests that run:summary event is published when finishing a test
     */
    it("should publish run:summary event when finishing a test", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${newRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Finish the test (which should trigger run:summary event)
        await storageAPI.finishTest(newRun.runId, {
          storyIdentifier: mockStoryIdentifier,
          status: "passed",
          baseline: createTestImageBuffer("baseline"),
          current: createTestImageBuffer("current"),
          diff: null,
          diffRatio: 0.05,
          message: "Test passed",
        });

        // Wait for messages to be received
        await Promise.all([
          waitForMessages(runChannelMessages, 2), // test:finished + run:summary
          waitForMessages(globalChannelMessages, 2), // test:finished + run:summary
        ]);

        // Verify run:summary event was published
        const runSummaryRun = runChannelMessages.find(
          (msg) => msg.type === "run:summary"
        );
        const runSummaryGlobal = globalChannelMessages.find(
          (msg) => msg.type === "run:summary"
        );

        expect(runSummaryRun).toBeDefined();
        expect(runSummaryGlobal).toBeDefined();
        expect(runSummaryRun!.type).toBe("run:summary");
        expect(runSummaryGlobal!.type).toBe("run:summary");
        expect(runSummaryRun!.payload.summary).toBeDefined();
        expect(runSummaryGlobal!.payload.summary).toBeDefined();
        expect(runSummaryRun!.payload.summary.finished).toBe(1);
        expect(runSummaryGlobal!.payload.summary.finished).toBe(1);
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });

    /**
     * Tests that run:finished event is published when finishing a run
     */
    it("should publish run:finished event when finishing a run", async () => {
      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${newRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Finish the run (which should trigger run:finished event)
        await storageAPI.finishRun(newRun.runId, "passed");

        // Wait for messages to be received
        await Promise.all([
          waitForMessages(runChannelMessages, 2), // run:finished + run:summary
          waitForMessages(globalChannelMessages, 2), // run:finished + run:summary
        ]);

        // Verify run:finished event was published
        const runFinishedRun = runChannelMessages.find(
          (msg) => msg.type === "run:finished"
        );
        const runFinishedGlobal = globalChannelMessages.find(
          (msg) => msg.type === "run:finished"
        );

        expect(runFinishedRun).toBeDefined();
        expect(runFinishedGlobal).toBeDefined();
        expect(runFinishedRun!.type).toBe("run:finished");
        expect(runFinishedGlobal!.type).toBe("run:finished");
        expect(runFinishedRun!.payload.reason).toBe("passed");
        expect(runFinishedGlobal!.payload.reason).toBe("passed");
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });

    /**
     * Tests that baseline:accepted event is published when accepting a baseline
     */
    it("should publish baseline:accepted event when accepting a baseline", async () => {
      await storageAPI.startTest(newRun.runId, mockStoryIdentifier);

      await storageAPI.finishTest(newRun.runId, {
        storyIdentifier: mockStoryIdentifier,
        status: "failed",
        baseline: createTestImageBuffer("baseline"),
        current: createTestImageBuffer("current"),
        diff: createTestImageBuffer("diff"),
        diffRatio: 0.15,
        message: "Test failed",
      });

      const [runChannelMessages, runCleanup] = await subscribeWithCleanup(
        subscriberClient,
        `visualrun:${newRun.runId}:channel`
      );
      const [globalChannelMessages, globalCleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Accept the baseline (which should trigger baseline:accepted event)
        await storageAPI.acceptBaseline(newRun.runId, mockStoryIdentifier);

        // Wait for messages to be received
        await waitForMessages(globalChannelMessages, 1);

        // Verify baseline:accepted event was published
        const baselineAcceptedRun = runChannelMessages.find(
          (msg) => msg.type === "baseline:accepted"
        );
        const baselineAcceptedGlobal = globalChannelMessages.find(
          (msg) => msg.type === "baseline:accepted"
        );

        expect(baselineAcceptedRun).toBeDefined();
        expect(baselineAcceptedGlobal).toBeDefined();
        expect(baselineAcceptedRun!.type).toBe("baseline:accepted");
        expect(baselineAcceptedGlobal!.type).toBe("baseline:accepted");
        expect(baselineAcceptedRun!.payload.storyIdentifier).toEqual(
          mockStoryIdentifier
        );
        expect(baselineAcceptedGlobal!.payload.storyIdentifier).toEqual(
          mockStoryIdentifier
        );
      } finally {
        await runCleanup();
        await globalCleanup();
      }
    });
  });

  /**
   * Tests for different event types
   * Verifies that all supported event types are properly published
   */
  describe("Different Event Types", () => {
    const mockStoryIdentifier: StoryIdentifier = {
      storyId: "event-test",
      theme: "light",
      viewport: { width: 1024, height: 768 },
    };

    let run: NewVisualTestRun;

    beforeEach(async () => {
      run = await storageAPI.startRun(1);
      await storageAPI.startTest(run.runId, mockStoryIdentifier);
    });

    it("should handle all supported event types", async () => {
      const [allEventMessages, cleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Trigger various events
        await storageAPI.updateTest(run.runId, mockStoryIdentifier, {
          status: "failed",
          diffRatio: 0.1,
        });

        await storageAPI.finishTest(run.runId, {
          storyIdentifier: mockStoryIdentifier,
          status: "failed",
          baseline: createTestImageBuffer("baseline"),
          current: createTestImageBuffer("current"),
          diff: createTestImageBuffer("diff"),
          diffRatio: 0.1,
          message: "Test failed",
        });

        await storageAPI.acceptBaseline(run.runId, mockStoryIdentifier);

        await storageAPI.finishRun(run.runId, "passed");

        // Wait for all expected messages (test:updated, test:finished, run:summary, baseline:accepted, run:finished, run:summary)
        await waitForMessages(allEventMessages, 6);

        // Verify all expected event types were published
        const eventTypes = allEventMessages.map((msg) => msg.type);
        expect(eventTypes).toContain("test:updated");
        expect(eventTypes).toContain("test:finished");
        expect(eventTypes).toContain("run:summary");
        expect(eventTypes).toContain("baseline:accepted");
        expect(eventTypes).toContain("run:finished");
      } finally {
        await cleanup();
      }
    });
  });

  /**
   * Tests for concurrent pub/sub operations
   * Verifies that pub/sub works correctly under concurrent load
   */
  describe("Concurrent Pub/Sub Operations", () => {
    it("should handle concurrent publish operations correctly", async () => {
      const run1 = await storageAPI.startRun(2);
      const run2 = await storageAPI.startRun(2);

      const [allEventMessages, cleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Concurrently start and finish tests on different runs
        const promises = [
          // Run 1 operations
          storageAPI.startTest(run1.runId, {
            storyId: "test-1-1",
            theme: "light",
            viewport: { width: 1920, height: 1080 },
          }),
          storageAPI.startTest(run1.runId, {
            storyId: "test-1-2",
            theme: "dark",
            viewport: { width: 1280, height: 720 },
          }),

          // Run 2 operations
          storageAPI.startTest(run2.runId, {
            storyId: "test-2-1",
            theme: "light",
            viewport: { width: 1920, height: 1080 },
          }),
          storageAPI.startTest(run2.runId, {
            storyId: "test-2-2",
            theme: "dark",
            viewport: { width: 1280, height: 720 },
          }),
        ];

        await Promise.all(promises);

        // Wait for messages to be received
        await waitForMessages(allEventMessages, 4);

        // Verify that test:started events were published for all tests
        const testStartedEvents = allEventMessages.filter(
          (msg) => msg.type === "test:started"
        );
        expect(testStartedEvents).toHaveLength(4);

        // Verify that events from both runs were received
        const run1Events = testStartedEvents.filter(
          (msg) => msg.runId === run1.runId
        );
        const run2Events = testStartedEvents.filter(
          (msg) => msg.runId === run2.runId
        );
        expect(run1Events).toHaveLength(2);
        expect(run2Events).toHaveLength(2);
      } finally {
        await cleanup();
      }
    });
  });

  /**
   * Tests for edge cases in pub/sub
   * Verifies proper handling of edge cases and error conditions
   */
  describe("Pub/Sub Edge Cases", () => {
    it("should handle rapid successive publications", async () => {
      const run = await storageAPI.startRun(1);
      const identifier: StoryIdentifier = {
        storyId: "rapid-test",
        theme: "light",
        viewport: { width: 1024, height: 768 },
      };

      const [allEventMessages, cleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Rapidly publish multiple events
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            storageAPI.startTest(run.runId, {
              ...identifier,
              storyId: `rapid-test-${i}`,
            })
          );
        }
        await Promise.all(promises);

        // Wait for all messages
        await waitForMessages(allEventMessages, 5);

        // Verify all events were received
        const testStartedEvents = allEventMessages.filter(
          (msg) => msg.type === "test:started"
        );
        expect(testStartedEvents).toHaveLength(5);
      } finally {
        await cleanup();
      }
    });

    it("should handle large payload publications through test operations", async () => {
      const run = await storageAPI.startRun(1);
      const mockStoryIdentifier: StoryIdentifier = {
        storyId: "large-payload-test",
        theme: "light",
        viewport: { width: 1024, height: 768 },
      };

      const largeBuffer = Buffer.from("x".repeat(10000)); // Large buffer payload
      const [receivedMessages, cleanup] = await subscribeWithCleanup(
        subscriberClient,
        "visualtest:events"
      );

      try {
        // Start a test which will trigger events with potentially large operations
        await storageAPI.startTest(run.runId, mockStoryIdentifier);

        // Update the test with a large buffer which should trigger test:updated event
        await storageAPI.updateTest(run.runId, mockStoryIdentifier, {
          status: "running",
          current: largeBuffer, // This creates a large payload when saving the image
        });

        // Wait for messages (test:started + test:updated)
        await waitForMessages(receivedMessages, 2);

        // Verify that events were received (there should be both test:started and test:updated events)
        expect(receivedMessages.length).toBeGreaterThanOrEqual(2);

        // Check that at least one event contains our test identifier
        const testEvents = receivedMessages.filter(
          (msg) => msg.payload.storyIdentifier?.storyId === "large-payload-test"
        );
        expect(testEvents.length).toBeGreaterThanOrEqual(2); // Should have both started and updated events
      } finally {
        await cleanup();
      }
    });
  });
});
