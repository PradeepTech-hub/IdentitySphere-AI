const PLATFORM_COLORS = {
  active_directory: '#00a4ef',
  aws_iam: '#ff9900',
  okta: '#007dc1',
  github: '#f0f6fc',
  salesforce: '#00a1e0',
  azure_ad: '#0078d4',
  servicenow: '#81b5a1',
  identity: '#E31937',
};

const PLATFORM_LABELS = {
  active_directory: 'AD',
  aws_iam: 'AWS',
  okta: 'Okta',
  github: 'GH',
  salesforce: 'SF',
  azure_ad: 'AAD',
  servicenow: 'SN',
  identity: 'ID',
};

export default function PlatformIcon({ platform, size = 'sm' }) {
  const key = (platform || '').toLowerCase().replace(/[\s-]+/g, '_');
  const s = size === 'lg' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  const color = PLATFORM_COLORS[key] || '#64748b';
  const label = PLATFORM_LABELS[key] || platform?.slice(0, 3).toUpperCase() || '??';
  return (
    <div
      className={`${s} rounded-md flex items-center justify-center font-bold shrink-0`}
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}
      title={platform}
    >
      {label}
    </div>
  );
}
