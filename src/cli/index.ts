#!/usr/bin/env node

import { homedir } from "node:os";
import { main } from "./main.js";

const result = main(
  process.argv.slice(2),
  process.env,
  homedir(),
  process.stdout.isTTY
);
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.exitCode;
