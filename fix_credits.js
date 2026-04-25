const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const result = await User.updateMany(
    { plan: 'free', resumeCredits: { $lt: 1 } },
    { $set: { resumeCredits: 1 } }
  );
  console.log('Fixed users:', result.modifiedCount);
  
  const users = await User.find({}).select('fullName resumeCredits plan');
  users.forEach(u => console.log(u.fullName, '- Credits:', u.resumeCredits, '- Plan:', u.plan));
  process.exit(0);
}
fix();
