// Global variables
let html5QrcodeScanner;
let currentAdmin = '';
let currentAdminData = null;
let studentsData = {};
let adminsData = {};
let isFirebaseConnected = false;
let firebaseListeners = [];

// Head admin phone number
const HEAD_ADMIN_PHONE = '01207714622';

// Define all possible score types with IDs and labels
let SCORE_TYPES = {
    'mass': { id: 'mass', label: 'القداس والتناول', allowMultiplePerDay: false },
    'tunic': { id: 'tunic', label: 'لبس التونيه', allowMultiplePerDay: false },
    'meeting': { id: 'meeting', label: 'حضور الاجتماع', allowMultiplePerDay: false },
    'behavior': { id: 'behavior', label: 'سلوك', allowMultiplePerDay: true },
    'bible': { id: 'bible', label: 'احضار الكتاب المقدس', allowMultiplePerDay: false }
};

let ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);

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
        updateSyncStatus('connected', 'متصل');

        // Initialize admins data first
        await initializeAdminsData();

        // Check login status
        checkLoginStatus();
    } else {
        isFirebaseConnected = false;
        updateSyncStatus('offline', 'غير متصل…');
        loadStoredData();
        checkLoginStatus();
    }
}

// Initialize admins data from Firebase
async function initializeAdminsData() {
    if (!window.firebase) {
        console.log('Firebase not available, cannot initialize admins');
        return;
    }

    console.log('Initializing admins data from Firebase...');
    const adminsRef = window.firebase.ref(window.firebase.database, 'admins');

    // Check if admins collection exists
    const snapshot = await new Promise((resolve) => {
        window.firebase.onValue(adminsRef, resolve, { onlyOnce: true });
    });

    if (!snapshot.exists()) {
        // Initialize with default admins
        console.log('No admins found in Firebase, creating default admins...');
        const defaultAdmins = {
            '01207714622': {
                name: 'Michael',
                phone: '01207714622',
                password: '123456789mI#',
                isHeadAdmin: true,
                createdAt: new Date().toISOString()
            },
            '01283469752': {
                name: 'Mina Zaher',
                phone: '01283469752',
                password: '01283469752',
                isHeadAdmin: false,
                createdAt: new Date().toISOString()
            },
            '01207320088': {
                name: 'Kero Boles',
                phone: '01207320088',
                password: '01207320088',
                isHeadAdmin: false,
                createdAt: new Date().toISOString()
            },
            '01282201313': {
                name: 'Remon Aziz',
                phone: '01282201313',
                password: '01282201313',
                isHeadAdmin: false,
                createdAt: new Date().toISOString()
            }
        };

        await window.firebase.set(adminsRef, defaultAdmins);
        adminsData = defaultAdmins;
        console.log('Default admins initialized:', Object.keys(adminsData));
    } else {
        adminsData = snapshot.val() || {};
        console.log('Admins loaded from Firebase:', Object.keys(adminsData));
    }

    // Listen for real-time updates to admins
    const unsubscribe = window.firebase.onValue(adminsRef, (snapshot) => {
        adminsData = snapshot.val() || {};
        console.log('Admins updated from Firebase:', Object.keys(adminsData));
    });

    firebaseListeners.push(unsubscribe);
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');

    // Clear form
    if (document.getElementById('adminPhone')) {
        document.getElementById('adminPhone').value = '';
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
            updateSyncStatus('synced', 'تم التحديث');

            // Update dashboard if it's currently visible
            if (!document.getElementById('dashboardSection').classList.contains('hidden')) {
                renderScoresTable();
            }
        } else {
            studentsData = {};
        }
    }, (error) => {
        console.error('Firebase sync error:', error);
        updateSyncStatus('error', 'خطأ في المزامنة');
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

    updateSyncStatus('syncing', 'تحديث…');

    const studentRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
    return window.firebase.set(studentRef, {
        ...studentData,
        lastUpdated: window.firebase.serverTimestamp(),
        lastUpdatedBy: currentAdmin
    }).then(() => {
        updateSyncStatus('synced', 'تم التحديث');
    }).catch((error) => {
        console.error('Firebase save error:', error);
        updateSyncStatus('error', 'خطأ في المزامنة');
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
    const phone = document.getElementById('adminPhone').value.trim();
    const password = document.getElementById('adminPassword').value;
    const keepLoggedIn = document.getElementById('keepLoggedIn').checked;
    const loginError = document.getElementById('loginError');

    // Clear previous error
    loginError.classList.add('hidden');
    loginError.textContent = '';

    console.log('Login attempt - Phone:', phone, 'Admins loaded:', Object.keys(adminsData).length);

    // Validation
    if (!phone) {
        loginError.textContent = 'الرجاء إدخال رقم الهاتف';
        loginError.classList.remove('hidden');
        return;
    }

    if (phone.length !== 11) {
        loginError.textContent = 'رقم الهاتف يجب أن يكون 11 رقماً';
        loginError.classList.remove('hidden');
        return;
    }

    if (!password) {
        loginError.textContent = 'الرجاء إدخال كلمة المرور';
        loginError.classList.remove('hidden');
        return;
    }

    // Check if admins data is loaded
    if (Object.keys(adminsData).length === 0) {
        console.log('Admins data not loaded yet, attempting to reload...');
        loginError.textContent = 'جاري تحميل البيانات... يرجى الانتظار ثانية والمحاولة مرة أخرى';
        loginError.classList.remove('hidden');

        // Try to reload admins data
        if (window.firebase && window.firebase.database) {
            await initializeAdminsData();
        }
        return;
    }

    // Check if admin exists
    const admin = adminsData[phone];

    if (!admin) {
        console.log('Admin not found for phone:', phone, 'Available phones:', Object.keys(adminsData));
        loginError.textContent = 'رقم الهاتف غير مسجل';
        loginError.classList.remove('hidden');
        return;
    }

    // Verify password
    if (admin.password !== password) {
        console.log('Password mismatch for phone:', phone);
        loginError.textContent = 'كلمة المرور غير صحيحة';
        loginError.classList.remove('hidden');
        return;
    }

    // Login successful
    currentAdmin = admin.name;
    currentAdminData = admin;

    // Save login state if "keep me logged in" is checked
    if (keepLoggedIn) {
        localStorage.setItem('currentAdminPhone', phone);
        localStorage.setItem('currentAdminPassword', password);
    }

    // Show main app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    // Update UI
    document.getElementById('adminNameDisplay').textContent = `${currentAdmin}`;

    // Show "Manage Admins" and "Manage Score Types" tabs for head admin
    if (admin.isHeadAdmin) {
        document.getElementById('manageAdminsNavBtn').classList.remove('hidden');
        document.getElementById('manageScoreTypesNavBtn').classList.remove('hidden');
    }

    // Initialize score types from Firebase
    await initializeScoreTypes();

    // Initialize Firebase sync
    initializeFirebaseSync();

    // Show scanner section by default
    showScanner();

    showNotification(`أهلاً ${currentAdmin}!`, 'success');
}

async function logout() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    // Clean up Firebase listeners
    firebaseListeners.forEach(unsubscribe => unsubscribe());
    firebaseListeners = [];

    // Clear stored credentials
    localStorage.removeItem('currentAdminPhone');
    localStorage.removeItem('currentAdminPassword');
    currentAdmin = '';
    currentAdminData = null;

    // Show login screen
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');

    // Clear login form
    document.getElementById('adminPhone').value = '';
    document.getElementById('adminPassword').value = '';

    showNotification('تم تسجيل الخروج بنجاح', 'info');
}

async function checkLoginStatus() {
    const storedPhone = localStorage.getItem('currentAdminPhone');
    const storedPassword = localStorage.getItem('currentAdminPassword');

    if (storedPhone && storedPassword && adminsData[storedPhone]) {
        const admin = adminsData[storedPhone];

        // Verify stored password still matches
        if (admin.password === storedPassword) {
            // Auto-login
            currentAdmin = admin.name;
            currentAdminData = admin;

            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            document.getElementById('adminNameDisplay').textContent = `${currentAdmin}`;

            // Show "Manage Admins" and "Manage Score Types" tabs for head admin
            if (admin.isHeadAdmin) {
                document.getElementById('manageAdminsNavBtn').classList.remove('hidden');
                document.getElementById('manageScoreTypesNavBtn').classList.remove('hidden');
            }

            await initializeScoreTypes();
            initializeFirebaseSync();

            // Show scanner section by default
            showScanner();
        } else {
            // Password changed, logout
            localStorage.removeItem('currentAdminPhone');
            localStorage.removeItem('currentAdminPassword');
        }
    }
}

// QR Scanner functions
function initializeQRScanner() {
    console.log('initializeQRScanner called');

    // Clear any existing scanner
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.clear().catch(err => console.log('Scanner clear error:', err));
        } catch (error) {
            console.log('Scanner already cleared:', error);
        }
        html5QrcodeScanner = null;
    }

    // Check if container exists
    const container = document.getElementById('qr-reader');
    if (!container) {
        console.error('QR reader container not found!');
        return;
    }

    // Clear container first
    container.innerHTML = '';

    // Longer delay to ensure DOM is fully ready and previous scanner is cleared
    setTimeout(() => {
        try {
            html5QrcodeScanner = new Html5QrcodeScanner(
                "qr-reader",
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                    rememberLastUsedCamera: true,
                    showTorchButtonIfSupported: true
                },
                false
            );

            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            console.log('QR Scanner initialized and rendered successfully');
        } catch (error) {
            console.error('Error initializing scanner:', error);
        }
    }, 200);
}

