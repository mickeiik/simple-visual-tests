import { compareSnapshots } from "./compareSnapshots.js";
import { takeSnapshot } from "./takeSnapshot.js";
import { setViewportSize } from "./setViewportSize.js";
import { subscribeToBrowserConsole } from "./subscribeToBrowserConsole.js";
import { startTrace, endTrace } from "./playwrightTracing.js";
import { getBaseline } from "./getBaseline.js";
import {
  setPreviewFullScreen,
  exitPreviewFullScreen,
} from "./previewFullScreen.js";

export {
  getBaseline,
  compareSnapshots,
  takeSnapshot,
  setViewportSize,
  subscribeToBrowserConsole,
  setPreviewFullScreen,
  exitPreviewFullScreen,
  startTrace,
  endTrace,
};
