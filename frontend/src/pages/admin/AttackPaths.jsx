import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactFlow, Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Search, Route, Shield, AlertTriangle, Target, Key, Users,
  ChevronRight, Eye, X, Server, Lock, Unlock, Activity, Zap,
  ShieldAlert, CheckCircle, FileText, Hash,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import {
  getIdentities as getStoredIdentities,
  getRiskEvents,
  getBlastRadii,
} from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';
import { fetchGraph, fetchAttackPaths } from '../../services/dataService';

const PLATFORM_LABELS = {
  active_directory: 'Active Directory',
  aws_iam: 'AWS IAM',
  okta: 'Okta',
  salesforce: 'Salesforce',
};

const PLATFORM_COLORS = {
  active_directory: '#00a4ef',
  aws_iam: '#ff9900',
  okta: '#007dc1',
  salesforce: '#00a1e0',
};

const ROLE_MAP = {
  active_directory: ['Domain Admin', 'Server Admin', 'Helpdesk Operator', 'User'],
  aws_iam: ['AdministratorAccess', 'PowerUserAccess', 'ReadOnlyAccess', 'ViewOnlyAccess'],
  okta: ['Org Admin', 'App Admin', 'Group Admin', 'SSO User'],
  salesforce: ['System Administrator', 'Standard User', 'Report Viewer', 'Read Only'],
};

const RESOURCE_MAP = {
  active_directory: ['domain-controller', 'dns-server', 'file-server', 'gpo-management'],
  aws_iam: ['iam:*', 'ec2:*', 's3://prod-data', 'kms:*'],
  okta: ['api-tokens', 'sso-config', 'mfa-policy', 'user-provisioning'],
  salesforce: ['setup', 'user-management', 'reports', 'apex-classes'],
};

const MITRE_TECHNIQUES = {
  cross_platform_admin: { id: 'T1078', name: 'Valid Accounts', tactic: 'Initial Access / Persistence' },
  privilege_escalation: { id: 'T1098', name: 'Account Manipulation', tactic: 'Persistence / Privilege Escalation' },
  token_abuse: { id: 'T1550', name: 'Use Alternate Authentication Material', tactic: 'Lateral Movement' },
  orphaned_account: { id: 'T1078.001', name: 'Default Accounts', tactic: 'Initial Access' },
  mfa_disabled: { id: 'T1556', name: 'Modify Authentication Process', tactic: 'Credential Access' },
  sod_violation: { id: 'T1098', name: 'Account Manipulation', tactic: 'Privilege Escalation' },
  offboarding_gap: { id: 'T1078', name: 'Valid Accounts', tactic: 'Initial Access' },
  stale_account: { id: 'T1078.003', name: 'Local Accounts', tactic: 'Persistence' },
  over_privileged: { id: 'T1098', name: 'Account Manipulation', tactic: 'Privilege Escalation' },
};

const FILTER_OPTS = [
  { key: 'all', label: 'All Identities' },
  { key: 'critical', label: 'Critical Risk' },
  { key: 'high', label: 'High Risk' },
  { key: 'cross_platform', label: 'Cross Platform' },
  { key: 'dormant', label: 'Dormant Accounts' },
  { key: 'admin', label: 'Admin Accounts' },
];

