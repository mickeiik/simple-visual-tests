# Simple Visual Tests

Simple visual regression testing for Storybook stories using Vitest Browser mode, Pixelmatch and Redis/Filesystem storage.

- [Redis Key space, Conventions and Data Model](/src/storage/)
- [Custom Vitest Commands](/src/commands/)

## High-level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐│
││                                                      Visual test                                                          ││
││                                               (vitest.visual.config.ts)                                                   ││
│├───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤│
││┌─────────────────────────────────────────────────────┐                                                                    ││
│││                Server (node)                        │         ┌─────────────────────────────────────────────────────────┐││
││├─────────────────────────────────────────────────────┤         │                       Browser                           │││
│││ • Spawn browser                                     │         ├─────────────────────────────────────────────────────────┤││
│││ • Manage snapshots                                  │         │ • Tests run in the vitestUI preview iframe              │││
│││ • Use pixelMatch to compare snapshots               │         │                                                         │││
│││                                                     │Commands │ • Extend `expect` with custom `toMatchSnapshot` matcher │││
│││ • Inject `testerHtml.html`                          ◄─────────┤   - Calls server commands to do the heavy lifting:      │││
│││                                                     │         │     - Manage snapshots                                  │││
│││┌───────────────────────────────────────────────────┐│         │     - Do image comparison                               │││
││││               Server Commands                     ││         │   - Populate `task.meta` with test results metadata     │││
│││├───────────────────────────────────────────────────┤│         │   - Return test result                                  │││
││││ Server commands exposed to the browser:           ││         │                                                         │││
││││                                                   ││         │ • Setup:                                                │││
││││ • getBaseline(storyIdentifier)                    ││         │   - Query storybook instance for storyId list           │││
││││ • compareSnapshots(lSnapshot, rSnapshot, options) ││         │      `/index.json`                                      │││
││││ • takeSnapshot(frameLocator, locator)             ││         │     Or get tested stories from STORY_IDS env var        │││
││││ • setViewportSize(viewport)                       ││         │   - Query storybook instance for configured viewports   │││
││││ • setPreviewFullScreen()                          ││         │     Or get tested viewports from TEST_VIEWPORTS env var │││
││││ • exitPreviewFullScreen()                         ││         │                                                         │││
│││└───────────────────────────────────────────────────┘│         │   - Use server comand to toggle fullscreen on the       │││
│││    ┌───────────────────────────────────────────┐    │TaskMeta │     preview iframe                                      │││
│││    │         VisualTestReporter.ts             │    ◄─────────┤                                                         │││
│││    ├───────────────────────────────────────────┤    │         │ • Test each stories in all viewports and themes:        │││
│││    │ • Hooks into vitest test lifecycle        │    │         │   - Navigate injected frame to the story url            │││
│││    │ • Receive test results through `task.meta`│    │         │     (with theme url param)                              │││
│││    │ • Write test results as test runs         │    │         │   - Set preview iframe viewport                         │││
│││    │ • Publish events on run/test progress     │    │         │   - Use server command to set browser page viewport     │││
│││    └─────────┬─────────────────────────────────┘    │         │   - `expect(storyIdentifier).toMatchSnapshot({})        │││
││└──────────────┼──────────────────────────────────────┘         └─────────────────────────────────────────────────────────┘││
│└───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┘│
│                │                                                                                                            │
│                │                                                                                                            │
│┌───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┐│
││               │                                       Storage                                                             ││
│├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┤│
││┌──────────────▼────────────────────────────────┐                   ┌─────────────────────────────────────────────────────┐││
│││            VisualTestStorageAPI.ts            │                   │┌───────────────────────────────────────────────────┐│││
│││                   (Server)                    │  Run/Test Results ││                     Redis                         ││││
││├───────────────────────────────────────────────┼───────────────────►│                   (metadata)                      ││││
│││ • Store runs/tests as JSON documents          │                   │├───────────────────────────────────────────────────┤│││
│││ • Store snapshot to filesystem directory      │                   ││ • Test Result Metadata                            ││││
│││                                               │    Pub Events     ││ • Progress events                                 ││││
│││ • Publish events to Redis Pub/Sub             ├───────────────────►│ • Persist to disk (RDB/AOF)                       ││││
│││   - RunId channel: `visualrun:{runId}:channel`│                   │└───────────────────────────────────────────────────┘│││
│││   - Global channel: `visualtest:events`       │                   │                                                     │││
│││                                               │ Run/Test Results  │┌───────────────────────────────────────────────────┐│││
│││                                               ├───────────────────►│                  Filesystem                       ││││
│││                                               │                   ││                  (snapshot)                       ││││
│││                                               │  Accept baseline  │├───────────────────────────────────────────────────┤│││
│││                                               ├───────────────────►│ • /baselines/storyId-theme-viewport.png           ││││
│││                                               │                   ││ • /runs/runId/storyId-theme-viewport-current.png  ││││
│││                                               │                   ││              /storyId-theme-viewport-diff.png     ││││
│││                                               │                   │└───────────────────────────────────────────────────┘│││
││└───────────────────────────────────────────────┘                   └─────────────────────────────────────────────────────┘││
│└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Installation/Setup

```bash
npm install simple-visual-tests
```

Initialize testing environnement with template files `./tests/visual.spec.ts` and `./vitest.visual.config.ts`

```bash
npx simple-visual-tests init
```

### [visual.spec.ts](/templates/visual.spec.ts): Template test file for regression testing

- Needs a running storybook instance at `http://localhost:6006` or `VITE_STORYBOOK_URL` ENV variable
- Get stories from storybook `/index.json` endpoint
- Get storybook configured viewports ([Storybook Viewport Feature Docs](https://storybook.js.org/docs/essentials/viewport))
- Does visual regression testing for each stories, viewports and `light`/`dark` themes

### [vitest.visual.config.ts](/templates/vitest.visual.config.ts): Vitest configuration template

Modify Vite Config via Vite Plugin (`simpleVisualTests(redisClientOptions)` [vitestAddon.ts](/src/vitestAddon.ts)):

- Add custom matcher via vitest `setupFiles` array ([toMatchStorySnapshot.ts](/src/matcher/toMatchStorySnapshot.ts))
- Add custom reporter ([VisualTestReporter.ts](/src/reporter/VisualTestReporter.ts))
- Enable [vitest browser mode](https://vitest.dev/guide/browser/) with `playwright` and a headless chromium instance
- Add browser `testerHtmlPath` ([testerHtml.html](/testerHtml.html)) (inject the frame where storybook `iframe.html` navigation is made)
- [Server commands](/src/commands/) exposed to the browser (used in custom matcher)

### Configuration

- ENV Variables:

  - `VITE_STORYBOOK_URL` defaults to `http://localhost:6006`
  - `VITE_UPDATE_VISUAL_SNAPSHOTS` will force update snapshots if set to 'true'
  - `VITE_VISUAL_TEST_IMAGES_PATH` directory path where snapshots are saved (default to `./tests/visual-test-images`)

- [node-redis](https://github.com/redis/node-redis/tree/master) `createClient`: [Official Configuration Documentation](https://github.com/redis/node-redis/blob/master/docs/client-configuration.md)
  - Redis connection made by [VisualTestReporter.ts](/src/reporter/VisualTestReporter.ts) initialized by `simpleVisualTests(redisClientOptions)` if you're using [vitestAddon.ts](/src/vitestAddon.ts) (default `url: "redis://localhost:6379"`)

## Usage

```bash
npx vitest --config=./vitest.visual.config.ts
```

## Next Up

- Enable testing subsets through `STORY_IDS` and `VIEWPORTS` env vars
- Add `visualTestServerBridge.ts` to spawn test runs for set of stories/viewports and broadcast progress to clients through websocket
- Add storybook UI addon to manage visual regression tests for stories from storybook
- Expand unit testing
- Add CI testing pipeline
- Project showcase
- Cleanup strategy to avoid filesystem bloat
- Add docker-compose/dockerfile templates to run tests in container

## Nice to have

- Story lazy loading/streaming for large storybooks
- 'Lite mode' without redis for quick setup (JSON files (`lowdb`?) ? SQLite ?)
- S3 image storage
- Analytics: average diffs ratios, test durations, etc.
- Expand CLI (list runs, accept baseline, ..)
- Structural similarity comparison algorithm (SSIM)
- Support for masks/ignored region

## Security thoughts

- Prevent path traversal ?
- Only safe environnement variables in browser context ?

## Performance thoughts

- Compress diffs for storage ?
- Skip diff generation for passing test cases ?
- Parallelize image comparisons ?
