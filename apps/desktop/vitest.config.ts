import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
      exclude: [
        "**/src/vite-env.d.ts",
        "**/src/main.tsx",
        "**/*.d.ts",
        "**/src/test/**",
      ],
    },
  },
});

