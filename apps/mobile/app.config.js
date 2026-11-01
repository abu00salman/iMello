// Extends app.json. Build-time overrides:
//   IMELLO_API_URL  – policy API (kept for future native screens)
//   IMELLO_WEB_URL  – the iMello web client the app hosts
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.IMELLO_API_URL || config.extra.apiUrl,
    webUrl: process.env.IMELLO_WEB_URL || config.extra.webUrl,
  },
});
