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

// Define all possible score types with IDs, labels, and emojis
let SCORE_TYPES = {
    'mass': { id: 'mass', label: '⛪ القداس والتناول', allowMultiplePerDay: false },
    'tunic': { id: 'tunic', label: '👔 لبس التونيه', allowMultiplePerDay: false },
    'meeting': { id: 'meeting', label: '📖 حضور الاجتماع', allowMultiplePerDay: false },
    'behavior': { id: 'behavior', label: '⭐ سلوك', allowMultiplePerDay: true },
    'bible': { id: 'bible', label: '📕 احضار الكتاب المقدس', allowMultiplePerDay: false }
};

let ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);

// Helper function to sanitize Firebase keys
// Firebase paths cannot contain: . # $ [ ] /
function sanitizeFirebaseKey(key) {
    if (!key) return 'unknown';

    // Replace invalid characters with underscores
    // Keep the original name readable but Firebase-safe
    return key
        .replace(/\./g, '_')   // Replace dots
        .replace(/#/g, '_')    // Replace hash
        .replace(/\$/g, '_')   // Replace dollar
        .replace(/\[/g, '_')   // Replace open bracket
        .replace(/\]/g, '_')   // Replace close bracket
        .replace(/\//g, '_')   // Replace forward slash
        .replace(/:/g, '_')    // Replace colon (for URLs)
        .trim();
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Wait for Firebase to be ready
    await window.firebaseReady;

    // Check if Firebase is available
    if (window.firebase && window.firebase.database) {
        console.log('🔗 Firebase is available, checking authentication...');

        // Wait for authentication to complete before loading data
        if (window.firebase.auth && window.firebase.onAuthStateChanged) {
            await new Promise((resolve) => {
                const unsubscribe = window.firebase.onAuthStateChanged(window.firebase.auth, (user) => {
                    console.log('🔐 Auth state changed:', user ? 'authenticated' : 'not authenticated');
                    if (user) {
                        console.log('✅ User authenticated with UID:', user.uid);
                        isFirebaseConnected = true;
                        updateSyncStatus('connected', 'متصل');
                    } else {
                        console.log('❌ No authenticated user - Firebase writes will fail!');
                        isFirebaseConnected = false;
                        updateSyncStatus('error', 'خطأ مصادقة');
                    }
                    unsubscribe();
                    resolve();
                });
            });
        }

        if (isFirebaseConnected) {
            // Initialize admins data after authentication is ready
            await initializeAdminsData();
        } else {
            console.warn('⚠️ Firebase authentication failed, using offline mode');
            loadStoredData();
        }

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

    console.log('📋 Initializing admins data from Firebase...');
    const adminsRef = window.firebase.ref(window.firebase.database, 'admins');

    try {
        // Check if admins collection exists using get()
        const snapshot = await window.firebase.get(adminsRef);

        if (!snapshot.exists()) {
            // Initialize with default admins
            console.log('➕ No admins found in Firebase, creating default admins...');
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

            try {
                await window.firebase.set(adminsRef, defaultAdmins);
                adminsData = defaultAdmins;
                console.log('✅ Default admins created in Firebase:', Object.keys(adminsData));
            } catch (writeError) {
                console.error('❌ Failed to write default admins to Firebase:', writeError);
                console.log('⚠️ Using local default admins (Firebase write failed - check authentication and database rules)');
                adminsData = defaultAdmins;
            }
        } else {
            adminsData = snapshot.val() || {};
            console.log('✅ Admins loaded from Firebase:', Object.keys(adminsData).length, 'admins');
        }

        // Listen for real-time updates to admins
        const unsubscribe = window.firebase.onValue(adminsRef, (snapshot) => {
            adminsData = snapshot.val() || {};
            console.log('🔄 Admins updated from Firebase:', Object.keys(adminsData).length, 'admins');
        });

        firebaseListeners.push(unsubscribe);
    } catch (error) {
        console.error('❌ Error initializing admins data:', error);
        console.log('⚠️ Falling back to empty admins data');
    }
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
    console.log('🔄 initializeFirebaseSync called');
    if (!window.firebase) {
        console.log('❌ Firebase not available');
        return;
    }

    const studentsRef = window.firebase.ref(window.firebase.database, 'students');
    console.log('📡 Setting up Firebase listener for students data');

    // Listen for real-time updates
    const unsubscribe = window.firebase.onValue(studentsRef, (snapshot) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`📥 [${timestamp}] Firebase students data received:`, snapshot.exists());
        if (snapshot.exists()) {
            const newData = snapshot.val() || {};
            const studentCount = Object.keys(newData).length;
            const previousCount = Object.keys(studentsData).length;

            console.log(`✅ [${timestamp}] Students data loaded from Firebase:`, studentCount, 'students (was', previousCount, ')');

            // Check if data actually changed
            if (JSON.stringify(studentsData) !== JSON.stringify(newData)) {
                console.log('🔄 Data changed, updating local studentsData');

                // Deep merge instead of complete replacement to preserve any pending local changes
                Object.keys(newData).forEach(studentId => {
                    if (!studentsData[studentId]) {
                        // New student, just copy
                        studentsData[studentId] = newData[studentId];
                        // Ensure scans object exists
                        if (!studentsData[studentId].scans) {
                            studentsData[studentId].scans = {};
                        }
                    } else {
                        // Existing student, merge carefully
                        // Save local scans before updating (to preserve any pending writes)
                        const localScans = studentsData[studentId].scans || {};

                        // Always update scores and basic info from Firebase (source of truth)
                        studentsData[studentId].scores = newData[studentId].scores || {};
                        studentsData[studentId].name = newData[studentId].name;
                        studentsData[studentId].lastUpdated = newData[studentId].lastUpdated;
                        studentsData[studentId].lastUpdatedBy = newData[studentId].lastUpdatedBy;

                        // Merge scans data: local changes take precedence over Firebase
                        // This prevents race conditions during save operations
                        studentsData[studentId].scans = {
                            ...(newData[studentId].scans || {}),
                            ...localScans
                        };
                    }
                });

                // Remove students that no longer exist in Firebase
                Object.keys(studentsData).forEach(studentId => {
                    if (!newData[studentId]) {
                        delete studentsData[studentId];
                    }
                });

                // Update dashboard if it's currently visible
                if (!document.getElementById('dashboardSection').classList.contains('hidden')) {
                    console.log('📊 Dashboard is visible, re-rendering table');
                    renderScoresTable();
                } else {
                    console.log('📱 Dashboard not visible, skipping render');
                }
            } else {
                console.log('ℹ️ Data unchanged, skipping update');
            }

            updateSyncStatus('synced', 'تم التحديث');
        } else {
            studentsData = {};
            console.log('ℹ️ No students data in Firebase yet');
        }
    }, (error) => {
        console.error('❌ Firebase sync error:', error);
        updateSyncStatus('error', 'خطأ في المزامنة');
        // Fall back to localStorage
        loadStoredData();
    });

    firebaseListeners.push(unsubscribe);
    console.log('✅ Firebase listener registered');
}

function saveToFirebase(studentId, studentData) {
    console.log('💾 saveToFirebase called for:', studentId);
    console.log('🔌 Firebase available:', !!window.firebase);
    console.log('🔌 Firebase database:', !!window.firebase?.database);
    console.log('🔌 Firebase connected flag:', isFirebaseConnected);

    // Always save to localStorage as backup first
    saveData();

    // Check if Firebase is available
    if (!window.firebase || !window.firebase.database) {
        console.log('⚠️ Firebase not available, data saved to localStorage only');
        return Promise.resolve();
    }

    console.log('📤 Attempting to save to Firebase:', studentId);
    updateSyncStatus('syncing', 'تحديث…');

    const studentRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
    const dataToSave = {
        ...studentData,
        lastUpdated: window.firebase.serverTimestamp(),
        lastUpdatedBy: currentAdmin
    };

    return window.firebase.set(studentRef, dataToSave).then(() => {
        console.log('✅ Saved to Firebase:', studentId);
        updateSyncStatus('synced', 'تم التحديث');
    }).catch((error) => {
        console.error('❌ Firebase save error:', error);
        console.error('❌ Error details:', error.message, error.code);
        if (error.code === 'PERMISSION_DENIED') {
            console.error('🚫 Permission denied - check Firebase security rules');
        }
        updateSyncStatus('error', 'خطأ في المزامنة');
        throw error; // Re-throw to be caught by caller
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

    console.log('🚀 Login complete, scheduling scanner initialization...');

    // Show scanner section by default with a delay to ensure DOM is ready
    setTimeout(() => {
        console.log('⏰ Timer fired, calling showScanner()...');
        showScanner();
    }, 150);

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

            console.log('🚀 Auto-login complete, scheduling scanner initialization...');

            // Show scanner section by default with a delay to ensure DOM is ready
            setTimeout(() => {
                console.log('⏰ Auto-login timer fired, calling showScanner()...');
                showScanner();
            }, 150);
        } else {
            // Password changed, logout
            localStorage.removeItem('currentAdminPhone');
            localStorage.removeItem('currentAdminPassword');
        }
    }
}

// QR Scanner functions
function initializeQRScanner() {
    console.log('🔧 initializeQRScanner called');

    // Clear any existing scanner
    if (html5QrcodeScanner) {
        console.log('🧹 Clearing existing scanner instance...');
        try {
            html5QrcodeScanner.clear().catch(err => console.log('⚠️ Scanner clear error:', err));
        } catch (error) {
            console.log('ℹ️ Scanner already cleared:', error);
        }
        html5QrcodeScanner = null;
    }

    // Check if container exists
    const container = document.getElementById('qr-reader');
    if (!container) {
        console.error('❌ QR reader container (#qr-reader) not found!');
        return;
    }

    console.log('✅ Container found, clearing innerHTML...');
    // Clear container first
    container.innerHTML = '';

    // Longer delay to ensure DOM is fully ready and previous scanner is cleared
    setTimeout(() => {
        console.log('⏱️ Delay complete, creating scanner instance...');
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

            console.log('📷 Rendering scanner...');
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            console.log('✅ QR Scanner initialized and rendered successfully');

            // Verify scanner DOM was created
            setTimeout(() => {
                const scannerElements = container.children.length;
                console.log('🔍 Scanner DOM verification: container has', scannerElements, 'child elements');
            }, 100);
        } catch (error) {
            console.error('❌ Error initializing scanner:', error);
            console.error('❌ Error stack:', error.stack);
        }
    }, 250);
}