function onScanSuccess(decodedText, decodedResult) {
    console.log(`QR Code detected: ${decodedText}`);

    // Stop scanning temporarily (don't clear DOM)
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }

    // The QR code now contains the student name directly
    const studentName = decodedText.trim();

    // Show scoring form with the scanned name
    document.getElementById('studentName').value = studentName;
    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '1'; // Default 1 point
    document.getElementById('scoringForm').classList.remove('hidden');

    showNotification(`اسم المخدوم: ${studentName}`, 'success');
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
        showNotification('يرجى إدخال اسم المخدوم', 'error');
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
            showNotification(`⚠️ تم تسجيل "${scoreTypeConfig.label}" لهذا المخدوم اليوم بالفعل. لا يمكن التسجيل أكثر من مرة في اليوم الواحد.`, 'error');
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
// Helper function to format date as two lines (Day, Date / Time in 12h format)
function formatDateTwoLines(dateString) {
    if (!dateString) return 'غير معروف';

    const date = new Date(dateString);

    // Arabic day names
    const arabicDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = arabicDays[date.getDay()];

    // Format date as YYYY/MM/DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}/${month}/${day}`;

    // Format time in 12h format
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const timeStr = `${hours}:${minutes} ${ampm}`;

    return `${dayName}، ${dateStr}<br>${timeStr}`;
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
                    <th>اسم المخدوم</th>
                    ${ALL_SCORE_TYPE_IDS.map(typeId => `<th>${SCORE_TYPES[typeId].label}</th>`).join('')}
                    <th class="total-column">المجموع</th>
                    <th>التاريخ والوقت</th>
                    <th>الخادم</th>
                    <th>الإجراءات</th>
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

        const lastUpdated = formatDateTwoLines(student.lastUpdated);

        tableHTML += `
            <tr>
                <td><strong>${student.name}</strong></td>
                ${scoresCells}
                <td class="total-column"><strong>${total}</strong></td>
                <td>${lastUpdated}</td>
                <td>${student.lastUpdatedBy || 'غير معروف'}</td>
                <td><button onclick="editStudentRow('${studentId}')" class="edit-row-btn">✏️</button></td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

// Edit student row function
async function editStudentRow(studentId) {
    const student = studentsData[studentId];
    if (!student) {
        showNotification('المخدوم غير موجود', 'error');
        return;
    }

    // Create edit dialog content
    let dialogHTML = `
        <div style="max-width: 600px;">
            <h3 style="margin-bottom: 20px;">✏️ تعديل نقاط ${student.name}</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">اسم المخدوم:</label>
                <input type="text" id="editStudentName" value="${student.name}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
    `;

    // Add input fields for each score type
    ALL_SCORE_TYPE_IDS.forEach(typeId => {
        const currentScore = student.scores?.[typeId] || 0;
        dialogHTML += `
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">${SCORE_TYPES[typeId].label}:</label>
                <input type="number" id="editScore_${typeId}" value="${currentScore}" min="0" max="1000" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
        `;
    });

    dialogHTML += `
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                <button onclick="saveStudentEdit('${studentId}')" style="padding: 10px 20px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); border: none; border-radius: 5px; font-weight: 600; cursor: pointer;">💾 حفظ</button>
                <button onclick="deleteStudent('${studentId}')" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; font-weight: 600; cursor: pointer;">🗑️ حذف</button>
                <button onclick="closeEditDialog()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; font-weight: 600; cursor: pointer;">إلغاء</button>
            </div>
        </div>
    `;

    // Show edit dialog
    showEditDialog(dialogHTML);
}

function showEditDialog(content) {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.id = 'editDialogOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        max-height: 80vh;
        overflow-y: auto;
    `;
    dialog.innerHTML = content;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

function closeEditDialog() {
    const overlay = document.getElementById('editDialogOverlay');
    if (overlay) {
        overlay.remove();
    }
}

async function saveStudentEdit(studentId) {
    const newName = document.getElementById('editStudentName').value.trim();

    if (!newName) {
        showNotification('الرجاء إدخال اسم المخدوم', 'error');
        return;
    }

    // Collect all scores
    const newScores = {};
    ALL_SCORE_TYPE_IDS.forEach(typeId => {
        const input = document.getElementById(`editScore_${typeId}`);
        if (input) {
            const value = parseFloat(input.value) || 0;
            if (value > 0) {
                newScores[typeId] = value;
            }
        }
    });

    // If student name changed, we need to delete old entry and create new one
    if (newName !== studentId) {
        // Delete old entry
        delete studentsData[studentId];

        // Create new entry with new name
        studentsData[newName] = {
            name: newName,
            scores: newScores,
            scans: studentsData[studentId]?.scans || {},
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };

        // Update Firebase
        if (window.firebase && window.firebase.database) {
            // Delete old entry
            const oldRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
            await window.firebase.set(oldRef, null);

            // Save new entry
            await saveToFirebase(newName, studentsData[newName]);
        }
    } else {
        // Just update scores
        studentsData[studentId].scores = newScores;
        studentsData[studentId].lastUpdated = new Date().toISOString();
        studentsData[studentId].lastUpdatedBy = currentAdmin;

        // Save to Firebase
        await saveToFirebase(studentId, studentsData[studentId]);
    }

    closeEditDialog();
    renderScoresTable();
    showNotification('تم تحديث البيانات بنجاح', 'success');
}

async function deleteStudent(studentId) {
    const student = studentsData[studentId];
    if (!student) return;

    if (!confirm(`هل أنت متأكد من حذف المخدوم "${student.name}"؟\n\nسيتم حذف جميع نقاطه نهائياً!`)) {
        return;
    }

    // Delete from data
    delete studentsData[studentId];

    // Delete from Firebase
    if (window.firebase && window.firebase.database) {
        const studentRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
        await window.firebase.set(studentRef, null);
    }

    closeEditDialog();
    renderScoresTable();
    showNotification('تم حذف المخدوم', 'info');
}

// Excel export function
function exportToExcel() {
    // Prepare data for Excel
    const excelData = [];

    // Header row with Arabic labels
    const headers = ['اسم المخدوم', ...ALL_SCORE_TYPE_IDS.map(id => SCORE_TYPES[id].label), 'المجموع', 'آخر تحديث', 'الخادم'];
    excelData.push(headers);

    // If no data, still create Excel with headers
    if (Object.keys(studentsData).length === 0) {
        // Create workbook with headers only
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "نقاط المخدومين");

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
    XLSX.utils.book_append_sheet(wb, ws, "نقاط المخدومين");

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
    if (confirm('هل أنت متأكد من حذف جميع بيانات المخدومين؟ لا يمكن التراجع عن هذا الإجراء.')) {
        studentsData = {};

        if (isFirebaseConnected && window.firebase) {
            updateSyncStatus('syncing', 'جاري المسح…');
            try {
                const studentsRef = window.firebase.ref(window.firebase.database, 'students');
                await window.firebase.set(studentsRef, null);
                updateSyncStatus('synced', 'تم التحديث');
            } catch (error) {
                console.error('Firebase clear error:', error);
                updateSyncStatus('error', 'خطأ في المسح');
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
    const scoreTypeFilter = document.getElementById('filterScoreType').value;

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

    // Filter by score type - show only students who have this score type
    if (scoreTypeFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) =>
                student.scores && student.scores[scoreTypeFilter] !== undefined
            )
        );
    }

    renderScoresTable(filteredData);
}

function clearFilters() {
    document.getElementById('filterName').value = '';
    document.getElementById('filterAdmin').value = '';
    document.getElementById('filterDate').value = '';
    document.getElementById('filterScoreType').value = '';
    renderScoresTable();
}

// Leaderboard functionality
let isLeaderboardMode = false;

function toggleLeaderboard() {
    isLeaderboardMode = !isLeaderboardMode;
    const btn = document.getElementById('leaderboardBtn');

    if (isLeaderboardMode) {
        btn.textContent = '📊 عرض عادي';
        btn.classList.add('active');
        renderLeaderboard();
    } else {
        btn.textContent = '🏆 عرض الترتيب';
        btn.classList.remove('active');
        renderScoresTable();
    }
}

function renderLeaderboard() {
    const tableContainer = document.getElementById('scoresTable');

    if (Object.keys(studentsData).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
        return;
    }

    // Calculate totals and create array
    const studentsArray = Object.entries(studentsData).map(([studentId, student]) => {
        let total = 0;
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            if (student.scores?.[typeId]) {
                total += student.scores[typeId];
            }
        });
        return { ...student, total };
    });

    // Sort by total points (highest to lowest)
    studentsArray.sort((a, b) => b.total - a.total);

    // Create table HTML
    let tableHTML = `
        <div class="leaderboard-header">
            <h3>🏆 ترتيب المخدومين حسب النقاط</h3>
        </div>
        <table>
            <thead>
                <tr>
                    <th>الترتيب</th>
                    <th>اسم المخدوم</th>
                    ${ALL_SCORE_TYPE_IDS.map(typeId => `<th>${SCORE_TYPES[typeId].label}</th>`).join('')}
                    <th class="total-column">المجموع</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Add student rows with ranking
    studentsArray.forEach((student, index) => {
        const rank = index + 1;
        let rankBadge = '';

        if (rank === 1) {
            rankBadge = '🥇';
        } else if (rank === 2) {
            rankBadge = '🥈';
        } else if (rank === 3) {
            rankBadge = '🥉';
        } else {
            rankBadge = rank;
        }

        const scoresCells = ALL_SCORE_TYPE_IDS.map(typeId => {
            const score = student.scores?.[typeId];
            return score !== undefined ? `<td>${score}</td>` : '<td>-</td>';
        }).join('');

        tableHTML += `
            <tr class="rank-${rank}">
                <td><strong>${rankBadge}</strong></td>
                <td><strong>${student.name}</strong></td>
                ${scoresCells}
                <td class="total-column"><strong>${student.total}</strong></td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

