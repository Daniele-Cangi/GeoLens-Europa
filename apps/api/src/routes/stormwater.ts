
import { FastifyInstance } from 'fastify';
import { importAssets, getAssetRisk } from '../services/stormwater/assetService';

export async function stormwaterRoutes(fastify: FastifyInstance) {

    // Import Assets
    fastify.post('/api/stormwater/assets/import', async (req, reply) => {
        try {
            const geojson = req.body as GeoJSON.FeatureCollection;
            if (!geojson || !geojson.features) {
                return reply.code(400).send({ error: 'Invalid GeoJSON' });
            }
            const ids = importAssets(geojson);
            return { success: true, count: ids.length, ids };
        } catch (err: any) {
            req.log.error(err);
            return reply.code(500).send({ error: err.message });
        }
    });

    // Get Asset Risk
    fastify.get<{ Params: { id: string } }>('/api/stormwater/assets/:id/risk', async (req, reply) => {
        try {
            const { id } = req.params;
            const riskReport = await getAssetRisk(id);

            if (!riskReport) {
                return reply.code(404).send({ error: 'Asset not found' });
            }
            return riskReport;

        } catch (err: any) {
            // Handle 503 Strict Mode from Orchestrator
            if (err.statusCode) {
                return reply.code(err.statusCode).send({
                    error: err.message,
                    code: err.code,
                    details: err.details
                });
            }
            req.log.error(err);
            return reply.code(500).send({ error: 'Failed to calculate asset risk' });
        }
    });

    // Build Network
    fastify.post('/api/stormwater/network/build', async (req, reply) => {
        try {
            const geojson = req.body as GeoJSON.FeatureCollection;
            if (!geojson || !geojson.features) {
                return reply.code(400).send({ error: 'Invalid GeoJSON' });
            }

            // 1. Import Assets (Reuse service)
            // Note: importAssets returns IDs, we need the actual objects.
            // Refactor hint: importAssets stores them in `assetStore`.
            const ids = importAssets(geojson);
            const { getAssetsByIds } = require('../services/stormwater/assetService');
            const assets = getAssetsByIds(ids); // Need to export this helper

            // 2. Build Graph
            const { NetworkBuilder } = require('../services/stormwater/networkGraph');
            const builder = new NetworkBuilder();
            const network = builder.build(assets);

            // Store in-memory for MVP (Last built)
            (global as any).lastNetwork = network;

            return network;

        } catch (err: any) {
            req.log.error(err);
            return reply.code(500).send({ error: err.message });
        }
    });

    // Get Network Risk
    fastify.get('/api/stormwater/network/:id/risk', async (req, reply) => {
        try {
            // Retrieve network (MVP: use global lastNetwork)
            const network = (global as any).lastNetwork;
            if (!network) {
                return reply.code(404).send({ error: 'Network not found (Build one first)' });
            }

            const { NetworkBuilder } = require('../services/stormwater/networkGraph');
            const builder = new NetworkBuilder(); // Just for methods

            // 1. Enrich (Elevation)
            await builder.enrichWithElevation(network);

            // 2. Orient
            builder.orientEdges(network);

            // 3. Compute Risk
            const results = await builder.computeRisk(network, 'stormwater');

            return {
                networkId: network.id,
                ...results
            };

        } catch (err: any) {
            req.log.error(err);
            return reply.code(500).send({ error: err.message, details: err.details });
        }
    });
}
