import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env
dotenv.config({ path: resolve(__dirname, '../.env') });

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not defined in .env');
  process.exit(1);
}

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

const PLAN_LIMITS = {
  weekend: {
    maxDays: 7
  },
  vacation: {
    maxDays: 14
  },
  extended: {
    maxDays: 30
  }
};

async function updatePlanDurations() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('splitgram');
    const now = new Date();
    
    // Find all users with active plans
    const usersWithPlans = await db.collection('users').find({
      'plan.expires_at': { $gt: now }
    }).toArray();
    
    console.log('\nActive Plans:', usersWithPlans.length);
    
    for (const user of usersWithPlans) {
      const planType = user.plan.type;
      const startDate = new Date(user.plan.started_at);
      
      // Calculate new expiry based on new durations
      const newExpiryDate = new Date(startDate);
      newExpiryDate.setDate(startDate.getDate() + PLAN_LIMITS[planType].maxDays);

      console.log('\nUpdating plan for user:', user.id);
      console.log('Plan Type:', planType);
      console.log('Started:', startDate.toLocaleString());
      console.log('Old Expiry:', new Date(user.plan.expires_at).toLocaleString());
      console.log('New Expiry:', newExpiryDate.toLocaleString());

      // Update the expiration date
      const result = await db.collection('users').updateOne(
        { id: user.id },
        {
          $set: {
            'plan.expires_at': newExpiryDate
          }
        }
      );

      console.log('Update result:', result.modifiedCount === 1 ? 'Success' : 'Failed');
      console.log('---');
    }

  } finally {
    await client.close();
  }
}

updatePlanDurations().catch(console.error); 