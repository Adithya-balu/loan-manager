// Vercel Function entry point. Vercel auto-detects any file under /api as a
// serverless function; re-exporting the Express app from server/src lets the
// whole API run as a single function while the rest of the repo (client/
// shared) is built separately (see vercel.json + package.json#vercel-build).
export { default } from '../server/src/index.js';
