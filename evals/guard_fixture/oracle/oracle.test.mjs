// The grader's own checks, independent of anything the agent wrote: does the page now pass the two
// automatable Guards? Run against the agent's index.html, with the fixture's own helpers.
import test from "node:test";
import assert from "node:assert/strict";
import { withPage, axeViolations } from "./helpers.mjs";

test("oracle: button-name", async () => {
  await withPage("index.html", async (page) => assert.deepEqual(await axeViolations(page, ["button-name"]), []));
});
test("oracle: color-contrast", async () => {
  await withPage("index.html", async (page) => assert.deepEqual(await axeViolations(page, ["color-contrast"]), []));
});
