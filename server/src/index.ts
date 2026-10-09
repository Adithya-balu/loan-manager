import app from './app.js';

const PORT = Number(process.env.PORT ?? 4000);

// Vercel Functions invoke the exported app directly rather than listening on
// a port, so only start a listener when running as a normal Node process.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Loan Manager API running on http://localhost:${PORT}`);
  });
}

// Default export so this app can be used directly as a Vercel Function
// handler (see /api/index.ts at the repo root).
export default app;