// Store scanned QR data temporarily
let scannedQRData = null;

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

    // Check if this is a new format QR (pipe-delimited) or old format (just name)
    let studentName = decodedText.trim();
    let additionalInfo = '';
    scannedQRData = null; // Reset

    if (decodedText.includes('|')) {
        // New format: name|year|phone|team
        const qrData = decodeQRData(decodedText);
        if (qrData && qrData.name) {
            studentName = qrData.name;
            scannedQRData = qrData; // Store for later use
            // Build additional info string
            const infoParts = [];
            if (qrData.academicYear) infoParts.push(`السنة: ${qrData.academicYear}`);
            if (qrData.phone) infoParts.push(`الهاتف: ${qrData.phone}`);
            if (qrData.team) infoParts.push(`الفريق: ${qrData.team}`);
            additionalInfo = infoParts.length > 0 ? ` (${infoParts.join(', ')})` : '';
        }
    }

    // Show scoring form with the scanned name
    document.getElementById('studentName').value = studentName;
    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '1'; // Default 1 point
    document.getElementById('scoringForm').classList.remove('hidden');

    showNotification(`اسم المخدوم: ${studentName}${additionalInfo}`, 'success');
}

function onScanFailure(error) {
    // Silently handle scan failures
    console.log(`QR Code scan error: ${error}`);
}

