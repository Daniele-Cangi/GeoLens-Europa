import type { MetadataRoute } from 'next';

const origin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

const routes = [
  '/',
  '/platform',
  '/method',
  '/cases',
  '/cases/trento',
  '/cases/amsterdam',
  '/cases/emilia-romagna-2023',
  '/about',
  '/proof-zero',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: new URL(route, origin).toString(),
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : route === '/proof-zero' ? 0.8 : 0.7,
  }));
}
