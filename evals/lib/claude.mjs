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

// --budget <usd> becomes claude's --max-budget-usd: a hard cap on what one run may spend.
export const budgetArgs = (budget) => (budget == null ? [] : ["--max-budget-usd", String(budget)]);
export function parseBudget(text) {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--budget needs a positive number of dollars, got "${text}"`);
  return n;
}
// What a run cost, from the result event's total_cost_usd, or "n/a" when the run was stopped before it reported.
export const costText = (usd) => (typeof usd === "number" ? `$${usd.toFixed(4)}` : "n/a");
