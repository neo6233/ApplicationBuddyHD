import 'dotenv/config';
import express, {Application} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import os from 'os';
import routes from './routes/routes';

const app: Application = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

const getLocalIpAddress = (): string | null => {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaces of Object.values(networkInterfaces)) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
};

// Security
app.use(helmet());

// CORS
const corsOrigin =
  process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
    ? process.env.CORS_ORIGIN.split(',').map((s: string) => s.trim())
    : '*';
app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// Body parsing — allow base64 document payloads for eligibility checks.
app.use(express.json({limit: '15mb'}));
app.use(express.urlencoded({extended: true, limit: '15mb'}));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({message: 'Route not found'});
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({message: 'Internal server error'});
  },
);

app.listen(PORT, HOST, () => {
  const localIp = getLocalIpAddress();
  const baseUrl = localIp ? `http://${localIp}:${PORT}` : `http://localhost:${PORT}`;

  console.log(`\n🚀 ARIA Backend running on ${baseUrl}`);
  console.log(`📡 Health check: ${baseUrl}/api/health`);
  console.log(`🌐 Bind host: ${HOST}\n`);
});

export default app;
