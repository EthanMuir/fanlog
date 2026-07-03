import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Custom plugin to serve the pre-built React UI app from public/app/
// as raw static files, bypassing Vite's module transform pipeline.
function serveNestedApp() {
  return {
    name: 'serve-nested-app',
    configureServer(server) {
      // This middleware runs BEFORE Vite's built-in middleware,
      // so it intercepts /app/* requests before Vite can try to
      // transform the JS/CSS or fall back to the root index.html.
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/app')) return next();

        // Parse the URL path (strip query string)
        const urlPath = req.url.split('?')[0];
        const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

        // Determine the file to serve
        let filePath;
        if (urlPath === '/app' || urlPath === '/app/') {
          filePath = path.resolve(__dirname, 'public/app/index.html');
        } else {
          // Map /app/assets/xyz.js -> public/app/assets/xyz.js
          const relative = urlPath.replace(/^\/app/, '');
          filePath = path.resolve(__dirname, 'public/app' + relative);
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          // Determine content type
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.json': 'application/json',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.end(fs.readFileSync(filePath));
          return;
        }

        // If the file doesn't exist under /app, serve app/index.html
        // (SPA client-side routing fallback within the React app)
        const fallback = path.resolve(__dirname, 'public/app/index.html');
        if (fs.existsSync(fallback)) {
          res.setHeader('Content-Type', 'text/html');
          res.end(fs.readFileSync(fallback));
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [serveNestedApp()],
  base: './',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
