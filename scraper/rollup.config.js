import typescript from "rollup-plugin-typescript2";
import { string } from "rollup-plugin-string";
import json from "rollup-plugin-json";
import commonjs from "rollup-plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";

module.exports = {
  input: "src/main.ts",
  output: {
    file: "out/main.js",
    format: "cjs",
    sourcemap: "inline",
  },
  plugins: [
    typescript(),
    string({
      include: ["**/*.txt", "**/*.svg"],
    }),
    json({}),
    resolve({
      extensions: [".js", ".ts"], // Extensions to resolve
    }),
    commonjs(),
  ],
  external: ["zlib", "fs-extra", "request-promise-native"],
};
