'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import MapLibre, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { getCellData, analyzePatch } from '../lib/api';
import { CellScore } from '@geo-lens/geocube';
import DeckGL from '@deck.gl/react';
import { ZoomIn, Satellite, CloudRain } from 'lucide-react';
import { getOverlayLayers } from './MapOverlay';
import Sidebar from './Sidebar';
// import ChatPanel from './ChatPanel'; // Removed

// Compact cell format from tile endpoint
type CompactCell = {
    i: string;   // h3Index
    w: number;   // water score
    l: number;   // landslide score
    s: number;   // seismic score
    m: number;   // mineral score
    p?: number;  // precipitation (mm)
    e?: number;  // elevation (optional)
};

interface Props {
    selectedLayer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite' | 'precipitation';
    onLayerChange: (layer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite' | 'precipitation') => void;
}

export default function MapView({ selectedLayer, onLayerChange }: Props) {
    const [viewState, setViewState] = useState({
        longitude: 19.35,
        latitude: 43.75,
        zoom: 7
    });

    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [selectedCell, setSelectedCell] = useState<CellScore | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showZoomMsg, setShowZoomMsg] = useState(false);

    const MIN_ZOOM = 6;

    useEffect(() => {
        // Register PMTiles Protocol (Optional, keeping for future use)
        const protocol = new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);

        return () => {
            maplibregl.removeProtocol('pmtiles');
        };
    }, []);

    const onHover = (info: any) => {
        setHoverInfo(info);
    };

    // Debounced fetch for detailed cell data
    const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
    const fetchDetailedData = useCallback((h3Index: string) => {
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(async () => {
            try {
                const detailedData = await getCellData(h3Index);
                setSelectedCell(detailedData);
            } catch (e) {
                console.error("Failed to fetch details", e);
            }
        }, 300); // 300ms debounce
    }, []);

    const onClick = async (info: any) => {
        // Send log to server
        fetch('http://localhost:3001/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'DECK_CLICK', info: { object: info.object, layerId: info.layer?.id } })
        }).catch(() => { });

        if (!info.object) {
            console.log("[Map] Click without object", info);
            return;
        }

        const compactCell = info.object as CompactCell;
        console.log("[Map] Click on CompactCell", compactCell);

        // Create mock CellScore for instant UI update
        const mockCell: CellScore = {
            h3Index: compactCell.i,
            water: { stress: 0, recharge: 0, score: compactCell.w },
            landslide: { susceptibility: compactCell.l, history: false, score: compactCell.l },
            seismic: { pga: 0, class: 'LOW', score: compactCell.s },
            mineral: { prospectivity: compactCell.m, type: 'Unknown', score: compactCell.m },
            metadata: { lat: 0, lon: 0, elevation: compactCell.e || 0, biome: 'Unknown' }
        };

        // Add precipitation if available
        if (compactCell.p !== undefined) {
            mockCell.water.rain24h = compactCell.p;
        }

        setSelectedCell(mockCell); // Instant optimistic update
        setAnalysis(null);

        // Fetch detailed data with debounce
        fetchDetailedData(compactCell.i);
    };

    const handleAnalyze = async () => {
        if (!selectedCell) return;
        setLoading(true);
        try {
            const result = await analyzePatch(selectedCell.h3Index, {
                slope: 45, // Mock context
                landslideHistory: selectedCell.landslide.history ? 'HIGH' : 'LOW'
            });
            setAnalysis(result);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const onMoveEnd = (evt: any) => {
        const zoom = evt.target.getZoom();
        setShowZoomMsg(zoom < MIN_ZOOM);
    };

    return (
        <div className="relative w-full h-full font-sans">
            {/* Zoom Indicator */}
            {showZoomMsg && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur z-20 flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                    <ZoomIn className="w-4 h-4" /> Zoom in to view data
                </div>
            )}

            {/* Zoom Hint */}
            {viewState.zoom < 6 && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 rounded-full backdrop-blur-sm pointer-events-none z-10 flex items-center gap-2">
                    <ZoomIn className="w-4 h-4" /> Zoom in to view data
                </div>
            )}

            {/* Layer Controls - Top Right (Shifted down below NavigationControl) */}
            <div className="absolute top-36 right-4 flex flex-col gap-2 z-10">
                <button
                    onClick={() => onLayerChange(selectedLayer === 'satellite' ? 'water' : 'satellite')}
                    className={`p-2 rounded-lg shadow-lg transition-all ${selectedLayer === 'satellite'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    title="Toggle Satellite"
                >
                    <Satellite className="w-5 h-5" />
                </button>

                <button
                    onClick={() => onLayerChange(selectedLayer === 'precipitation' ? 'water' : 'precipitation')}
                    className={`p-2 rounded-lg shadow-lg transition-all ${selectedLayer === 'precipitation'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    title="Toggle Rain"
                >
                    <CloudRain className="w-5 h-5" />
                </button>
            </div>

            {/* Floating Dock Layer Control - Light Theme */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md p-1.5 rounded-2xl shadow-xl z-10 flex gap-1 border border-slate-200 ring-1 ring-black/5">
                {/* Risk Engine V1: Only water, landslide, seismic (mineral hidden) */}
                {(['water', 'landslide', 'seismic'] as const).map(layer => (
                    <button
                        key={layer}
                        onClick={() => onLayerChange(layer)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${selectedLayer === layer
                            ? 'bg-slate-800 text-white shadow-lg ring-1 ring-black/5'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        {layer}
                    </button>
                ))}
            </div>

            {/* Legend - Bottom Left (Moved to avoid overlap with Sidebar) */}
            {selectedLayer !== 'satellite' && (
                <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl z-10 w-64 ring-1 ring-black/5">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{selectedLayer} Risk</span>
                        <span className="text-[10px] text-slate-400">0 - 100</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-gradient-to-r from-slate-100 via-slate-400 to-slate-800 mb-1"
                        style={{
                            background: selectedLayer === 'water' ? 'linear-gradient(to right, #E3F2FD, #0D47A1)' :
                                selectedLayer === 'landslide' ? 'linear-gradient(to right, #EFEBE9, #3E2723)' :
                                    selectedLayer === 'seismic' ? 'linear-gradient(to right, #FFEBEE, #B71C1C)' :
                                        selectedLayer === 'mineral' ? 'linear-gradient(to right, #FFF8E1, #FF6F00)' :
                                            selectedLayer === 'precipitation' ? 'linear-gradient(to right, #E0F7FA, #01579B)' : ''
                        }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>{selectedLayer === 'precipitation' ? '0 mm' : 'Low'}</span>
                        <span>{selectedLayer === 'precipitation' ? '> 50 mm' : 'High'}</span>
                    </div>
                </div>
            )}

            <DeckGL
                initialViewState={viewState}
                controller={true}
                onViewStateChange={({ viewState }) => setViewState(viewState as any)}
                layers={!showZoomMsg ? getOverlayLayers({ selectedLayer, onHover, onClick }) : []}
                onClick={onClick}
                onHover={onHover}
                pickingRadius={5}
                glOptions={{
                    preserveDrawingBuffer: true,
                    failIfMajorPerformanceCaveat: false
                }}
            >
                <MapLibre
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                >
                    <NavigationControl position="top-right" />

                    {/* Sentinel-2 Cloudless WMS (EOX) - Conditional */}
                    {selectedLayer === 'satellite' && (
                        <Source
                            id="sentinel2-source"
                            type="raster"
                            tiles={[
                                'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'
                            ]}
                            tileSize={256}
                            attribution="Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)"
                        >
                            <Layer id="sentinel2-layer" type="raster" />
                        </Source>
                    )}

                    {/* ESHM20 Seismic Hazard WMS (EFEHR) - Placeholder WMS as direct URL requires specific ID */}
                    {selectedLayer === 'seismic' && (
                        <div className="absolute bottom-20 left-6 bg-white/90 backdrop-blur p-2 rounded text-xs text-slate-500 z-10 border border-slate-200 shadow-sm">
                            Source: ESHM20 (EFEHR) via GeoLens
                        </div>
                    )}
                </MapLibre>
            </DeckGL>

            {/* Tooltip */}
            {hoverInfo && hoverInfo.object && (
                <div
                    className="absolute bg-slate-900/90 text-white p-3 rounded-lg text-xs pointer-events-none z-30 backdrop-blur border border-slate-700 shadow-xl"
                    style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}
                >
                    <div className="font-mono text-slate-400 mb-1">{hoverInfo.object.i}</div>
                    <div className="font-bold text-lg">
                        {selectedLayer === 'satellite'
                            ? 'N/A'
                            : (() => {
                                const obj = hoverInfo.object as CompactCell;

                                if (selectedLayer === 'precipitation') {
                                    return `${(obj.p || 0).toFixed(1)} mm`;
                                }
                                const scoreMap = { water: obj.w, mineral: obj.m, landslide: obj.l, seismic: obj.s };
                                return (scoreMap[selectedLayer as keyof typeof scoreMap] * 100).toFixed(0);
                            })()
                        }
                        {selectedLayer !== 'satellite' && selectedLayer !== 'precipitation' && <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>}
                    </div>
                </div>
            )}

            {/* Advanced Sidebar */}
            <Sidebar
                cell={selectedCell}
                onClose={() => setSelectedCell(null)}
                onAnalyze={handleAnalyze}
                loading={loading}
                analysis={analysis}
                selectedLayer={selectedLayer}
                onLayerChange={onLayerChange}
            />

            {/* Chat Panel Removed */}
        </div>
    );
}
