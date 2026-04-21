const deployDir = process.env.DAMAQI_DEPLOY_DIR || '/root/damaqi-web/current';
const socketPort = process.env.SOCKET_PORT || '3011';
const clientPort = process.env.PM2_SERVE_PORT || '80';

module.exports = {
  apps: [
    {
      name: 'damaqi-socket',
      script: './dist-server/index.cjs',
      cwd: deployDir,
      env: {
        NODE_ENV: 'production',
        SOCKET_PORT: socketPort
      }
    },
    {
      name: 'damaqi-client',
      script: 'serve',
      cwd: deployDir,
      env: {
        PM2_SERVE_PATH: 'dist',
        PM2_SERVE_PORT: clientPort,
        PM2_SERVE_SPA: 'true'
      }
    }
  ]
};
