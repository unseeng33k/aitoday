import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "browser",
  outfile: "main.js",
  sourcemap: false,
  external: ["obsidian", "electron", "@codemirror/*"]
});
