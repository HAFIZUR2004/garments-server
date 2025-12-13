require("dotenv").config();
const admin = require("./config/firebaseAdmin"); // তোমার admin init file

const uid = "ADMIN_UID_HERE"; // এখানে admin বানানোর user er UID দাও

admin.auth().setCustomUserClaims(uid, { role: "admin" })
  .then(() => {
    console.log("🔥 Admin role added successfully!");
    process.exit();
  })
  .catch((err) => {
    console.error("Error:", err);
  });
