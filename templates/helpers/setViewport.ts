import { commands, page } from "@vitest/browser/context";

// Set both Playwright and Vitest viewports
const setViewport = async (width: number, height: number) => {
  await commands.setViewportSize({ width, height }); // Playwright page viewport - controls the browser window size
  await page.viewport(width, height); // Vitest iframe 'viewport' - controls the iframe container size for Storybook
};

export { setViewport };
