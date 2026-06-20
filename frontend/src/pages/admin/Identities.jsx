import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Users, Shield, AlertTriangle, Eye, ChevronLeft, ChevronRight, Database, UserCheck, UserX, Clock, Skull } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { getIdentities as getStoredIdentities } from '../../services/storageService';

const STATUS_CHIP_STYLES = {
  active: 'bg-green-500/15 text-green-400 border border-green-500/30',
  dormant: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  orphaned: 'bg-red-500/15 text-red-400 border border-red-500/30',
  offboarded: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  disabled: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
};

const STATUS_SUMMARY = [
  { key: 'active', label: 'Active', color: 'text-green-400', borderColor: 'border-green-500/30', icon: UserCheck },
  { key: 'dormant', label: 'Dormant', color: 'text-yellow-400', borderColor: 'border-yellow-500/30', icon: Clock },
  { key: 'orphaned', label: 'Orphaned', color: 'text-red-400', borderColor: 'border-red-500/30', icon: Skull },
  { key: 'offboarded', label: 'Offboarded', color: 'text-blue-400', borderColor: 'border-blue-500/30', icon: UserX },
  { key: 'disabled', label: 'Disabled', color: 'text-slate-400', borderColor: 'border-slate-500/30', icon: Shield },
];

const TYPE_SUMMARY = [
  { key: 'human', label: 'Human', color: 'text-blue-400', borderColor: 'border-blue-500/30', icon: Users },
  { key: 'service', label: 'Service', color: 'text-amber-400', borderColor: 'border-amber-500/30', icon: Database },
  { key: 'external', label: 'External', color: 'text-purple-400', borderColor: 'border-purple-500/30', icon: AlertTriangle },
];

const TYPE_BADGE_STYLES = {
  human: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  service: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  external: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
};

const FILTER_OPTIONS = ['All', 'Active', 'Dormant', 'Orphaned', 'Offboarded'];

const ITEMS_PER_PAGE = 20;

const RISK_COLORS = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
};

export default function Identities() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const identities = getStoredIdentities();
    const statusCounts = {};
    const typeCounts = {};
    identities.forEach(i => {
      const s = (i.status || 'active').toLowerCase();
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      const t = (i.type || 'human').toLowerCase();
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    setData({ identities, status_counts: statusCounts, type_counts: typeCounts });
    setLoading(false);
  }, []);

  const filteredIdentities = useMemo(() => {
    if (!data?.identities) return [];

    let filtered = data.identities;

    if (statusFilter !== 'All') {
      const filterValue = statusFilter.toLowerCase();
      filtered = filtered.filter((id) => id.status?.toLowerCase() === filterValue);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (id) =>
          id.display_name?.toLowerCase().includes(query) ||
          id.email?.toLowerCase().includes(query) ||
          id.department?.toLowerCase().includes(query) ||
          id.person_id?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [data, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredIdentities.length / ITEMS_PER_PAGE));

  const paginatedIdentities = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredIdentities.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredIdentities, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading identity inventory...</p>
        </motion.div>
      </div>
    );
  }

  const statusCounts = data?.status_counts || {};
  const typeCounts = data?.type_counts || {};
  const totalIdentities = data?.identities?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Shield className="w-7 h-7 text-sg-red" />
          Identity Inventory
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Monitoring <span className="text-white font-semibold">{totalIdentities}</span> identities across all connected platforms
        </p>
      </div>

      {/* Status Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {STATUS_SUMMARY.map((item, index) => {
          const Icon = item.icon;
          return (
            <GlassCard key={item.key} delay={index * 0.05} className={`border ${item.borderColor}`}>
              <div className="p-4 flex flex-col items-center gap-2">
                <Icon className={`w-5 h-5 ${item.color}`} />
                <AnimatedCounter
                  value={statusCounts[item.key] || 0}
                  className={`text-2xl font-bold ${item.color}`}
                />
                <span className="text-[11px] text-slate-500 uppercase tracking-wider">{item.label}</span>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Type Summary Row */}
      <div className="grid grid-cols-3 gap-3">
        {TYPE_SUMMARY.map((item, index) => {
          const Icon = item.icon;
          return (
            <GlassCard key={item.key} delay={index * 0.05 + 0.25} className={`border ${item.borderColor}`}>
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  <span className="text-sm text-slate-300">{item.label}</span>
                </div>
                <AnimatedCounter
                  value={typeCounts[item.key] || 0}
                  className={`text-xl font-bold ${item.color}`}
                />
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, department, or person ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/3 border border-white/6 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                statusFilter === filter
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-white/3 text-slate-400 border border-white/6 hover:bg-white/6'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <GlassCard className="border border-red-500/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/6">
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Identity</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Department</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Type</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Platforms</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Risk Score</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Severity</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Status</th>
                <th className="text-[11px] text-slate-500 uppercase tracking-wider text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedIdentities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500 text-sm">
                    No identities found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedIdentities.map((identity, index) => (
                  <motion.tr
                    key={identity.person_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="border-b border-white/3 hover:bg-white/2 transition-colors"
                  >
                    {/* Identity */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-white font-medium">{identity.display_name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{identity.person_id}</p>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-300">{identity.department || '—'}</span>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          TYPE_BADGE_STYLES[identity.type?.toLowerCase()] || TYPE_BADGE_STYLES.human
                        }`}
                      >
                        {identity.type || 'Unknown'}
                      </span>
                    </td>

                    {/* Platforms */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {identity.platforms?.length > 0 ? (
                          identity.platforms.map((platform) => (
                            <PlatformIcon key={platform} platform={platform} size={18} />
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-600">None</span>
                        )}
                      </div>
                    </td>

                    {/* Risk Score */}
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono text-sm font-semibold ${
                          RISK_COLORS[identity.severity?.toLowerCase()] || 'text-slate-400'
                        }`}
                      >
                        {identity.risk_score ?? '—'}
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="px-4 py-3">
                      {identity.severity ? (
                        <SeverityBadge severity={identity.severity.toLowerCase()} pulse={identity.severity.toLowerCase() === 'critical'} />
                      ) : (
                        <span className="text-[11px] text-slate-600">{'—'}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-medium ${
                          STATUS_CHIP_STYLES[identity.status?.toLowerCase()] || STATUS_CHIP_STYLES.disabled
                        }`}
                      >
                        {identity.status || 'Unknown'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/admin/identities/${identity.person_id}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredIdentities.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/6">
            <p className="text-[11px] text-slate-500">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}{'–'}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredIdentities.length)} of{' '}
              {filteredIdentities.length} identities
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-white/3 border border-white/6 text-slate-400 hover:bg-white/6 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    if (totalPages <= 7) return true;
                    if (page === 1 || page === totalPages) return true;
                    if (Math.abs(page - currentPage) <= 1) return true;
                    return false;
                  })
                  .reduce((acc, page, idx, arr) => {
                    if (idx > 0 && page - arr[idx - 1] > 1) {
                      acc.push('ellipsis-' + page);
                    }
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item) => {
                    if (typeof item === 'string') {
                      return (
                        <span key={item} className="px-1 text-slate-600 text-xs">
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                          currentPage === item
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-white/3 text-slate-400 border border-white/6 hover:bg-white/6'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-white/3 border border-white/6 text-slate-400 hover:bg-white/6 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
