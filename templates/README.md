# Visual Testing Templates

Template files for setting up visual regression testing with Storybook and Vitest.

## Overview

The templates provide a complete setup for visual regression testing that:

- Iterates through all Storybook stories
- Tests across multiple themes (light/dark)
- Tests across multiple viewports
- Integrates with Redis for storage and reporting
- Uses Playwright for browser automation

## Files

### `visual.spec.ts`

The main visual regression test suite that creates a comprehensive test matrix across stories, themes, and viewports.

**Key Features:**

- Loads stories from Storybook's `/index.json` endpoint
- Configures viewports from environment variables or Storybook configuration
- Tests each story with different themes and viewport sizes
- Uses full-screen mode for consistent testing environment
- Captures and compares snapshots using the `toMatchStorySnapshot` matcher

### `vitest.visual.config.ts`

Vitest configuration for browser-based visual testing with Playwright integration.

**Key Features:**

- Redis storage plugin for visual test results
- Playwright browser provider with Chromium
- Headless browser testing
- Custom reporter for visual test results

### `helpers/` directory

Utility functions for viewport management, story loading, and browser operations. See [helpers/README.md](./helpers/README.md) for detailed documentation.

## Usage

### Basic Setup

1. **Install dependencies:**

   ```bash
   npm install simple-visual-tests
   ```

2. **Configure Storybook:**
   Add the viewport script to your Storybook configuration:

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

3. **Run tests:**
   ```bash
   npx vitest --config templates/vitest.visual.config.ts
   ```

### Environment Variables

- `VITE_STORYBOOK_URL`: Custom Storybook URL (defaults to `http://localhost:6006`)
- `VITE_STORY_IDS`: Semicolon-separated list of story IDs to test
- `VITE_TESTED_VIEWPORTS`: Semicolon-separated viewport configurations in format "name,width,height"
- `VITE_UPDATE_VISUAL_SNAPSHOTS`: Set to "true" to update baseline images instead of running regression tests
- `VITE_VISUAL_TEST_IMAGES_PATH`: Directory for storing visual test images (defaults to `./tests/visual-test-images`)

### Example Viewport Configuration

```
VITE_TESTED_VIEWPORTS=desktop,1440,900;mobile,375,67;tablet,768,1024
```

## Test Matrix

The visual test creates a comprehensive matrix testing:

- **Stories**: All stories from Storybook index
- **Themes**: Light and dark themes
- **Viewports**: Configured viewport sizes

For each combination, it:

1. Navigates to the story in the specified theme
2. Sets the viewport size
3. Takes a snapshot
4. Compares with baseline image

## Configuration Options

### Viewport Priority

Viewports are loaded with the following priority:

1. Environment variable `VITE_TESTED_VIEWPORTS`
2. Storybook configured viewports (requires Storybook setup)
3. Default Desktop (1440px x 900px) as fallback

### Browser Configuration

The test runs in headless Chromium by default. To run in headed mode, modify the config:

```typescript
// vitest.visual.config.ts
{
  browser: {
    instances: [
      {
        browser: "chromium",
        headless: false, // Set to false for headed mode
      },
    ],
  },
}
```

## Integration with Redis

The configuration includes Redis integration for:

- Tracking test results and metadata
- Managing visual test storage API
- Real-time reporting and event publishing
- Storing image file paths (actual images stored on filesystem)

Default Redis URL: `redis://localhost:6379`

Images are stored on the filesystem in the directory specified by `VITE_VISUAL_TEST_IMAGES_PATH` (defaults to `./tests/visual-test-images`).

## Notes & Gotchas

- **Mandatory Storybook Setup**: For viewport configuration to work with Storybook's viewports, the `sendViewports.html` script must be added to your Storybook configuration
- **Redis Dependency**: The visual testing framework requires Redis for storage and reporting
- **Full Screen Mode**: Tests run in full-screen mode for consistent viewport management
- **DOM Rect Restoration**: Viewport is restored to initial size after tests complete
- **Test Parallelization**: Tests can be parallelized by splitting story groups across different test files
- **Update Mode**: Set `VITE_UPDATE_VISUAL_SNAPSHOTS=true` to create new baseline images instead of running regression tests
