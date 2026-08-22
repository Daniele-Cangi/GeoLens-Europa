import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import path from 'path';
import * as dotenv from 'dotenv';
import { CellScore } from '@geo-lens/geocube';
import rateLimitPlugin from './plugins/rateLimit';
import { h3AreaRoutes } from './routes/h3-area';
import { h3AreaV2Routes } from './routes/h3-area-v2';
import { h3TileRoutes } from './routes/h3-tile';
import { h3TileOptimizedRoutes } from './routes/h3-tile-optimized';
import { cellRoutes } from './routes/cell';
import { aiRoutes } from './routes/ai';
import { stormwaterRoutes } from './routes/stormwater';

// Load environment variables
dotenv.config();

const server = Fastify({ logger: true });

// Core plugins
server.register(cors);
server.register(compress, { global: true }); // Gzip/Deflate compression
server.register(rateLimitPlugin);
// Routes

server.register(h3AreaRoutes); // V1 - backward compatible
server.register(h3AreaV2Routes); // V2 - optimized
server.register(h3TileRoutes); // Legacy tile endpoint
server.register(h3TileOptimizedRoutes); // OPTIMIZED tile endpoint (use this!)
server.register(cellRoutes); // Single cell details
server.register(aiRoutes); // AI - optional enhancement (works without GEMINI_API_KEY)
server.register(stormwaterRoutes); // P1 Stormwater Assets

// Serve Static Assets (Tiles & Data)
server.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/static/', // Access via /static/tiles/... or /static/data/...
    acceptRanges: true,
    decorateReply: false
});

server.get('/health', async () => {
    return { status: 'ok' };
});

server.get('/', async () => {
    return {
        service: 'GeoLens API',
        version: '0.1.0',
        endpoints: {
            health: '/health',
            tiles: '/api/h3/tile/optimized',
            analysis: '/api/ai/analyze'
        }
    };
});

// LEGACY AI ENDPOINTS - DEPRECATED
// These endpoints are kept for backward compatibility but should not be used.
// Use /api/ai/* endpoints instead (see routes/ai.ts)
// TODO: Remove after frontend migration (deprecation date: TBD)

// Temporary debug endpoint
server.post('/api/log', async (request, reply) => {
    console.log('[CLIENT LOG]', request.body);
    return { success: true };
});

const start = async () => {
    try {
        await server.listen({ port: 3003, host: '0.0.0.0' });
        console.log('API Server running at http://localhost:3003');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
