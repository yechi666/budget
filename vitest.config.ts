import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      // Silence the Next.js "server-only" guard -- tests run in Node, not the
      // Next.js runtime, so the real package would throw on import.
      "server-only": resolve(__dirname, "src/__tests__/mocks/server-only.ts"),
      "@": resolve(__dirname, "src"),
    },
  },
});
