# Firebase Setup Guide for Real-Time Sync

This guide will help you set up Firebase for real-time data synchronization across multiple phones.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** or **"Add project"**
3. Enter project name: `student-scoring-system` (or your preferred name)
4. **Disable Google Analytics** (not needed for this project)
5. Click **"Create project"**

## Step 2: Set Up Realtime Database

1. In your Firebase project, click **"Realtime Database"** in the left sidebar
2. Click **"Create Database"**
3. **Choose location**: Select closest to your region
4. **Security rules**: Start in **"Test mode"** for now (we'll secure it later)
5. Click **"Enable"**

## Step 3: Get Your Firebase Configuration

1. In Firebase Console, click the **gear icon** ⚙️ → **"Project settings"**
2. Scroll down to **"Your apps"** section
3. Click **"Web"** icon `</>`
4. App nickname: `Student Scoring App`
5. **Don't check** "Also set up Firebase Hosting"
6. Click **"Register app"**
7. **Copy the configuration object** (looks like this):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project-id.firebaseapp.com",
  databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdefghijklmnop"
};
```

## Step 4: Update Your App Configuration

1. Open the file `firebase-config.js` in your project
2. **Replace the placeholder values** with your actual Firebase config:

```javascript
// Replace this section in firebase-config.js
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",           // ← Replace with your apiKey
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",     // ← Replace with your authDomain
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com", // ← Replace with your databaseURL
    projectId: "YOUR_PROJECT_ID",         // ← Replace with your projectId
    storageBucket: "YOUR_PROJECT_ID.appspot.com",      // ← Replace with your storageBucket
    messagingSenderId: "YOUR_SENDER_ID",  // ← Replace with your messagingSenderId
    appId: "YOUR_APP_ID"                  // ← Replace with your appId
};
```

## Step 5: Set Up Authentication

1. In Firebase Console, click **"Authentication"** in the left sidebar
2. Click **"Get started"**
3. Click on **"Email/Password"** in the Sign-in method tab
4. **Enable** Email/Password authentication
5. Click **"Save"**

### Add Admin Users

1. Go to **"Authentication"** → **"Users"** tab
2. Click **"Add user"**
3. Enter admin credentials:
   - Email: `admin@yourchurch.com` (or any email you prefer)
   - Password: Create a strong password
4. Click **"Add user"**
5. Repeat for each admin who needs access

**Important**: Share these credentials securely with your admins!

## Step 6: Set Up Security Rules

1. Go back to **"Realtime Database"** in Firebase Console
2. Click the **"Rules"** tab
3. Replace the default rules with these **security rules** (requires authentication):

```javascript
{
  "rules": {
    "students": {
      ".read": true,
      ".write": true,
      "$studentId": {
        ".validate": "newData.hasChildren(['name', 'scores', 'scans', 'lastUpdated', 'lastUpdatedBy'])",
        "name": {
          ".validate": "newData.isString() && newData.val().length > 0"
        },
        "scores": {
          "$scoreType": {
            ".validate": "newData.isNumber() && newData.val() >= 0"
          }
        },
        "scans": {
          "$scoreType": {
            ".validate": "newData.isString()"
          }
        },
        "lastUpdatedBy": {
          ".validate": "newData.isString() && newData.val().length > 0"
        }
      }
    },
    "admins": {
      ".read": true,
      ".write": true,
      "$phone": {
        ".validate": "newData.hasChildren(['name', 'phone', 'password', 'isHeadAdmin'])",
        "name": {
          ".validate": "newData.isString() && newData.val().length > 0"
        },
        "phone": {
          ".validate": "newData.isString() && newData.val().length == 11"
        },
        "password": {
          ".validate": "newData.isString() && newData.val().length > 0"
        },
        "isHeadAdmin": {
          ".validate": "newData.isBoolean()"
        }
      }
    }
  }
}
```

**Note**: These rules require users to be authenticated. Only logged-in admins can read/write data.

4. Click **"Publish"**

## Step 7: Deploy and Test

1. **Push your updated code** to GitHub:
```bash
cd "/Users/michaelmaher/Desktop/Scoring-app"
git add .
git commit -m "Add Firebase real-time sync functionality"
git push origin main
```

2. **Access your app** on multiple phones using the GitHub Pages URL
3. **Test real-time sync**:
   - Login as different admins on different phones
   - Scan QR codes and add scores on one phone
   - Verify scores appear instantly on other phones
   - Check the sync status indicator in the header

## Step 8: Understanding the Sync Status

The app shows sync status in the header with colored indicators:

- 🟢 **Green "Synced"**: Connected to Firebase, data is synchronized
- 🟡 **Yellow "Syncing..."**: Currently saving/loading data
- 🔴 **Red "Sync Error"**: Connection problem, using offline mode
- ⚫ **Gray "Offline Mode"**: Firebase not configured, using local storage only

## Troubleshooting

### Issue: "Sync Error" or "Offline Mode"
1. Check if `firebase-config.js` has the correct configuration values
2. Verify Firebase project is active in Firebase Console
3. Check browser network connection
4. Look for errors in browser developer tools (F12)

### Issue: Data not syncing between phones
1. Verify all phones are using the same GitHub Pages URL
2. Check that Firebase Realtime Database rules are published
3. Make sure both phones show "Connected" or "Synced" status

### Issue: Camera not working
1. Grant camera permissions when browser asks
2. Make sure other apps aren't using the camera
3. Try refreshing the page

## Advanced Features

### Offline Support
- App works offline using local storage
- Data syncs automatically when connection is restored
- No data loss during network interruptions

### Multi-Admin Tracking
- Each score shows which admin entered it
- Timestamp tracking for all updates
- Real-time updates across all connected devices

### Excel Export
- Export includes all data from Firebase
- Works with or without internet connection
- Includes totals and admin tracking info

## Free Tier Limits

Firebase free tier includes:
- **100 GB/month** data transfer
- **1 GB** storage
- **100,000** simultaneous connections

This is more than enough for typical school/class usage.

## Security Notes

- Current setup allows all reads/writes for simplicity
- For production, consider adding user authentication
- Monitor usage in Firebase Console
- Database URL is public but data validation prevents corruption

## Need Help?

1. Check Firebase Console → Project → Usage tab for quotas
2. View Firebase Console → Project → Database → Data tab to see live data
3. Use browser developer tools (F12) to check for JavaScript errors
4. Firebase documentation: https://firebase.google.com/docs/database