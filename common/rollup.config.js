import typescript from "rollup-plugin-typescript2";

module.exports = {
  input: "src/index.ts",
  output: {
    file: "out/index.js",
    format: "cjs",
    sourcemap: "inline",
  },
  plugins: [typescript()],
  external: [],
};
