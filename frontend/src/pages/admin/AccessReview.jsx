import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, AlertTriangle, Clock, Shield, Users,
  Eye, ChevronUp, Key, ArrowUpRight, FileText, Activity,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import PageHeader from '../../components/shared/PageHeader';
import StatCard from '../../components/shared/StatCard';
import {
  getAccessReviews, saveAccessReviews,
  getReviewHistory, saveReviewHistory,
  getAccessRequests, saveAccessRequests,
} from '../../services/storageService';

const INITIAL_CAMPAIGNS = [];

const STATUS_STYLES = {
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  revoked: { label: 'Revoked', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  escalated: { label: 'Escalated', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: ArrowUpRight },
  pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock },
};

const CAMPAIGN_STATUS = {
  active: { label: 'Active', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border border-emerald-500/30' },
  completed: { label: 'Completed', color: 'text-blue-400', bg: 'bg-blue-500/15 border border-blue-500/30' },
  overdue: { label: 'Overdue', color: 'text-red-400', bg: 'bg-red-500/15 border border-red-500/30' },
};

export default function AccessReview() {
  const [campaigns, setCampaigns] = useState(() => {
    const stored = getAccessReviews();
    return stored.length > 0 ? stored : INITIAL_CAMPAIGNS;
  });
  const [selectedCampaign, setSelectedCampaign] = useState(() => {
    const stored = getAccessReviews();
    return (stored.length > 0 ? stored : INITIAL_CAMPAIGNS)[0];
  });
  const [reviewHistory, setReviewHistory] = useState(() => getReviewHistory());
  const [filter, setFilter] = useState('all');

  const pendingRequests = getAccessRequests().filter(r => r.status === 'pending');

  const pendingCount = selectedCampaign.items.filter(i => i.status === 'pending').length;
  const approvedCount = selectedCampaign.items.filter(i => i.status === 'approved').length;
  const revokedCount = selectedCampaign.items.filter(i => i.status === 'revoked').length;
  const escalatedCount = selectedCampaign.items.filter(i => i.status === 'escalated').length;

  const handleAction = useCallback((itemId, action) => {
    setCampaigns(prev => {
      const updated = prev.map(c => {
        if (c.id !== selectedCampaign.id) return c;
        return {
          ...c,
          items: c.items.map(item => item.id === itemId ? { ...item, status: action } : item),
          completedItems: c.items.filter(item => item.id === itemId ? action !== 'pending' : item.status !== 'pending').length,
        };
      });
      saveAccessReviews(updated);
      return updated;
    });
    setSelectedCampaign(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === itemId ? { ...item, status: action } : item),
    }));

    const item = selectedCampaign.items.find(i => i.id === itemId);
    if (item) {
      const entry = {
        id: `HIST-${Date.now()}`,
        reviewId: itemId,
        identity: item.identity,
        platform: item.platform,
        role: item.role,
        action,
        reviewer: 'Pradeep M',
        timestamp: new Date().toISOString(),
      };
      setReviewHistory(prev => {
        const updated = [entry, ...prev];
        saveReviewHistory(updated);
        return updated;
      });
    }
  }, [selectedCampaign]);

  const handleRequestAction = useCallback((reqId, action) => {
    const allReqs = getAccessRequests();
    const updated = allReqs.map(r => {
      if (r.id !== reqId) return r;
      const now = new Date();
      return {
        ...r,
        status: action,
        reviewedBy: 'Pradeep M',
        reviewedAt: now.toISOString(),
        expiresAt: action === 'approved' ? new Date(now.getTime() + r.durationDays * 86400000).toISOString() : null,
      };
    });
    saveAccessRequests(updated);

    const req = allReqs.find(r => r.id === reqId);
    if (req) {
      const entry = {
        id: `HIST-${Date.now()}`,
        reviewId: reqId,
        identity: req.employeeName,
        platform: req.platform,
        role: req.role,
        action: action === 'approved' ? 'approved' : 'revoked',
        reviewer: 'Pradeep M',
        timestamp: new Date().toISOString(),
      };
      setReviewHistory(prev => {
        const list = [entry, ...prev];
        saveReviewHistory(list);
        return list;
      });
    }
  }, []);

  const filteredItems = filter === 'all'
    ? selectedCampaign.items
    : selectedCampaign.items.filter(i => i.status === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader
        badge="Access Review"
        title="Access Review & Certification"
        subtitle="Review, approve, revoke, or escalate privileged access across platforms"
      />

      {/* Campaign Selector */}
      <div className="grid lg:grid-cols-2 gap-4">
        {campaigns.map((campaign, i) => {
          const campStatus = CAMPAIGN_STATUS[campaign.status];
          const progress = campaign.totalItems > 0 ? Math.round((campaign.completedItems / campaign.totalItems) * 100) : 100;
          const isSelected = selectedCampaign.id === campaign.id;
          return (
            <GlassCard key={campaign.id} delay={i * 0.05} onClick={() => setSelectedCampaign(campaign)}
              className={`cursor-pointer ${isSelected ? 'border-red-500/30 bg-red-500/[0.03]' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">{campaign.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{campaign.id} | Reviewer: {campaign.reviewer}</p>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${campStatus.bg} ${campStatus.color}`}>
                  {campStatus.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-3">
                <span>Created: {campaign.created}</span>
                <span className="text-white/10">|</span>
                <span>Deadline: {campaign.deadline}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8 }}
                  style={{ background: progress === 100 ? '#22c55e' : 'linear-gradient(90deg, #E31937, #FF3355)' }} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">{campaign.completedItems}/{campaign.totalItems} reviews completed ({progress}%)</p>
            </GlassCard>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pending" value={pendingCount} icon={Clock} color="text-yellow-400" bg="from-yellow-500/10 to-amber-500/5" delay={0.05} />
        <StatCard label="Approved" value={approvedCount} icon={CheckCircle} color="text-green-400" bg="from-green-500/10 to-emerald-500/5" delay={0.1} />
        <StatCard label="Revoked" value={revokedCount} icon={XCircle} color="text-red-400" bg="from-red-500/10 to-rose-500/5" delay={0.15} />
        <StatCard label="Escalated" value={escalatedCount} icon={ArrowUpRight} color="text-orange-400" bg="from-orange-500/10 to-amber-500/5" delay={0.2} />
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'revoked', 'escalated'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium font-orbitron uppercase tracking-wider transition-all ${filter === f ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}>
            {f === 'all' ? `All (${selectedCampaign.items.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${selectedCampaign.items.filter(i => i.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Review Items */}
      <GlassCard hover={false} className="border-red-500/10">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Eye size={14} className="text-red-400" /> Review Items — {selectedCampaign.name}
        </h3>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle size={36} className="text-emerald-400" />
            <p className="text-sm text-slate-400">{filter === 'all' ? 'No review items in this campaign' : `No ${filter} items`}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, i) => {
              const statusCfg = STATUS_STYLES[item.status];
              const StatusIcon = statusCfg.icon;
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(227,25,55,0.1)' }}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-white">{item.identity}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{item.personId}</span>
                        <SeverityBadge severity={item.severity} pulse={item.severity === 'critical'} />
                        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                          <StatusIcon size={10} /> {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <PlatformIcon platform={item.platform} size="sm" />
                          {item.platform.replace('_', ' ')}
                        </span>
                        <span className="flex items-center gap-1"><Key size={10} className="text-slate-500" /> {item.role}</span>
                        <span className="flex items-center gap-1"><Users size={10} className="text-slate-500" /> {item.department}</span>
                        <span className="font-mono text-red-400">Score: {item.riskScore}</span>
                      </div>
                    </div>

                    {item.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => handleAction(item.id, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20 hover:bg-green-500/20 transition-all">
                          Approve
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => handleAction(item.id, 'revoked')}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">
                          Revoke
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => handleAction(item.id, 'escalated')}
                          className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-semibold border border-orange-500/20 hover:bg-orange-500/20 transition-all">
                          Escalate
                        </motion.button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Employee Access Requests */}
      {pendingRequests.length > 0 && (
        <GlassCard hover={false} className="border-blue-500/20">
          <h3 className="text-sm font-semibold text-blue-400 mb-4 flex items-center gap-2">
            <Key size={14} /> Employee Access Requests ({pendingRequests.length} pending)
          </h3>
          <div className="space-y-3">
            {pendingRequests.map((req, i) => (
              <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-white">{req.employeeName}</span>
                      <span className="text-[10px] text-slate-500">requests</span>
                      <span className="text-sm text-blue-400 font-medium">{req.role}</span>
                      <span className="text-[10px] text-slate-500">on</span>
                      <PlatformIcon platform={req.platform} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>Duration: {req.durationDays} day(s)</span>
                      <span className="text-white/10">|</span>
                      <span>Justification: {req.justification}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => handleRequestAction(req.id, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20 hover:bg-green-500/20 transition-all">
                      Approve
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => handleRequestAction(req.id, 'rejected')}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">
                      Reject
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Review History */}
      {reviewHistory.length > 0 && (
        <GlassCard hover={false} delay={0.1}>
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <FileText size={14} className="text-red-400" /> Review History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/6">
                  <th className="text-left pb-3 font-medium">Time</th>
                  <th className="text-left pb-3 font-medium">Identity</th>
                  <th className="text-left pb-3 font-medium">Platform</th>
                  <th className="text-left pb-3 font-medium">Role</th>
                  <th className="text-left pb-3 font-medium">Action</th>
                  <th className="text-left pb-3 font-medium">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {reviewHistory.map((h, i) => {
                  const actionCfg = STATUS_STYLES[h.action];
                  return (
                    <motion.tr key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                      className="border-b border-white/3">
                      <td className="py-2.5 text-[11px] text-slate-500">{new Date(h.timestamp).toLocaleTimeString()}</td>
                      <td className="py-2.5 text-white font-medium">{h.identity}</td>
                      <td className="py-2.5"><PlatformIcon platform={h.platform} size="sm" /></td>
                      <td className="py-2.5 text-slate-400 text-xs">{h.role}</td>
                      <td className="py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${actionCfg.bg} ${actionCfg.color} font-semibold`}>{actionCfg.label}</span>
                      </td>
                      <td className="py-2.5 text-slate-400 text-xs">{h.reviewer}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}
