process.env.TS_NODE_PROJECT = 'apps/api/tsconfig.json';
process.env.ADMIN_EMAIL ||= 'contract-export@example.invalid';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
require('../apps/api/src/export-openapi.ts');
