# Student Scoring System - نظام تسجيل نقاط المخدومين

A web-based application for scanning student QR codes and recording scores with **real-time Firebase synchronization** across multiple devices, multi-admin support, and Excel export functionality.

## Features

- **🔄 Real-Time Sync**: Instant data synchronization across all devices using Firebase Realtime Database
- **📱 QR Code Scanning**: Camera-based QR code scanning to identify students
- **📊 Score Management**: Record scores for different activities with duplicate prevention
- **👥 Multi-Admin Support**: Multiple administrators with phone number authentication
- **📄 Excel Export**: Export all data to Excel spreadsheet
- **⚡ Live Dashboard**: View all student scores with real-time updates
- **📱 Responsive Design**: Works on desktop and mobile devices
- **🔌 Offline Support**: Works offline with automatic sync when connection is restored
- **🎯 Sync Status**: Visual indicators showing connection and sync status
- **🔒 Duplicate Prevention**: Prevents scanning the same activity type twice per day (configurable)

## Quick Start

### 1. Local Testing

```bash
# Start a local server
python3 -m http.server 8000

# Open in browser
http://localhost:8000
```

### 2. Firebase Setup (Required for Multi-Device Sync)

**IMPORTANT:** You must enable Anonymous Authentication in Firebase Console for the app to save data.

