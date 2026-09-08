#!/bin/sh
set -eu
# A migration error stops startup instead of serving an incompatible schema.
node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
exec node apps/api/dist/main.js
