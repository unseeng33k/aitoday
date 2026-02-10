import esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["main.ts"],
    bundle: true,
    outfile: "main.js",
    target: "es2018",
    external: ["obsidian"],
    format: "cjs",
    platform: "browser",
    logLevel: "info"
  })
  .catch(() => process.exit(1));