// Navigation functions
function setActiveNav(navId) {
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Add active class to clicked nav
    if (document.getElementById(navId)) {
        document.getElementById(navId).classList.add('active');
    }
}

function showProfile() {
    // Hide all sections
    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('profileSection').classList.remove('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('profileNavBtn');

    // Pause scanner (don't clear DOM)
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }

    // Load profile data
    loadProfileData();
}

function loadProfileData() {
    if (!currentAdminData) return;

    const firstLetter = currentAdminData.name.charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent = firstLetter;
    document.getElementById('profileName').textContent = currentAdminData.name;
    document.getElementById('profilePhone').textContent = currentAdminData.phone;
    document.getElementById('profileRole').textContent = currentAdminData.isHeadAdmin ? 'امين الخدمه' : 'خادم';

    document.getElementById('editProfileName').value = currentAdminData.name;
    document.getElementById('editProfilePhone').value = currentAdminData.phone;
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
}

async function updateProfile() {
    const newName = document.getElementById('editProfileName').value.trim();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    if (!newName) {
        showNotification('الرجاء إدخال الاسم', 'error');
        return;
    }

    if (!currentPassword) {
        showNotification('الرجاء إدخال كلمة المرور الحالية', 'error');
        return;
    }

    // Verify current password
    if (currentPassword !== currentAdminData.password) {
        showNotification('كلمة المرور الحالية غير صحيحة', 'error');
        return;
    }

    // Update admin data
    const updatedData = {
        ...currentAdminData,
        name: newName
    };

    if (newPassword) {
        updatedData.password = newPassword;
    }

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        const adminRef = window.firebase.ref(window.firebase.database, `admins/${currentAdminData.phone}`);
        await window.firebase.set(adminRef, updatedData);
    }

    currentAdminData = updatedData;
    currentAdmin = newName;

    // Update stored password if changed
    if (newPassword && localStorage.getItem('currentAdminPhone')) {
        localStorage.setItem('currentAdminPassword', newPassword);
    }

    // Update UI
    document.getElementById('adminNameDisplay').textContent = `${currentAdmin}`;
    loadProfileData();

    showNotification('تم تحديث الملف الشخصي بنجاح', 'success');
}

