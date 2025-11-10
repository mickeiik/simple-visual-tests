/**
 * Server-specific entry point for simple-visual-tests
 *
 * This module exports only server-compatible functionality, including
 * Redis-based storage API and other Node.js specific features.
 *
 * Import from "simple-visual-tests/server" when using in server contexts.
 */

import * as StorageAPI from "./src/storage/VisualTestStorageAPI.js";
import { VisualTestReporter } from "./src/reporter/VisualTestReporter.js";
import { simpleVisualTests } from "./src/vitestAddon.js";

export { StorageAPI, VisualTestReporter, simpleVisualTests };
