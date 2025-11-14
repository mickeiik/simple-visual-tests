/**
 * Visual test reporter for Vitest that integrates with Redis to track test execution
 * and results for visual regression testing.
 */

import type { Reporter } from "vitest/reporters";
import type { Vitest } from "vitest/node";
import type { SerializedError } from "@vitest/utils";
import { VisualTestStorageAPI } from "../storage/VisualTestStorageAPI";

import type { TestCase, TestModule, TestRunEndReason } from "vitest/node";
import type { RedisClientOptions } from "redis";

/**
 *
 */
export type VisualTestReporterOptions = {
  log?: boolean; // Disable reporter logging (use another reporter like vitest 'default' but keep saving data to Redis/Filesystem)
};

/**
 * Reporter class that handles visual test execution lifecycle
 */
export class VisualTestReporter implements Reporter {
  private runId!: string;
  private vitest!: Vitest;
  private visualTestStorageApi: VisualTestStorageAPI;
  private visualTestReporterOptions?: VisualTestReporterOptions;
  /**
   * Creates a new VisualTestReporter instance
   * @param redisOptions Redis client configuration options
   * @param visualTestReporterOptions VisualTestReporter configuration options
   */
  constructor(
    redisOptions: RedisClientOptions,
    visualTestReporterOptions?: VisualTestReporterOptions
  ) {
    this.visualTestStorageApi = new VisualTestStorageAPI(redisOptions);
    this.visualTestReporterOptions = visualTestReporterOptions;
  }

  /**
   * Initializes the reporter by connecting to Redis
   */
  async onInit(ctx: Vitest): Promise<void> {
    this.vitest = ctx;
    // Connect to Redis
    await this.visualTestStorageApi.connect();

    if (this.visualTestReporterOptions?.log)
      console.debug("[VisualTestReporter] Connected to Redis");

    return;
  }

  /**
   * Since the tests are dynamically created, the specifications do not contain the real test number
   * This commented-out approach would work for static test definitions but doesn't work for dynamic tests
   */
  // async onTestRunStart(
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
    // Basic error logging using vitest logger (keep vitest 'default' logger for better/prettier logging)
    testModule.errors().map((err) => {
      this.vitest.logger.printError(err, {
        fullStack: true,
      });
    });

    // Count only tests that will be executed (not skipped)
    const totalTests = Array.from(
      testModule.children.allTests("pending")
    ).length;

    const newRun = await this.visualTestStorageApi.startRun(totalTests);
    this.runId = newRun.runId;

    if (this.visualTestReporterOptions?.log)
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
    // Basic error logging using vitest logger
    testCase.result().errors?.map((err) => {
      this.vitest.logger.printError(err, {
        fullStack: true,
      });
    });

    if (testCase.options.mode !== "run") {
      // Ignore skipped tests
      return;
    }
    const storyIdentifier = testCase.meta().storyIdentifier;

    await this.visualTestStorageApi.startTest(this.runId, storyIdentifier);

    return;
  }

  /**
   * Handles test case results and updates the test status in Redis
   * @param testCase The test case with its result
   */
  async onTestCaseResult(testCase: TestCase): Promise<void> {
    // Basic error logging using vitest logger (keep vitest 'default' logger for better/prettier logging)
    testCase.result().errors?.map((err) => {
      this.vitest.logger.printError(err, {
        fullStack: true,
      });
    });

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
    await this.visualTestStorageApi.finishTest(this.runId, {
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

    if (this.visualTestReporterOptions?.log)
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
    const finishedRun = await this.visualTestStorageApi.finishRun(
      this.runId,
      reason
    );

    const { summary, duration } = finishedRun;

    if (this.visualTestReporterOptions?.log) {
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
        // Basic error logging using vitest logger (keep vitest 'default' logger for better/prettier logging)
        unhandledErrors.map((err) => {
          this.vitest.logger.printError(err, {
            fullStack: true,
          });
        });
      }
    }

    // Do not disconnect here to maintain Redis connection for potential UI interactions
    // This allows running specific tests from the Vitest UI without losing connection
    await this.visualTestStorageApi.disconnect();
    if (this.visualTestReporterOptions?.log)
      console.debug("[VisualTestReporter] Disconnected from Redis");

    return;
  }
}

export default VisualTestReporter;
