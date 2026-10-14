// How the eval scripts start the `claude` CLI.
//
// Arguments are passed as a list and never through a shell, so a prompt containing & ( ) > or quotes is
// delivered as one argument on every platform. Set CLAUDE_BIN to use another executable. A CLAUDE_BIN that
// ends in .mjs or .js is run with this Node (the tests use that for a fake CLI).
import { spawn } from "node:child_process";

export function claudeCommand(args) {
  const bin = process.env.CLAUDE_BIN || "claude";
  return /\.(mjs|js)$/.test(bin) ? { cmd: process.execPath, args: [bin, ...args] } : { cmd: bin, args };
}

export function spawnClaude(args, options) {
  const { cmd, args: full } = claudeCommand(args);
  return spawn(cmd, full, { ...options, shell: false });
}
