# Student Scoring System

A web-based application for scanning student QR codes and recording scores with multi-admin support and Excel export functionality.

## Features

- **QR Code Scanning**: Camera-based QR code scanning to identify students
- **Score Management**: Record scores for different item types (Quiz, Assignment, Participation, Project, Exam)
- **Multi-Admin Support**: Multiple administrators can access and update scores
- **Excel Export**: Export all data to Excel spreadsheet with student names as rows and item types as columns
- **Real-time Dashboard**: View all student scores in a centralized table
- **Responsive Design**: Works on desktop and mobile devices
- **Data Persistence**: All data stored locally in browser

## Quick Start

1. Open `index.html` in a web browser
2. Enter your admin name to login
3. Grant camera permissions when prompted
4. Scan student QR codes to add scores
5. Use the dashboard to view and export data

## Usage Instructions

### For Administrators

1. **Login**: Enter your admin name on the login screen
2. **Scan QR Code**: Point camera at student's QR code
3. **Enter Score**: Fill in student name, select score type, and enter score (0-100)
4. **Submit**: Click "Submit Score" to save the data
5. **View Dashboard**: Click "Dashboard" to see all scores
6. **Export Data**: Click "Export to Excel" to download spreadsheet

### QR Code Format

Student QR codes should contain the student's unique ID (text or numbers).

### Score Types

- Quiz
- Assignment
- Participation
- Project
- Exam

## Technical Details

### Files Structure
```
/
├── index.html          # Main HTML file
├── styles.css          # CSS styling
├── script.js          # JavaScript functionality
└── README.md          # This file
```

### Dependencies

- **html5-qrcode**: QR code scanning library (loaded from CDN)
- **xlsx**: Excel export functionality (loaded from CDN)

### Data Storage

All data is stored in the browser's localStorage. Data includes:
- Student ID and name
- Scores by item type
- Last update timestamp
- Admin who made the update

### Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 11+)
- Mobile browsers: Supported with camera access

## Security Notes

- No server-side authentication
- Data stored locally in each browser
- Camera access required for QR scanning
- Admin names are for tracking purposes only

## Troubleshooting

### Camera Not Working
- Grant camera permissions in browser
- Check if other applications are using camera
- Try refreshing the page

### QR Code Not Scanning
- Ensure good lighting
- Hold QR code steady
- Try different distances from camera

### Data Not Saving
- Check browser localStorage is enabled
- Clear browser cache if issues persist

### Excel Export Issues
- Ensure pop-ups are not blocked
- Check browser download permissions

## Future Enhancements

Potential improvements could include:
- Server-side data storage
- User authentication system
- Score analytics and reporting
- Bulk import/export features
- Score history tracking
- Email notifications