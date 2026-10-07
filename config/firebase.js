const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

if (!getApps().length) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

module.exports = { getAuth };
