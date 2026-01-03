// Global variables
let html5QrcodeScanner;
let currentAdmin = '';
let studentsData = {};
let isFirebaseConnected = false;
let firebaseListeners = [];

// Define all possible score types with IDs and labels
const SCORE_TYPES = {
    'mass': { id: 'mass', label: 'القداس والتناول', allowMultiplePerDay: false },
    'tunic': { id: 'tunic', label: 'لبس التونيه', allowMultiplePerDay: false },
    'meeting': { id: 'meeting', label: 'حضور الاجتماع', allowMultiplePerDay: false },
    'behavior': { id: 'behavior', label: 'سلوك', allowMultiplePerDay: true },
    'bible': { id: 'bible', label: 'احضار الكتاب المقدس', allowMultiplePerDay: false }
};

const ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);

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

        // Set up authentication state listener
        if (window.firebase.auth) {
            window.firebase.onAuthStateChanged(window.firebase.auth, (user) => {
                if (user) {
                    // User is signed in
                    console.log('User authenticated:', user.email);
                    onUserAuthenticated(user);
                } else {
                    // User is signed out
                    console.log('User not authenticated');
                    showLoginScreen();
                }
            });
        } else {
            checkLoginStatus();
        }
    } else {
        isFirebaseConnected = false;
        updateSyncStatus('offline', 'Offline Mode');
        loadStoredData();
        checkLoginStatus();
    }
}

function onUserAuthenticated(user) {
    // Extract admin name from email (before @)
    const adminName = user.email.split('@')[0];
    currentAdmin = adminName;

    // Initialize Firebase sync after authentication
    initializeFirebaseSync();

    // Show main app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('adminNameDisplay').textContent = `المشرف: ${adminName}`;

    // Initialize QR Scanner
    initializeQRScanner();
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');

    // Clear form
    if (document.getElementById('adminEmail')) {
        document.getElementById('adminEmail').value = '';
    }
    if (document.getElementById('adminPassword')) {
        document.getElementById('adminPassword').value = '';
    }
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
async function login() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const keepLoggedIn = document.getElementById('keepLoggedIn').checked;
    const loginError = document.getElementById('loginError');

    // Clear previous error
    loginError.classList.add('hidden');
    loginError.textContent = '';

    // Validation
    if (!email) {
        loginError.textContent = 'الرجاء إدخال البريد الإلكتروني';
        loginError.classList.remove('hidden');
        return;
    }

    if (!password) {
        loginError.textContent = 'الرجاء إدخال كلمة المرور';
        loginError.classList.remove('hidden');
        return;
    }

    // Check if Firebase Auth is available
    if (!window.firebase || !window.firebase.auth) {
        // Fallback to simple login (no authentication)
        const adminName = email.split('@')[0];
        currentAdmin = adminName;

        if (keepLoggedIn) {
            localStorage.setItem('currentAdmin', currentAdmin);
        }

        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('adminNameDisplay').textContent = `المشرف: ${currentAdmin}`;

        initializeQRScanner();
        showNotification(`أهلاً ${currentAdmin}!`, 'success');
        return;
    }

    try {
        // Set persistence based on "keep me logged in"
        const persistence = keepLoggedIn
            ? window.firebase.browserLocalPersistence
            : window.firebase.browserSessionPersistence;

        await window.firebase.setPersistence(window.firebase.auth, persistence);

        // Sign in with Firebase Authentication
        await window.firebase.signInWithEmailAndPassword(window.firebase.auth, email, password);

        // Success notification will be shown by onUserAuthenticated
        const adminName = email.split('@')[0];
        showNotification(`أهلاً ${adminName}!`, 'success');

    } catch (error) {
        console.error('Login error:', error);

        // Show user-friendly error messages
        let errorMessage = 'حدث خطأ أثناء تسجيل الدخول';

        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = 'البريد الإلكتروني غير صحيح';
                break;
            case 'auth/user-disabled':
                errorMessage = 'هذا الحساب معطل';
                break;
            case 'auth/user-not-found':
                errorMessage = 'المستخدم غير موجود';
                break;
            case 'auth/wrong-password':
                errorMessage = 'كلمة المرور غير صحيحة';
                break;
            case 'auth/invalid-credential':
                errorMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'عدد كبير جداً من المحاولات. الرجاء المحاولة لاحقاً';
                break;
            case 'auth/network-request-failed':
                errorMessage = 'خطأ في الاتصال بالإنترنت';
                break;
        }

        loginError.textContent = errorMessage;
        loginError.classList.remove('hidden');
        showNotification(errorMessage, 'error');
    }
}

