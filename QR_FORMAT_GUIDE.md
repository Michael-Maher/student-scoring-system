# QR Code Format Guide

## Overview
The QR code system uses a compact pipe-delimited format to store student information efficiently, avoiding the "code length overflow" error that occurs with JSON format.

## QR Code Data Format

### Format Structure
```
name|academicYear|phone|team
```

### Examples

**Student with all fields:**
```
مايكل ماهر|2024-2025|01234567890|الفريق الأحمر
```

**Student with only name:**
```
مايكل ماهر|||
```

**Student with name and academic year:**
```
مايكل ماهر|2024-2025||
```

## Why This Format?

### ❌ Old Format (JSON) - Too Large
```json
{"name":"مايكل ماهر","academicYear":"2024-2025","phone":"01234567890","team":"الفريق الأحمر"}
```
**Size**: ~120 characters
**Problem**: Exceeds QR code capacity at high error correction levels

### ✅ New Format (Pipe-Delimited) - Compact
```
مايكل ماهر|2024-2025|01234567890|الفريق الأحمر
```
**Size**: ~60 characters
**Benefit**: 50% smaller, fits easily in QR codes

## QR Code Settings

- **Error Correction Level**: Medium (M)
- **Capacity**: Up to 370 alphanumeric characters
- **Size**: 512x512 pixels
- **Format**: PNG

### Error Correction Levels Comparison

| Level | Capacity | Recovery | Used For |
|-------|----------|----------|----------|
| L (Low) | 2953 chars | 7% | Clean environments |
| M (Medium) | 2331 chars | 15% | **Our choice** - Good balance |
| Q (Quartile) | 1663 chars | 25% | Moderate damage |
| H (High) | 1273 chars | 30% | High damage (too restrictive) |

## How It Works

### 1. Generating QR Codes
When you create a QR code in the system:
```javascript
// Input
{
  name: "مايكل ماهر",
  academicYear: "2024-2025",
  phone: "01234567890",
  team: "الفريق الأحمر"
}

// Converted to
"مايكل ماهر|2024-2025|01234567890|الفريق الأحمر"
```

### 2. Scanning QR Codes
When you scan a QR code:
```javascript
// Scanned data
"مايكل ماهر|2024-2025|01234567890|الفريق الأحمر"

// Decoded to
{
  name: "مايكل ماهر",
  academicYear: "2024-2025",
  phone: "01234567890",
  team: "الفريق الأحمر"
}
```

### 3. Display in Notification
After scanning, you'll see:
```
اسم المخدوم: مايكل ماهر (السنة: 2024-2025, الهاتف: 01234567890, الفريق: الفريق الأحمر)
```

## Backward Compatibility

The scanner supports **both formats**:

1. **Old QR codes** (just name):
   ```
   مايكل ماهر
   ```
   Works perfectly! ✅

2. **New QR codes** (with additional data):
   ```
   مايكل ماهر|2024-2025|01234567890|الفريق الأحمر
   ```
   Automatically detects and decodes! ✅

## Maximum Field Lengths

To stay within QR code limits:

- **Name**: Up to 100 characters
- **Academic Year**: Up to 20 characters (e.g., "2024-2025")
- **Phone**: Exactly 11 digits (Egyptian format)
- **Team**: Up to 50 characters

**Total recommended**: Keep under 200 characters total for reliability

## Technical Details

### Encoding Function
```javascript
function encodeQRData(qr) {
    return [
        qr.name || '',
        qr.academicYear || '',
        qr.phone || '',
        qr.team || ''
    ].join('|');
}
```

### Decoding Function
```javascript
function decodeQRData(qrString) {
    const parts = qrString.split('|');
    return {
        name: parts[0] || '',
        academicYear: parts[1] || '',
        phone: parts[2] || '',
        team: parts[3] || ''
    };
}
```

## Troubleshooting

### Error: "code length overflow"
**Cause**: Data is too large for QR code
**Solution**:
- Shorten field values
- Remove unnecessary information
- System now uses Medium error correction to prevent this

### Error: "البيانات كبيرة جداً لإنشاء رمز QR"
**Cause**: Combined data exceeds 370 characters
**Solution**:
- Use abbreviations in team names
- Shorten academic year format (e.g., "24-25" instead of "2024-2025")
- Remove optional fields

## Best Practices

1. **Keep names concise** - Use common names or nicknames
2. **Use short team names** - "أحمر" instead of "الفريق الأحمر الكبير"
3. **Standardize year format** - "2024-2025" or "24-25" consistently
4. **Test QR codes** - Always download and test scan before distributing
5. **Print quality** - Use high-quality printing for best scanning results

## File Locations

- QR Generation: `script-firebase.js` (lines 2210-2269)
- QR Decoding: `script-firebase.js` (lines 1957-1970)
- QR Scanning: `script-firebase.js` (lines 552-589)
