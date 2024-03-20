const { defineConfig } = require('@vue/cli-service');
module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  configureWebpack: {
    entry: {
      app: './src/mainApp.js'
    }
  },
  pages: {
    index: {
      entry: 'src/mainApp.js',
      template: 'public/index.html',
      filename: 'index.html',
    },
    tiktok: {
      entry: 'src/redirectApp.js',
      template: 'public/tiktok-redirect/index.html',
      filename: 'tiktok-redirect/index.html',
    },
  },
});
