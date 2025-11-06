import { defineConfig } from "vitest/config";
import {
  setViewportSize,
  setPreviewFullScreen,
  exitPreviewFullScreen,
  takeSnapshot,
  compareSnapshots,
  getBaseline,
} from "./src/commands";
import { VisualTestReporter } from "./src/reporter/VisualTestReporter";
import type { PluginOption } from "vite";
import type { RedisClientOptions } from "redis";

const simpleVisualTests = (
  redisClientOptions: RedisClientOptions
): PluginOption[] => [
  {
    name: "simple-visual-tests",
    config: (config, { command }) => {
      return {
        test: {
          include: ["./visual.spec.ts"],
          setupFiles: ["./src/matcher/toMatchStorySnapshot.ts"],
          reporters: [new VisualTestReporter(redisClientOptions)],
          browser: {
            enabled: true,
            provider: "playwright",
            testerHtmlPath: "./index.html",
            commands: {
              takeSnapshot,
              getBaseline,
              compareSnapshots,
              setViewportSize,
              setPreviewFullScreen,
              exitPreviewFullScreen,
            },
            instances: [
              {
                browser: "chromium",
                headless: false,
              },
            ],
          },
        },
      };
    },
  },
];

export default defineConfig({
  envDir: "./",
  plugins: [
    simpleVisualTests({
      url: "redis://localhost:6379",
    }),
  ],
  test: {
    // reporters: [
    //   "default",
    //   new VisualTestReporter({
    //     username: "default",
    //     password: "EeIn8CSRJRfg62AwccyBI6sq0auA1FZO",
    //     socket: {
    //       host: "redis-18796.c80.us-east-1-2.ec2.redns.redis-cloud.com",
    //       port: 18796,
    //     },
    //   }),
    // ],
    // include: ["./visual.spec2.ts"],
    // setupFiles: ["./src/tests/visual-tests/matchers/toMatchStorySnapshot.ts"],
    // browser: {
    //   enabled: true,
    //   provider: "playwright",
    //   // commands: {
    //   //   takeSnapshot,
    //   //   compareSnapshots,
    //   //   setViewportSize,
    //   //   setPreviewFullScreen,
    //   //   exitPreviewFullScreen,
    //   //   // Dev commands. Import from './src/tests/visual-tests/commands
    //   //   // subscribeToBrowserConsole,
    //   //   // startTrace,
    //   //   // endTrace,
    //   // },
    //   instances: [
    //     {
    //       browser: "chromium",
    //       headless: false,
    //     },
    //   ],
    // },
  },
});
