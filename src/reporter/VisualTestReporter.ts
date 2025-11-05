/**
 * Visual test reporter for Vitest that integrates with Redis to track test execution
 * and results for visual regression testing.
 */

import type { Reporter } from "vitest/reporters";
import type { SerializedError } from "@vitest/utils";
import * as VisualTestStorageAPI from "../storage/VisualTestStorageAPI";

import type { TestCase, TestModule, TestRunEndReason } from "vitest/node";
import type { RedisClientOptions } from "redis";

/**
 * Reporter class that handles visual test execution lifecycle
 */
export class VisualTestReporter implements Reporter {
  private runId!: string;
  private redisClientOptions: RedisClientOptions;

  /**
   * Creates a new VisualTestReporter instance
   * @param options Redis client configuration options
   */
  constructor(options: RedisClientOptions) {
    this.redisClientOptions = options;
  }

  /**
   * Initializes the reporter by connecting to Redis
   */
  async onInit(): Promise<void> {
    // Connect to Redis
    await VisualTestStorageAPI.connect(this.redisClientOptions);
    console.debug("[VisualTestReporter] Connected to Redis");

    return;
  }

  /**
   * Since the tests are dynamically created, the specifications do not contain the real test number
   * This commented-out approach would work for static test definitions but doesn't work for dynamic tests
   * async onTestRunStart(
   //   specifications: readonly TestSpecification[]
   // ): Promise<void> {
   //   const newRun = await VisualTestStorageAPI.startRun(specifications.length);
   //   this.runId = newRun.runId;

  //   console.log(
  //     `\n🎬 Visual test run started with ${specifications.length} tests (ID: ${this.runId})`
  //   );
  // }

  /**
   * Handles test module collection and starts a new test run
   * Uses 'onTestModuleCollected' instead of 'onTestRunStart' because tests are dynamically created
   * This ensures we count actual tests that will run rather than just specifications
   * @param testModule The collected test module containing test cases
   */
  async onTestModuleCollected(testModule: TestModule) {
    // Count only tests that will be executed (not skipped)
    const totalTests = Array.from(
      testModule.children.allTests("pending")
    ).length;

    const newRun = await VisualTestStorageAPI.startRun(totalTests);
    this.runId = newRun.runId;

    console.log(
      `\n🎬 Visual test run started with ${totalTests} tests (ID: ${this.runId})`
    );

    return;
  }

  /**
   * Handles test case preparation and starts tracking the test in Redis
   * @param testCase The test case that is ready to run
   */
  async onTestCaseReady(testCase: TestCase): Promise<void> {
    if (testCase.options.mode !== "run") {
      // Ignore skipped tests
      return;
    }
    const storyIdentifier = testCase.meta().storyIdentifier;

    await VisualTestStorageAPI.startTest(this.runId, storyIdentifier);

    return;
  }

  /**
   * Handles test case results and updates the test status in Redis
   * @param testCase The test case with its result
   */
  async onTestCaseResult(testCase: TestCase): Promise<void> {
    if (testCase.options.mode !== "run") {
      // Ignore skipped tests
      return;
    }

    const testMeta = testCase.meta();
    const storyIdentifier = testMeta.storyIdentifier;
    const visualTestResult = testMeta.visualTestResult;

    const { status, baseline, current, diff, diffRatio, message } =
      visualTestResult;

    // Store test result in Redis
    await VisualTestStorageAPI.finishTest(this.runId, {
      storyIdentifier,
      status,
      baseline,
      current,
      diff,
      diffRatio,
      message,
    });

    const {
      storyId,
      theme,
      viewport: { width, height },
    } = storyIdentifier;

    // Display test result with appropriate icon
    const icon = status === "passed" ? "✅" : status === "failed" ? "❌" : "🆕";

    console.log(`   ${icon} : ${storyId} ${theme} ${width}x${height}`);

    return;
  }

  /**
   * Handles the end of test run, displaying summary and cleaning up
   * @param testModules The test modules that were executed
   * @param unhandledErrors Any unhandled errors that occurred during the test run
   * @param reason The reason why the test run ended
   */
  async onTestRunEnd(
    //@ts-expect-error testModules declared but never read - Required for type compatibility but not used in this function
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason
  ): Promise<void> {
    const finishedRun = await VisualTestStorageAPI.finishRun(
      this.runId,
      reason
    );

    const { summary, duration } = finishedRun;

    console.log(`\n✅ Visual test run ended (${reason})`);
    console.log(
      `📊 Summary: ${summary.finished}/${summary.total} finished
          ✅ ${summary.passed} passed
          ❌ ${summary.failed} failed
          🆕 ${summary.new} new`
    );
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

    if (unhandledErrors.length > 0) {
      console.error(
        `[VisualTestReporter] ${unhandledErrors.length} unhandled errors occurred`,
        unhandledErrors
      );
    }

    // Do not disconnect here to maintain Redis connection for potential UI interactions
    // This allows running specific tests from the Vitest UI without losing connection
    // await VisualTestStorageAPI.disconnect();
    // console.debug("[VisualTestReporter] Disconnected from Redis");

    return;
  }
}

export default VisualTestReporter;
