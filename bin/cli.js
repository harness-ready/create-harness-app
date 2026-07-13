#!/usr/bin/env node

import { main } from '../lib/cli.js';

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
