# Visual Test Storage API

Redis-based storage API for visual test results that handles storage of test runs, images, and real-time events.

## Overview

The storage system uses a hybrid approach:

- **Redis**: Stores metadata (test status, run summaries, timing information) and handles real-time events
- **Filesystem**: Stores actual image files to optimize performance and storage costs

This approach avoids bloating Redis memory usage while maintaining fast metadata queries and real-time event publishing capabilities.

## Redis Key Space & Conventions

- `visualruns:index` (Set) — stores `runId` for all runs
- `visualrun:{runId}` (JSON) — stores `VisualTestRun` object
- `visualrun:{runId}:tests` (Set) — members are test keys listed below
- `visualtest:{runId}:{storyId}:{theme}:{width}x{height}` (JSON) — stores `VisualTestResult` object
- `visualrun:{runId}:channel` (Pub/Sub channel) — specific run events
- `visualtest:events` (Pub/Sub channel) — global events (new run, run finished, baseline accepted)

## Data Model

### VisualTestRun

```json
{
  "runId": "run-123",
  "startedAt": 163000000,
  "finishedAt": 163000030000,
  "duration": 300000,
  "reason": "passed",
  "summary": {
    "total": 10,
    "finished": 10,
    "passed": 9,
    "failed": 1,
    "changed": 0,
    "skipped": 0,
    "new": 0
  },
  "environment": {
    "nodeVersion": "v20.x",
    "platform": "linux",
    "ci": true
  }
}
```

### VisualTestResult

```json
{
  "runId": "run-123",
  "storyIdentifier": {
    "storyId": "button-primary",
    "theme": "dark",
    "viewport": {
      "width": 1024,
      "height": 768
    }
  },
  "status": "failed",
  "baseline": "./tests/visual-test-images/baselines/storyId-theme-viewport.png",
  "current": "./tests/visual-test-images/runs/run-123/storyId-theme-viewport-current.png",
  "diff": "./tests/visual-test-images/runs/run-123/storyId-theme-viewport-diff.png",
  "diffRatio": 0.12,
  "message": "5% difference",
  "startedAt": 163000000000,
  "finishedAt": 1630000001000
}
```

## API Reference

### Class: VisualTestStorageAPI

The VisualTestStorageAPI class provides methods for managing visual test storage and operations.

#### Constructor

- `new VisualTestStorageAPI(redisOptions?, imageRootPath?)` - Create a new instance of the storage API

#### Connection Management

- `connect(options?)` - Connect to Redis client with configuration options (overwrites constructor redisOptions if set)
- `disconnect()` - Disconnect from Redis client

#### Run Operations

- `startRun(testCount)` - Start a new visual test run
- `finishRun(runId, reason?)` - Complete a visual test run
- `getRun(runId)` - Get run data
- `listAllRuns()` - Get all saved runs

#### Test Operations

- `startTest(runId, storyIdentifier)` - Start a new visual test
- `updateTest(runId, storyIdentifier, partial)` - Update test with new data
- `finishTest(runId, result)` - Complete a visual test
- `getTest(runId, storyIdentifier)` - Get test data
- `listTestsForRun(runId)` - Get a list of tests for a run

#### Baseline Management

- `getBaseline(storyIdentifier)` - Get baseline image from filesystem
- `acceptBaseline(runId, storyIdentifier)` - Accept a new baseline
- `saveImage(runId, storyIdentifier, buffer, type)` - Save image to appropriate location

#### Image Operations

- `getImage(filePath)` - Read image from filesystem
- `deleteTestImages(runId, storyIdentifier)` - Delete current and diff images for a test
- `deleteBaseline(storyIdentifier)` - Delete baseline image for a story

#### Static Methods

- `getFileStorageOnlyApi(imageRootPath?)` - Get a singleton instance for filesystem-only operations

## Event Types (Pub/Sub payload: JSON)

- `run:started` — `{ runId, testCount }`
- `test:started` — `{ runId, storyIdentifier, status }`
- `test:updated` — `{ runId, storyIdentifier, status, ...partialUpdatedData }`
- `test:finished` — `{ runId, storyIdentifier, status, diffRatio }`
- `run:finished` — `{ runId, reason, summary }`
- `run:summary` — `{ summary }`
- `baseline:accepted` — `{ runId, storyIdentifier }`

Each event is published to both:

- per-run channel: `visualrun:{runId}:channel`
- global channel: `visualtest:events`

## Usage Examples

### Basic Setup

```typescript
import { VisualTestStorageAPI } from "./VisualTestStorageAPI";

// Create instance and connect to Redis
const storage = new VisualTestStorageAPI({ url: "redis://localhost:6379" });
await storage.connect();

// Start a test run
const run = await storage.startRun(10); // 10 tests in this run

// Perform tests...

// Finish the run
await storage.finishRun(run.runId, "passed");
```

### Working with Tests

```typescript
import { VisualTestStorageAPI } from "./VisualTestStorageAPI";

const storage = new VisualTestStorageAPI({ url: "redis://localhost:6379" });
await storage.connect();

// Start a test
const test = await storage.startTest(runId, {
  storyId: "button-primary",
  theme: "dark",
  viewport: { width: 1024, height: 768 },
});

// Update test with results
await storage.updateTest(runId, test.storyIdentifier, {
  status: "failed",
  current: currentImageBuffer,
  diff: diffImageBuffer,
  diffRatio: 0.15,
});

// Finish test with final results
await storage.finishTest(runId, {
  storyIdentifier: test.storyIdentifier,
  status: "failed",
  baseline: baselineImageBuffer,
  current: currentImageBuffer,
  diff: diffImageBuffer,
  diffRatio: 0.15,
  message: "Visual difference detected",
});
```

### Subscribing to Events

The VisualTestStorageAPI handles event publishing internally, but you can still subscribe to events using Redis directly:

```typescript
import { createClient } from "redis";

const client = createClient({ url: "redis://localhost:6379" });
await client.connect();

// Subscribe to all events
await client.subscribe("visualtest:events", (message) => {
  const event = JSON.parse(message);
  console.log(`Event: ${event.type}`, event.payload);
});

// Subscribe to specific run events
await client.subscribe(`visualrun:${runId}:channel`, (message) => {
  const event = JSON.parse(message);
  console.log(`Run ${runId} event: ${event.type}`, event.payload);
});
```

## Filesystem-Only API

The class provides a static method to get a singleton instance for filesystem-only operations, which is useful for vitest server commands that need to access baselines in the shared FileSystem without Redis:

```typescript
import { VisualTestStorageAPI } from "./VisualTestStorageAPI";

// Get a filesystem-only instance
const fileStorage = VisualTestStorageAPI.getFileStorageOnlyApi();

// Use for baseline operations
const baselineBuffer = await fileStorage.getBaseline(storyIdentifier);
```

## Persistence & Durability

- Configure Redis persistence in production:
  - RDB snapshots and/or AOF enabled (recommended: AOF with fsync policy tuned for your environment)
- Backups: periodically `BGSAVE` or export JSON dumps (optional)

## Image Storage

Images are stored on the filesystem in the directory specified by `VITE_VISUAL_TEST_IMAGES_PATH` (defaults to `./tests/visual-test-images`). The directory structure is:

```
./tests/visual-test-images/
├── baselines/
│   └── {storyId}-{theme}-{width}x{height}.png
└── runs/
    └── {runId}/
        ├── {storyId}-{theme}-{width}x{height}-current.png
        └── {storyId}-{theme}-{width}x{height}-diff.png
```