function buildAttackGraph(identity, riskEvent, blastRadius) {
  if (!identity) return { nodes: [], edges: [] };
  const nodes = [];
  const edges = [];
  const platforms = identity.platforms || [];
  const isAdmin = identity.is_admin;
  const severity = identity.severity?.toLowerCase();

  const entryPlatform = platforms[0] || 'okta';
  const entryColor = severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f97316' : '#eab308';

  nodes.push({
    id: 'attacker',
    position: { x: 50, y: 220 },
    data: { label: `Attacker compromises\n${identity.display_name}@${entryPlatform.replace('_', '')}` },
    style: {
      background: '#1e293b', color: entryColor, border: `2px solid ${entryColor}`,
      borderRadius: 12, padding: 16, fontSize: 12, width: 190, textAlign: 'center',
      boxShadow: `0 0 12px ${entryColor}33`,
    },
  });

  let xOffset = 300;
  const adminPlatforms = [];

  platforms.forEach((platform, pIdx) => {
    const pColor = PLATFORM_COLORS[platform] || '#64748b';
    const roles = ROLE_MAP[platform] || ['User'];
    const assignedRole = isAdmin ? roles[0] : roles[Math.min(pIdx, roles.length - 1)];
    const isAdminRole = roles.indexOf(assignedRole) <= 1;
    const nodeColor = isAdminRole ? '#ef4444' : '#f97316';

    if (isAdminRole) adminPlatforms.push(platform);

    const nodeId = `platform-${platform}`;
    const yPos = pIdx % 2 === 0 ? 120 : 320;

    nodes.push({
      id: nodeId,
      position: { x: xOffset, y: yPos },
      data: {
        label: `${PLATFORM_LABELS[platform] || platform}\n${assignedRole}`,
        _detail: { platform, role: assignedRole, isAdmin: isAdminRole },
      },
      style: {
        background: '#1e293b', color: nodeColor, border: `2px solid ${nodeColor}`,
        borderRadius: 12, padding: 14, fontSize: 12, width: 180, textAlign: 'center',
      },
    });

    const edgeLabel = pIdx === 0 ? 'compromised' : 'lateral_movement';
    const edgeSource = pIdx === 0 ? 'attacker' : `platform-${platforms[pIdx - 1]}`;

    edges.push({
      id: `e-${edgeSource}-${nodeId}`,
      source: edgeSource, target: nodeId,
      animated: true,
      label: edgeLabel.replace('_', ' '),
      style: { stroke: pIdx === 0 ? entryColor : '#eab308', strokeWidth: 2 },
      labelStyle: { fontSize: 10, fill: '#94a3b8' },
    });

    xOffset += 240;
  });

  if (adminPlatforms.length > 0) {
    const targetPlatform = adminPlatforms[adminPlatforms.length - 1];
    const resources = RESOURCE_MAP[targetPlatform] || ['unknown-resource'];
    const criticalResource = resources[0];

    nodes.push({
      id: 'target',
      position: { x: xOffset, y: 220 },
      data: {
        label: `${criticalResource}\nFULL COMPROMISE`,
        _detail: { platform: targetPlatform, resource: criticalResource },
      },
      style: {
        background: '#450a0a', color: '#fca5a5', border: '2px solid #ef4444',
        borderRadius: 12, padding: 16, fontSize: 12, fontWeight: 700,
        width: 180, textAlign: 'center',
        boxShadow: '0 0 20px rgba(239,68,68,0.3)',
      },
    });

    edges.push({
      id: `e-platform-${targetPlatform}-target`,
      source: `platform-${targetPlatform}`, target: 'target',
      animated: true, label: 'accesses',
      style: { stroke: '#ef4444', strokeWidth: 2 },
      labelStyle: { fontSize: 10, fill: '#94a3b8' },
    });
  }

  return { nodes, edges };
}

