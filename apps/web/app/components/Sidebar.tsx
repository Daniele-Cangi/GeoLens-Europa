'use client';

import React from 'react';
import { CellScore } from '@geo-lens/geocube';
import { Droplets, Mountain, Activity, Sparkles, X } from 'lucide-react';

type Props = {
    cell: CellScore | null;
    onClose: () => void;
    onAnalyze: () => void;
    loading: boolean;
    analysis: any;
    selectedLayer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite' | 'precipitation';
    onLayerChange: (layer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite' | 'precipitation') => void;
};

export default function Sidebar({ cell, onClose, onAnalyze, loading, analysis, selectedLayer, onLayerChange }: Props) {
    if (!cell) return null;

    return (
        <div className="absolute top-4 right-4 w-[22rem] bg-white/90 backdrop-blur-xl shadow-2xl rounded-2xl z-20 flex flex-col animate-in slide-in-from-right-10 duration-500 ring-1 ring-black/5 font-sans max-h-[calc(100vh-2rem)]">
            {/* Header - Compact */}
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-800 tracking-tight">
                        Hazard Cube
                    </h2>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {cell.h3Index}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Scrollable Content - Compact Padding */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 custom-scrollbar">

                {/* Layer Toggle Bar - Integrated */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar mb-1">
                    {(['water', 'landslide', 'seismic', 'precipitation'] as const).map(layer => (
                        <button
                            key={layer}
                            onClick={() => onLayerChange(layer)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all border whitespace-nowrap ${selectedLayer === layer
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            {layer === 'precipitation' ? 'Rain' : layer}
                        </button>
                    ))}
                </div>

                {/* Cards - Tighter Spacing */}
                <Card title="Water" icon={Droplets} color="blue" score={cell.water.score}>
                    <div className="grid grid-cols-2 gap-4 mb-2">
                        <MetricCompact label="Stress" value={cell.water.stress} />
                        <MetricCompact label="Recharge" value={cell.water.recharge} />
                    </div>
                    <div className="bg-blue-50/50 rounded-lg px-2 py-1.5 border border-blue-100/50 flex justify-between items-center">
                        <span className="text-[10px] text-blue-500 font-medium uppercase">Precipitation</span>
                        <div className="flex gap-3 text-xs font-mono font-semibold text-blue-700">
                            <span>24h: {cell.water.rain24h?.toFixed(1) ?? '-'}mm</span>
                            <span className="opacity-30">|</span>
                            <span>72h: {cell.water.rain72h?.toFixed(1) ?? '-'}mm</span>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 gap-3">
                    <Card title="Mass Movement" icon={Mountain} color="amber" score={cell.landslide.score}>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Susceptibility</span>
                            <span className="font-mono font-semibold text-slate-700">{cell.landslide.susceptibility.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-slate-500">History</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${cell.landslide.history
                                ? 'text-red-600 bg-red-50'
                                : 'text-emerald-600 bg-emerald-50'}`}>
                                {cell.landslide.history ? 'Yes' : 'No'}
                            </span>
                        </div>
                    </Card>

                    <Card title="Seismic" icon={Activity} color="red" score={cell.seismic.score}>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">PGA</span>
                            <span className="font-mono font-semibold text-slate-700">{cell.seismic.pga.toFixed(2)}g</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-slate-500">Class</span>
                            <span className="font-mono font-semibold text-slate-700">{cell.seismic.class}</span>
                        </div>
                    </Card>
                </div>

                {/* Metadata - One Line */}
                <div className="flex gap-2 text-[10px] justify-between px-1 text-slate-400 font-medium uppercase tracking-wider">
                    <span>Biome: {cell.metadata.biome}</span>
                    <span>Elev: {cell.metadata.elevation.toFixed(0)}m</span>
                </div>

                {/* Analysis Section (Sticky Bottom-ish but inside scroll if needed) */}
                {analysis ? (
                    <div className="relative bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-indigo-500" />
                                AI Assessment
                            </h4>
                            <span className="text-[10px] font-mono text-indigo-400">{Math.round(analysis.confidence * 100)}% Conf</span>
                        </div>
                        <p className="text-xs text-slate-700 leading-snug">
                            {analysis.reasoning}
                        </p>
                    </div>
                ) : (
                    <button
                        onClick={onAnalyze}
                        disabled={loading}
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-md transition-all flex justify-center items-center gap-2 mt-2 active:scale-[0.99]"
                    >
                        {loading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                        )}
                        <span className="text-xs font-bold uppercase tracking-wide">Analyze with AI</span>
                    </button>
                )}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    );
}

function Card({ title, icon: Icon, color, score, children }: { title: string, icon: React.ElementType, color: string, score: number, children: React.ReactNode }) {
    const theme = {
        blue: { text: 'text-blue-600', bg: 'bg-blue-500', light: 'bg-blue-50' },
        amber: { text: 'text-amber-600', bg: 'bg-amber-500', light: 'bg-amber-50' },
        red: { text: 'text-red-500', bg: 'bg-red-500', light: 'bg-red-50' },
    };

    const t = theme[color as keyof typeof theme] || theme.blue;

    return (
        <div className="bg-white/50 rounded-xl border border-slate-200/60 p-3 shadow-sm hover:border-slate-300 transition-colors">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${t.text}`} />
                    <h3 className="font-bold text-slate-700 text-xs tracking-tight uppercase">{title}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${t.bg} rounded-full`}
                            style={{ width: `${score * 100}%` }}
                        />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">{(score * 100).toFixed(0)}</span>
                </div>
            </div>
            <div className="space-y-1">
                {children}
            </div>
        </div>
    );
}

function MetricCompact({ label, value }: { label: string, value: number }) {
    return (
        <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">{label}</span>
            <span className="font-mono font-semibold text-slate-700">{value.toFixed(2)}</span>
        </div>
    );
}
