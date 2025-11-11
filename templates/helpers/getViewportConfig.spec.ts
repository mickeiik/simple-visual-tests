// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { getViewportConfig } from "./getViewportConfig";

describe("getViewportConfig", () => {
  beforeEach(() => {
    // Reset mocks and stubs before each test
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  afterAll(() => {
    // Reset mocks and stubs after all tests
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  describe("environment variable parsing", () => {
    it("should return environment viewports when VITE_TESTED_VIEWPORTS is set with single viewport", async () => {
      vi.stubEnv("VITE_TESTED_VIEWPORTS", "desktop,1440,900");

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      });
    });

    it("should return environment viewports when VITE_TESTED_VIEWPORTS is set with multiple viewports", async () => {
      vi.stubEnv("VITE_TESTED_VIEWPORTS", "desktop,1440,900;mobile,375,667");

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
        mobile: {
          name: "mobile",
          styles: {
            width: "375px",
            height: "667px",
          },
        },
      });
    });

    it("should handle px suffix in environment variable", async () => {
      vi.stubEnv("VITE_TESTED_VIEWPORTS", "mobile,375px,667px");

      const result = await getViewportConfig();

      expect(result).toEqual({
        mobile: {
          name: "mobile",
          styles: {
            width: "375px",
            height: "667px",
          },
        },
      });
    });

    it("should skip empty entries in environment variable", async () => {
      vi.stubEnv("VITE_TESTED_VIEWPORTS", "desktop,1440,900;;mobile,375,667");

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
        mobile: {
          name: "mobile",
          styles: {
            width: "375px",
            height: "667px",
          },
        },
      });
    });

    it("should return default viewport when environment variable has invalid format", async () => {
      // Mock console.warn mainly to not have logs in the test output (might as well test the output then)
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.stubGlobal("document", {
        getElementById: vi.fn().mockReturnValue({} as HTMLIFrameElement),
      });
      vi.stubGlobal("window", {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      vi.stubEnv("VITE_TESTED_VIEWPORTS", "invalid,format");

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      });

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        'Invalid viewport entry format: "invalid,format". Expected format: "name,width,height"'
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        "No valid viewports found in VITE_TESTED_VIEWPORTS environment variable, using default behavior and trying to load storybook configured viewports"
      );
    });

    it("should return default viewport when no valid viewports are found in environment variable", async () => {
      // Mock console.warn mainly to not have logs in the test output (might as well test the output then)
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.stubGlobal("document", {
        getElementById: vi.fn().mockReturnValue({} as HTMLIFrameElement),
      });
      vi.stubGlobal("window", {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      vi.stubEnv("VITE_TESTED_VIEWPORTS", "invalid,invalid,invalid");

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      });

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        `Invalid width or height format: "invalid", "invalid". Expected format: 'number' or 'number' with 'px' suffix`
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        "No valid viewports found in VITE_TESTED_VIEWPORTS environment variable, using default behavior and trying to load storybook configured viewports"
      );
    });
  });

  describe("default behavior", () => {
    it("should return default viewport when VITE_TESTED_VIEWPORTS is not set and storybook viewports fail to load", async () => {
      vi.stubGlobal("document", {
        getElementById: vi.fn().mockReturnValue({} as HTMLIFrameElement),
      });
      vi.stubGlobal("window", {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      });
    });

    it("should return default viewport when VITE_TESTED_VIEWPORTS is not set and storybook viewports return null", async () => {
      vi.stubGlobal("document", {
        getElementById: vi.fn().mockReturnValue({} as HTMLIFrameElement),
      });
      vi.stubGlobal("window", {
        //@ts-expect-error 'event' is declared but its value is never read
        addEventListener: vi.fn((event, callback) => {
          callback({ origin: "http://localhost:6006" });
        }),
        removeEventListener: vi.fn(),
      });

      // Mock JSON.parse to return null for storybook viewports
      vi.stubGlobal("JSON", {
        parse: vi.fn(() => null),
      });

      const result = await getViewportConfig();

      expect(result).toEqual({
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      });
    });

    it("should return storybook viewports when VITE_TESTED_VIEWPORTS is not set", async () => {
      vi.stubGlobal("document", {
        getElementById: vi.fn().mockReturnValue({} as HTMLIFrameElement),
      });

      // Mock window.addEventListener to simulate message handling
      vi.stubGlobal("window", {
        //@ts-expect-error 'event' is declared but its value is never read
        addEventListener: vi.fn((event, callback) => {
          callback({ origin: "http://localhost:6006" });
        }),
        removeEventListener: vi.fn(),
      });

      // Mock JSON.parse to return storybook viewports
      const mockViewports = {
        mobile: {
          name: "Mobile",
          styles: {
            width: "375px",
            height: "667px",
          },
        },
      };
      vi.stubGlobal("JSON", {
        parse: vi.fn(() => ({
          type: "STORYBOOK_VIEWPORTS",
          viewports: mockViewports,
        })),
      });

      const result = await getViewportConfig();

      expect(result).toEqual(mockViewports);
    });
  });
});
