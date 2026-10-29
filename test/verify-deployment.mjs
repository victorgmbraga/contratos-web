import { verifyDeployment } from './deployment-check.js';

await verifyDeployment({
  baseUrl: process.env.SITE_URL || 'https://contratos-web.net.br/',
  directory: 'dist-browser',
  revision: process.env.GITHUB_SHA || 'local',
});
