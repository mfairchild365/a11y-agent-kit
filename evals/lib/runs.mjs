// Shared helpers for the eval scripts that read skill-creator's run layout:
//   <workspace>/eval-<name>/<config>/run-<N>/...
import fs from "node:fs";
import path from "node:path";

const subdirs = (dir, test) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && test(e.name)).map((e) => e.name).sort() : [];

// Every run-* directory, as { dir, evalName, config }, sorted by path.
export function runDirs(workspace) {
  const runs = [];
  for (const ev of subdirs(workspace, (n) => n.startsWith("eval-"))) {
    for (const config of subdirs(path.join(workspace, ev), () => true)) {
      for (const run of subdirs(path.join(workspace, ev, config), (n) => n.startsWith("run-"))) {
        runs.push({ dir: path.join(workspace, ev, config, run), evalName: ev.slice("eval-".length), config });
      }
    }
  }
  return runs;
}

export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));
