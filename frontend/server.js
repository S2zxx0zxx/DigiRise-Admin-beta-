// Lightweight static file server for the DigiRise Partner OS.
// Serves the /app root directory on port 3000 so the Kubernetes ingress
// preview URL renders index.html, partner.html, admin.html, and all
// static assets (css/, js/, favicon, manifest, service-worker).
const express = require('express');
const path = require('path');

const app = express();
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Serve everything under /app as static assets. No SPA fallback — we
// want direct URLs like /partner.html and /admin.html to work.
app.use(
  express.static(ROOT, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      // Never cache HTML so design changes surface immediately.
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`[digirise] static server listening on http://${HOST}:${PORT} (root=${ROOT})`);
});