1. Go to [Firebase Console](https://console.firebase.google.com/project/student-scoring-system-1aa10/authentication/providers)
2. Click on **"Anonymous"**
3. Toggle **"Enable"** to ON
4. Click **"Save"**

For detailed setup instructions, see `FIREBASE_SETUP.md`

### 3. Login

Default admin credentials (phone-based):
- Phone: `01207714622` (Head Admin)
- Password: Set in Firebase Realtime Database under `admins/`

## Score Types (أنواع الأنشطة)

The system includes 5 predefined score types:

1. **القداس والتناول** (Mass & Communion) - No multiple scans per day
2. **لبس التونيه** (Wearing Tunic) - No multiple scans per day
3. **حضور الاجتماع** (Meeting Attendance) - No multiple scans per day
4. **سلوك** (Behavior) - Allows multiple scans per day
5. **احضار الكتاب المقدس** (Bringing Bible) - No multiple scans per day

Score types can be customized by the head admin in the settings.

## Files Structure

```
student-scoring-system/
├── assets/                      # Static assets
│   ├── logo.png                # Church logo
│   └── bookmark-template-data.js # Bookmark template
├── docs/                        # Documentation
│   ├── README.md               # This file
│   ├── QUICK_START.md          # Quick start guide
│   ├── FIREBASE_SETUP.md       # Firebase setup
│   ├── DEPLOYMENT_GUIDE.md     # Deployment instructions
│   ├── CHANGELOG.md            # Version history
│   ├── BOOKMARK_SETUP.md       # Bookmark configuration
│   ├── QR_FORMAT_GUIDE.md      # QR code specs
│   ├── FIREBASE_RULES_UPDATE.md # Security rules
│   ├── PROJECT_STRUCTURE.md    # Project organization
│   ├── PHASE1_REFACTORING.md   # Phase 1 details
│   ├── REFACTORING_GUIDE.md    # Migration guide
│   └── REFACTORING_SUMMARY.md  # Refactoring summary
├── scripts/                     # JavaScript files
│   ├── core/                   # Core modules (NEW)
│   │   ├── firebase-adapter.js # Firebase abstraction
│   │   └── state-manager.js    # State management
│   ├── constants.js            # Configuration constants
│   ├── firebase-config.js      # Firebase initialization
│   └── script-firebase.js      # Main application logic
├── index.html                   # Main application UI
├── styles.css                   # Application styling
├── sample-qr-codes.html         # QR code generator for testing
└── database.rules.json          # Firebase security rules
```

**Recent Updates (v15.0):**
- ✅ Reorganized folder structure for better maintainability
- ✅ Created core modules (FirebaseAdapter, StateManager)
- ✅ Extracted configuration to constants file
- ✅ Enhanced documentation with refactoring guides
- ✅ See `docs/REFACTORING_SUMMARY.md` for details

## Technical Details

### Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **QR Scanning**: html5-qrcode library v2.3.8
- **Database**: Firebase Realtime Database
- **Authentication**: Firebase Anonymous Authentication
- **Export**: SheetJS (xlsx) library v0.18.5

### Data Structure

Firebase Realtime Database structure:

```json
{
  "students": {
    "student_name_sanitized": {
      "name": "Original Student Name",
      "scores": {
        "mass": 10,
        "behavior": 25
      },
      "scans": {
        "mass": "2026-01-05",
        "behavior": "2026-01-05"
      },
      "lastUpdated": "server_timestamp",
      "lastUpdatedBy": "Admin Name"
    }
  },
  "admins": {
    "phone_number": {
      "name": "Admin Name",
      "password": "hashed_password"
    }
  },
  "scoreTypes": {
    "type_id": {
      "id": "type_id",
      "label": "Display Label",
      "allowMultiplePerDay": false
    }
  }
}
```

### Key Features

#### 1. Path Sanitization
Student names/IDs are sanitized to remove Firebase-invalid characters (`.`, `#`, `$`, `[`, `]`, `/`, `:`) while preserving the original name in the database.

#### 2. Duplicate Prevention
The system tracks scan dates for each activity type and prevents duplicate scans on the same day (unless `allowMultiplePerDay` is enabled).

#### 3. Real-Time Sync
Uses Firebase listeners with deep merge strategy to prevent data loss during concurrent updates.

#### 4. Offline Support
- Data saves to localStorage as backup
- Automatic sync when connection is restored
- Visual sync status indicators

## Usage

### For Administrators

1. **Login**: Enter phone number and password
2. **Scan QR Code**: Point camera at student's QR code
3. **Select Activity**: Choose the activity type
4. **Enter Score**: Default is 1 point (adjustable)
5. **Submit**: Click "Submit Score"

### For Head Admin

Additional permissions:
- Add/edit/delete admins
- Customize score types
- View all admin activity

### QR Code Format

QR codes can contain:
- Student names (Arabic or English)
- Student IDs (numbers or text)
- URLs (automatically sanitized)

Generate test QR codes using `sample-qr-codes.html`

## Sync Status Indicators

- 🟢 **متصل** (Connected): Firebase connected, ready to sync
- 🟡 **تحديث…** (Syncing): Data being saved/loaded
- ✅ **تم التحديث** (Synced): All data synchronized
- 🔴 **خطأ في المزامنة** (Sync Error): Connection issue
- ⚫ **غير متصل** (Offline): Local storage only

## Troubleshooting

### Data Not Saving to Firebase

**Symptom**: Console shows "PERMISSION_DENIED" or path validation errors

**Solutions**:
1. Enable Anonymous Authentication in Firebase Console
2. Check Firebase Database Rules allow authenticated writes
3. Verify QR code content doesn't contain invalid characters (handled automatically)

### Camera Not Working

- Grant camera permissions in browser settings
- Use HTTPS or localhost (required for camera access)
- Check if another app is using the camera

### Excel Export Not Working

- Ensure pop-ups are not blocked
- Check browser download permissions
- Verify data exists in the dashboard

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (iOS 11+)
- Mobile browsers: ✅ Supported with camera access

## Security

- Anonymous authentication for Firebase writes
- Phone-based admin authentication
- Database rules enforce authentication (`auth != null`)
- Client-side password verification
- No sensitive data in QR codes

## Development

### Running Locally

```bash
# Start local server (required for camera access)
python3 -m http.server 8000

# Or using Node.js
npx http-server -p 8000

# Access at
http://localhost:8000
```

### Deploying to Production

See `DEPLOYMENT_GUIDE.md` for GitHub Pages deployment instructions.

## License

This project is created for church/educational use.

## Architecture

The application now includes core modules for improved maintainability:

- **FirebaseAdapter** (`scripts/core/firebase-adapter.js`) - Abstraction layer for database operations
- **StateManager** (`scripts/core/state-manager.js`) - Centralized state with Observer pattern
- **Constants** (`scripts/constants.js`) - Single source of truth for configuration

For details on the architecture and gradual migration, see `docs/REFACTORING_GUIDE.md`

## Support

For Firebase setup help, see `docs/FIREBASE_SETUP.md`
For deployment help, see `docs/DEPLOYMENT_GUIDE.md`
For quick start, see `docs/QUICK_START.md`
For refactoring details, see `docs/REFACTORING_SUMMARY.md`
