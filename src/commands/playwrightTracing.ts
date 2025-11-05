import type { BrowserCommand, BrowserCommandContext } from "vitest/node";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
    startTrace: () => Promise<void>;
    endTrace: (savePath?: string) => Promise<void>;
  }
}

export const startTrace: BrowserCommand<[string]> = async (
  ctx: BrowserCommandContext
): Promise<void> => {
  await ctx.context.tracing.start({ screenshots: true, snapshots: true });
};

export const endTrace: BrowserCommand<[string]> = async (
  ctx: BrowserCommandContext,
  savePath?: string
): Promise<void> => {
  await ctx.context.tracing.stop({ path: savePath || "trace.zip" });
};
