# Bookmark Feature Setup Guide

## Overview
The system now includes a bookmark download feature that overlays a generated QR code onto your custom bookmark template.

## Required Setup

### 1. Add Bookmark Template Image

You need to save your bookmark image to the project directory:

1. **Save your bookmark image** as `bookmark-template.png`
2. **Place it in the same directory** as `index.html`
3. The image should be the exact bookmark image you provided

**File location:**
```
/Users/mmichaelmaher/Documents/student-scoring-system/bookmark-template.png
```

### 2. Adjust QR Position (If Needed)

The QR code is positioned in the **white rounded rectangle at bottom left corner** by default. If you need to adjust the position:

**Edit `script-firebase.js` around line 2477:**

```javascript
// Calculate QR position - VERY LARGE to fill white box completely
const qrSize = 120;    // QR code size (width and height)
const qrX = 25;        // Distance from left edge (pixels)
const qrY = bookmarkImg.height - 155; // Distance from bottom (pixels)
```

**Adjust these values:**
- `qrSize`: Resize QR code (current: 120px)
- `qrX`: Move QR left/right
- `qrY`: Move QR up/down (smaller = higher, larger = lower)

## How It Works

### 1. QR Code Generation
The system generates a QR code with the student's information:
```
name|academicYear|phone|team
```

### 2. Template Overlay
- Loads your bookmark template image
- Generates QR code (256x256 pixels)
- Overlays QR on the bottom left corner
- Adds white background behind QR for visibility

### 3. Download
- Saves as PNG file
- Filename: `Bookmark_StudentName.png`
- Full resolution, ready to print

## Button Locations

The bookmark button (🔖) appears in the QR Codes table:
- **Edit** (✏️) - Purple button
- **Download QR** (⬇️) - Green button
- **Download Bookmark** (🔖) - Orange button (NEW)
- **Delete** (🗑️) - Red button

## Usage Instructions

### For Users:

1. Go to **QR Generator** tab
2. Find the student in the table
3. Click the **🔖 bookmark button**
4. The bookmark will download automatically
5. Print and use!

### Testing:

1. Make sure `bookmark-template.png` exists in the project folder
2. Create a test QR code
3. Click the bookmark button
4. Check if QR appears in the correct position
5. Adjust position values if needed

## Troubleshooting

### Error: "تعذر تحميل قالب علامة الكتاب"
**Problem:** Template image not found
**Solution:**
- Check file exists: `bookmark-template.png`
- Check file is in correct location
- Check filename spelling (case-sensitive)

### QR Code in Wrong Position
**Problem:** QR not aligned properly
**Solution:**
- Measure your template image
- Find the QR area coordinates
- Update `qrX` and `qrY` values in code

### QR Code Too Big/Small
**Problem:** QR doesn't fit in template area
**Solution:**
- Adjust `qrWidth` and `qrHeight` values
- Keep aspect ratio 1:1 (same width and height)

### White Background Shows
**Problem:** White box around QR looks bad
**Solution:**
Remove the white background code (lines 2483-2485):
```javascript
// Comment out or delete these lines:
// ctx.fillStyle = '#ffffff';
// ctx.fillRect(qrX - 5, qrY - 5, qrWidth + 10, qrHeight + 10);
```

## Template Specifications

**Your bookmark template should:**
- Be a PNG image with transparency (if needed)
- Have a designated area for QR code (bottom left)
- Be high resolution for best print quality
- Recommended size: 600-1200 pixels wide

**QR Code area in template:**
- Located: Bottom left corner
- Size: ~230x230 pixels
- Has white/light background for QR visibility

## Advanced Customization

### Multiple Templates

To support multiple bookmark designs:

1. Create different templates: `bookmark-template-1.png`, `bookmark-template-2.png`
2. Add a selector in the QR form
3. Modify the code to use selected template

### Add Student Name to Bookmark

To add the student name on the bookmark (not just in QR):

```javascript
// After drawing QR code, add text:
ctx.fillStyle = '#000000';
ctx.font = 'bold 24px Arial';
ctx.textAlign = 'center';
ctx.fillText(qr.name, bookmarkImg.width / 2, 50); // Top center
```

## File Locations

| File | Purpose | Line Numbers |
|------|---------|--------------|
| `script-firebase.js` | Bookmark download function | 2420-2517 |
| `script-firebase.js` | Table with bookmark button | 2204-2209 |
| `styles.css` | Bookmark button styling | 1903-1925 |
| `bookmark-template.png` | Your template image | (root folder) |

## Color Coding

The bookmark button uses an **orange gradient**:
- Normal: Gold to Orange gradient
- Hover: Glowing orange shadow
- Matches the spiritual/church theme

## Next Steps

1. ✅ Save `bookmark-template.png` to project folder
2. ✅ Refresh browser
3. ✅ Test bookmark generation
4. ✅ Adjust QR position if needed
5. ✅ Print and distribute to students!

---

**Created:** 2026-01-11
**Version:** 1.0
**Feature:** Bookmark QR Code Generator
