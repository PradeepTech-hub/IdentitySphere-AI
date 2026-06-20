const PLATFORM_COLORS = {
  active_directory: '#00a4ef',
  aws_iam: '#ff9900',
  okta: '#007dc1',
  github: '#f0f6fc',
  salesforce: '#00a1e0',
  identity: '#00d4ff',
};
const PLATFORM_LABELS = {
  active_directory: 'AD',
  aws_iam: 'AWS',
  okta: 'Okta',
  github: 'GH',
  salesforce: 'SF',
  identity: 'ID',
};

export default function PlatformIcon({ platform, size = 'sm' }) {
  const s = size === 'lg' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  const color = PLATFORM_COLORS[platform] || '#64748b';
  return (
    <div className={`${s} rounded-md flex items-center justify-center font-bold`} style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
      {PLATFORM_LABELS[platform] || '?'}
    </div>
  );
}