// Scoring functions
async function submitScore() {
    console.log('🎯 submitScore called');
    const studentName = document.getElementById('studentName').value.trim();
    const scoreType = document.getElementById('scoreType').value;
    const score = parseFloat(document.getElementById('score').value);

    console.log('📝 Score details:', { studentName, scoreType, score });

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

    // Sanitize student name for use as Firebase key
    const studentId = sanitizeFirebaseKey(studentName);

    // Get today's date (YYYY-MM-DD format for comparison)
    const today = new Date().toISOString().split('T')[0];

    // Store score locally first
    if (!studentsData[studentId]) {
        studentsData[studentId] = {
            name: studentName,
            academicYear: scannedQRData?.academicYear || '',
            team: scannedQRData?.team || '',
            scores: {},
            scans: {}, // Track scans by type and date
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };
    } else {
        // Update academic year and team if they were scanned and are currently empty
        if (scannedQRData) {
            if (!studentsData[studentId].academicYear && scannedQRData.academicYear) {
                studentsData[studentId].academicYear = scannedQRData.academicYear;
            }
            if (!studentsData[studentId].team && scannedQRData.team) {
                studentsData[studentId].team = scannedQRData.team;
            }
        }
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

    // Record the scan date for this score type
    studentsData[studentId].scans[scoreType] = today;

    // Add the new score (accumulate if already exists)
    if (studentsData[studentId].scores[scoreType]) {
        studentsData[studentId].scores[scoreType] += score;
    } else {
        studentsData[studentId].scores[scoreType] = score;
    }

    studentsData[studentId].lastUpdated = new Date().toISOString();
    studentsData[studentId].lastUpdatedBy = currentAdmin;

    console.log('💾 Saving score:', { student: studentName, scoreType, score });

    // Save to localStorage as backup
    saveData();

    // Save to Firebase (with fallback to localStorage)
    try {
        await saveToFirebase(studentId, studentsData[studentId]);
        const typeLabel = scoreTypeConfig ? scoreTypeConfig.label : scoreType;
        showNotification(`✅ تم إضافة ${score} نقطة لـ ${studentName} في ${typeLabel}`, 'success');
    } catch (error) {
        console.error('❌ Firebase save error:', error);
        const typeLabel = scoreTypeConfig ? scoreTypeConfig.label : scoreType;
        showNotification(`⚠️ تم حفظ النقاط محلياً فقط (لم يتم المزامنة): ${studentName} - ${typeLabel}: ${score}`, 'error');
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

    // Clear scanned QR data
    scannedQRData = null;

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
                    <th>السنة الدراسية</th>
                    <th>الفريق</th>
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
                <td>${student.academicYear || '-'}</td>
                <td>${student.team || '-'}</td>
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
            <h3 style="margin-bottom: 20px;">✏️ تعديل بيانات ${student.name}</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">اسم المخدوم:</label>
                <input type="text" id="editStudentName" value="${student.name}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">السنة الدراسية:</label>
                <input type="text" id="editStudentAcademicYear" value="${student.academicYear || ''}" placeholder="مثال: 2024-2025" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">الفريق:</label>
                <input type="text" id="editStudentTeam" value="${student.team || ''}" placeholder="مثال: الفريق الأحمر" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <h4 style="margin: 20px 0 10px 0; color: #667eea;">النقاط:</h4>
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
    const newAcademicYear = document.getElementById('editStudentAcademicYear').value.trim();
    const newTeam = document.getElementById('editStudentTeam').value.trim();

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

    // Get the sanitized version of the new name for Firebase
    const newStudentKey = sanitizeFirebaseKey(newName);

    // If student name changed, we need to delete old entry and create new one
    if (newStudentKey !== studentId) {
        // Store the old student data BEFORE deleting
        const oldStudentData = { ...studentsData[studentId] };

        // Delete old entry from local data
        delete studentsData[studentId];

        // Create new entry with new name, preserving scans data
        studentsData[newStudentKey] = {
            name: newName,
            academicYear: newAcademicYear,
            team: newTeam,
            scores: newScores,
            scans: oldStudentData.scans || {},
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };

        // Update Firebase
        if (window.firebase && window.firebase.database) {
            // Delete old entry
            const oldRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
            await window.firebase.set(oldRef, null);

            // Save new entry
            await saveToFirebase(newStudentKey, studentsData[newStudentKey]);
        }

        // Save to localStorage
        saveData();
    } else {
        // Just update data - name unchanged
        studentsData[studentId].academicYear = newAcademicYear;
        studentsData[studentId].team = newTeam;
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
    const headers = ['اسم المخدوم', 'السنة الدراسية', 'الفريق', ...ALL_SCORE_TYPE_IDS.map(id => SCORE_TYPES[id].label), 'المجموع', 'آخر تحديث', 'الخادم'];
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
        const row = [
            student.name,
            student.academicYear || '-',
            student.team || '-'
        ];

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
    const academicYearFilter = document.getElementById('filterAcademicYear').value.trim().toLowerCase();
    const teamFilter = document.getElementById('filterTeam').value.trim().toLowerCase();
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

    // Filter by academic year
    if (academicYearFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) =>
                student.academicYear && student.academicYear.toLowerCase().includes(academicYearFilter)
            )
        );
    }

    // Filter by team
    if (teamFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) =>
                student.team && student.team.toLowerCase().includes(teamFilter)
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
    document.getElementById('filterAcademicYear').value = '';
    document.getElementById('filterTeam').value = '';
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
    document.getElementById('qrGeneratorSection').classList.add('hidden');
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
    document.getElementById('qrGeneratorSection').classList.add('hidden');
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
    console.log('🔧 Initializing score types...');
    console.log('📋 Current SCORE_TYPES:', Object.keys(SCORE_TYPES));

    // Always update UI with current score types (default or loaded)
    updateScoreTypeSelects();
    console.log('✅ Score type selects updated with current types');

    if (!window.firebase) {
        console.log('⚠️ Firebase not available, using default score types only');
        return;
    }

    try {
        const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
        console.log('📡 Fetching score types from Firebase...');

        // Use get() for one-time read
        const snapshot = await window.firebase.get(scoreTypesRef);
        console.log('📦 Received snapshot, exists:', snapshot.exists());

        if (snapshot.exists()) {
            SCORE_TYPES = snapshot.val();
            ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);
            console.log('✅ Score types loaded from Firebase:', ALL_SCORE_TYPE_IDS);
            updateScoreTypeSelects();
        } else {
            // Save default score types to Firebase
            console.log('📤 No score types in Firebase, saving defaults...');
            console.log('📋 Default types to save:', SCORE_TYPES);
            await window.firebase.set(scoreTypesRef, SCORE_TYPES);
            console.log('✅ Default score types saved to Firebase');
            console.log('💡 You can now see "scoreTypes" in your Firebase Realtime Database');
            updateScoreTypeSelects();
        }

        // Listen for real-time updates
        console.log('👂 Setting up real-time listener for score types...');
        const unsubscribe = window.firebase.onValue(scoreTypesRef, (snapshot) => {
            console.log('🔔 Score types changed in Firebase');
            if (snapshot.exists()) {
                const newTypes = snapshot.val();
                console.log('🔄 Score types updated from Firebase:', Object.keys(newTypes));
                SCORE_TYPES = newTypes;
                ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);
                updateScoreTypeSelects();
            }
        });

        firebaseListeners.push(unsubscribe);
        console.log('✅ Score types real-time listener registered');
    } catch (error) {
        console.error('❌ Error initializing score types from Firebase:', error);
        console.error('❌ Error stack:', error.stack);
        // Continue with default types
        updateScoreTypeSelects();
    }
}