function showManageAdmins() {
    if (!currentAdminData || !currentAdminData.isHeadAdmin) {
        showNotification('غير مصرح لك بالوصول إلى هذه الصفحة', 'error');
        return;
    }

    // Hide all sections
    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.remove('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('manageAdminsNavBtn');

    // Pause scanner (don't clear DOM)
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }

    // Load admins list
    renderAdminsList();
}

function renderAdminsList() {
    const container = document.getElementById('adminsList');

    console.log('renderAdminsList called, adminsData:', adminsData);
    console.log('adminsData keys:', Object.keys(adminsData));

    if (!Object.keys(adminsData).length) {
        container.innerHTML = '<p style="text-align: center; color: #666;">لا يوجد خدام</p>';
        console.log('No admins data found - showing empty message');
        return;
    }

    let html = '';
    Object.entries(adminsData).forEach(([phone, admin]) => {
        console.log('Processing admin:', phone, admin);
        const isHeadAdmin = admin.isHeadAdmin;
        const roleClass = isHeadAdmin ? 'head-admin-badge' : 'admin-badge';
        const roleText = isHeadAdmin ? 'امين الخدمه' : 'خادم';

        html += `
            <div class="admin-card">
                <div class="admin-card-header">
                    <div class="admin-avatar">${admin.name.charAt(0).toUpperCase()}</div>
                    <div class="admin-card-info">
                        <h4>${admin.name}</h4>
                        <p class="admin-phone">${admin.phone}</p>
                        <span class="${roleClass}">${roleText}</span>
                    </div>
                </div>
                <div class="admin-card-actions">
                    ${!isHeadAdmin ? `
                        <button onclick="editAdmin('${phone}')" class="edit-btn">✏️ تعديل</button>
                        <button onclick="deleteAdmin('${phone}')" class="delete-btn">🗑️ حذف</button>
                    ` : '<span class="protected-badge">محمي</span>'}
                </div>
            </div>
        `;
    });

    console.log('Generated HTML length:', html.length);
    container.innerHTML = html;
}

