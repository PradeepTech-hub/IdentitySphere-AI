import { USERS } from '../data/mockData';

const ROLE_TITLES = {
  admin: 'Security Administrator',
  auditor: 'Compliance Auditor',
  employee: 'Employee',
  executive: 'Executive',
  contractor: 'External Contractor',
};

/** Turn j.martin@socgen.com → "J Martin" */
export function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'User';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return 'User';
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function getRoleTitle(role) {
  if (!role) return '';
  return ROLE_TITLES[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

export function buildUserFromAuth({ email, role, name, title, auth_token }) {
  if (!email) return null;

  const trimmedEmail = email.trim();
  const demo = USERS[trimmedEmail.toLowerCase()] || USERS[trimmedEmail];
  const resolvedRole = role || demo?.role;
  if (!resolvedRole) return null;

  const derivedName = displayNameFromEmail(trimmedEmail);
  const resolvedName =
    name ||
    (derivedName !== 'User' ? derivedName : null) ||
    demo?.name ||
    derivedName;

  return {
    email: trimmedEmail,
    role: resolvedRole,
    name: resolvedName,
    title: title || demo?.title || getRoleTitle(resolvedRole),
    auth_token: auth_token || undefined,
  };
}

export function persistAuthSession(user) {
  if (!user?.email) return;
  sessionStorage.setItem(
    'is_auth',
    JSON.stringify({
      email: user.email,
      role: user.role,
      name: user.name,
      title: user.title,
      auth_token: user.auth_token,
    }),
  );
}
