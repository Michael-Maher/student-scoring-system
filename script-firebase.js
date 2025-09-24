// Global variables
let html5QrcodeScanner;
let currentAdmin = '';
let studentsData = {};
let isFirebaseConnected = false;
let firebaseListeners = [];

// Define all possible score types
const ALL_SCORE_TYPES = [
    'حضور القداس',
    'لبس شماس',
    'حضور الاجتماع من الأول من ١١ ونص لـ ١١:٤٠',
    'اعتراف شهري',
    'مسابقة رياضية',
    'كل مجموعة هتكون فريق (محتاجين حد يشرح)'
];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Wait for Firebase to be ready
    await window.firebaseReady;

    // Check if Firebase is available
    if (window.firebase && window.firebase.database) {
        isFirebaseConnected = true;
        updateSyncStatus('connected', 'Connected');
        initializeFirebaseSync();
    } else {
        isFirebaseConnected = false;
        updateSyncStatus('offline', 'Offline Mode');
        loadStoredData();
    }

    checkLoginStatus();
}

// Firebase synchronization functions
function initializeFirebaseSync() {
    if (!window.firebase) return;

    const studentsRef = window.firebase.ref(window.firebase.database, 'students');

    // Listen for real-time updates
    const unsubscribe = window.firebase.onValue(studentsRef, (snapshot) => {
        if (snapshot.exists()) {
            studentsData = snapshot.val() || {};
            updateSyncStatus('synced', 'Synced');

            // Update dashboard if it's currently visible
            if (!document.getElementById('dashboardSection').classList.contains('hidden')) {
                renderScoresTable();
            }
        } else {
            studentsData = {};
        }
    }, (error) => {
        console.error('Firebase sync error:', error);
        updateSyncStatus('error', 'Sync Error');
        // Fall back to localStorage
        loadStoredData();
    });

    firebaseListeners.push(unsubscribe);
}

function saveToFirebase(studentId, studentData) {
    if (!window.firebase || !isFirebaseConnected) {
        // Fall back to localStorage
        saveData();
        return Promise.resolve();
    }

    updateSyncStatus('syncing', 'Syncing...');

    const studentRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
    return window.firebase.set(studentRef, {
        ...studentData,
        lastUpdated: window.firebase.serverTimestamp(),
        lastUpdatedBy: currentAdmin
    }).then(() => {
        updateSyncStatus('synced', 'Synced');
    }).catch((error) => {
        console.error('Firebase save error:', error);
        updateSyncStatus('error', 'Sync Error');
        // Fall back to localStorage
        saveData();
    });
}

// Sync status management
function updateSyncStatus(status, text) {
    const indicator = document.getElementById('syncIndicator');
    const syncText = document.getElementById('syncText');

    if (!indicator || !syncText) return;

    // Remove all status classes
    indicator.className = 'sync-indicator';

    // Add new status class
    indicator.classList.add(`sync-${status}`);
    syncText.textContent = text;
}

// Authentication functions
function login() {
    const adminName = document.getElementById('adminName').value.trim();
    if (!adminName) {
        showNotification('Please enter your admin name', 'error');
        return;
    }

    currentAdmin = adminName;
    localStorage.setItem('currentAdmin', currentAdmin);

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('adminNameDisplay').textContent = `Admin: ${currentAdmin}`;

    initializeQRScanner();
    showNotification(`Welcome, ${currentAdmin}!`, 'success');
}

function logout() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    // Clean up Firebase listeners
    firebaseListeners.forEach(unsubscribe => unsubscribe());
    firebaseListeners = [];

    localStorage.removeItem('currentAdmin');
    currentAdmin = '';

    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('adminName').value = '';

    showNotification('Logged out successfully', 'info');
}

function checkLoginStatus() {
    const storedAdmin = localStorage.getItem('currentAdmin');
    if (storedAdmin) {
        currentAdmin = storedAdmin;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('adminNameDisplay').textContent = `Admin: ${currentAdmin}`;
        initializeQRScanner();
    }
}

// QR Scanner functions
function initializeQRScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        },
        false
    );

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function onScanSuccess(decodedText, decodedResult) {
    console.log(`QR Code detected: ${decodedText}`);

    // Stop scanning temporarily
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true);
    }

    // The QR code now contains the student name directly
    const studentName = decodedText.trim();

    // Show scoring form with the scanned name
    document.getElementById('studentName').value = studentName;
    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '1'; // Default 1 point
    document.getElementById('scoringForm').classList.remove('hidden');

    showNotification(`اسم الطالب: ${studentName}`, 'success');
}

function onScanFailure(error) {
    // Silently handle scan failures
    console.log(`QR Code scan error: ${error}`);
}

// Scoring functions
async function submitScore() {
    const studentName = document.getElementById('studentName').value.trim();
    const scoreType = document.getElementById('scoreType').value;
    const score = parseFloat(document.getElementById('score').value);

    // Validation
    if (!studentName) {
        showNotification('يرجى إدخال اسم الطالب', 'error');
        return;
    }

    if (!scoreType) {
        showNotification('يرجى اختيار نوع النشاط', 'error');
        return;
    }

    if (isNaN(score) || score < 0 || score > 100) {
        showNotification('يرجى إدخال نقاط صحيحة (0-100)', 'error');
        return;
    }

    // Use student name as the key (ID)
    const studentId = studentName;

    // Store score locally first
    if (!studentsData[studentId]) {
        studentsData[studentId] = {
            name: studentName,
            scores: {},
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };
    }

    // Add the new score (accumulate if already exists)
    if (studentsData[studentId].scores[scoreType]) {
        studentsData[studentId].scores[scoreType] += score;
    } else {
        studentsData[studentId].scores[scoreType] = score;
    }

    studentsData[studentId].lastUpdated = new Date().toISOString();
    studentsData[studentId].lastUpdatedBy = currentAdmin;

    // Save to Firebase (with fallback to localStorage)
    try {
        await saveToFirebase(studentId, studentsData[studentId]);
        showNotification(`تم إضافة ${score} نقطة لـ ${studentName} في ${scoreType}`, 'success');
    } catch (error) {
        console.error('Save error:', error);
        saveData(); // Fall back to localStorage
        showNotification(`تم حفظ النقاط محلياً: ${studentName} - ${scoreType}: ${score}`, 'info');
    }

    // Reset form and resume scanning
    cancelScoring();
}

