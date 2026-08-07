import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };

initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth();

async function deleteUsers(nextPageToken) {
  try {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    const uids = listUsersResult.users.map((userRecord) => userRecord.uid);

    if (uids.length > 0) {
      await auth.deleteUsers(uids);
      console.log(`সফলভাবে ${uids.length} জন ইউজার ডিলিট হয়েছে।`);
    }

    if (listUsersResult.pageToken) {
      await deleteUsers(listUsersResult.pageToken);
    } else {
      console.log("সব ইউজার ডিলিট সম্পন্ন হয়েছে!");
    }
  } catch (error) {
    console.error("এরর হয়েছে:", error);
  }
}

deleteUsers();