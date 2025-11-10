import type { ViewportMap } from "storybook/internal/viewport";

// Get storybook viewports from iframe
const getStorybookViewportsOrDefaultDesktop = async (
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
  const iframeUrl = `${baseURL}/iframe.html`;

  storybookIframe.src = iframeUrl;

  const storybookViewports = await new Promise<ViewportMap | null>((res) => {
    window.addEventListener("message", (event) => {
      if (event.origin !== baseURL) return;

      const parsedData = JSON.parse(event.data);

      if (parsedData.type === "STORYBOOK_VIEWPORTS") {
        res(parsedData.viewports);
      }
    });

    setTimeout(() => res(null), 1000); // Return null if storybook did not send viewports after 1 second
  });

  return storybookViewports === null
    ? {
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
        },
      }
    : storybookViewports;
};

export { getStorybookViewportsOrDefaultDesktop };
