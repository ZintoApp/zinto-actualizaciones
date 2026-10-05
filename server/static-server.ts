import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  
}

export function serveStatic(app: Express) {


  const distPath = process.env.NODE_ENV === 'development'
    ? path.resolve(process.cwd(), "dist", "public")
    : path.resolve(__dirname, "public");


  if (!fs.existsSync(distPath)) {
    if (process.env.NODE_ENV === 'development') {
      
      
      


      app.use("*", (req, res, next) => {

        if (req.originalUrl.startsWith('/api/')) {
          return next();
        }
        res.status(503).send(`
          <html>
            <head><title>BotHivePlus - Build Required</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>🔧 Build Required</h1>
              <p>The client hasn't been built yet.</p>
              <p>Please run: <code style="background: #f0f0f0; padding: 5px;">npm run build:dev</code></p>
              <p>Then restart the server with: <code style="background: #f0f0f0; padding: 5px;">npm run dev</code></p>
              <hr>
              <p><small>API endpoints are still available at /api/*</small></p>
            </body>
          </html>
        `);
      });
      return;
    } else {
      throw new Error(
        `Could not find the build directory: ${distPath}, make sure to build the client first`,
      );
    }
  }


  // Proxy country-flag SVGs through our origin (avoids VPN/proxy ERR_NAME_NOT_RESOLVED)
  app.get("/flags/:code.svg", async (req, res) => {
    const code = (req.params.code || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!code || code.length !== 2) {
      return res.status(400).end();
    }
    try {
      const url = `https://purecatamphetamine.github.io/country-flag-icons/3x2/${code}.svg`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        return res.status(resp.status).end();
      }
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=86400");
      const body = await resp.arrayBuffer();
      res.end(Buffer.from(body));
    } catch {
      res.status(502).end();
    }
  });

  app.use('/public', express.static(distPath, { maxAge: '1h', etag: true, lastModified: true }));


  app.use(express.static(distPath, { maxAge: '1h', etag: true, lastModified: true }));


  app.use("*", (req, res, next) => {

    if (req.originalUrl.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