function buildNarrative(identity, riskEvent) {
  if (!identity) return [];
  const platforms = identity.platforms || [];
  const steps = [];
  const entryPlatform = platforms[0];
  const riskType = riskEvent?.type || 'unknown';

  const entryMethods = {
    cross_platform_admin: 'credential stuffing',
    mfa_disabled: 'brute force (MFA absent)',
    privilege_escalation: 'phishing',
    token_abuse: 'leaked token exploitation',
    orphaned_account: 'orphaned credential reuse',
    sod_violation: 'compromised credentials',
    offboarding_gap: 'former employee credential reuse',
    stale_account: 'password spray on dormant account',
    over_privileged: 'social engineering',
  };

  steps.push({
    color: '#ef4444',
    label: 'Step 1',
    text: `Attacker compromises ${identity.display_name}'s ${PLATFORM_LABELS[entryPlatform] || entryPlatform} account via ${entryMethods[riskType] || 'credential theft'}.`,
  });

  if (identity.is_admin) {
    const adminRole = ROLE_MAP[entryPlatform]?.[0] || 'Admin';
    steps.push({
      color: '#f97316',
      label: 'Step 2',
      text: `${PLATFORM_LABELS[entryPlatform]} ${adminRole} role grants elevated access to sensitive configurations and data.`,
    });
  }

  if (platforms.length > 1) {
    const bridgePlatform = platforms[1];
    steps.push({
      color: '#eab308',
      label: `Step ${steps.length + 1}`,
      text: `Cross-platform bridge — same identity has ${PLATFORM_LABELS[bridgePlatform]} account, enabling lateral movement.`,
    });

    for (let i = 2; i < platforms.length; i++) {
      steps.push({
        color: '#f97316',
        label: `Step ${steps.length + 1}`,
        text: `Lateral movement continues to ${PLATFORM_LABELS[platforms[i]]} via correlated identity (${identity.display_name}).`,
      });
    }
  }

  const blastEntry = getBlastRadii().find(b => b.id === identity.person_id);
  const resourceCount = blastEntry?.resources || platforms.length * 3;

  steps.push({
    color: '#ef4444',
    label: 'Result',
    text: `${identity.is_admin ? 'Complete privilege compromise' : 'Significant data exposure'} from a single account takeover. Blast radius: ${resourceCount} resources across ${platforms.length} platform${platforms.length !== 1 ? 's' : ''}.`,
    bold: true,
  });

  return steps;
}