function showAddAdminForm() {
    document.getElementById('addAdminForm').classList.remove('hidden');
    document.getElementById('newAdminName').value = '';
    document.getElementById('newAdminPhone').value = '';
    document.getElementById('newAdminPassword').value = '';
}

function hideAddAdminForm() {
    document.getElementById('addAdminForm').classList.add('hidden');
}

async function addAdmin() {
    const name = document.getElementById('newAdminName').value.trim();
    const phone = document.getElementById('newAdminPhone').value.trim();
    const password = document.getElementById('newAdminPassword').value;

    if (!name) {
        showNotification('الرجاء إدخال الاسم', 'error');
        return;
    }

    if (!phone || phone.length !== 11) {
        showNotification('الرجاء إدخال رقم هاتف صحيح (11 رقم)', 'error');
        return;
    }

    if (!password) {
        showNotification('الرجاء إدخال كلمة المرور', 'error');
        return;
    }

    // Check if phone already exists
    if (adminsData[phone]) {
        showNotification('رقم الهاتف مسجل مسبقاً', 'error');
        return;
    }

    const newAdmin = {
        name,
        phone,
        password,
        isHeadAdmin: false,
        createdAt: new Date().toISOString()
    };

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        const adminRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
        await window.firebase.set(adminRef, newAdmin);
    }

    adminsData[phone] = newAdmin;

    hideAddAdminForm();
    renderAdminsList();
    showNotification('تم إضافة الخادم بنجاح', 'success');
}