// Helper function to manually sync score types to Firebase (useful for debugging)
async function syncScoreTypesToFirebase() {
    if (!window.firebase || !window.firebase.database) {
        console.error('❌ Firebase not available');
        return;
    }

    console.log('🔄 Manually syncing score types to Firebase...');
    console.log('📋 Current score types:', SCORE_TYPES);

    try {
        const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
        await window.firebase.set(scoreTypesRef, SCORE_TYPES);
        console.log('✅ Score types synced to Firebase successfully!');
        console.log('💡 Check Firebase Console -> Realtime Database -> scoreTypes');
        showNotification('✅ تم مزامنة أنواع النقاط مع Firebase بنجاح', 'success');
    } catch (error) {
        console.error('❌ Error syncing score types:', error);
        showNotification('❌ خطأ في المزامنة', 'error');
    }
}

// Make it globally available for console access
window.syncScoreTypesToFirebase = syncScoreTypesToFirebase;

function updateScoreTypeSelects() {
    console.log('🔄 Updating score type select dropdowns...');
    console.log('📋 Available score types:', ALL_SCORE_TYPE_IDS.length, ':', ALL_SCORE_TYPE_IDS);

    // Update scoring form select
    const scoreTypeSelect = document.getElementById('scoreType');
    if (scoreTypeSelect) {
        const currentValue = scoreTypeSelect.value;
        scoreTypeSelect.innerHTML = '<option value="">اختر نوع النشاط</option>';

        let optionsAdded = 0;
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            const option = document.createElement('option');
            option.value = typeId;
            option.textContent = SCORE_TYPES[typeId].label;
            scoreTypeSelect.appendChild(option);
            optionsAdded++;
        });

        scoreTypeSelect.value = currentValue;
        console.log('✅ Scoring form dropdown: added', optionsAdded, 'options');
    } else {
        console.log('⚠️ Scoring form select element (#scoreType) not found');
    }

    // Update filter select
    const filterScoreType = document.getElementById('filterScoreType');
    if (filterScoreType) {
        const currentFilterValue = filterScoreType.value;
        filterScoreType.innerHTML = '<option value="">الكل</option>';

        let filterOptionsAdded = 0;
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            const option = document.createElement('option');
            option.value = typeId;
            option.textContent = SCORE_TYPES[typeId].label;
            filterScoreType.appendChild(option);
            filterOptionsAdded++;
        });

        filterScoreType.value = currentFilterValue;
        console.log('✅ Filter dropdown: added', filterOptionsAdded, 'options');
    } else {
        console.log('⚠️ Filter select element (#filterScoreType) not found');
    }
}

function showManageScoreTypes() {
    if (!currentAdminData || !currentAdminData.isHeadAdmin) {
        showNotification('غير مصرح لك بالوصول إلى هذه الصفحة', 'error');
        return;
    }

    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('qrGeneratorSection').classList.add('hidden');
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

    console.log('➕ Adding new score type:', { id, label, allowMultiple });

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

    // Update local data
    SCORE_TYPES[id] = newScoreType;
    ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);
    console.log('✅ Score type added locally:', id);

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        try {
            console.log('📤 Saving score types to Firebase...');
            const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
            await window.firebase.set(scoreTypesRef, SCORE_TYPES);
            console.log('✅ Score types saved to Firebase successfully');
            console.log('🔔 Real-time listeners will notify all users of this change');
        } catch (error) {
            console.error('❌ Error saving score types to Firebase:', error);
            showNotification('⚠️ تم الإضافة محلياً فقط - خطأ في المزامنة', 'error');
            return;
        }
    }

    updateScoreTypeSelects();
    hideAddScoreTypeForm();
    renderScoreTypesList();
    showNotification('✅ تم إضافة نوع النقاط بنجاح وتم مزامنته مع جميع المستخدمين', 'success');
}

