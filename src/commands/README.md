## Available Commands

Each command is documented with JSDoc comments that describe its purpose, parameters, return values, and potential error conditions.

See vitest documentation on [Custom Commands](https://vitest.dev/api/browser/commands.html#custom-commands).

### `takeSnapshot(frameLocator, locator)`

Captures a visual snapshot of a specific element within a nested frame structure.

- **Parameters**:
  - `frameLocator`: Selector for the frame containing the target element
  - `locator`: Selector for the target element within the frame
- **Returns**: Promise resolving to a Buffer containing the PNG screenshot
- **Description**: This function addresses the complexity of Storybook's iframe-based rendering by waiting for network idle, navigating to the correct iframe, locating the target element, and taking a clipped screenshot using full-page mode to maintain context.

### `compareSnapshots(lSnapshot, rSnapshot, options)`

Compares two PNG image buffers pixel by pixel to detect visual differences.

- **Parameters**:
  - `ctx`: Browser command context (required for type compatibility but unused)
  - `lSnapshot`: The baseline/left image snapshot as a Buffer
  - `rSnapshot`: The actual/right image snapshot as a Buffer
  - `options.threshold`: Pixel intensity difference threshold (0-1), values below this are considered equal
  - `options.maxDiffPercentage`: Maximum allowed difference percentage before images are considered different
- **Returns**: Promise resolving to a ComparisonResult with matches status, message, diff image and ratio
- **Description**: Performs a pixel-level comparison between two images, calculating the percentage of different pixels and generating a visual diff image.

### `setViewportSize(viewport)`

Sets the viewport size of the current browser page for visual testing.

- **Parameters**:
  - `viewport`: Object containing width and height dimensions in pixels
- **Returns**: Promise that resolves when the viewport size has been successfully set
- **Description**: Provides a clean abstraction over Playwright's setViewportSize method, ensuring consistent viewport management across all visual tests.

### `getBaseline(storyIdentifier)`

Retrieves baseline images from storage.

- **Parameters**:
  - `storyIdentifier`: Identifier for the story whose baseline image should be retrieved
- **Returns**: Promise resolving to a Buffer containing the baseline image or null if not found
- **Description**: Serves as the bridge between browser-side tests and the storage API, allowing tests to fetch baseline images that were previously established during the "accept" phase of visual testing.

### `subscribeToBrowserConsole()`

Subscribes to browser console messages and forwards them to the Node.js console.

- **Parameters**: None
- **Returns**: Promise that resolves when subscription is established
- **Description**: Useful for debugging browser-side code during visual tests by capturing console.log, console.error, console.warn, etc. messages from the browser context.

### `setPreviewFullScreen()`

Requests fullscreen mode for the tester UI element.

- **Parameters**: None
- **Returns**: Promise resolving when fullscreen request is processed
- **Description**: Waits for network idle state to ensure all assets are loaded before entering fullscreen, then attempts to make the "tester-ui" element fullscreen.

### `exitPreviewFullScreen()`

Exits fullscreen mode if currently in fullscreen.

- **Parameters**: None
- **Returns**: Promise resolving when exit fullscreen request is processed
- **Description**: Calls the browser's exitFullscreen API to return from fullscreen mode.

### `startTrace()`

Starts Playwright tracing to capture browser interactions.

- **Parameters**: None
- **Returns**: Promise resolving when tracing has started
- **Description**: Initiates Playwright tracing with screenshots and snapshots enabled for debugging purposes.

### `endTrace(savePath?)`

Stops Playwright tracing and saves the trace file.

- **Parameters**:
  - `savePath` (optional): Path where the trace file should be saved (defaults to "trace.zip")
- **Returns**: Promise resolving when tracing has stopped
- **Description**: Stops Playwright tracing and saves the trace file for debugging and analysis.

## Usage

These commands are typically used in conjunction with Vitest's browser testing capabilities. They can be imported and used within test files to perform specific actions during visual regression tests.

Must be declared in vitest browser config:

```typescript
test {
  browser: {
    // Expose commands to the browser environment
    commands: {
    takeSnapshot,
      getBaseline,
      compareSnapshots,
      setViewportSize,
      setPreviewFullScreen,
      exitPreviewFullScreen,
    },
  },
}
```

Example:

```typescript
import { commands } from "@vitest/browser/context";

// Take a snapshot of an element
const snapshot = await commands.takeSnapshot(
  "#storybook-frame",
  "#my-component"
);

// Compare with a baseline
const result = await commands.compareSnapshots(ctx, baseline, snapshot, {
  threshold: 0.1,
  maxDiffPercentage: 0.1,
});
```
