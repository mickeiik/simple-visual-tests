## Redis Key space & Conventions

- `visualruns:index` (Set) — stores `runId` for all runs.
- `visualrun:{runId}` (JSON) — store `VisualTestRun` object.
- `visualrun:{runId}:tests` (Set) — members are test keys listed below.
- `visualtest:{runId}:{storyId}:{theme}:{width}x{height}` (JSON) — store `VisualTestResult` object.
- `visualrun:{runId}:channel` (Pub/Sub channel) — specific run events.
- `visualtest:events` (Pub/Sub channel) — global events (new run, run finished, baseline accepted).

---

## Data Model

**VisualTestRun**:

```json
{
  "runId": "run-123",
  "timestamp": 1630000000000,
  "startTime": "2025-10-26T12:00:00Z",
  "endTime": "2025-10-26T12:05:00Z",
  "duration": 300000,
  "reason": "passed",
  "summary": {
    "total": 10,
    "passed": 9,
    "failed": 1,
    "changed": 0,
    "skipped": 0,
    "new": 0
  },
  "environment": { "nodeVersion": "v20.x", "platform": "linux", "ci": true }
}
```

**VisualTestResult**:

```json
{
  "runId": "run-123",
  "storyIdentifier": {
    "storyId": "button-primary",
    "theme": "dark",
    "viewport": { "width": 1024, "height": 768 }
  },
  "theme": "dark",
  "status": "failed",
  "baseline": "./tests/visual-test-images/baselines/storyId-theme-viewport.png",
  "current": "./tests/visual-test-images/runs/${runId}/storyId-theme-viewport-current.png",
  "diff": "./tests/visual-test-images/runs/${runId}/storyId-theme-viewport-diff.png",
  "diffRatio": 0.12,
  "message": "5% difference"
}
```

---

## Event Types (Pub/Sub payload: JSON)

- `run:started` — `{ runId }`
- `test:started` — `{ runId, storyIdentifier }`
- `test:updated` — `{ runId, storyIdentifier, status, ...partialUpdatedData }`
- `test:finished` — `{ runId, storyIdentifier, status, diffRatio }`
- `run:finished` — `{ runId, summary, reason }`
- `baseline:accepted` — `{ runId, storyIdentifier }`

Each event is published to both:

- per-run channel: `visualrun:{runId}:channel`
- global channel: `visualtest:events`

---

## Persistence & Durability

- Configure Redis persistence in production:

  - RDB snapshots and/or AOF enabled (recommended: AOF with fsync policy tuned for your environment).

- Backups: periodically `BGSAVE` or export JSON dumps (optional).