async function editScoreType(typeId) {
    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) return;

    console.log('✏️ Editing score type:', typeId, scoreType);

    const newLabel = prompt('الاسم العربي الجديد:', scoreType.label);
    if (!newLabel || !newLabel.trim()) return;

    const allowMultiple = confirm('السماح بالتسجيل أكثر من مرة في اليوم؟');

    // Update local data
    SCORE_TYPES[typeId] = {
        ...scoreType,
        label: newLabel.trim(),
        allowMultiplePerDay: allowMultiple
    };
    console.log('✅ Score type updated locally:', typeId, SCORE_TYPES[typeId]);

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        try {
            console.log('📤 Saving updated score types to Firebase...');
            const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
            await window.firebase.set(scoreTypesRef, SCORE_TYPES);
            console.log('✅ Score types saved to Firebase successfully');
            console.log('🔔 Real-time listeners will notify all users of this change');
        } catch (error) {
            console.error('❌ Error saving score types to Firebase:', error);
            showNotification('⚠️ تم التحديث محلياً فقط - خطأ في المزامنة', 'error');
            return;
        }
    }

    updateScoreTypeSelects();
    renderScoreTypesList();
    showNotification('✅ تم تحديث نوع النقاط بنجاح وتم مزامنته مع جميع المستخدمين', 'success');
}

async function deleteScoreType(typeId) {
    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) return;

    console.log('🗑️ Deleting score type:', typeId, scoreType);

    if (!confirm(`هل أنت متأكد من حذف نوع النقاط "${scoreType.label}"؟\n\nسيتم حذف جميع النقاط المرتبطة بهذا النوع من جميع المخدومين!`)) {
        return;
    }

    // Remove from SCORE_TYPES
    delete SCORE_TYPES[typeId];
    ALL_SCORE_TYPE_IDS = Object.keys(SCORE_TYPES);
    console.log('✅ Score type removed locally');

    // Remove from all students
    let studentsAffected = 0;
    Object.keys(studentsData).forEach(studentId => {
        if (studentsData[studentId].scores && studentsData[studentId].scores[typeId]) {
            delete studentsData[studentId].scores[typeId];
            studentsAffected++;
        }
        if (studentsData[studentId].scans && studentsData[studentId].scans[typeId]) {
            delete studentsData[studentId].scans[typeId];
        }
    });
    console.log(`🔄 Removed score type from ${studentsAffected} students`);

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        try {
            console.log('📤 Saving updated score types to Firebase...');
            const scoreTypesRef = window.firebase.ref(window.firebase.database, 'scoreTypes');
            await window.firebase.set(scoreTypesRef, SCORE_TYPES);
            console.log('✅ Score types saved to Firebase');

            if (studentsAffected > 0) {
                console.log('📤 Updating students in Firebase...');
                const studentsRef = window.firebase.ref(window.firebase.database, 'students');
                await window.firebase.set(studentsRef, studentsData);
                console.log('✅ Students updated in Firebase');
            }

            console.log('🔔 Real-time listeners will notify all users of this change');
        } catch (error) {
            console.error('❌ Error saving to Firebase:', error);
            showNotification('⚠️ تم الحذف محلياً فقط - خطأ في المزامنة', 'error');
            return;
        }
    }

    updateScoreTypeSelects();
    renderScoreTypesList();
    showNotification('✅ تم حذف نوع النقاط بنجاح وتم مزامنته مع جميع المستخدمين', 'success');
}

