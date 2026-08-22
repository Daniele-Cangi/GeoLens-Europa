import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { h3Cache } from '../services/h3Cache';
import { getH3ScoresForArea } from '../services/tileOrchestrator';
import { cellToLatLng } from 'h3-js';

export async function cellRoutes(fastify: FastifyInstance) {
    /**
     * GET /cell/:h3Index - Get detailed data for a specific cell with real-time NASA data
     */
    fastify.get<{
        Params: { h3Index: string };
    }>('/api/cell/:h3Index', {
        config: {
            rateLimit: {
                max: 100,
                timeWindow: '1 minute'
            }
        }
    }, async (request: FastifyRequest<{ Params: { h3Index: string } }>, reply: FastifyReply) => {
        const { h3Index } = request.params;

        if (!h3Index) {
            return reply.code(400).send({ error: 'Missing h3Index' });
        }

        console.log(`[API] Fetching cell data with real-time NASA data for: ${h3Index}`);

        try {
            // Get cell coordinates
            const [lat, lon] = cellToLatLng(h3Index);

            // Get H3 resolution from index (h3-js provides getResolution function)
            const { getResolution } = await import('h3-js');
            const resolution = getResolution(h3Index);

            // Create a small bounding box around the cell to trigger tileOrchestrator
            const delta = 0.001; // Very small margin to minimize cells generated
            const area = {
                minLat: lat - delta,
                maxLat: lat + delta,
                minLon: lon - delta,
                maxLon: lon + delta,
                resolution: resolution
            };

            // Fetch data through tileOrchestrator (includes NASA precipitation)
            // This will throw 503 if Strict Mode is violated
            const { profile } = request.query as { profile?: string };
            const results = await getH3ScoresForArea(area, { profile });

            // Find the exact cell in results
            const cellData = results.find(r => r.h3Index === h3Index);

            if (cellData) {
                console.log(`[API] Cell data fetched with NASA precipitation for ${h3Index}`);
                return cellData;
            } else {
                // Fallback to cache if tileOrchestrator didn't return the cell
                const cached = h3Cache.get(h3Index);
                if (cached) {
                    console.log(`[API] Fallback to cache for ${h3Index}`);
                    return cached;
                } else {
                    console.log(`[API] Cell not found: ${h3Index}`);
                    return reply.code(404).send({ error: 'Cell data not found' });
                }
            }
        } catch (error: any) {
            console.error(`[API] Error fetching cell data for ${h3Index}:`, error);

            // Respect specific error codes (e.g. 503 Strict Mode)
            if (error.statusCode) {
                return reply.code(error.statusCode).send({
                    error: error.message,
                    code: error.code,
                    details: error.details
                });
            }

            // Fallback to cache on generic error
            const cached = h3Cache.get(h3Index);
            if (cached) {
                console.log(`[API] Error fallback to cache for ${h3Index}`);
                return cached;
            }

            return reply.code(500).send({ error: 'Failed to fetch cell data' });
        }
    });
}
