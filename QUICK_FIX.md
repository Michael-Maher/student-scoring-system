# Quick Fix for Firebase Not Saving

## The Problem
Scanned records are not appearing in Firebase - they only save locally.

## The Solution (2 minutes)

### 1. Enable Anonymous Authentication

**Go to this link:** https://console.firebase.google.com/project/student-scoring-system-1aa10/authentication/providers

**Then:**
- Click on "Anonymous"
- Toggle "Enable" to ON
- Click "Save"

### 2. Run the Diagnostic Tool

**Open in your browser:**
```
http://localhost:8000/firebase-diagnostic.html
```

(A local server is already running on port 8000)

**You should see:**
- All green ✅ checks
- Click "Test Write to Firebase" to verify

### 3. Verify Database Rules (optional)

**Go to:** https://console.firebase.google.com/project/student-scoring-system-1aa10/database/student-scoring-system-1aa10-default-rtdb/rules

**Rules should be:**
```json
{
  "rules": {
    "students": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "admins": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Click "Publish" if you make changes.

## Test It

1. Open http://localhost:8000/index.html
2. Login and scan a QR code
3. Check Firebase Console: https://console.firebase.google.com/project/student-scoring-system-1aa10/database/student-scoring-system-1aa10-default-rtdb/data

You should now see student records appearing under "students/"

## Still Not Working?

See detailed instructions in: `FIREBASE_FIX_INSTRUCTIONS.md`