async function logout() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    // Clean up Firebase listeners
    firebaseListeners.forEach(unsubscribe => unsubscribe());
    firebaseListeners = [];

    // Sign out from Firebase Auth if available
    if (window.firebase && window.firebase.auth) {
        try {
            await window.firebase.signOut(window.firebase.auth);
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    // Clear local storage
    localStorage.removeItem('currentAdmin');
    currentAdmin = '';

    // Show login screen
    showLoginScreen();

    showNotification('تم تسجيل الخروج بنجاح', 'info');
}

function checkLoginStatus() {
    const storedAdmin = localStorage.getItem('currentAdmin');
    if (storedAdmin) {
        currentAdmin = storedAdmin;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('adminNameDisplay').textContent = `المشرف: ${currentAdmin}`;
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

    // Get today's date (YYYY-MM-DD format for comparison)
    const today = new Date().toISOString().split('T')[0];

    // Store score locally first
    if (!studentsData[studentId]) {
        studentsData[studentId] = {
            name: studentName,
            scores: {},
            scans: {}, // Track scans by type and date
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };
    }

    // Initialize scans tracking if not exists
    if (!studentsData[studentId].scans) {
        studentsData[studentId].scans = {};
    }

    // Check if this score type was already scanned today (except for types that allow multiple per day)
    const scoreTypeConfig = SCORE_TYPES[scoreType];
    if (scoreTypeConfig && !scoreTypeConfig.allowMultiplePerDay) {
        if (studentsData[studentId].scans[scoreType] === today) {
            showNotification(`⚠️ تم تسجيل "${scoreTypeConfig.label}" لهذا الطالب اليوم بالفعل. لا يمكن التسجيل أكثر من مرة في اليوم الواحد.`, 'error');
            cancelScoring();
            return;
        }
    }

    // Record the scan date for this score type (سلوك is always recorded but doesn't block)
    studentsData[studentId].scans[scoreType] = today;

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
        const typeLabel = scoreTypeConfig ? scoreTypeConfig.label : scoreType;
        showNotification(`✅ تم إضافة ${score} نقطة لـ ${studentName} في ${typeLabel}`, 'success');
    } catch (error) {
        console.error('Save error:', error);
        saveData(); // Fall back to localStorage
        const typeLabel = scoreTypeConfig ? scoreTypeConfig.label : scoreType;
        showNotification(`تم حفظ النقاط محلياً: ${studentName} - ${typeLabel}: ${score}`, 'info');
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
function renderScoresTable(filteredData = null) {
    const tableContainer = document.getElementById('scoresTable');
    const dataToRender = filteredData || studentsData;

    if (Object.keys(dataToRender).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
        return;
    }

    // Create table HTML with Arabic headers using labels
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>اسم الطالب</th>
                    ${ALL_SCORE_TYPE_IDS.map(typeId => `<th>${SCORE_TYPES[typeId].label}</th>`).join('')}
                    <th class="total-column">المجموع</th>
                    <th>التاريخ والوقت</th>
                    <th>المشرف</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Add student rows
    Object.entries(dataToRender).forEach(([studentId, student]) => {
        let total = 0;
        const scoresCells = ALL_SCORE_TYPE_IDS.map(typeId => {
            const score = student.scores?.[typeId];
            if (score !== undefined) {
                total += score;
                return `<td>${score}</td>`;
            }
            return '<td>-</td>';
        }).join('');

        const lastUpdated = student.lastUpdated ? new Date(student.lastUpdated).toLocaleString('ar-SA') : 'غير معروف';

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
    // Prepare data for Excel
    const excelData = [];

    // Header row with Arabic labels
    const headers = ['اسم الطالب', ...ALL_SCORE_TYPE_IDS.map(id => SCORE_TYPES[id].label), 'المجموع', 'آخر تحديث', 'المشرف'];
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

        // Add score columns for ALL score types using IDs
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            const score = student.scores?.[typeId];
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
    if (confirm('هل أنت متأكد من حذف جميع بيانات الطلاب؟ لا يمكن التراجع عن هذا الإجراء.')) {
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
        showNotification('تم مسح جميع البيانات بنجاح', 'info');
    }
}

// Filtering functions
function applyFilters() {
    const nameFilter = document.getElementById('filterName').value.trim().toLowerCase();
    const adminFilter = document.getElementById('filterAdmin').value.trim().toLowerCase();
    const dateFilter = document.getElementById('filterDate').value;

    let filteredData = { ...studentsData };

    // Filter by student name
    if (nameFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) =>
                student.name.toLowerCase().includes(nameFilter)
            )
        );
    }

    // Filter by admin name
    if (adminFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) =>
                student.lastUpdatedBy && student.lastUpdatedBy.toLowerCase().includes(adminFilter)
            )
        );
    }

    // Filter by date
    if (dateFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) => {
                if (!student.lastUpdated) return false;
                const studentDate = new Date(student.lastUpdated).toISOString().split('T')[0];
                return studentDate === dateFilter;
            })
        );
    }

    renderScoresTable(filteredData);
}

function clearFilters() {
    document.getElementById('filterName').value = '';
    document.getElementById('filterAdmin').value = '';
    document.getElementById('filterDate').value = '';
    renderScoresTable();
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