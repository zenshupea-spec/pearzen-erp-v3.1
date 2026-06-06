/** Role gate for Master Hub module cards (server-safe). */
export function canSeeMasterHubModule(route: string, role: string): boolean {
  const isGodMode = role === 'MD' || role === 'OD';
  if (isGodMode) return true;

  if (route.startsWith('/executive')) return false;
  if (route === '/tm') return role === 'TM';
  if (route === '/om') return role === 'OM' || role === 'HR' || role === 'FM';
  if (route === '/hr' || route.startsWith('/hr/')) {
    return role === 'HR' || role === 'FM' || role === 'OM';
  }
  if (route === '/fm' || route.startsWith('/fm')) {
    return role === 'FM' || role === 'HR';
  }
  if (route.startsWith('/hq/')) return role === 'HR' || role === 'FM';
  if (route === '/invoice-desk') return false;

  return false;
}
