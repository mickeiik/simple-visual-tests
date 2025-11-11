import type { ViewportMap } from "storybook/internal/viewport";

const DEFAULT_VIEWPORT = {
  desktop: {
    name: "Desktop",
    styles: {
      width: "1440px",
      height: "900px",
    },
  },
};

/**
 * Regular expression for validating viewport dimensions that can optionally
 * include 'px' suffix. This allows flexibility in environment variable
 * configuration where users can specify dimensions as '1440' or '140px'.
 */
const numberWithOrWithoutPxSuffix = /^(\d+)(px)?$/;

/**
 * Parses a single viewport entry string in the format "name,width,height".
 * Validates the format and dimensions, returning a tuple of [name, width, height]
 * or null if the entry is invalid. Used to process viewport configurations
 * provided through environment variables.
 *
 * @param entry - The viewport entry string to parse
 * @returns A tuple of [name, width, height] or null if invalid
 */
const parseViewportEntry = (entry: string): [string, string, string] | null => {
  const [name, width, height] = entry
    .split(",")
    .map((part: string) => part.trim());

  if (!name || !width || !height) {
    console.warn(
      `Invalid viewport entry format: "${entry}". Expected format: "name,width,height"`
    );
    return null;
  }

  if (
    !numberWithOrWithoutPxSuffix.test(width) ||
    !numberWithOrWithoutPxSuffix.test(height)
  ) {
    console.warn(
      `Invalid width or height format: "${width}", "${height}". Expected format: 'number' or 'number' with 'px' suffix`
    );
    return null;
  }

  return [name, width, height];
};

/**
 * Ensures a dimension value has the 'px' suffix to mimic storybook viewport format.
 * If the value already ends with 'px', it's returned as-is; otherwise, 'px'
 * is appended. This maintains consistency in viewport dimension formatting.
 *
 * @param value - The dimension value to normalize (e.g., "1440" or "1440px")
 * @returns The normalized dimension with 'px' suffix
 */
const normalizeDimension = (value: string): string => {
  return value.endsWith("px") ? value : `${value}px`;
};

/**
 * Parses viewport configurations from the VITE_TESTED_VIEWPORTS environment variable.
 * The environment variable should contain viewport entries separated by semicolons
 * in the format "name,width,height". Returns a ViewportMap if valid configurations
 * are found, or null if the environment variable is not set or contains invalid data.
 *
 * @param envValue - The VITE_TESTED_VIEWPORTS environment variable value
 * @returns A ViewportMap with parsed viewports or null if invalid
 */
const parseViewportEnv = (envValue: string | undefined): ViewportMap | null => {
  if (!envValue) return null;

  try {
    const viewportEntries = envValue.split(";");
    const parsedViewports: ViewportMap = {};

    for (const entry of viewportEntries) {
      if (entry.trim() === "") continue;

      const result = parseViewportEntry(entry);
      if (!result) continue;

      const [name, width, height] = result;
      const widthValue = normalizeDimension(width);
      const heightValue = normalizeDimension(height);

      parsedViewports[name] = {
        name: name,
        styles: {
          width: widthValue,
          height: heightValue,
        },
      };
    }

    // Return parsed viewports if any were successfully parsed
    if (Object.keys(parsedViewports).length > 0) {
      return parsedViewports;
    } else {
      console.warn(
        "No valid viewports found in VITE_TESTED_VIEWPORTS environment variable, using default behavior and trying to load storybook configured viewports"
      );
      return null;
    }
  } catch (error) {
    console.warn(
      "Invalid VITE_TESTED_VIEWPORTS environment variable format, using default behavior and trying to load storybook configured viewports",
      error
    );
    return null;
  }
};

/**
 * Loads viewport configurations from the Storybook iframe by sending a message
 * to the Storybook instance and waiting for a response with viewport data.
 * This allows the visual testing framework to use the same viewports that
 * are configured in the Storybook instance, ensuring consistency between
 * development and testing environments.
 *
 * @param storybookIframeId - The ID of the iframe element containing the Storybook instance
 * @returns A Promise that resolves to the ViewportMap from Storybook or null if loading fails
 * @throws Error if the Storybook iframe element cannot be found
 */
const loadStorybookViewports = async (
  storybookIframeId: string
): Promise<ViewportMap | null> => {
  const storybookIframe = document.getElementById(
    storybookIframeId
  ) as HTMLIFrameElement | null;

  if (storybookIframe === null) {
    throw new Error(
      `Could not find storybook preview iframe of id '${storybookIframeId}'`
    );
  }

  const baseURL: string =
    import.meta.env.VITE_STORYBOOK_URL || "http://localhost:6006";
  const iframeUrl = `${baseURL}/iframe.html`;

  storybookIframe.src = iframeUrl;

  return await new Promise<ViewportMap | null>((res) => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== baseURL) return;

      try {
        const parsedData = JSON.parse(event.data);

        if (parsedData.type === "STORYBOOK_VIEWPORTS") {
          window.removeEventListener("message", handleMessage);
          res(parsedData.viewports);
        }
      } catch (error) {
        // Ignore malformed messages
      }
    };

    window.addEventListener("message", handleMessage);

    setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      res(null);
    }, 1000);
  });
};

/**
 * Retrieves viewport configuration for visual testing with the following priority:
 * 1. Environment variable VITE_TESTED_VIEWPORTS (if set and valid)
 * 2. Viewports from Storybook configuration (if available)
 * 3. Default Desktop (1440px x 900px) viewport as fallback
 *
 * This function provides flexibility in configuring viewports for visual tests,
 * allowing teams to override default viewports through environment variables
 * while maintaining compatibility with Storybook's viewport configuration.
 *
 * Note: For Storybook viewport configuration to be loaded correctly, the
 * sendViewports.html file must be included in the Storybook preview iframe.
 * This HTML file contains the necessary script to extract viewport configurations
 * from Storybook and communicate them to the testing environment via postMessage API.
 *
 * @param storybookIframeId - The ID of the iframe element containing the Storybook instance (defaults to "visualTestFrame")
 * @returns A Promise that resolves to the configured ViewportMap
 *
 * @example
 * VITE_TESTED_VIEWPORTS=desktop,1000,1500;mobile,600px,200px
 */
const getViewportConfig = async (
  storybookIframeId: string = "visualTestFrame"
) => {
  const envViewports = parseViewportEnv(import.meta.env.VITE_TESTED_VIEWPORTS);
  if (envViewports) {
    return envViewports;
  }

  const storybookViewports = await loadStorybookViewports(storybookIframeId);
  return storybookViewports ?? DEFAULT_VIEWPORT;
};

export { getViewportConfig };
