/**
 * Vite `import.meta.env` and CSS `?inline` imports used by the content script.
 *
 * These are declared here so type-aware lint does not depend on resolving the
 * `vite` package from the project root under pnpm.
 */

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css?inline' {
  const source: string;
  export default source;
}
