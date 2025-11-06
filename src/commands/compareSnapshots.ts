import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { BrowserCommandContext } from "vitest/node";
import type { ComparisonResult } from "../types";

/**
 * Extends the BrowserCommands interface to add the compareSnapshots command
 * This allows the command to be available in Vitest browser contexts
 */
declare module "@vitest/browser/context" {
  interface BrowserCommands {
    /**
     * Compares two PNG image buffers pixel by pixel to detect visual differences
     *
     * This function performs a pixel-level comparison between two images, calculating
     * the percentage of different pixels and generating a visual diff image. The
     * comparison accounts for minor variations using a threshold value to determine
     * what constitutes a significant difference.
     *
     * @param ctx - Browser command context (required for type compatibility but unused)
     * @param lSnapshot - The baseline/left image snapshot as a Buffer
     * @param rSnapshot - The actual/right image snapshot as a Buffer
     * @param options - Configuration for the comparison
     * @param options.threshold - Pixel intensity difference threshold (0-1), values below this are considered equal
     * @param options.maxDiffPercentage - Maximum allowed difference percentage before images are considered different
     * @returns Promise resolving to a ComparisonResult with matches status, message, diff image and ratio
     *
     * @throws {Error} If images cannot be parsed as valid PNGs
     * @throws {Error} If pixelmatch encounters an unexpected error during comparison
     */
    compareSnapshots: (
      lSnapshot: Buffer,
      rSnapshot: Buffer,
      options: { threshold: number; maxDiffPercentage: number }
    ) => Promise<ComparisonResult>;
  }
}

/**
 * Compares two PNG image buffers pixel by pixel to detect visual differences
 *
 * This function performs a pixel-level comparison between two images, calculating
 * the percentage of different pixels and generating a visual diff image. The
 * comparison accounts for minor variations using a threshold value to determine
 * what constitutes a significant difference.
 *
 * @param ctx - Browser command context (required for type compatibility but unused)
 * @param lSnapshot - The baseline/left image snapshot as a Buffer
 * @param rSnapshot - The actual/right image snapshot as a Buffer
 * @param options - Configuration for the comparison
 * @param options.threshold - Pixel intensity difference threshold (0-1), values below this are considered equal
 * @param options.maxDiffPercentage - Maximum allowed difference percentage before images are considered different
 * @returns Promise resolving to a ComparisonResult with matches status, message, diff image and ratio
 *
 * @throws {Error} If images cannot be parsed as valid PNGs
 * @throws {Error} If pixelmatch encounters an unexpected error during comparison
 */
export const compareSnapshots: (
  ctx: BrowserCommandContext,
  lSnapshot: Buffer,
  rSnapshot: Buffer,
  options: { threshold: number; maxDiffPercentage: number }
) => Promise<ComparisonResult> = async (
  //@ts-expect-error ctx declared but never read - BrowserCommandContext is required for type compatibility but not used in this function
  ctx,
  lSnapshot,
  rSnapshot,
  { threshold, maxDiffPercentage }
) => {
  // Ensure we're working with Buffer instances to handle potential type variations
  lSnapshot = Buffer.from(lSnapshot);
  rSnapshot = Buffer.from(rSnapshot);

  // Initialize the comparison result with default values
  let comparisonResult: ComparisonResult = {
    matches: false,
    message: `Comparison result initialized`,
    diff: null,
    diffRatio: null,
  };

  // Parse both images using PNG.sync.read to extract pixel data
  // This operation may throw if the buffers are not valid PNG images
  const lImg = PNG.sync.read(lSnapshot);
  const rImg = PNG.sync.read(rSnapshot);

  // Validate that both images have identical dimensions
  // Pixel-by-pixel comparison requires same width and height
  if (lImg.width !== rImg.width || lImg.height !== rImg.height) {
    comparisonResult.message = `Image dimensions don't match. ${lImg.width}x${lImg.height}  / ${rImg.width}x${rImg.height}.`;

    return comparisonResult;
  }

  const { width, height } = lImg;
  // Create a new PNG instance for the diff image with the same dimensions
  const diff = new PNG({ width, height });

  // Perform pixel-by-pixel comparison using pixelmatch
  // The threshold parameter controls sensitivity: lower values detect more subtle differences
  const numDiffPixels = pixelmatch(
    lImg.data,
    rImg.data,
    diff.data,
    width,
    height,
    { threshold } // Pixel intensity difference threshold (0-1) - values below this are considered equal
  );

  // Calculate the percentage of different pixels relative to total pixels
  const diffRatio = (numDiffPixels / (width * height)) * 100;

  // Determine if the difference is within acceptable tolerance
  const matches = diffRatio <= maxDiffPercentage;

  // Update the comparison result with calculated values
  comparisonResult.matches = matches;
  comparisonResult.diff = PNG.sync.write(diff); // Serialize the diff PNG to buffer
  comparisonResult.diffRatio = diffRatio;
  comparisonResult.message = matches
    ? `Image matches baseline (diff: ${diffRatio.toFixed(2)}%)`
    : `Image differs from baseline by ${diffRatio.toFixed(
        2
      )}% (threshold: ${maxDiffPercentage}%).`;

  return comparisonResult;
};
