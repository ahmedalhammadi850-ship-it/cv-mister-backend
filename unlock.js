require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const User = require('./models/User');
    const users = await User.find({});
    for(let u of users) {
      u.upgradeFailedAttempts = 0;
      u.upgradeLastRejectedAt = null;
      u.upgradeLockedUntil = null;
      await u.save();
    }
    console.log("Done unlocking all users");
    process.exit();
  });
