/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pacotes do monorepo usam estilo NodeNext (.js em imports); o Next transpila
  // do TS fonte para evitar "Module not found: ./schema.js".
  transpilePackages: [
    '@mants/shared-types',
    '@mants/auth',
    '@mants/config',
    '@mants/validation',
    '@mants/billing',
    '@mants/prompt-engine',
    '@mants/creative-package',
    '@mants/asset-selection',
    '@mants/database',
  ],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Pacotes do monorepo usam estilo NodeNext (imports './x.js'); mapeia .js -> .ts
    // na resolução do webpack para que o source TS seja encontrado sem build prévio.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
