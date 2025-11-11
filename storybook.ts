import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Reads and returns the content of the sendViewports.html file.
 *
 * This HTML file contains a script that extracts viewport configurations
 * from Storybook's global store and sends them to the parent window via postMessage.
 * It's used in visual testing to synchronize viewport settings between the
 * testing environment and Storybook's configured viewports.
 *
 * @returns The HTML content as a UTF-8 string
 */
const getSendViewportHtmlString = (): string => {
  const sendViewportHtmlPath = path.join(
    __dirname,
    "templates",
    "helpers",
    "sendViewports.html"
  );

  return readFileSync(sendViewportHtmlPath, "utf-8");
};

export { getSendViewportHtmlString };
