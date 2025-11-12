/**
 * Helper to navigate an iframe to a storybook preview url `/iframe.html` and wait for the frame 'onload' event.
 *
 * Created URL: `${VITE_STORYBOOK_URL}/iframe.html?id=${storyId}&globals=backgrounds.value:${theme}`
 *
 * @param storyId storybook storyId
 * @param theme light or dark
 * @param storybookIframeId id of the iframe to navigate
 * @returns
 */

export const navigateStoryFrame = async (
  storyId: string,
  theme: "light" | "dark" = "light",
  storybookIframeId: string = "visualTestFrame"
) => {
  const storybookIframe = document.getElementById(
    storybookIframeId
  ) as HTMLIFrameElement | null;

  if (storybookIframe === null) {
    throw new Error(
      `Could not find storybook preview iframe of id '${storybookIframeId}'`
    );
  }

  const baseURL = import.meta.env.VITE_STORYBOOK_URL || "http://localhost:6006";
  // Construct Storybook iframe URL with story ID and theme as background color
  const storyURL = `${baseURL}/iframe.html?id=${storyId}&globals=backgrounds.value:${theme}`;

  if (storybookIframe.src === storyURL) {
    return;
  }

  storybookIframe.src = `${baseURL}/iframe.html?id=${storyId}&globals=backgrounds.value:${theme}`;

  await new Promise((res) => (storybookIframe.onload = res));
};
