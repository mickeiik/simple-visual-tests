# Template Helpers

Utility functions for visual testing that handle viewport configuration, story loading, and browser viewport management.

## Overview

The template helpers provide essential functionality for visual testing workflows:

- **Viewport Management**: Configure and set browser viewports for responsive testing
- **Story Loading**: Fetch and filter Storybook stories for testing
- **Dimension Parsing**: Handle pixel dimension conversions and formatting
- **Environment Integration**: Support for environment variable configuration

## API Reference

### `getViewportConfig(storybookIframeId?)`

Retrieves viewport configuration for visual testing with the following priority:

1. Environment variable `VITE_TESTED_VIEWPORTS` (if set and valid)
2. Viewports from Storybook configuration (if available)
3. Default Desktop (1440px x 900px) viewport as fallback

**Parameters:**

- `storybookIframeId` (string, optional): The ID of the iframe element containing the Storybook instance (defaults to "visualTestFrame")

**Returns:**
Promise resolving to a `ViewportMap` object containing viewport configurations

**Example Environment Variable:**

```
VITE_TESTED_VIEWPORTS=desktop,1000,1500;mobile,600px,200px
```

### `navigateStoryFrame(storyId, theme, storybookIframeId)`

Helper to navigate an iframe to a Storybook preview URL and wait for the frame 'onload' event.

**Parameters:**

- `storyId`: Storybook story ID
- `theme`: Theme ("light" or "dark", defaults to "light")
- `storybookIframeId`: ID of the iframe to navigate (defaults to "visualTestFrame")

**Returns:**
Promise that resolves when the iframe has loaded

**URL Construction:**
The function creates a URL in the format: `${VITE_STORYBOOK_URL}/iframe.html?id=${storyId}&globals=backgrounds.value:${theme}`

### `loadStories()`

Fetches and filters Storybook stories from the `/index.json` endpoint.

**Parameters:** None

**Returns:**
Promise resolving to an array of `StoryIndexEntry` objects representing stories

**Environment Integration:**

- `VITE_STORYBOOK_URL`: Custom Storybook URL (defaults to `http://localhost:6006`)
- `VITE_STORY_IDS`: Colon-separated list of story IDs to filter by

### `parsePxSizeToNumber(pxString)`

Converts a pixel string to a number by removing the 'px' suffix.

**Parameters:**

- `pxString` (string): A pixel value string (e.g., "1440px" or "1440")

**Returns:**
Number representing the pixel value

### `setViewport(width, height)`

Sets both Playwright and Vitest viewports for consistent browser and iframe sizing.

**Parameters:**

- `width` (number): The viewport width in pixels
- `height` (number): The viewport height in pixels

**Note:** This function controls both the browser window size (Playwright) and the iframe container size (Vitest) for Storybook.

## Usage Examples

### Basic Viewport Configuration

```typescript
import { getViewportConfig } from "simple-visual-tests/browser";

const viewports = await getViewportConfig();
console.log(viewports); // { desktop: { name: "Desktop", styles: { width: "1440px", height: "900px" } }
```

### Loading Specific Stories

```typescript
// Set environment variable: VITE_STORY_IDS=button-story;card-story
import { loadStories } from "simple-visual-tests/browser";

const stories = await loadStories();
// Returns only stories with IDs 'button-story' and 'card-story'
```

### Setting Browser Viewport

```typescript
import { setViewport } from "simple-visual-tests/browser";

await setViewport(1200, 800);
// Sets both Playwright and Vitest viewports to 1200x800
```

### Dimension Parsing

```typescript
import { parsePxSizeToNumber } from "simple-visual-tests/browser";

const width = parsePxSizeToNumber("1440px"); // 1440
const height = parsePxSizeToNumber("900"); // 900
```

## Environment Variables

### Viewport Configuration

- `VITE_TESTED_VIEWPORTS`: Semicolon-separated viewport configurations in format "name,width,height"
  - Example: `desktop,1440,900;mobile,375,667`
  - Supports both "number" and "numberpx" formats

### Story Configuration

- `VITE_STORYBOOK_URL`: Custom Storybook URL for fetching stories and viewports
  - Default: `http://localhost:6006`
- `VITE_STORY_IDS`: Semicolon-separated list of story IDs to test
  - Example: `story-id-1;story-id-2;story-id-3`

## Notes & Gotchas

- **Mandatory Storybook Setup**: For `getViewportConfig()` to work with Storybook's viewport configuration, you must add the `sendViewports.html` script to your Storybook configuration. Import `getSendViewportHtmlString()` from `simple-visual-tests/storybook` and add it to your Storybook main.ts config:

  ```typescript
  // .storybook/main.ts
  import { getSendViewportHtmlString } from "simple-visual-tests/storybook";

  export default {
    // ... other config
    previewHead: (head) => `
      ${head}${getSendViewportHtmlString()}
    `,
  };
  ```

- **Viewport Priority**: Environment variables take precedence over Storybook configuration, which falls back to default desktop viewport
- **Dimension Consistency**: The `normalizeDimension` function ensures all viewport dimensions have 'px' suffix for consistency
- **Error Handling**: Invalid viewport entries or story IDs will trigger warnings but won't stop execution unless all requested items are invalid
- **Timeout**: Storybook viewport loading has a 1-second timeout to prevent hanging