function cancelScoring() {
    document.getElementById('scoringForm').classList.add('hidden');

    // Clear form
    document.getElementById('studentName').value = '';
    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '1'; // Reset to default

    // Resume scanning
    if (html5QrcodeScanner) {
        html5QrcodeScanner.resume();
    }
}

// Navigation functions
function showScanner() {
    document.getElementById('scannerSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');

    // Reinitialize scanner if needed
    if (!html5QrcodeScanner) {
        initializeQRScanner();
    } else {
        html5QrcodeScanner.resume();
    }
}

function showDashboard() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true);
    }

    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');

    renderScoresTable();
}

// Dashboard functions
function renderScoresTable() {
    const tableContainer = document.getElementById('scoresTable');

    if (Object.keys(studentsData).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
        return;
    }

    // Use ALL_SCORE_TYPES to ensure all columns always appear
    const scoreTypesArray = ALL_SCORE_TYPES;

    // Create table HTML with Arabic headers
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>اسم الطالب</th>
                    ${scoreTypesArray.map(type => `<th>${type}</th>`).join('')}
                    <th class="total-column">المجموع</th>
                    <th>آخر تحديث</th>
                    <th>المشرف</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Add student rows
    Object.entries(studentsData).forEach(([studentId, student]) => {
        let total = 0;
        const scoresCells = scoreTypesArray.map(type => {
            const score = student.scores?.[type];
            if (score !== undefined) {
                total += score;
                return `<td>${score}</td>`;
            }
            return '<td>-</td>';
        }).join('');

        const lastUpdated = student.lastUpdated ? new Date(student.lastUpdated).toLocaleString() : 'Unknown';

        tableHTML += `
            <tr>
                <td><strong>${student.name}</strong></td>
                ${scoresCells}
                <td class="total-column"><strong>${total}</strong></td>
                <td>${lastUpdated}</td>
                <td>${student.lastUpdatedBy || 'غير معروف'}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

// Excel export function
function exportToExcel() {
    // Use ALL_SCORE_TYPES to ensure all columns always appear in export
    const scoreTypesArray = ALL_SCORE_TYPES;

    // Prepare data for Excel
    const excelData = [];

    // Header row with Arabic
    const headers = ['اسم الطالب', ...scoreTypesArray, 'المجموع', 'آخر تحديث', 'المشرف'];
    excelData.push(headers);

    // If no data, still create Excel with headers
    if (Object.keys(studentsData).length === 0) {
        // Create workbook with headers only
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "نقاط الطلاب");

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `student_scores_${timestamp}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);
        showNotification('تم تصدير ملف Excel بنجاح!', 'success');
        return;
    }

    // Data rows
    Object.entries(studentsData).forEach(([studentId, student]) => {
        let total = 0;
        const row = [student.name]; // Only student name, no ID

        // Add score columns for ALL score types
        scoreTypesArray.forEach(type => {
            const score = student.scores?.[type];
            if (score !== undefined) {
                total += score;
                row.push(score);
            } else {
                row.push(0); // Show 0 instead of empty for missing scores
            }
        });

        row.push(total);
        row.push(student.lastUpdated ? new Date(student.lastUpdated).toLocaleString('ar-SA') : 'غير معروف');
        row.push(student.lastUpdatedBy || 'غير معروف');

        excelData.push(row);
    });

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نقاط الطلاب");

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `student_scores_${timestamp}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);

    showNotification('تم تصدير ملف Excel بنجاح!', 'success');
}

// Data management functions
function saveData() {
    localStorage.setItem('studentsData', JSON.stringify(studentsData));
}

function loadStoredData() {
    const stored = localStorage.getItem('studentsData');
    if (stored) {
        try {
            studentsData = JSON.parse(stored);
        } catch (error) {
            console.error('Error loading stored data:', error);
            studentsData = {};
        }
    }
}

async function clearAllData() {
    if (confirm('Are you sure you want to clear all student data? This action cannot be undone.')) {
        studentsData = {};

        if (isFirebaseConnected && window.firebase) {
            updateSyncStatus('syncing', 'Clearing...');
            try {
                const studentsRef = window.firebase.ref(window.firebase.database, 'students');
                await window.firebase.set(studentsRef, null);
                updateSyncStatus('synced', 'Synced');
            } catch (error) {
                console.error('Firebase clear error:', error);
                updateSyncStatus('error', 'Clear Error');
            }
        }

        localStorage.removeItem('studentsData');
        renderScoresTable();
        showNotification('All data cleared successfully', 'info');
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    setTimeout(() => {
        notification.classList.add('hidden');
    }, 4000);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // Page is hidden, pause scanner
        if (html5QrcodeScanner) {
            html5QrcodeScanner.pause(true);
        }
    } else {
        // Page is visible, resume scanner if on scanner section
        if (html5QrcodeScanner && !document.getElementById('scannerSection').classList.contains('hidden')) {
            html5QrcodeScanner.resume();
        }
    }
});

// Handle browser back/forward
window.addEventListener('beforeunload', function() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    // Clean up Firebase listeners
    firebaseListeners.forEach(unsubscribe => unsubscribe());
});