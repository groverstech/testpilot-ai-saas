import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Bundle workspace packages (they ship TypeScript source); keep npm deps external.
  noExternal: [/^@testpilot\//],
  external: ["@prisma/client", ".prisma/client"],
});