export default function AttackPaths() {
  const location = useLocation();

  const preSelected = useMemo(() => {
    const pid = location.state?.personId;
    if (!pid) return null;
    const match = getStoredIdentities().find(i => i.person_id === pid);
    if (match) window.history.replaceState({}, '');
    return match || null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data } = usePlatformData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState(preSelected);
  const [identityDetail, setIdentityDetail] = useState(preSelected);
  const [filter, setFilter] = useState('all');
  const [selectedNode, setSelectedNode] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [identities, setIdentities] = useState(() => getStoredIdentities());
  const [apiGraph, setApiGraph] = useState(null);
  const [apiPaths, setApiPaths] = useState([]);

  useEffect(() => {
    setIdentities(getStoredIdentities());
  }, [data]);

  useEffect(() => {
    if (!selectedIdentity?.person_id) {
      setApiGraph(null);
      setApiPaths([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchGraph(selectedIdentity.person_id).catch(() => null),
      fetchAttackPaths(selectedIdentity.person_id).catch(() => null),
    ]).then(([graph, paths]) => {
      if (cancelled) return;
      if (graph?.nodes?.length) setApiGraph(graph);
      else setApiGraph(null);
      setApiPaths(paths?.paths || []);
    });
    return () => { cancelled = true; };
  }, [selectedIdentity?.person_id]);

  const filteredIdentities = useMemo(() => {
    let list = identities;
    if (filter === 'critical') list = list.filter(i => i.severity?.toLowerCase() === 'critical');
    else if (filter === 'high') list = list.filter(i => ['critical', 'high'].includes(i.severity?.toLowerCase()));
    else if (filter === 'cross_platform') list = list.filter(i => (i.platforms?.length || 0) >= 3);
    else if (filter === 'dormant') list = list.filter(i => i.status?.toLowerCase() === 'dormant');
    else if (filter === 'admin') list = list.filter(i => i.is_admin);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.display_name?.toLowerCase().includes(q) ||
        i.person_id?.toLowerCase().includes(q) ||
        i.department?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  }, [identities, filter, searchQuery]);

  const handleSelectIdentity = useCallback((identity) => {
    setSelectedIdentity(identity);
    setSelectedNode(null);
    setShowDropdown(false);
    setSearchQuery('');
    setIdentityDetail(identity);
  }, []);

  const riskEvent = useMemo(() => {
    if (!selectedIdentity) return null;
    return getRiskEvents().find(r => r.identityId === selectedIdentity.person_id) || null;
  }, [selectedIdentity]);

  const blastRadius = useMemo(() => {
    if (!selectedIdentity) return null;
    return getBlastRadii().find(b => b.id === selectedIdentity.person_id) || null;
  }, [selectedIdentity]);

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    if (apiGraph?.nodes?.length) {
      return { nodes: apiGraph.nodes, edges: apiGraph.edges };
    }
    return buildAttackGraph(selectedIdentity, riskEvent, blastRadius);
  }, [apiGraph, selectedIdentity, riskEvent, blastRadius]);

  const narrative = useMemo(() => {
    return buildNarrative(selectedIdentity, riskEvent);
  }, [selectedIdentity, riskEvent]);

  const mitre = riskEvent ? MITRE_TECHNIQUES[riskEvent.type] : null;

  const handleNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
  }, []);

  const hasAttackPath = selectedIdentity && (selectedIdentity.is_admin || (selectedIdentity.platforms?.length || 0) >= 2 || riskEvent);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Route className="w-7 h-7 text-sg-red" />
          Cyber Attack Path Visualization
        </h1>
        <p className="text-sm text-slate-500 mt-1">Identity-driven privilege escalation and lateral movement analysis</p>
      </div>

      {/* Identity Selector + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search identity by name, ID, or department..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/3 border border-white/6 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50 transition-colors"
          />
          {/* Dropdown */}
          <AnimatePresence>
            {showDropdown && filteredIdentities.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 top-full mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-xl"
                style={{ background: 'rgba(8,10,18,0.98)', border: '1px solid rgba(227,25,55,0.2)', backdropFilter: 'blur(20px)' }}
              >
                {filteredIdentities.slice(0, 20).map((id, i) => (
                  <button
                    key={id.person_id}
                    onClick={() => handleSelectIdentity(id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/3 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'rgba(227,25,55,0.15)', color: '#E31937', border: '1px solid rgba(227,25,55,0.3)' }}>
                      {(id.display_name || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{id.display_name}</p>
                      <p className="text-[10px] text-slate-500">{id.person_id} | {id.department} | {id.platforms?.length || 0} platforms</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {id.severity && <SeverityBadge severity={id.severity.toLowerCase()} />}
                      {id.is_admin && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-bold">ADMIN</span>}
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={() => { setShowDropdown(false); }} className="sr-only">close</button>
      </div>

      {/* Click-outside close */}
      {showDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTS.map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setShowDropdown(true); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.key ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Selected identity header */}
      {selectedIdentity && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard hover={false} glow="red" delay={0.05}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                  style={{ background: 'linear-gradient(135deg, rgba(227,25,55,0.25), rgba(227,25,55,0.08))', border: '2px solid rgba(227,25,55,0.35)', color: '#E31937' }}>
                  {(selectedIdentity.display_name || '?')[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{selectedIdentity.display_name}</h2>
                    <SeverityBadge severity={selectedIdentity.severity?.toLowerCase() || 'medium'} pulse />
                    {selectedIdentity.is_admin && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-bold flex items-center gap-1">
                        <ShieldAlert size={10} /> ADMIN
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span className="flex items-center gap-1"><Hash size={10} /> {selectedIdentity.person_id}</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {selectedIdentity.department}</span>
                    <span className="flex items-center gap-1"><Server size={10} /> {selectedIdentity.platforms?.length || 0} platforms</span>
                    <span className="font-mono text-red-400">Score: {selectedIdentity.risk_score ?? 0}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {(selectedIdentity.platforms || []).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Legend */}
      <div className="grid grid-cols-4 gap-3 text-center text-xs">
        {[['Compromised Account', '#ef4444'], ['Lateral Movement', '#eab308'], ['Privilege Escalation', '#f97316'], ['Target Resource', '#ef4444']].map(([l, c]) => (
          <div key={l} className="rounded-xl py-2 px-3" style={{ background: 'rgba(255,255,255,0.04)', borderColor: c + '33', borderWidth: 1, borderStyle: 'solid', borderRadius: 12 }}>
            <span style={{ color: c }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Attack Graph */}
      {selectedIdentity ? (
        hasAttackPath ? (
          <GlassCard hover={false} className="p-0 overflow-hidden" style={{ height: 500 }}>
            <ReactFlow
              nodes={graphNodes}
              edges={graphEdges}
              onNodeClick={handleNodeClick}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              panOnDrag
              zoomOnScroll
              minZoom={0.3}
              maxZoom={2}
              className="bg-navy-950"
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#E3193708" gap={30} />
              <Controls className="bg-navy-800 border border-white/10 rounded-xl" />
            </ReactFlow>
          </GlassCard>
        ) : (
          <GlassCard hover={false}>
            <div className="flex flex-col items-center gap-4 py-12">
              <CheckCircle size={48} className="text-emerald-400" />
              <h3 className="text-lg font-semibold text-emerald-400">No Significant Attack Path Detected</h3>
              <p className="text-sm text-slate-400 text-center max-w-md">
                {selectedIdentity.display_name} has a low-risk security posture. Single-platform access with standard privileges and no admin roles detected.
              </p>
              <div className="grid grid-cols-3 gap-4 mt-4">
                {[
                  { label: 'Platforms', value: selectedIdentity.platforms?.length || 0, color: 'text-blue-400' },
                  { label: 'Risk Score', value: selectedIdentity.risk_score ?? 0, color: 'text-green-400' },
                  { label: 'Admin', value: selectedIdentity.is_admin ? 'Yes' : 'No', color: selectedIdentity.is_admin ? 'text-red-400' : 'text-green-400' },
                ].map(s => (
                  <div key={s.label} className="text-center px-6 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        )
      ) : (
        <GlassCard hover={false}>
          <div className="flex flex-col items-center gap-4 py-16">
            <Route size={48} className="text-slate-600" />
            <p className="text-sm text-slate-500">Select an identity above to generate their attack path analysis</p>
            <p className="text-xs text-slate-600">Attack paths are generated from correlated accounts, roles, permissions, and admin privileges</p>
          </div>
        </GlassCard>
      )}

      {/* Node Detail Panel */}
      <AnimatePresence>
        {selectedNode && selectedNode.data._detail && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <GlassCard hover={false} className="border-red-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                  <Eye size={14} /> Node Detail
                </h3>
                <button onClick={() => setSelectedNode(null)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Platform</span>
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={selectedNode.data._detail.platform} size="sm" />
                    <span className="text-sm text-white font-medium">{PLATFORM_LABELS[selectedNode.data._detail.platform] || selectedNode.data._detail.platform}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Role</span>
                  <span className="text-sm text-white font-medium">{selectedNode.data._detail.role || selectedNode.data._detail.resource || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Admin</span>
                  <span className={`text-sm font-semibold ${selectedNode.data._detail.isAdmin ? 'text-red-400' : 'text-green-400'}`}>
                    {selectedNode.data._detail.isAdmin ? 'YES' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Risk Score</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedIdentity?.risk_score ?? 0}</span>
                </div>
              </div>
              {selectedNode.data._detail.platform && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-2">Resources at Risk</span>
                  <div className="flex flex-wrap gap-2">
                    {(RESOURCE_MAP[selectedNode.data._detail.platform] || []).map(r => (
                      <span key={r} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              {riskEvent && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Related Finding</span>
                  <p className="text-xs text-slate-300">{riskEvent.title}</p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Narrative + Context panels (only when identity selected and has path) */}
      {selectedIdentity && hasAttackPath && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Narrative */}
          <GlassCard hover={false} delay={0.1}>
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <FileText size={14} className="text-red-400" /> Attack Path Narrative
            </h3>
            <div className="text-sm text-slate-400 space-y-2.5">
              {narrative.map((step, i) => (
                <motion.p key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}>
                  <span className={`font-medium ${step.bold ? 'font-bold' : ''}`} style={{ color: step.color }}>{step.label}:</span>{' '}
                  {step.text}
                </motion.p>
              ))}
            </div>
          </GlassCard>

          {/* MITRE + Blast Radius */}
          <div className="space-y-6">
            {mitre && (
              <GlassCard hover={false} delay={0.15}>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Shield size={14} className="text-red-400" /> MITRE ATT&CK Mapping
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 uppercase w-16">Technique</span>
                    <span className="text-sm text-red-400 font-mono font-semibold">{mitre.id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 uppercase w-16">Name</span>
                    <span className="text-sm text-white">{mitre.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 uppercase w-16">Tactic</span>
                    <span className="text-sm text-orange-400">{mitre.tactic}</span>
                  </div>
                </div>
              </GlassCard>
            )}

            <GlassCard hover={false} delay={0.2}>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Target size={14} className="text-red-400" /> Blast Radius Impact
              </h3>
              {blastRadius ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-xl font-black text-red-400">{blastRadius.resources}</p><p className="text-[10px] text-slate-500">Resources</p></div>
                  <div><p className="text-xl font-black text-amber-400">{blastRadius.permissions}</p><p className="text-[10px] text-slate-500">Permissions</p></div>
                  <div><p className="text-xl font-black text-orange-400">{blastRadius.adminRoles}</p><p className="text-[10px] text-slate-500">Admin Roles</p></div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-xl font-black text-slate-400">{(selectedIdentity.platforms?.length || 1) * 3}</p><p className="text-[10px] text-slate-500">Est. Resources</p></div>
                  <div><p className="text-xl font-black text-slate-400">{selectedIdentity.entitlement_count || 0}</p><p className="text-[10px] text-slate-500">Entitlements</p></div>
                  <div><p className="text-xl font-black text-slate-400">{selectedIdentity.is_admin ? 1 : 0}</p><p className="text-[10px] text-slate-500">Admin Roles</p></div>
                </div>
              )}
              <div className="flex gap-1 mt-3 justify-center">
                {(selectedIdentity.platforms || []).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Correlated Accounts (from identity detail) */}
      {selectedIdentity && identityDetail?.accounts?.length > 0 && (
        <GlassCard hover={false} delay={0.25}>
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Activity size={14} className="text-red-400" /> Correlated Accounts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/6">
                  <th className="text-left pb-3 font-medium">Platform</th>
                  <th className="text-left pb-3 font-medium">Username</th>
                  <th className="text-left pb-3 font-medium">Status</th>
                  <th className="text-left pb-3 font-medium">Admin</th>
                  <th className="text-left pb-3 font-medium">MFA</th>
                  <th className="text-left pb-3 font-medium">Dormancy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {identityDetail.accounts.map((acct, i) => (
                  <motion.tr key={acct.acct_id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * i }}
                    className="text-slate-300">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={acct.platform} size="sm" />
                        <span className="text-xs text-slate-400">{PLATFORM_LABELS[acct.platform] || acct.platform}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{acct.username}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${acct.status?.toLowerCase() === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}`}>
                        {acct.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {acct.is_admin
                        ? <span className="text-red-400 font-semibold text-xs">YES</span>
                        : <span className="text-slate-500 text-xs">No</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      {acct.mfa_enabled
                        ? <Lock size={14} className="text-emerald-400" />
                        : <Unlock size={14} className="text-red-400" />}
                    </td>
                    <td className="py-2.5">
                      <span className={`text-xs font-semibold ${(acct.dormancy_days ?? 0) > 90 ? 'text-red-400' : (acct.dormancy_days ?? 0) > 30 ? 'text-yellow-400' : 'text-slate-400'}`}>
                        {acct.dormancy_days != null ? `${acct.dormancy_days}d` : '--'}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
