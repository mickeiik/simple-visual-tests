interface ImportMetaEnv {
  readonly VITE_UPDATE_VISUAL_SNAPSHOTS: string;
  readonly VITE_STORYBOOK_URL: string;
  readonly VITE_VISUAL_TEST_IMAGES_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
