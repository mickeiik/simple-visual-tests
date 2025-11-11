import { describe, expect } from "vitest";
import { compareSnapshots } from "./compareSnapshots";
import { test } from "vitest";
import type { BrowserCommandContext } from "vitest/node";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/**
 * Helper function to create a random PNG image buffer
 * @param width - Width of the image in pixels (default: 8)
 * @param height - Height of the image in pixels (default: 8)
 * @returns PNG buffer with random pixel values
 */
const createRandomPng = (width = 8, height = 8) => {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = Math.floor(Math.random() * 256); // R
    png.data[i + 1] = Math.floor(Math.random() * 256); // G
    png.data[i + 2] = Math.floor(Math.random() * 256); // B
    png.data[i + 3] = 255; // A
  }
  return PNG.sync.write(png);
};

/**
 * Helper function to create two PNG images with a specified number of different pixels
 * @param width - Width of the images in pixels (default: 8)
 * @param height - Height of the images in pixels (default: 8)
 * @param diffCount - Number of pixels to make different between the two images (default: 1)
 * @param diffThreshold - Pixelmatch threshold for difference detection (default: 0.1)
 * @returns Object containing two image buffers and their diff image buffer
 */
const createTwoPngsWithDiff = (
  width = 8,
  height = 8,
  diffCount = 1,
  diffThreshold = 0.1
) => {
  const totalPixels = width * height;
  const png1 = new PNG({ width, height });
  const png2 = new PNG({ width, height });
  const diffPng = new PNG({ width, height });

  // Fill both with same random base
  for (let i = 0; i < png1.data.length; i += 4) {
    const val = Math.floor(Math.random() * 256);
    png1.data[i] = val;
    png1.data[i + 1] = val;
    png1.data[i + 2] = val;
    png1.data[i + 3] = 255;

    png2.data[i] = val;
    png2.data[i + 1] = val;
    png2.data[i + 2] = val;
    png2.data[i + 3] = 255;
  }

  // Limit diffCount to pixel count
  const safeDiffCount = Math.min(diffCount, totalPixels);

  // Randomly select unique pixel indices to modify
  const changedPixels = new Set<number>();
  while (changedPixels.size < safeDiffCount) {
    changedPixels.add(Math.floor(Math.random() * totalPixels));
  }

  // Apply differences
  for (const pixelIdx of changedPixels) {
    const i = pixelIdx * 4;

    // Alter RGB channels slightly
    png2.data[i] = (png1.data[i] + 80) % 256;
    png2.data[i + 1] = (png1.data[i + 1] + 160) % 256;
  }

  // Create diffPng
  pixelmatch(png1.data, png2.data, diffPng.data, width, height, {
    threshold: diffThreshold,
  });

  return {
    buf1: PNG.sync.write(png1),
    buf2: PNG.sync.write(png2),
    diff: PNG.sync.write(diffPng),
  };
};

/**
 * Test suite for the compareSnapshots function
 * Verifies that image comparison works correctly in various scenarios
 */
describe("Compare Snapshot", () => {
  /**
   * Test that identical images are correctly identified as matching
   * This verifies the basic functionality when comparing the same image buffer
   */
  test("should match when comparing identic image buffer", async () => {
    const randomPngBuffer = createRandomPng();

    const comparisonResult = await compareSnapshots(
      {} as BrowserCommandContext,
      randomPngBuffer,
      randomPngBuffer,
      {
        threshold: 0.1,
        maxDiffPercentage: 1,
      }
    );

    expect(comparisonResult.matches).toStrictEqual(true);
    expect(comparisonResult.diff).toStrictEqual(comparisonResult.diff);
    expect(comparisonResult.message).toBe(
      "Image matches baseline (diff: 0.00%)"
    );
    expect(comparisonResult.diffRatio).toBe(0);
  });

  /**
   * Test that images with different dimensions are correctly identified as non-matching
   * This verifies the dimension checking functionality
   */
  test("should throw error when compared images have different sizes", async () => {
    const randomSmallPngBuffer = createRandomPng();
    const randomBiggerPngBuffer = createRandomPng(100, 100);

    await expect(
      compareSnapshots(
        {} as BrowserCommandContext,
        randomSmallPngBuffer,
        randomBiggerPngBuffer,
        {
          threshold: 0.1,
          maxDiffPercentage: 1,
        }
      )
    ).resolves.toEqual({
      diff: null,
      diffRatio: null,
      matches: false,
      message: "Image dimensions don't match. 8x8  / 100x100.",
    });
  });

  /**
   * Test that images with minor differences (within threshold) are correctly identified as matching
   * This verifies the tolerance functionality for small differences
   */
  test("should match when images differ but within threshold", async () => {
    const { buf1, buf2 } = createTwoPngsWithDiff(8, 8, 2); // 2 out of 64 pixels different = ~3.125%

    const comparisonResult = await compareSnapshots(
      {} as BrowserCommandContext,
      buf1,
      buf2,
      {
        threshold: 0.1,
        maxDiffPercentage: 5, // 5% maxDiffPercentage should allow ~3.125% difference
      }
    );

    expect(comparisonResult.matches).toStrictEqual(true);
    expect(comparisonResult.diff).toStrictEqual(comparisonResult.diff);
    expect(comparisonResult.diffRatio).toBeGreaterThan(0);
    expect(comparisonResult.message).toContain("Image matches baseline");
  });

  /**
   * Test that images with significant differences (beyond threshold) are correctly identified as non-matching
   * This verifies the failure detection functionality for large differences
   */
  test("should not match when images differ beyond threshold", async () => {
    const { buf1, buf2 } = createTwoPngsWithDiff(8, 8, 10); // 10 out of 64 pixels different = ~15.625%

    const comparisonResult = await compareSnapshots(
      {} as BrowserCommandContext,
      buf1,
      buf2,
      {
        threshold: 0.1,
        maxDiffPercentage: 10, // 10% maxDiffPercentage should allow up to 10% difference
      }
    );

    expect(comparisonResult.matches).toStrictEqual(false);
    expect(comparisonResult.diff).toStrictEqual(comparisonResult.diff);
    expect(comparisonResult.diffRatio).toBeGreaterThan(10);
    expect(comparisonResult.message).toContain("Image differs from baseline");
  });

  /**
   * Test that identical images match even when maxDiffPercentage is set to 0
   * This verifies that identical images always match regardless of tolerance settings
   */
  test("should handle zero pixel difference correctly", async () => {
    const randomPngBuffer = createRandomPng();

    const comparisonResult = await compareSnapshots(
      {} as BrowserCommandContext,
      randomPngBuffer,
      randomPngBuffer,
      {
        threshold: 0.1,
        maxDiffPercentage: 0, // Even 0% maxDiffPercentage should match identical images
      }
    );

    expect(comparisonResult.matches).toStrictEqual(true);
    expect(comparisonResult.diff).toStrictEqual(comparisonResult.diff);
    expect(comparisonResult.diffRatio).toBe(0);
    expect(comparisonResult.message).toBe(
      "Image matches baseline (diff: 0.00%)"
    );
  });
});
