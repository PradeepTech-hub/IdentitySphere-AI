import { createContext, useContext, useEffect, useState } from 'react';
import { initPlatformData, getPlatformCache } from '../services/dataService';
import { loadGovernanceSnapshot, getGovernanceCache } from '../services/governanceService';

const PlatformDataContext = createContext({
  loading: true,
  data: null,
  refresh: async () => {},
});

export function PlatformDataProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(() => getPlatformCache());

  const refresh = async () => {
    setLoading(true);
    try {
      const [loaded] = await Promise.all([initPlatformData(), loadGovernanceSnapshot()]);
      setData({ ...loaded, governance: getGovernanceCache() });
    } catch {
      setData(getPlatformCache());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

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
