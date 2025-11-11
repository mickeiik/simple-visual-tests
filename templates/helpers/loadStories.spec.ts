// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { loadStories } from "./loadStories";

describe("loadStories", () => {
  beforeEach(() => {
    // Reset mocks and stubs before each test
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  afterAll(() => {
    // Reset mocks and stubs before after all tests
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("returns all stories when VITE_STORY_IDS is not set", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
          "header--logged-in": {
            id: "header--logged-in",
            type: "story",
            title: "Header",
            name: "Logged In",
            importPath: "./Header.stories.ts",
          },
          "docs--page": {
            id: "docs--page",
            type: "docs",
            title: "Documentation",
            name: "Page",
            importPath: "./Documentation.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
    expect(stories).toHaveLength(3); // Only stories, not docs
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "button--secondary" }),
        expect.objectContaining({ id: "header--logged-in" }),
      ])
    );
  });

  it("filters stories when VITE_STORY_IDS is set with valid IDs", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set VITE_STORY_IDS environment variable
    vi.stubEnv("VITE_STORY_IDS", "button--primary;header--logged-in");

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
          "header--logged-in": {
            id: "header--logged-in",
            type: "story",
            title: "Header",
            name: "Logged In",
            importPath: "./Header.stories.ts",
          },
          "footer--simple": {
            id: "footer--simple",
            type: "story",
            title: "Footer",
            name: "Simple",
            importPath: "./Footer.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
    expect(stories).toHaveLength(2);
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "header--logged-in" }),
      ])
    );
  });

  it("filters stories and logs warning when VITE_STORY_IDS is set with some invalid IDs", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set VITE_STORY_IDS environment variable with some invalid IDs
    vi.stubEnv(
      "VITE_STORY_IDS",
      "button--primary;non-existent-story;header--logged-in"
    );

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
          "header--logged-in": {
            id: "header--logged-in",
            type: "story",
            title: "Header",
            name: "Logged In",
            importPath: "./Header.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    // Mock console.warn to capture warnings
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
    expect(stories).toHaveLength(2);
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "header--logged-in" }),
      ])
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Some requested story IDs not found: non-existent-story (requested: 3, found: 2)"
    );

    consoleWarnSpy.mockRestore();
  });

  it("throws error when VITE_STORY_IDS is set with all invalid IDs", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set VITE_STORY_IDS environment variable with all invalid IDs
    vi.stubEnv("VITE_STORY_IDS", "non-existent-story-1;non-existent-story-2");

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(loadStories()).rejects.toThrow(
      "All requested story IDs not found: non-existent-story-1, non-existent-story-2 (requested: 2, found: 0)"
    );

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
  });

  it("handles VITE_STORY_IDS with extra whitespace in colon-separated list", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set VITE_STORY_IDS environment variable with extra whitespace
    vi.stubEnv(
      "VITE_STORY_IDS",
      "  button--primary ; header--logged-in  ;  footer--simple  "
    );

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "header--logged-in": {
            id: "header--logged-in",
            type: "story",
            title: "Header",
            name: "Logged In",
            importPath: "./Header.stories.ts",
          },
          "footer--simple": {
            id: "footer--simple",
            type: "story",
            title: "Footer",
            name: "Simple",
            importPath: "./Footer.stories.ts",
          },
          "other--story": {
            id: "other--story",
            type: "story",
            title: "Other",
            name: "Story",
            importPath: "./Other.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
    expect(stories).toHaveLength(3);
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "header--logged-in" }),
        expect.objectContaining({ id: "footer--simple" }),
      ])
    );
  });

  it("works with custom VITE_STORYBOOK_URL", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set custom Storybook URL
    vi.stubEnv("VITE_STORYBOOK_URL", "http://localhost:9009");

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:9009/index.json");
    expect(stories).toHaveLength(2);
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "button--secondary" }),
      ])
    );
  });

  it("throws error when fetch fails", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock the fetch response to fail
    const mockResponse = {
      ok: false,
      statusText: "Not Found",
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(loadStories()).rejects.toThrow(
      "Failed to fetch stories: Not Found"
    );

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
  });

  it("handles empty VITE_STORY_IDS string", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set VITE_STORY_IDS to empty string
    vi.stubEnv("VITE_STORY_IDS", "");

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
    // Should return all stories since empty string is treated as no filter
    expect(stories).toHaveLength(2);
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "button--secondary" }),
      ])
    );
  });

  it("handles VITE_STORY_IDS with only whitespace", async () => {
    // Mock global fetch
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Set VITE_STORY_IDS to string with only whitespace
    vi.stubEnv("VITE_STORY_IDS", "   ;  ; ");

    // Mock the fetch response
    const mockResponse = {
      ok: true,
      json: async () => ({
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            type: "story",
            title: "Button",
            name: "Primary",
            importPath: "./Button.stories.ts",
          },
          "button--secondary": {
            id: "button--secondary",
            type: "story",
            title: "Button",
            name: "Secondary",
            importPath: "./Button.stories.ts",
          },
        },
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const stories = await loadStories();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json");
    // Should return all stories since empty/whitespace IDs are filtered out
    expect(stories).toHaveLength(2);
    expect(stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "button--primary" }),
        expect.objectContaining({ id: "button--secondary" }),
      ])
    );
  });
});
