require("dotenv").config(); // ✅ THIS LINE IS REQUIRED
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FB_PROJECT_ID,
      clientEmail: process.env.FB_CLIENT_EMAIL,
      privateKey: process.env.FB_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

module.exports = admin;

//  aita firebase admin