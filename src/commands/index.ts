import { compareSnapshots } from "./compareSnapshots";
import { takeSnapshot } from "./takeSnapshot";
import { setViewportSize } from "./setViewportSize";
import { subscribeToBrowserConsole } from "./subscribeToBrowserConsole";
import { startTrace, endTrace } from "./playwrightTracing";
import { getBaseline } from "./getBaseline";
import {
  setPreviewFullScreen,
  exitPreviewFullScreen,
} from "./previewFullScreen";

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
