import 'dotenv/config';
import express, {Application} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes/routes';

const app: Application = express();
const PORT = process.env.PORT || 5000;

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

// Body parsing — allow up to 6 MB for base64 image payloads
app.use(express.json({limit: '6mb'}));
app.use(express.urlencoded({extended: true, limit: '6mb'}));

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

app.listen(PORT, () => {
  console.log(`\n🚀 ARIA Backend running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health\n`);
});

export default app;