function editAdmin(phone) {
    const admin = adminsData[phone];
    if (!admin) return;

    const newName = prompt('اسم الخادم الجديد:', admin.name);
    if (!newName) return;

    const newPassword = prompt('كلمة المرور الجديدة (اتركها فارغة للإبقاء على القديمة):');

    const updatedAdmin = {
        ...admin,
        name: newName.trim()
    };

    if (newPassword && newPassword.trim()) {
        updatedAdmin.password = newPassword.trim();
    }

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        const adminRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
        window.firebase.set(adminRef, updatedAdmin);
    }

    adminsData[phone] = updatedAdmin;
    renderAdminsList();
    showNotification('تم تحديث بيانات الخادم', 'success');
}

async function deleteAdmin(phone) {
    const admin = adminsData[phone];
    if (!admin) return;

    if (!confirm(`هل أنت متأكد من حذف الخادم "${admin.name}"؟`)) {
        return;
    }

    // Delete from Firebase
    if (window.firebase && window.firebase.database) {
        const adminRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
        await window.firebase.set(adminRef, null);
    }

    delete adminsData[phone];
    renderAdminsList();
    showNotification('تم حذف الخادم', 'info');
}

// Score Types Management Functions
async function initializeScoreTypes() {
    if (!window.firebase) {
        console.log('Firebase not available, using default score types');
        return;
    }

    const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
    const snapshot = await new Promise((resolve) => {
        window.firebase.onValue(scoreTypesRef, resolve, { onlyOnce: true });
    });

    if (snapshot.exists()) {
        SCORE_TYPES = snapshot.val();
        ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);
        console.log('Score types loaded from Firebase:', ALL_SCORE_TYPE_IDS);
        updateScoreTypeSelects();
    } else {
        // Save default score types to Firebase
        await window.firebase.set(scoreTypesRef, SCORE_TYPES);
        console.log('Default score types saved to Firebase');
    }

    // Listen for real-time updates
    const unsubscribe = window.firebase.onValue(scoreTypesRef, (snapshot) => {
        if (snapshot.exists()) {
            SCORE_TYPES = snapshot.val();
            ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);
            updateScoreTypeSelects();
            console.log('Score types updated from Firebase');
        }
    });

    firebaseListeners.push(unsubscribe);
}

