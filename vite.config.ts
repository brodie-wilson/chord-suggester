import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")

  // Without a client ID the app can't authenticate, and dead-code elimination
  // strips the whole Audiotool SDK out of the bundle — a build that looks fine
  // but can never log in. Say so loudly at build time.
  if (!env.VITE_AUDIOTOOL_CLIENT_ID) {
    console.warn(
      "\n  WARNING: VITE_AUDIOTOOL_CLIENT_ID is not set.\n" +
        "  The build will not be able to sign in to Audiotool.\n" +
        "  Set it in .env.local (see .env.example) or in your host's environment variables.\n",
    )
  }

  return {
    build: {
      // The Audiotool SDK identifies its Pointer type by comparing
      // Function.name (`t.T.name === Pointer.name`). Default minification
      // mangles class names, so that check misfires and entity creation dies
      // with "Cannot read properties of undefined (reading 'slice')" — the
      // dev server is unaffected because it doesn't minify. Terser with
      // keep_classnames preserves the names the comparison relies on.
      minify: "terser" as const,
      terserOptions: {
        keep_classnames: true,
        keep_fnames: true,
      },
    },
    server: {
      // OAuth redirects must come back to 127.0.0.1 — Audiotool rejects
      // "localhost" as a redirect URI host, so the dev server must not
      // serve on it either.
      host: "127.0.0.1",
      port: 5173,
    },
  }
})