// Update existing showScanner function
function showScanner() {
    console.log('📱 showScanner called');

    // Show scanner section and hide others
    document.getElementById('scannerSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('qrGeneratorSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('scannerNavBtn');

    // Check if scanner container exists
    const scannerContainer = document.getElementById('qr-reader');
    if (!scannerContainer) {
        console.error('❌ Scanner container (#qr-reader) not found!');
        return;
    }

    const hasContent = scannerContainer.children.length > 0;

    console.log('📊 Scanner state:');
    console.log('  - Container found: ✅');
    console.log('  - Has content:', hasContent ? '✅' : '❌');
    console.log('  - Scanner instance exists:', html5QrcodeScanner ? '✅' : '❌');

    // Only initialize if scanner doesn't exist yet
    if (!html5QrcodeScanner || !hasContent) {
        console.log('🔧 Initializing scanner for the first time');
        setTimeout(() => {
            initializeQRScanner();
        }, 200);
    } else {
        // Scanner already exists, just resume it
        console.log('▶️ Resuming existing scanner');
        try {
            html5QrcodeScanner.resume();
            console.log('✅ Scanner resumed successfully');
        } catch (error) {
            console.log('⚠️ Error resuming scanner:', error);
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
    document.getElementById('qrGeneratorSection').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('dashboardNavBtn');

    renderScoresTable();
}

// Show QR Generator section
function showQRGenerator() {
    console.log('🎫 showQRGenerator called');

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
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('qrGeneratorSection').classList.remove('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('manageAdminsSection').classList.add('hidden');
    document.getElementById('manageScoreTypesSection').classList.add('hidden');

    setActiveNav('qrGeneratorNavBtn');

    // Load and render QR codes
    try {
        loadQRCodes().then(() => {
            renderQRCodesTable();
            console.log('✅ QR Generator section loaded successfully');
        }).catch(error => {
            console.error('Error loading QR codes:', error);
            renderQRCodesTable(); // Render empty table even if load fails
        });
    } catch (error) {
        console.error('Error in showQRGenerator:', error);
        renderQRCodesTable(); // Render empty table even if load fails
    }
}

// ============================================
// QR CODE GENERATION AND MANAGEMENT SYSTEM
// ============================================

// QR Codes data storage
let qrCodesData = {};

// Helper function to decode QR data (pipe-delimited format)
// Format: name|academicYear|phone|team
function decodeQRData(qrString) {
    try {
        const parts = qrString.split('|');
        return {
            name: parts[0] || '',
            academicYear: parts[1] || '',
            phone: parts[2] || '',
            team: parts[3] || ''
        };
    } catch (error) {
        console.error('Error decoding QR data:', error);
        return null;
    }
}

// Load QR codes from Firebase and localStorage
async function loadQRCodes() {
    // Load from localStorage first
    const stored = localStorage.getItem('qrCodesData');
    if (stored) {
        try {
            qrCodesData = JSON.parse(stored);
        } catch (error) {
            console.error('Error parsing QR codes from localStorage:', error);
            qrCodesData = {};
        }
    }

    // Load from Firebase
    if (window.firebase && window.firebase.database) {
        try {
            const qrRef = window.firebase.ref(window.firebase.database, 'qrcodes');
            const snapshot = await window.firebase.get(qrRef);
            if (snapshot.exists()) {
                qrCodesData = snapshot.val();
                // Save to localStorage
                localStorage.setItem('qrCodesData', JSON.stringify(qrCodesData));
            }
        } catch (error) {
            console.error('Error loading QR codes from Firebase:', error);
        }
    }
}

// Save QR codes to Firebase and localStorage
async function saveQRCodesToFirebase(qrId, qrData) {
    // Save to localStorage
    localStorage.setItem('qrCodesData', JSON.stringify(qrCodesData));

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        try {
            const qrRef = window.firebase.ref(window.firebase.database, `qrcodes/${qrId}`);
            await window.firebase.set(qrRef, qrData);
        } catch (error) {
            console.error('Error saving QR code to Firebase:', error);
            showNotification('حدث خطأ في حفظ QR للخادم', 'error');
        }
    }
}

// Generate QR Code
async function generateQRCode() {
    const name = document.getElementById('qrStudentName').value.trim();
    const academicYear = document.getElementById('qrAcademicYear').value.trim();
    const phone = document.getElementById('qrPhone').value.trim();
    const team = document.getElementById('qrTeam').value.trim();

    // Validation
    if (!name) {
        showNotification('الرجاء إدخال اسم المخدوم', 'error');
        return;
    }

    // Phone validation (if provided)
    if (phone && (phone.length !== 11 || !/^[0-9]{11}$/.test(phone))) {
        showNotification('رقم الهاتف يجب أن يكون 11 رقم', 'error');
        return;
    }

    // Check for duplicates
    const isDuplicate = Object.values(qrCodesData).some(qr =>
        qr.name.toLowerCase() === name.toLowerCase() &&
        qr.academicYear === academicYear &&
        qr.phone === phone &&
        qr.team === team
    );

    if (isDuplicate) {
        showNotification('هذا الرمز موجود بالفعل بنفس البيانات', 'error');
        return;
    }

    // Create QR data object
    const qrData = {
        name,
        academicYear: academicYear || '',
        phone: phone || '',
        team: team || '',
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin
    };

    // Generate unique ID
    const qrId = sanitizeFirebaseKey(name) + '_' + Date.now();

    // Add to qrCodesData
    qrCodesData[qrId] = qrData;

    // Save to Firebase
    await saveQRCodesToFirebase(qrId, qrData);

    // Show success notification
    showNotification('تم إنشاء رمز QR بنجاح', 'success');

    // Reset form
    resetQRForm();

    // Render table
    renderQRCodesTable();
}

// Reset QR form
function resetQRForm() {
    document.getElementById('qrStudentName').value = '';
    document.getElementById('qrAcademicYear').value = '';
    document.getElementById('qrPhone').value = '';
    document.getElementById('qrTeam').value = '';
}

// Render QR Codes Table
function renderQRCodesTable(filteredData = null) {
    const tableContainer = document.getElementById('qrCodesTable');
    const dataToRender = filteredData || qrCodesData;

    if (Object.keys(dataToRender).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic; padding: 40px;">لم يتم إنشاء أي رموز QR بعد.</p>';
        return;
    }

    let tableHTML = `
        <table class="modern-table">
            <thead>
                <tr>
                    <th>الاسم</th>
                    <th>السنة الدراسية</th>
                    <th>رقم الهاتف</th>
                    <th>الفريق</th>
                    <th>تاريخ الإنشاء</th>
                    <th>الخادم</th>
                    <th>الإجراءات</th>
                </tr>
            </thead>
            <tbody>
    `;

    Object.entries(dataToRender).forEach(([qrId, qr]) => {
        const createdDate = formatDateTwoLines(qr.createdAt);
        tableHTML += `
            <tr>
                <td><strong>${qr.name}</strong></td>
                <td>${qr.academicYear || '-'}</td>
                <td>${qr.phone || '-'}</td>
                <td>${qr.team || '-'}</td>
                <td>${createdDate}</td>
                <td>${qr.createdBy || 'غير معروف'}</td>
                <td>
                    <div class="action-buttons">
                        <button onclick="editQRCode('${qrId}')" class="action-btn edit-btn" title="تعديل">✏️</button>
                        <button onclick="downloadQRCode('${qrId}')" class="action-btn download-btn" title="تحميل QR">⬇️</button>
                        <button onclick="downloadBookmark('${qrId}')" class="action-btn bookmark-btn" title="تحميل علامة">🔖</button>
                        <button onclick="deleteQRCode('${qrId}')" class="action-btn delete-btn" title="حذف">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

// Edit QR Code
async function editQRCode(qrId) {
    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    let dialogHTML = `
        <div style="max-width: 600px;">
            <h3 style="margin-bottom: 20px;">✏️ تعديل رمز QR</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">اسم المخدوم: <span style="color: red;">*</span></label>
                <input type="text" id="editQRName" value="${qr.name}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">السنة الدراسية:</label>
                <input type="text" id="editQRAcademicYear" value="${qr.academicYear || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">رقم الهاتف:</label>
                <input type="tel" id="editQRPhone" value="${qr.phone || ''}" maxlength="11" pattern="[0-9]{11}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">الفريق:</label>
                <input type="text" id="editQRTeam" value="${qr.team || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                <button onclick="saveQREdit('${qrId}')" style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 5px; font-weight: 600; cursor: pointer;">💾 حفظ</button>
                <button onclick="closeEditDialog()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; font-weight: 600; cursor: pointer;">إلغاء</button>
            </div>
        </div>
    `;

    showEditDialog(dialogHTML);
}

// Save QR Edit
async function saveQREdit(qrId) {
    const newName = document.getElementById('editQRName').value.trim();
    const newAcademicYear = document.getElementById('editQRAcademicYear').value.trim();
    const newPhone = document.getElementById('editQRPhone').value.trim();
    const newTeam = document.getElementById('editQRTeam').value.trim();

    if (!newName) {
        showNotification('الرجاء إدخال اسم المخدوم', 'error');
        return;
    }

    // Phone validation (if provided)
    if (newPhone && (newPhone.length !== 11 || !/^[0-9]{11}$/.test(newPhone))) {
        showNotification('رقم الهاتف يجب أن يكون 11 رقم', 'error');
        return;
    }

    // Check for duplicates (excluding current QR)
    const isDuplicate = Object.entries(qrCodesData).some(([id, qr]) =>
        id !== qrId &&
        qr.name.toLowerCase() === newName.toLowerCase() &&
        qr.academicYear === newAcademicYear &&
        qr.phone === newPhone &&
        qr.team === newTeam
    );

    if (isDuplicate) {
        showNotification('يوجد رمز QR آخر بنفس هذه البيانات', 'error');
        return;
    }

    // Update QR data
    qrCodesData[qrId].name = newName;
    qrCodesData[qrId].academicYear = newAcademicYear;
    qrCodesData[qrId].phone = newPhone;
    qrCodesData[qrId].team = newTeam;
    qrCodesData[qrId].lastUpdated = new Date().toISOString();
    qrCodesData[qrId].lastUpdatedBy = currentAdmin;

    // Save to Firebase
    await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);

    closeEditDialog();
    renderQRCodesTable();
    showNotification('تم تحديث رمز QR بنجاح', 'success');
}

// Download QR Code with student name underneath
function downloadQRCode(qrId) {
    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    // Create compact QR data string (pipe-delimited format: name|year|phone|team)
    // This reduces data size significantly compared to JSON
    const qrDataString = [
        qr.name || '',
        qr.academicYear || '',
        qr.phone || '',
        qr.team || ''
    ].join('|');

    // Create a temporary container for QR code
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    document.body.appendChild(tempContainer);

    try {
        // Generate QR code with medium error correction
        const qrcode = new QRCode(tempContainer, {
            text: qrDataString,
            width: 512,
            height: 512,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        // Wait for QR code to be generated, then create final image with name
        setTimeout(() => {
            const qrCanvas = tempContainer.querySelector('canvas');
            if (qrCanvas) {
                // Create a new canvas with extra height for the name
                const finalCanvas = document.createElement('canvas');
                const qrSize = 512;
                const textHeight = 80; // Height for text area
                const padding = 20; // Padding around text

                finalCanvas.width = qrSize;
                finalCanvas.height = qrSize + textHeight;

                const ctx = finalCanvas.getContext('2d');

                // Fill white background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

                // Draw QR code
                ctx.drawImage(qrCanvas, 0, 0);

                // Draw student name below QR code
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 32px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Draw name (split into multiple lines if too long)
                const maxWidth = qrSize - (padding * 2);
                const words = qr.name.split(' ');
                let line = '';
                let lines = [];

                for (let i = 0; i < words.length; i++) {
                    const testLine = line + words[i] + ' ';
                    const metrics = ctx.measureText(testLine);

                    if (metrics.width > maxWidth && i > 0) {
                        lines.push(line);
                        line = words[i] + ' ';
                    } else {
                        line = testLine;
                    }
                }
                lines.push(line);

                // Draw lines centered
                const lineHeight = 36;
                const startY = qrSize + (textHeight / 2) - ((lines.length - 1) * lineHeight / 2);

                lines.forEach((line, index) => {
                    ctx.fillText(line.trim(), qrSize / 2, startY + (index * lineHeight));
                });

                // Convert to blob and download
                finalCanvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `QR_${qr.name.replace(/\s+/g, '_')}.png`;
                    link.click();
                    URL.revokeObjectURL(url);
                    document.body.removeChild(tempContainer);
                    showNotification('تم تحميل رمز QR بنجاح', 'success');
                });
            } else {
                document.body.removeChild(tempContainer);
                showNotification('حدث خطأ في إنشاء رمز QR', 'error');
            }
        }, 500);
    } catch (error) {
        console.error('Error generating QR code:', error);
        document.body.removeChild(tempContainer);
        showNotification('البيانات كبيرة جداً لإنشاء رمز QR', 'error');
    }
}

// Download Bookmark with QR Code
function downloadBookmark(qrId) {
    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    // Create compact QR data string (pipe-delimited format)
    const qrDataString = [
        qr.name || '',
        qr.academicYear || '',
        qr.phone || '',
        qr.team || ''
    ].join('|');

    // Create a temporary container for QR code generation
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    document.body.appendChild(tempContainer);

    try {
        // Generate QR code
        const qrcode = new QRCode(tempContainer, {
            text: qrDataString,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        // Wait for QR code generation
        setTimeout(() => {
            const qrCanvas = tempContainer.querySelector('canvas');
            if (!qrCanvas) {
                document.body.removeChild(tempContainer);
                showNotification('حدث خطأ في إنشاء رمز QR', 'error');
                return;
            }

            // Load bookmark template image
            const bookmarkImg = new Image();
            bookmarkImg.crossOrigin = 'anonymous';

            bookmarkImg.onload = function() {
                // Create final canvas with bookmark dimensions
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = bookmarkImg.width;
                finalCanvas.height = bookmarkImg.height;
                const ctx = finalCanvas.getContext('2d');

                // Draw bookmark template
                ctx.drawImage(bookmarkImg, 0, 0);

                // Calculate QR position (bottom left corner)
                // Adjust these values based on your template's QR location
                const qrX = 20; // Left margin
                const qrY = bookmarkImg.height - 256 - 20; // Bottom margin
                const qrWidth = 230; // Slightly smaller to fit in the template
                const qrHeight = 230;

                // Draw white background for QR (optional, for better visibility)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(qrX - 5, qrY - 5, qrWidth + 10, qrHeight + 10);

                // Draw QR code on bookmark
                ctx.drawImage(qrCanvas, qrX, qrY, qrWidth, qrHeight);

                // Convert to blob and download
                finalCanvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `Bookmark_${qr.name.replace(/\s+/g, '_')}.png`;
                    link.click();
                    URL.revokeObjectURL(url);
                    document.body.removeChild(tempContainer);
                    showNotification('تم تحميل علامة الكتاب بنجاح', 'success');
                });
            };

            bookmarkImg.onerror = function() {
                document.body.removeChild(tempContainer);
                showNotification('تعذر تحميل قالب علامة الكتاب. تأكد من وجود ملف bookmark-template.png', 'error');
            };

            // Load the bookmark template (you need to add this image to your project)
            bookmarkImg.src = 'bookmark-template.png';

        }, 500);
    } catch (error) {
        console.error('Error generating bookmark:', error);
        document.body.removeChild(tempContainer);
        showNotification('حدث خطأ في إنشاء علامة الكتاب', 'error');
    }
}

// Delete QR Code
async function deleteQRCode(qrId) {
    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    if (!confirm(`هل أنت متأكد من حذف رمز QR الخاص بـ "${qr.name}"؟`)) {
        return;
    }

    // Delete from local data
    delete qrCodesData[qrId];

    // Delete from Firebase
    if (window.firebase && window.firebase.database) {
        try {
            const qrRef = window.firebase.ref(window.firebase.database, `qrcodes/${qrId}`);
            await window.firebase.set(qrRef, null);
        } catch (error) {
            console.error('Error deleting QR code from Firebase:', error);
        }
    }

    // Save to localStorage
    localStorage.setItem('qrCodesData', JSON.stringify(qrCodesData));

    renderQRCodesTable();
    showNotification('تم حذف رمز QR بنجاح', 'success');
}

// Apply QR Filters
function applyQRFilters() {
    const nameFilter = document.getElementById('qrFilterName').value.trim().toLowerCase();
    const yearFilter = document.getElementById('qrFilterYear').value.trim().toLowerCase();
    const phoneFilter = document.getElementById('qrFilterPhone').value.trim();
    const teamFilter = document.getElementById('qrFilterTeam').value.trim().toLowerCase();

    let filteredData = { ...qrCodesData };

    if (nameFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, qr]) =>
                qr.name.toLowerCase().includes(nameFilter)
            )
        );
    }

    if (yearFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, qr]) =>
                qr.academicYear && qr.academicYear.toLowerCase().includes(yearFilter)
            )
        );
    }

    if (phoneFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, qr]) =>
                qr.phone && qr.phone.includes(phoneFilter)
            )
        );
    }

    if (teamFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, qr]) =>
                qr.team && qr.team.toLowerCase().includes(teamFilter)
            )
        );
    }

    renderQRCodesTable(filteredData);
}

// Clear QR Filters
function clearQRFilters() {
    document.getElementById('qrFilterName').value = '';
    document.getElementById('qrFilterYear').value = '';
    document.getElementById('qrFilterPhone').value = '';
    document.getElementById('qrFilterTeam').value = '';
    renderQRCodesTable();
}

// Export QR Data to Excel
function exportQRDataToExcel() {
    if (Object.keys(qrCodesData).length === 0) {
        showNotification('لا توجد بيانات لتصديرها', 'error');
        return;
    }

    const exportData = Object.values(qrCodesData).map(qr => ({
        'الاسم': qr.name,
        'السنة الدراسية': qr.academicYear || '-',
        'رقم الهاتف': qr.phone || '-',
        'الفريق': qr.team || '-',
        'تاريخ الإنشاء': new Date(qr.createdAt).toLocaleString('ar-EG'),
        'الخادم': qr.createdBy || 'غير معروف'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'QR Codes');

    const timestamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `QR_Codes_${timestamp}.xlsx`);

    showNotification('تم تصدير البيانات بنجاح', 'success');
}

// ============================================
// END QR CODE SYSTEM
// ============================================

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