function updateScoreTypeSelects() {
    // Update scoring form select
    const scoreTypeSelect = document.getElementById('scoreType');
    if (scoreTypeSelect) {
        const currentValue = scoreTypeSelect.value;
        scoreTypeSelect.innerHTML = '<option value="">اختر نوع النشاط</option>';
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            const option = document.createElement('option');
            option.value = typeId;
            option.textContent = SCORE_TYPES[typeId].label;
            scoreTypeSelect.appendChild(option);
        });
        scoreTypeSelect.value = currentValue;
    }

    // Update filter select
    const filterScoreType = document.getElementById('filterScoreType');
    if (filterScoreType) {
        const currentFilterValue = filterScoreType.value;
        filterScoreType.innerHTML = '<option value="">الكل</option>';
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            const option = document.createElement('option');
            option.value = typeId;
            option.textContent = SCORE_TYPES[typeId].label;
            filterScoreType.appendChild(option);
        });
        filterScoreType.value = currentFilterValue;
    }
}

function showManageScoreTypes() {
    if (!currentAdminData || !currentAdminData.isHeadAdmin) {
        showNotification('غير مصرح لك بالوصول إلى هذه الصفحة', 'error');
        return;
    }

    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.remove('hidden');

    setActiveNav('manageScoreTypesNavBtn');

    // Pause scanner (don't clear DOM)
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }

    renderScoreTypesList();
}

