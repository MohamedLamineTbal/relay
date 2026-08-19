import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  async redirects() {
    return [
      {
        source: '/payments',
        destination: '/collections',
        permanent: false,
      },
      {
        source: '/payments/:publicId',
        destination: '/collections/:publicId',
        permanent: false,
      },
      {
        source: '/customers',
        destination: '/',
        permanent: false,
      },
      {
        source: '/alerts',
        destination: '/#needs-you',
        permanent: false,
      },
      {
        source: '/ledger',
        destination: '/collections?view=completed',
        permanent: false,
      },
      {
        source: '/stripe',
        destination: '/integrations/stripe',
        permanent: false,
      },
      {
        source: '/webhooks',
        destination: '/integrations/webhooks',
        permanent: false,
      },
      {
        source: '/settings',
        destination: '/integrations/stripe',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
