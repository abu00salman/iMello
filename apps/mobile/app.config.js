// Extends app.json. The API address is baked in at build time:
//   IMELLO_API_URL=https://api.example.com npx expo prebuild
// Default is localhost, which only works in a simulator/emulator on the dev machine.
module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, apiUrl: process.env.IMELLO_API_URL || config.extra.apiUrl },
});
