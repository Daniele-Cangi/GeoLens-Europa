import { FastifyInstance } from 'fastify';
import { getH3ScoresForArea } from '../services/tileOrchestrator';
import { h3Cache } from '../services/h3Cache';

// Utility to convert Tile XYZ to Lat/Lon BBox
function tileToBBox(x: number, y: number, z: number) {
    const tile2long = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
    const tile2lat = (y: number, z: number) => {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    };

    return {
        west: tile2long(x, z),
        north: tile2lat(y, z),
        east: tile2long(x + 1, z),
        south: tile2lat(y + 1, z)
    };
}

// Map Tile Zoom to H3 Resolution
function getResolutionForZoom(zoom: number): number {
    if (zoom < 5) return 2;
    if (zoom < 7) return 3;
    if (zoom < 9) return 4;
    if (zoom < 11) return 5;
    return 6;
}

export async function h3TileRoutes(server: FastifyInstance) {
    server.get<{ Querystring: { x: number; y: number; z: number } }>('/api/h3/tile', async (request, reply) => {
        const { x, y, z } = request.query;

        if (x === undefined || y === undefined || z === undefined) {
            return reply.code(400).send({ error: 'Missing tile coordinates (x, y, z)' });
        }

        // 1. Convert Tile to BBox
        const bbox = tileToBBox(Number(x), Number(y), Number(z));

        // 2. Determine H3 Resolution
        const res = getResolutionForZoom(Number(z));

        // 3. Fetch Data via Orchestrator
        const areaRequest = {
            minLon: bbox.west,
            minLat: bbox.south,
            maxLon: bbox.east,
            maxLat: bbox.north,
            resolution: res
        };

        try {
            const cells = await getH3ScoresForArea(areaRequest);
            return cells; // Return array directly for TileLayer
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to fetch tile data' });
        }
    });

    // Cache management endpoints
    server.post('/api/cache/clear', async (request, reply) => {
        h3Cache.clear();
        return { success: true, message: 'Cache cleared' };
    });

    server.post('/api/cache/invalidate-without-precip', async (request, reply) => {
        const invalidated = h3Cache.invalidateWithoutPrecip();
        return { success: true, invalidated, message: `Invalidated ${invalidated} entries without precipitation data` };
    });

    server.get('/api/cache/stats', async (request, reply) => {
        return { size: h3Cache.size() };
    });
}
