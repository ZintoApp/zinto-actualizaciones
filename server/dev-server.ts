#!/usr/bin/env node

import dotenv from "dotenv";
import path from "path";

const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });
import('./index.js').catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
