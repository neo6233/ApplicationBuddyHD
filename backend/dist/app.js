"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const os_1 = __importDefault(require("os"));
const routes_1 = __importDefault(require("./routes/routes"));
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
const getLocalIpAddress = () => {
    const networkInterfaces = os_1.default.networkInterfaces();
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
app.use((0, helmet_1.default)());
// CORS
const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : '*';
app.use((0, cors_1.default)({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
// Body parsing — allow base64 document payloads for eligibility checks.
app.use(express_1.default.json({ limit: '15mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '15mb' }));
// Logging
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('dev'));
}
// Routes
app.use('/api', routes_1.default);
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
});
// Global error handler
app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ message: 'Internal server error' });
});
app.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();
    const baseUrl = localIp ? `http://${localIp}:${PORT}` : `http://localhost:${PORT}`;
    console.log(`\n🚀 ARIA Backend running on ${baseUrl}`);
    console.log(`📡 Health check: ${baseUrl}/api/health`);
    console.log(`🌐 Bind host: ${HOST}\n`);
});
exports.default = app;
//# sourceMappingURL=app.js.map