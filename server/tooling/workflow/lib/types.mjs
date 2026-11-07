import { readFileSync } from "node:fs";

/** Loads server/tooling/workflow/types.json. @param {string} root repo root */
export function loadTypes(root) {
  return JSON.parse(readFileSync(`${root}/server/tooling/workflow/types.json`, "utf8"));
}
