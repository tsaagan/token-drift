#!/usr/bin/env node

import { homedir } from "node:os";
import { main } from "./main.js";

// The progress note goes to stderr, and only to a terminal, so piped output stays clean.
const progress = process.stderr.isTTY
  ? (message: string): void => void process.stderr.write(message)
  : undefined;

const result = main(
  process.argv.slice(2),
  process.env,
  homedir(),
  process.stdout.isTTY,
  progress
);
if (progress) process.stderr.write("\r\x1b[K");
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.exitCode;
