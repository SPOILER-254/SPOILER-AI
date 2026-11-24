import http from 'http';
import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { config } from './server/config.ts';
import './server/db.ts';
import { registerRoutes } from './server/routes.ts';
import { setupWebSocketServer } from './server/realtime.ts';

async function bootstrap() {
  const app = express();
  app.set('trust proxy', 1);

  // Capture rawBody for Meta & Stripe HMAC webhook signature verification
  app.use(
    express.json({
      limit: '12mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Clean security headers (never set X-Frame-Options so AI Studio preview iframe works)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  registerRoutes(app);

  // Global API error handler
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);
  setupWebSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`SPOILER AI server listening on port ${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start SPOILER AI server:', err);
  process.exit(1);
});
