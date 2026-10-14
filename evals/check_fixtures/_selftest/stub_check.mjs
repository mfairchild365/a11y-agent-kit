#!/usr/bin/env node
// A stand-in check used only to test the fixture runner (evals/test_check_runner.mjs).
// It "finds" every data-flag="id" in the file, and stops with "cap-reached" if the file asks for it.
import fs from "node:fs";
const html = fs.readFileSync(process.argv[2], "utf8");
const findings = [...html.matchAll(/data-flag="([^"]+)"/g)].map((m) => ({ id: m[1] }));
console.log(JSON.stringify({ findings, stopReason: html.includes('data-stop="cap"') ? "cap-reached" : "complete" }));