function renderScoreTypesList() {
    const container = document.getElementById('scoreTypesList');

    if (!Object.keys(SCORE_TYPES).length) {
        container.innerHTML = '<p style="text-align: center; color: #666;">لا توجد أنواع نقاط</p>';
        return;
    }

    let html = '<div class="score-types-grid">';
    Object.entries(SCORE_TYPES).forEach(([typeId, scoreType]) => {
        const multipleText = scoreType.allowMultiplePerDay ? 'نعم' : 'لا';
        const multipleClass = scoreType.allowMultiplePerDay ? 'badge-yes' : 'badge-no';

        html += `
            <div class="score-type-card">
                <div class="score-type-header">
                    <h4>${scoreType.label}</h4>
                    <code class="score-type-id">${typeId}</code>
                </div>
                <div class="score-type-info">
                    <p><strong>تسجيل متعدد:</strong> <span class="badge ${multipleClass}">${multipleText}</span></p>
                </div>
                <div class="score-type-actions">
                    <button onclick="editScoreType('${typeId}')" class="edit-btn">✏️ تعديل</button>
                    <button onclick="deleteScoreType('${typeId}')" class="delete-btn">🗑️ حذف</button>
                </div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

function showAddScoreTypeForm() {
    document.getElementById('addScoreTypeForm').classList.remove('hidden');
    document.getElementById('newScoreTypeId').value = '';
    document.getElementById('newScoreTypeLabel').value = '';
    document.getElementById('newScoreTypeMultiple').value = 'false';
}

function hideAddScoreTypeForm() {
    document.getElementById('addScoreTypeForm').classList.add('hidden');
}

async function addScoreType() {
    const id = document.getElementById('newScoreTypeId').value.trim().toLowerCase();
    const label = document.getElementById('newScoreTypeLabel').value.trim();
    const allowMultiple = document.getElementById('newScoreTypeMultiple').value === 'true';

    if (!id) {
        showNotification('الرجاء إدخال المعرف (ID)', 'error');
        return;
    }

    if (!/^[a-z_]+$/.test(id)) {
        showNotification('المعرف يجب أن يحتوي على حروف إنجليزية صغيرة و _ فقط', 'error');
        return;
    }

    if (!label) {
        showNotification('الرجاء إدخال الاسم العربي', 'error');
        return;
    }

    if (SCORE_TYPES[id]) {
        showNotification('هذا المعرف موجود بالفعل', 'error');
        return;
    }

    const newScoreType = {
        id,
        label,
        allowMultiplePerDay: allowMultiple
    };

    SCORE_TYPES[id] = newScoreType;
    ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);

    if (window.firebase && window.firebase.database) {
        const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
        await window.firebase.set(scoreTypesRef, SCORE_TYPES);
    }

    updateScoreTypeSelects();
    hideAddScoreTypeForm();
    renderScoreTypesList();
    showNotification('تم إضافة نوع النقاط بنجاح', 'success');
}

function editScoreType(typeId) {
    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) return;

    const newLabel = prompt('الاسم العربي الجديد:', scoreType.label);
    if (!newLabel || !newLabel.trim()) return;

    const allowMultiple = confirm('السماح بالتسجيل أكثر من مرة في اليوم؟');

    SCORE_TYPES[typeId] = {
        ...scoreType,
        label: newLabel.trim(),
        allowMultiplePerDay: allowMultiple
    };

    if (window.firebase && window.firebase.database) {
        const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
        window.firebase.set(scoreTypesRef, SCORE_TYPES);
    }

    updateScoreTypeSelects();
    renderScoreTypesList();
    showNotification('تم تحديث نوع النقاط', 'success');
}

async function deleteScoreType(typeId) {
    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) return;

    if (!confirm(`هل أنت متأكد من حذف نوع النقاط "${scoreType.label}"؟\n\nسيتم حذف جميع النقاط المرتبطة بهذا النوع من جميع المخدومين!`)) {
        return;
    }

    // Remove from SCORE_TYPES
    delete SCORE_TYPES[typeId];
    ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);

    // Remove from all students
    Object.keys(studentsData).forEach(studentId => {
        if (studentsData[studentId].scores && studentsData[studentId].scores[typeId]) {
            delete studentsData[studentId].scores[typeId];
        }
        if (studentsData[studentId].scans && studentsData[studentId].scans[typeId]) {
            delete studentsData[studentId].scans[typeId];
        }
    });

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
        await window.firebase.set(scoreTypesRef, SCORE_TYPES);

        // Update all students in Firebase
        const studentsRef = window.firebase.ref(window.firebase.database, 'students');
        await window.firebase.set(studentsRef, studentsData);
    }

    updateScoreTypeSelects();
    renderScoreTypesList();
    showNotification('تم حذف نوع النقاط', 'info');
}

// Update existing showScanner function
function showScanner() {
    console.log('showScanner called');

    document.getElementById('scannerSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('scannerNavBtn');

    // Check if scanner container exists and has content
    const scannerContainer = document.getElementById('qr-reader');
    if (!scannerContainer) {
        console.error('Scanner container not found!');
        return;
    }

    const hasContent = scannerContainer.children.length > 0;
    console.log('Scanner container has content:', hasContent);
    console.log('html5QrcodeScanner exists:', !!html5QrcodeScanner);

    // Always reinitialize if no content or no scanner instance
    if (!html5QrcodeScanner || !hasContent) {
        console.log('Initializing scanner - no scanner or empty container');
        initializeQRScanner();
    } else {
        // Try to resume, reinitialize if it fails
        try {
            html5QrcodeScanner.resume();
            console.log('Scanner resumed successfully');
        } catch (error) {
            console.log('Error resuming scanner, reinitializing:', error);
            initializeQRScanner();
        }
    }
}

// Update existing showDashboard function
function showDashboard() {
    // Hide scoring form if it's visible
    document.getElementById('scoringForm').classList.add('hidden');

    // Pause scanner (don't clear DOM)
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }

    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('dashboardNavBtn');

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
        // Page is hidden, pause scanner (don't clear DOM)
        if (html5QrcodeScanner) {
            try {
                html5QrcodeScanner.pause(false);
            } catch (error) {
                console.log('Error pausing scanner on visibility change:', error);
            }
        }
    } else {
        // Page is visible, resume scanner if on scanner section
        if (html5QrcodeScanner && !document.getElementById('scannerSection').classList.contains('hidden')) {
            try {
                html5QrcodeScanner.resume();
            } catch (error) {
                console.log('Error resuming scanner on visibility change:', error);
            }
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