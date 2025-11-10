import type { BrowserCommand, BrowserCommandContext } from "vitest/node";

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
