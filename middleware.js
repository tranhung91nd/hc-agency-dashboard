export const config = {
  matcher: '/',
};

export default function middleware(request) {
  const host = request.headers.get('host') || '';
  if (host === 'zalo.hc-agency.online') {
    const url = new URL('/demos/landing-zalo-ai.html', request.url);
    return fetch(url);
  }
}
