# Visual Test Matchers

Custom Vitest matchers for visual regression testing with Storybook.

## Overview

The matcher module provides **`toMatchStorySnapshot`**, a custom Vitest matcher for comparing visual snapshots against baseline images.

## API Reference

### `toMatchStorySnapshot(storyIdentifier, options)`

Custom matcher that compares a visual snapshot of a story against a baseline image.

**Parameters:**

- `storyIdentifier`: Unique identifier for the story to test
  - `storyId`: Storybook story ID
  - `theme`: Theme ("light" or "dark")
  - `viewport`: Viewport dimensions `{ width: number, height: number }`
- `options`: Configuration for the visual comparison
  - `threshold` (optional): Pixel intensity difference threshold (Default 0.1 = 10% difference allowed per pixel)
  - `maxDiffPercentage` (optional): Maximum percentage of pixels that can differ (Default 1 = 1% of total pixels)
  - `frameLocator` (optional): CSS Selector for the frame containing Storybook preview iframe (Default `#visualTestFrame`)
  - `locator` (optional): Element selector to screenshot inside frame (Default entire HTML document `html`)

**Returns:**
Promise resolving to `{ pass: boolean; message: () => string }`

**Modes:**

1. **Update Mode**: When `VITE_UPDATE_VISUAL_SNAPSHOTS=true`, creates new baseline images
2. **New Baseline Mode**: When no baseline exists, creates a new baseline and passes the test
3. **Comparison Mode**: When baseline exists, compares current snapshot with baseline and reports differences

## Usage Examples

### Basic Visual Snapshot Testing

```typescript
import { expect } from "vitest";

// Test a story with default options
await expect({
  storyId: "button--primary",
  theme: "light",
  viewport: { width: 1024, height: 768 },
}).toMatchStorySnapshot();

// Test with custom options
await expect({
  storyId: "card--with-image",
  theme: "dark",
  viewport: { width: 375, height: 667 },
}).toMatchStorySnapshot({
  threshold: 0.05, // 5% pixel difference tolerance
  maxDiffPercentage: 0.5, // 0.5% of total pixels can differ
  frameLocator: "#storybook-frame",
  locator: "#component-root",
});
```

### Complete Test Workflow

```typescript
import { describe, test } from "vitest";
import { navigateStoryFrame, setViewport } from "simple-visual-tests/browser";

describe("Visual Regression Tests", () => {
  test("Button component visual test", async () => {
    // Navigate to the story
    await navigateStoryFrame("button--primary", "light");

    // Set the viewport size
    await setViewport(1024, 768);

    // Take and compare snapshot
    await expect({
      storyId: "button--primary",
      theme: "light",
      viewport: { width: 1024, height: 768 },
    }).toMatchStorySnapshot({
      threshold: 0.1,
      maxDiffPercentage: 1,
    });
  });
});
```

## Environment Variables

- `VITE_UPDATE_VISUAL_SNAPSHOTS`: Set to "true" to update baseline images instead of running regression tests
- `VITE_STORYBOOK_URL`: Custom Storybook URL (defaults to `http://localhost:6006`)

## Notes & Gotchas

- **Test Context**: The `toMatchStorySnapshot` matcher must be used within a Vitest test context
- **Frame Setup**: The default frame locator `#visualTestFrame` must exist in the DOM for snapshot capture
- **Update Mode**: Use `VITE_UPDATE_VISUAL_SNAPSHOTS=true` when intentionally creating or updating baseline images
- **New Stories**: First-time stories automatically create baselines and pass the test
