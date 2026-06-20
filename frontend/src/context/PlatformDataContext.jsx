import { createContext, useContext, useEffect, useState } from 'react';
import { initPlatformData, getPlatformCache } from '../services/dataService';

const PlatformDataContext = createContext({
  loading: true,
  data: null,
  refresh: async () => {},
});

export function PlatformDataProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const refresh = async () => {
    setLoading(true);
    const loaded = await initPlatformData();
    setData(loaded);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm font-orbitron">Loading identity intelligence…</p>
        </div>
      </div>
    );
  }

  return (
    <PlatformDataContext.Provider value={{ loading, data, refresh }}>
      {children}
    </PlatformDataContext.Provider>
  );
}

export function usePlatformData() {
  return useContext(PlatformDataContext);
}

/** Sync accessors — only valid after PlatformDataProvider finished loading */
export function getLiveIdentities() {
  return getPlatformCache()?.identities || [];
}

export function getLiveRiskEvents() {
  return getPlatformCache()?.risk_events || [];
}

export function getLiveIncidents() {
  return getPlatformCache()?.incidents || [];
}

export function getLiveBlastRadii() {
  return getPlatformCache()?.blast_radii || [];
}

export function getLiveCompliance() {
  return getPlatformCache()?.compliance_mapping || [];
}

export function getLiveHeatmap() {
  return getPlatformCache()?.privilege_heatmap || null;
}
