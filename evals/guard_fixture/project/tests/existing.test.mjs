import test from "node:test";
import assert from "node:assert/strict";
import { withPage } from "./helpers.mjs";

test("the page has a title and one h1", async () => {
  await withPage("index.html", async (page) => {
    assert.equal(await page.title(), "Roster");
    assert.equal(await page.locator("h1").count(), 1);
  });
});
