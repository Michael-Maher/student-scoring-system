# Firebase Database Rules Update Guide

## Issue
The QR Generator feature requires access to a new `qrcodes` path in Firebase, but the current security rules don't allow it.

## Quick Fix (via Firebase Console)

### Step 1: Access Firebase Console
1. Go to https://console.firebase.google.com
2. Select your project

### Step 2: Navigate to Database Rules
1. Click **"Realtime Database"** in the left sidebar
2. Click the **"Rules"** tab at the top

### Step 3: Update Rules
Replace your current rules with:

```json
{
  "rules": {
    "students": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "qrcodes": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "admins": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "scoreTypes": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

### Step 4: Publish
Click the **"Publish"** button to save the changes.

---

## Alternative: Deploy Rules via Firebase CLI

If you have Firebase CLI installed:

```bash
# Make sure you're in the project directory
cd /Users/mmichaelmaher/Documents/student-scoring-system

# Deploy the rules
firebase deploy --only database
```

---

## What This Does

The new rules add permission for the `qrcodes` path, which allows your application to:
- ✅ Create new QR codes
- ✅ Read existing QR codes
- ✅ Update QR code data
- ✅ Delete QR codes

All operations require authentication (`auth != null`), which means only logged-in admins can access this data.

---

## After Updating Rules

1. **Refresh your browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Click the QR Generator tab** (🎫 إنشاء QR)
3. **Try creating a QR code**
4. You should no longer see permission errors in the console

---

## Troubleshooting

**Still seeing permission errors?**
- Make sure you clicked "Publish" in Firebase Console
- Wait 5-10 seconds for rules to propagate
- Hard refresh your browser
- Check that you're logged in to the app

**Need more restrictive rules?**
You can add validation rules like:
```json
"qrcodes": {
  ".read": "auth != null",
  ".write": "auth != null",
  "$qrId": {
    ".validate": "newData.hasChildren(['name', 'createdAt', 'createdBy'])"
  }
}
```
