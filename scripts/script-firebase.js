// Global variables
let html5QrcodeScanner; // Keep for backward compatibility
let html5Qrcode; // New lower-level API for camera control
let currentCameraId = null;
let availableCameras = [];
let isScannerRunning = false;
let currentAdmin = '';
let currentAdminData = null;
let studentsData = {};
let adminsData = {};
let teamsData = {};
let academicYearsData = {};
let isFirebaseConnected = false;
let firebaseListeners = [];

// Head admin phone number
const HEAD_ADMIN_PHONE = '01207714622';

// ============================================
// PASSWORD ENCRYPTION UTILITIES
// ============================================

// Encryption key - In production, use a more secure key management system
const ENCRYPTION_SECRET = 'StudentScoringSystem2025SecureKey!@#$';

// Simple but secure password encryption using Base64 and XOR cipher
function encryptPassword(password) {
    if (!password) return '';

    // Convert password and key to bytes
    const passwordBytes = new TextEncoder().encode(password);
    const keyBytes = new TextEncoder().encode(ENCRYPTION_SECRET);

    // XOR encryption
    const encrypted = new Uint8Array(passwordBytes.length);
    for (let i = 0; i < passwordBytes.length; i++) {
        encrypted[i] = passwordBytes[i] ^ keyBytes[i % keyBytes.length];
    }

    // Convert to base64
    return btoa(String.fromCharCode(...encrypted));
}

// Decrypt password
function decryptPassword(encryptedPassword) {
    if (!encryptedPassword) return '';

    try {
        // Decode from base64
        const encrypted = Uint8Array.from(atob(encryptedPassword), c => c.charCodeAt(0));
        const keyBytes = new TextEncoder().encode(ENCRYPTION_SECRET);

        // XOR decryption
        const decrypted = new Uint8Array(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
        }

        // Convert back to string
        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('Error decrypting password:', error);
        return '';
    }
}

// Utility function to migrate existing plain-text passwords to encrypted format
// Call this from browser console ONCE to upgrade all existing passwords
async function migratePasswordsToEncrypted() {
    if (!window.firebase || !window.firebase.database) {
        console.error('Firebase not initialized');
        return;
    }

    console.log('🔒 Starting password migration...');
    let migratedCount = 0;
    let alreadyEncryptedCount = 0;

    for (const [phone, admin] of Object.entries(adminsData)) {
        if (!admin.password) {
            console.log(`⚠️ Skipping ${admin.name} - no password set`);
            continue;
        }

        // Check if password is already encrypted (try to decrypt it)
        try {
            const decrypted = decryptPassword(admin.password);
            // If decryption produces garbled text or fails, it's likely plain text
            // If it produces normal text, it's already encrypted

            // Simple heuristic: encrypted passwords will be base64 (letters, numbers, +, /, =)
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(admin.password);

            if (!isBase64) {
                // Plain text password - encrypt it
                const encryptedPassword = encryptPassword(admin.password);
                admin.password = encryptedPassword;

                // Update in Firebase
                const adminRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
                await window.firebase.set(adminRef, admin);

                console.log(`✅ Migrated password for ${admin.name} (${phone})`);
                migratedCount++;
            } else {
                console.log(`ℹ️ Password for ${admin.name} (${phone}) appears to be already encrypted`);
                alreadyEncryptedCount++;
            }
        } catch (error) {
            console.error(`❌ Error migrating password for ${admin.name}:`, error);
        }
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`   Migrated: ${migratedCount} passwords`);
    console.log(`   Already encrypted: ${alreadyEncryptedCount} passwords`);
    console.log(`   Total admins: ${Object.keys(adminsData).length}`);
}

// Make migration function available globally for console access
window.migratePasswordsToEncrypted = migratePasswordsToEncrypted;

// ============================================
// INITIALIZE DEFAULT TEAMS AND ACADEMIC YEARS
// ============================================

// Default teams with colors and responsibles
const DEFAULT_TEAMS_DATA = [
    { name: 'فريق (١) دانيال النبي', color: '#E74C3C', responsible: 'ا. ريمون' },
    { name: 'فريق (٢) يوسف الصديق', color: '#3498DB', responsible: 'ا. مايكل ماهر' },
    { name: 'فريق (٣) داود النبي', color: '#2ECC71', responsible: 'ا. امير' },
    { name: 'فريق (٤) شمشون الجبار', color: '#F39C12', responsible: 'ا. بيشوي' },
    { name: 'فريق (٥) اسطفانوس', color: '#9B59B6', responsible: 'ا. مايكل كمال' },
    { name: 'فريق (٦) القديس ابانوب', color: '#1ABC9C', responsible: 'ا. انطون' },
    { name: 'فريق (٧) جدعون النبي', color: '#E91E63', responsible: 'ا. باخوم' },
    { name: 'فريق (٨) الفتية التلاتة', color: '#00BCD4', responsible: 'ا. كيرلس' },
    { name: 'فريق (٩) نحميا النبي', color: '#FF5722', responsible: 'ا. مينا زاهر' },
    { name: 'فريق (١٠) مارجرجس', color: '#673AB7', responsible: 'ا. جورج' },
    { name: 'فريق (١١) أبو سيفين', color: '#4CAF50', responsible: 'ا. مينا ظريف' },
    { name: 'فريق (١٢) مارمينا', color: '#795548', responsible: 'ا. امجد' },
    { name: 'فريق (١٣) بولس الرسول', color: '#607D8B', responsible: 'ا. مايكل ماهر' }
];

// Default academic years
const DEFAULT_ACADEMIC_YEARS_DATA = [
    { name: '١ اعدادي' },
    { name: '٢ اعدادي' },
    { name: '٣ اعدادي' }
];

// Initialize default teams in Firebase
async function initializeDefaultTeams(forceOverwrite = false) {
    if (!window.firebase || !window.firebase.database) {
        console.error('❌ Firebase not initialized');
        return;
    }

    if (!currentAdmin) {
        console.error('❌ You must be logged in as an admin to initialize data');
        return;
    }

    console.log('🏁 Starting teams initialization...');
    let addedCount = 0;
    let skippedCount = 0;

    for (const team of DEFAULT_TEAMS_DATA) {
        const teamId = sanitizeFirebaseKey(team.name);

        // Check if team already exists
        if (!forceOverwrite && teamsData[teamId]) {
            console.log(`ℹ️ Team "${team.name}" already exists, skipping...`);
            skippedCount++;
            continue;
        }

        const teamData = {
            name: team.name,
            color: team.color,
            responsible: team.responsible || '',
            createdAt: new Date().toISOString(),
            createdBy: currentAdmin
        };

        try {
            const teamRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.TEAMS}/${teamId}`);
            await window.firebase.set(teamRef, teamData);
            console.log(`✅ Added team: ${team.name}`);
            addedCount++;
        } catch (error) {
            console.error(`❌ Error adding team "${team.name}":`, error);
        }
    }

    console.log(`\n🎉 Teams initialization complete!`);
    console.log(`   Added: ${addedCount} teams`);
    console.log(`   Skipped (already exist): ${skippedCount} teams`);
}

// Initialize default academic years in Firebase
async function initializeDefaultAcademicYears(forceOverwrite = false) {
    if (!window.firebase || !window.firebase.database) {
        console.error('❌ Firebase not initialized');
        return;
    }

    if (!currentAdmin) {
        console.error('❌ You must be logged in as an admin to initialize data');
        return;
    }

    console.log('🏁 Starting academic years initialization...');
    let addedCount = 0;
    let skippedCount = 0;

    for (const year of DEFAULT_ACADEMIC_YEARS_DATA) {
        const yearId = sanitizeFirebaseKey(year.name);

        // Check if year already exists
        if (!forceOverwrite && academicYearsData[yearId]) {
            console.log(`ℹ️ Academic year "${year.name}" already exists, skipping...`);
            skippedCount++;
            continue;
        }

        const yearData = {
            name: year.name,
            createdAt: new Date().toISOString(),
            createdBy: currentAdmin
        };

        try {
            const yearRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.ACADEMIC_YEARS}/${yearId}`);
            await window.firebase.set(yearRef, yearData);
            console.log(`✅ Added academic year: ${year.name}`);
            addedCount++;
        } catch (error) {
            console.error(`❌ Error adding academic year "${year.name}":`, error);
        }
    }

    console.log(`\n🎉 Academic years initialization complete!`);
    console.log(`   Added: ${addedCount} years`);
    console.log(`   Skipped (already exist): ${skippedCount} years`);
}

// Initialize all default data (teams + academic years)
async function initializeDefaultData(forceOverwrite = false) {
    console.log('🚀 Starting full data initialization...\n');
    await initializeDefaultTeams(forceOverwrite);
    console.log('');
    await initializeDefaultAcademicYears(forceOverwrite);
    console.log('\n✨ All default data initialized!');
}

// Make initialization functions available globally for console access
window.initializeDefaultTeams = initializeDefaultTeams;
window.initializeDefaultAcademicYears = initializeDefaultAcademicYears;
window.initializeDefaultData = initializeDefaultData;

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

// Permission helper functions
function hasPermission(permission) {
    if (!currentAdminData) return false;

    // Head admins have all permissions
    if (currentAdminData.isHeadAdmin) return true;

    // Check specific permission
    if (!currentAdminData.permissions) return false;
    return currentAdminData.permissions[permission] === true;
}

function canAddQR() {
    return hasPermission('canAddQR');
}

function canEditQR() {
    return hasPermission('canEditQR');
}

function canDeleteQR() {
    return hasPermission('canDeleteQR');
}

function canModifyDashboard() {
    return hasPermission('canModifyDashboard');
}

function canManageTeams() {
    return hasPermission('canManageTeams');
}

function canManageAcademicYears() {
    return hasPermission('canManageAcademicYears');
}

function isHeadAdmin() {
    return currentAdminData && currentAdminData.isHeadAdmin === true;
}

function updateUIBasedOnPermissions() {
    // Show/hide QR Generator section in navigation
    const qrGeneratorBtn = document.getElementById('qrGeneratorNavBtn');
    if (qrGeneratorBtn) {
        // Only show QR Generator if user can add, edit, or delete QR codes
        if (canAddQR() || canEditQR() || canDeleteQR()) {
            qrGeneratorBtn.classList.remove('hidden');
        } else {
            qrGeneratorBtn.classList.add('hidden');
        }
    }

    // Show/hide Scanner section based on dashboard modification permission
    const scannerBtn = document.getElementById('scannerNavBtn');
    if (scannerBtn) {
        if (canModifyDashboard()) {
            scannerBtn.classList.remove('hidden');
        } else {
            scannerBtn.classList.add('hidden');
        }
    }

    // Show/hide Scores section based on dashboard modification permission
    const scoresBtn = document.getElementById('scoresNavBtn');
    if (scoresBtn) {
        if (canModifyDashboard()) {
            scoresBtn.classList.remove('hidden');
        } else {
            scoresBtn.classList.add('hidden');
        }
    }

    // Show/hide Settings section for admins with management permissions
    const settingsBtn = document.getElementById('settingsNavBtn');
    if (settingsBtn) {
        if (isHeadAdmin() || canManageTeams() || canManageAcademicYears()) {
            settingsBtn.classList.remove('hidden');
        } else {
            settingsBtn.classList.add('hidden');
        }
    }
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
                    password: encryptPassword('123456789mI#'),
                    isHeadAdmin: true,
                    permissions: {
                        canEditQR: true,
                        canAddQR: true,
                        canDeleteQR: true,
                        canModifyDashboard: true
                    },
                    createdAt: new Date().toISOString()
                },
                '01283469752': {
                    name: 'Mina Zaher',
                    phone: '01283469752',
                    password: encryptPassword('01283469752'),
                    isHeadAdmin: false,
                    permissions: {
                        canEditQR: false,
                        canAddQR: false,
                        canDeleteQR: false,
                        canModifyDashboard: false
                    },
                    createdAt: new Date().toISOString()
                },
                '01207320088': {
                    name: 'Kero Boles',
                    phone: '01207320088',
                    password: encryptPassword('01207320088'),
                    isHeadAdmin: false,
                    permissions: {
                        canEditQR: false,
                        canAddQR: false,
                        canDeleteQR: false,
                        canModifyDashboard: false
                    },
                    createdAt: new Date().toISOString()
                },
                '01282201313': {
                    name: 'Remon Aziz',
                    phone: '01282201313',
                    password: encryptPassword('01282201313'),
                    isHeadAdmin: false,
                    permissions: {
                        canEditQR: false,
                        canAddQR: false,
                        canDeleteQR: false,
                        canModifyDashboard: false
                    },
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

// Switch between login and signup tabs
function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabs = document.querySelectorAll('.auth-tab');

    // Update tabs
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    }
}

// Submit signup request
async function submitSignupRequest() {
    const name = document.getElementById('signupName').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const signupError = document.getElementById('signupError');
    const signupSuccess = document.getElementById('signupSuccess');

    // Hide previous messages
    signupError.classList.add('hidden');
    signupSuccess.classList.add('hidden');

    // Validation
    if (!name) {
        signupError.textContent = 'الرجاء إدخال الاسم';
        signupError.classList.remove('hidden');
        return;
    }

    if (!phone || phone.length !== 11) {
        signupError.textContent = 'رقم الهاتف يجب أن يكون 11 رقماً';
        signupError.classList.remove('hidden');
        return;
    }

    if (!password || password.length < 6) {
        signupError.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
        signupError.classList.remove('hidden');
        return;
    }

    if (password !== confirmPassword) {
        signupError.textContent = 'كلمات المرور غير متطابقة';
        signupError.classList.remove('hidden');
        return;
    }

    // Check if Firebase is available
    if (!window.firebase || !window.firebase.database) {
        signupError.textContent = 'غير متصل بقاعدة البيانات';
        signupError.classList.remove('hidden');
        return;
    }

    try {
        // Ensure user is authenticated anonymously
        if (window.firebase.auth && !window.firebase.auth.currentUser) {
            console.log('📝 Authenticating anonymously for signup...');
            try {
                await window.firebase.signInAnonymously(window.firebase.auth);
                console.log('✅ Anonymous authentication successful');
            } catch (authError) {
                console.error('❌ Anonymous authentication failed:', authError);
                signupError.textContent = 'خطأ في الاتصال بالخادم. تأكد من تفعيل Anonymous Authentication في Firebase';
                signupError.classList.remove('hidden');
                return;
            }
        }

        // Check if phone already exists in admins (from Firebase)
        const adminsRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
        const adminSnapshot = await window.firebase.get(adminsRef);

        if (adminSnapshot.exists()) {
            signupError.textContent = 'رقم الهاتف مسجل مسبقاً كخادم';
            signupError.classList.remove('hidden');
            return;
        }

        // Check if already has pending request
        const requestsRef = window.firebase.ref(window.firebase.database, 'signupRequests');
        const snapshot = await window.firebase.get(requestsRef);

        if (snapshot.exists()) {
            const requests = snapshot.val();
            if (requests[phone] && requests[phone].status === 'pending') {
                signupError.textContent = 'لديك طلب معلق بالفعل';
                signupError.classList.remove('hidden');
                return;
            }
        }

        // Create signup request
        const requestData = {
            name,
            phone,
            password,
            status: 'pending',
            requestedAt: new Date().toISOString()
        };

        console.log('📤 Saving signup request to Firebase:', requestData);
        const requestRef = window.firebase.ref(window.firebase.database, `signupRequests/${phone}`);
        await window.firebase.set(requestRef, requestData);
        console.log('✅ Signup request saved to Firebase successfully');

        // Send SMS notification to head admins
        await notifyHeadAdmins(name, phone);

        // Show success message
        signupSuccess.classList.remove('hidden');

        // Clear form
        document.getElementById('signupName').value = '';
        document.getElementById('signupPhone').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('signupConfirmPassword').value = '';

    } catch (error) {
        console.error('Error submitting signup request:', error);
        signupError.textContent = 'حدث خطأ، الرجاء المحاولة مرة أخرى';
        signupError.classList.remove('hidden');
    }
}

// Notify head admins about new signup request
async function notifyHeadAdmins(name, phone) {
    // Get all head admins
    const headAdmins = Object.values(adminsData).filter(admin => admin.isHeadAdmin);

    // Create notification message
    const message = `طلب انضمام جديد!\n\nالاسم: ${name}\nرقم الهاتف: ${phone}\n\nللمراجعة والموافقة، يرجى تسجيل الدخول إلى نظام تسجيل النقاط.`;

    // In a real implementation, you would integrate with an SMS service like Twilio
    // For now, we'll just log it
    console.log('📱 SMS Notification to head admins:');
    headAdmins.forEach(admin => {
        console.log(`  To: ${admin.phone} (${admin.name})`);
        console.log(`  Message: ${message}`);
        // TODO: Integrate with SMS service
        // await sendSMS(admin.phone, message);
    });
}

// Firebase synchronization functions
// Migrate old scans data to dailyScores format
// Old format: scans: { mass: "2024-02-07" } or scans: { mass: ["2024-02-07"] }
// New format: dailyScores: { "2024-02-07__mass": 1 }
function migrateScansToDaily(student) {
    if (!student.dailyScores) {
        student.dailyScores = {};
    }

    // Only migrate if student has old scans data and dailyScores is empty
    const scans = student.scans;
    if (!scans || Object.keys(student.dailyScores).length > 0) return;

    const scores = student.scores || {};
    Object.keys(scans).forEach(scoreType => {
        const val = scans[scoreType];
        // Handle string, array, or Firebase object format
        let dates = [];
        if (typeof val === 'string') {
            dates = [val];
        } else if (Array.isArray(val)) {
            dates = val;
        } else if (val && typeof val === 'object') {
            dates = Object.values(val);
        }

        dates.forEach(dateStr => {
            const dailyKey = `${dateStr}__${scoreType}`;
            if (student.dailyScores[dailyKey] === undefined) {
                // Use the total score for this type (best we can do for legacy data)
                student.dailyScores[dailyKey] = scores[scoreType] || 0;
            }
        });
    });
}


function initializeFirebaseSync() {
    console.log('🔄 initializeFirebaseSync called');
    if (!window.firebase) {
        console.log('❌ Firebase not available');
        return;
    }

    // ===== STUDENTS SYNC =====
    const studentsRef = window.firebase.ref(window.firebase.database, 'students');
    console.log('📡 Setting up Firebase listener for students data');

    // Listen for real-time updates
    const unsubscribeStudents = window.firebase.onValue(studentsRef, (snapshot) => {
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
                    } else {
                        // Existing student, merge carefully
                        const localDailyScores = studentsData[studentId].dailyScores || {};

                        // Always update scores and basic info from Firebase (source of truth)
                        studentsData[studentId].scores = newData[studentId].scores || {};
                        studentsData[studentId].name = newData[studentId].name;
                        studentsData[studentId].lastUpdated = newData[studentId].lastUpdated;
                        studentsData[studentId].lastUpdatedBy = newData[studentId].lastUpdatedBy;

                        // Merge dailyScores: local takes precedence (preserves pending writes)
                        studentsData[studentId].dailyScores = {
                            ...(newData[studentId].dailyScores || {}),
                            ...localDailyScores
                        };
                    }

                    // Migrate old scans format to dailyScores if needed
                    migrateScansToDaily(studentsData[studentId]);
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

    firebaseListeners.push(unsubscribeStudents);
    console.log('✅ Firebase students listener registered');

    // ===== QR CODES SYNC =====
    const qrCodesRef = window.firebase.ref(window.firebase.database, 'qrcodes');
    console.log('📡 Setting up Firebase listener for QR codes data');

    const unsubscribeQRCodes = window.firebase.onValue(qrCodesRef, (snapshot) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`📥 [${timestamp}] Firebase QR codes data received:`, snapshot.exists());
        if (snapshot.exists()) {
            const newData = snapshot.val() || {};
            const qrCount = Object.keys(newData).length;
            const previousCount = Object.keys(qrCodesData).length;

            console.log(`✅ [${timestamp}] QR codes data loaded from Firebase:`, qrCount, 'QR codes (was', previousCount, ')');

            // Check if data actually changed
            if (JSON.stringify(qrCodesData) !== JSON.stringify(newData)) {
                console.log('🔄 QR codes data changed, updating local qrCodesData');
                qrCodesData = newData;

                // Save to localStorage
                localStorage.setItem('qrCodesData', JSON.stringify(qrCodesData));

                // Update QR dashboard if it's currently visible
                if (!document.getElementById('qrSection').classList.contains('hidden')) {
                    console.log('📊 QR dashboard is visible, re-rendering table');
                    renderQRCodesTable();
                    populateFilterDropdowns();
                } else {
                    console.log('📱 QR dashboard not visible, skipping render');
                }
            } else {
                console.log('ℹ️ QR codes data unchanged, skipping update');
            }
        } else {
            qrCodesData = {};
            console.log('ℹ️ No QR codes data in Firebase yet');
        }
    }, (error) => {
        console.error('❌ Firebase QR codes sync error:', error);
    });

    firebaseListeners.push(unsubscribeQRCodes);
    console.log('✅ Firebase QR codes listener registered');

    // ===== SIGNUP REQUESTS SYNC =====
    const signupRequestsRef = window.firebase.ref(window.firebase.database, 'signupRequests');
    console.log('📡 Setting up Firebase listener for signup requests data');

    const unsubscribeSignupRequests = window.firebase.onValue(signupRequestsRef, (snapshot) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`📥 [${timestamp}] Firebase signup requests data received:`, snapshot.exists());

        if (snapshot.exists()) {
            const newData = snapshot.val() || {};
            const requestsCount = Object.keys(newData).length;
            const pendingCount = Object.values(newData).filter(req => req.status === 'pending').length;

            console.log(`✅ [${timestamp}] Signup requests loaded from Firebase:`, requestsCount, 'total (', pendingCount, 'pending)');

            // Update badge with pending count
            updateRequestsBadge(pendingCount);

            // Update signup requests section if it's currently visible
            if (isHeadAdmin() && !document.getElementById('signupRequestsSection').classList.contains('hidden')) {
                console.log('📊 Signup requests section is visible, re-rendering');
                renderPendingRequestsFromData(newData);
            } else {
                console.log('📱 Signup requests section not visible, skipping render');
            }
        } else {
            console.log('ℹ️ No signup requests in Firebase yet');
            updateRequestsBadge(0);
        }
    }, (error) => {
        console.error('❌ Firebase signup requests sync error:', error);
    });

    firebaseListeners.push(unsubscribeSignupRequests);
    console.log('✅ Firebase signup requests listener registered');

    // ===== TEAMS SYNC =====
    const teamsRef = window.firebase.ref(window.firebase.database, FIREBASE_PATHS.TEAMS);
    console.log('📡 Setting up Firebase listener for teams data');

    const unsubscribeTeams = window.firebase.onValue(teamsRef, (snapshot) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`📥 [${timestamp}] Firebase teams data received:`, snapshot.exists());

        if (snapshot.exists()) {
            teamsData = snapshot.val() || {};
            console.log(`✅ [${timestamp}] Teams loaded from Firebase:`, Object.keys(teamsData).length, 'teams');

            // Update dropdowns
            populateTeamDropdowns();

            // Render teams list if settings section is visible
            if (!document.getElementById('settingsSection').classList.contains('hidden')) {
                renderTeamsList();
            }
        } else {
            teamsData = {};
            console.log('ℹ️ No teams data in Firebase yet');
        }
    }, (error) => {
        console.error('❌ Firebase teams sync error:', error);
    });

    firebaseListeners.push(unsubscribeTeams);
    console.log('✅ Firebase teams listener registered');

    // ===== ACADEMIC YEARS SYNC =====
    const academicYearsRef = window.firebase.ref(window.firebase.database, FIREBASE_PATHS.ACADEMIC_YEARS);
    console.log('📡 Setting up Firebase listener for academic years data');

    const unsubscribeAcademicYears = window.firebase.onValue(academicYearsRef, (snapshot) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`📥 [${timestamp}] Firebase academic years data received:`, snapshot.exists());

        if (snapshot.exists()) {
            academicYearsData = snapshot.val() || {};
            console.log(`✅ [${timestamp}] Academic years loaded from Firebase:`, Object.keys(academicYearsData).length, 'years');

            // Update dropdowns
            populateAcademicYearDropdowns();

            // Render years list if settings section is visible
            if (!document.getElementById('settingsSection').classList.contains('hidden')) {
                renderAcademicYearsList();
            }
        } else {
            academicYearsData = {};
            console.log('ℹ️ No academic years data in Firebase yet');
        }
    }, (error) => {
        console.error('❌ Firebase academic years sync error:', error);
    });

    firebaseListeners.push(unsubscribeAcademicYears);
    console.log('✅ Firebase academic years listener registered');
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

    // Verify password (decrypt stored password and compare)
    const decryptedPassword = decryptPassword(admin.password);
    if (decryptedPassword !== password) {
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
    const adminNameDisplayEl = document.getElementById('adminNameDisplay');
    if (adminNameDisplayEl) adminNameDisplayEl.textContent = `${currentAdmin}`;

    // Update sidebar user info
    updateSidebarUserInfo();

    // Show "Signup Requests", "Manage Admins" and "Manage Score Types" tabs for head admin
    if (admin.isHeadAdmin) {
        document.getElementById('signupRequestsNavBtn').classList.remove('hidden');
        document.getElementById('manageAdminsNavBtn').classList.remove('hidden');
        document.getElementById('manageScoreTypesNavBtn').classList.remove('hidden');
        // Update badge count
        updateRequestsBadge();
    }

    // Update UI based on permissions
    updateUIBasedOnPermissions();

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
// Expose login function immediately
window.login = login;

// Attach login event listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.addEventListener('click', login);
    }
});

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

        // Verify stored password still matches (decrypt stored password and compare)
        const decryptedPassword = decryptPassword(admin.password);
        if (decryptedPassword === storedPassword) {
            // Auto-login
            currentAdmin = admin.name;
            currentAdminData = admin;

            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            const adminNameDisplayEl = document.getElementById('adminNameDisplay');
            if (adminNameDisplayEl) adminNameDisplayEl.textContent = `${currentAdmin}`;

            // Update sidebar user info
            updateSidebarUserInfo();

            // Show "Manage Admins" and "Manage Score Types" tabs for head admin
            if (admin.isHeadAdmin) {
                document.getElementById('manageAdminsNavBtn').classList.remove('hidden');
                document.getElementById('manageScoreTypesNavBtn').classList.remove('hidden');
            }

            // Update UI based on permissions
            updateUIBasedOnPermissions();

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

// QR Scanner functions - Custom Arabic UI with camera switching support
async function initializeQRScanner() {
    console.log('🔧 initializeQRScanner called');

    // Clear any existing scanner
    if (html5Qrcode && isScannerRunning) {
        console.log('🧹 Stopping existing scanner...');
        try {
            await html5Qrcode.stop();
            isScannerRunning = false;
        } catch (error) {
            console.log('ℹ️ Scanner already stopped:', error);
        }
    }

    // Check if container exists
    const container = document.getElementById('qr-reader');
    if (!container) {
        console.error('❌ QR reader container (#qr-reader) not found!');
        return;
    }

    console.log('✅ Container found, creating Arabic UI...');

    // Create custom Arabic UI
    container.innerHTML = `
        <div class="scanner-controls">
            <div class="scanner-control-row">
                <select id="cameraSelect" class="camera-dropdown" onchange="onCameraSelectChange()">
                    <option value="">جاري تحميل الكاميرات...</option>
                </select>
            </div>
            <div class="scanner-control-row">
                <button id="startScanBtn" onclick="startQRScanning()" class="scanner-btn start-btn">
                    <span>📷</span> بدء المسح
                </button>
                <button id="stopScanBtn" onclick="stopQRScanning()" class="scanner-btn stop-btn hidden">
                    <span>⏹️</span> إيقاف المسح
                </button>
                <button id="torchBtn" onclick="toggleTorch()" class="scanner-btn torch-btn hidden">
                    <span>🔦</span> الفلاش
                </button>
            </div>
            <div id="zoomControlRow" class="scanner-control-row hidden">
                <label for="zoomRange" class="zoom-label">🔍 التقريب</label>
                <input type="range" id="zoomRange" class="zoom-slider" min="1" max="5" step="0.1" value="1" oninput="onZoomChange(this.value)">
                <span id="zoomValue" class="zoom-value">1x</span>
            </div>
        </div>
        <div id="scanner-view" class="scanner-view-container"></div>
        <div id="scanner-status" class="scanner-status">اضغط "بدء المسح" لتشغيل الكاميرا</div>

        <div class="file-scan-section">
            <div class="file-scan-divider">
                <span>أو</span>
            </div>
            <div id="file-drop-zone" class="file-drop-zone" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleFileDrop(event)">
                <div class="file-drop-content">
                    <span class="file-drop-icon">📁</span>
                    <p class="file-drop-text">اسحب صورة QR هنا</p>
                    <p class="file-drop-hint">أو</p>
                    <label for="qrFileInput" class="file-select-btn">
                        <span>🖼️</span> اختر صورة
                    </label>
                    <input type="file" id="qrFileInput" accept="image/*" onchange="handleFileSelect(event)" hidden>
                </div>
            </div>
        </div>
    `;

    // Create Html5Qrcode instance
    html5Qrcode = new Html5Qrcode("scanner-view");

    // Get available cameras
    try {
        console.log('📷 Getting available cameras...');
        availableCameras = await Html5Qrcode.getCameras();
        console.log('✅ Found cameras:', availableCameras);
        populateCameraDropdown();

        // Auto-start scanning with back camera
        await startQRScanning();
    } catch (err) {
        console.error('❌ Error getting cameras:', err);
        updateScannerStatus('لا يمكن الوصول للكاميرا - يرجى السماح بالوصول', 'error');
        showNotification('لا يمكن الوصول للكاميرا', 'error');
    }
}

// Populate camera dropdown with available cameras - with descriptive Arabic names
function populateCameraDropdown() {
    const select = document.getElementById('cameraSelect');
    if (!select || availableCameras.length === 0) return;

    select.innerHTML = '';

    // Count cameras for sequential numbering
    let backCameraCount = 0;
    let frontCameraCount = 0;

    // Log raw camera labels for debugging
    console.log('📷 Available cameras:', availableCameras.map(c => ({ id: c.id, label: c.label })));

    availableCameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.id;

        const rawLabel = (camera.label || '').toLowerCase();
        let label = '';

        // Check if it's a front camera
        if (rawLabel.includes('front') || rawLabel.includes('user') || rawLabel.includes('face') || rawLabel.includes('selfie')) {
            frontCameraCount++;
            if (frontCameraCount > 1) {
                label = `🤳 الكاميرا الأمامية ${frontCameraCount}`;
            } else {
                label = `🤳 الكاميرا الأمامية`;
            }
        }
        // Check for ultra-wide camera
        else if (rawLabel.includes('ultrawide') || rawLabel.includes('ultra wide') || rawLabel.includes('ultra-wide') ||
                 rawLabel.includes('0.5x') || rawLabel.includes('0.6x') || rawLabel.includes('0.67x')) {
            label = `📷 فائقة العرض (Ultra-wide)`;
        }
        // Check for telephoto camera
        else if (rawLabel.includes('telephoto') || rawLabel.includes('tele') ||
                 rawLabel.includes('2x') || rawLabel.includes('3x') || rawLabel.includes('5x') || rawLabel.includes('10x')) {
            label = `🔭 التقريب (Telephoto)`;
        }
        // Check for macro camera
        else if (rawLabel.includes('macro')) {
            label = `🔬 ماكرو (Macro)`;
        }
        // Check for main/wide camera
        else if (rawLabel.includes('main') || (rawLabel.includes('wide') && !rawLabel.includes('ultra')) || rawLabel.includes('1x')) {
            label = `📱 الرئيسية (Main)`;
        }
        // Back camera without specific type - use sequential numbering
        else if (rawLabel.includes('back') || rawLabel.includes('rear') || rawLabel.includes('environment') ||
                 rawLabel.match(/camera\s*[0-3]/)) {
            backCameraCount++;
            const arabicNum = ['١', '٢', '٣', '٤', '٥'][backCameraCount - 1] || backCameraCount;
            label = `📱 الكاميرا الخلفية ${arabicNum}`;
        }
        // Unknown camera with label - show original label
        else if (camera.label) {
            backCameraCount++;
            const arabicNum = ['١', '٢', '٣', '٤', '٥'][backCameraCount - 1] || backCameraCount;
            label = `📷 كاميرا ${arabicNum} (${camera.label})`;
        }
        // Unknown camera without label
        else {
            label = `📷 كاميرا ${index + 1}`;
        }

        option.textContent = label;
        select.appendChild(option);
    });

    // Select the best default camera
    selectDefaultCamera();
}

// Select the best camera for QR scanning (main back camera preferred)
function selectDefaultCamera() {
    const select = document.getElementById('cameraSelect');
    if (!select || availableCameras.length === 0) return;

    // Priority 1: Main/wide back camera (best for QR scanning)
    let selectedCamera = availableCameras.find(cam => {
        const label = (cam.label || '').toLowerCase();
        return (label.includes('main') || (label.includes('wide') && !label.includes('ultra')) || label.includes('1x')) &&
               !label.includes('front') && !label.includes('user');
    });

    // Priority 2: First back camera that's not ultra-wide
    if (!selectedCamera) {
        selectedCamera = availableCameras.find(cam => {
            const label = (cam.label || '').toLowerCase();
            return (label.includes('back') || label.includes('rear') || label.includes('environment')) &&
                   !label.includes('ultrawide') && !label.includes('ultra wide') && !label.includes('0.5') && !label.includes('0.6');
        });
    }

    // Priority 3: Any back camera
    if (!selectedCamera) {
        selectedCamera = availableCameras.find(cam => {
            const label = (cam.label || '').toLowerCase();
            return label.includes('back') || label.includes('rear') || label.includes('environment');
        });
    }

    // Priority 4: First available camera
    if (!selectedCamera && availableCameras.length > 0) {
        selectedCamera = availableCameras[0];
    }

    if (selectedCamera) {
        select.value = selectedCamera.id;
        currentCameraId = selectedCamera.id;
        console.log('📷 Default camera selected:', selectedCamera.label || selectedCamera.id);
    }
}

// Handle camera selection change
async function onCameraSelectChange() {
    const select = document.getElementById('cameraSelect');
    if (!select) return;

    const newCameraId = select.value;
    if (newCameraId && newCameraId !== currentCameraId) {
        currentCameraId = newCameraId;

        // If scanner is running, switch camera seamlessly
        if (isScannerRunning) {
            updateScannerStatus('جاري تبديل الكاميرا...', 'loading');
            try {
                await html5Qrcode.stop();
                isScannerRunning = false;
                await startQRScanning();
            } catch (error) {
                console.error('Error switching camera:', error);
                updateScannerStatus('خطأ في تبديل الكاميرا', 'error');
            }
        }
    }
}

// Start QR scanning
async function startQRScanning() {
    if (!html5Qrcode) {
        console.error('Scanner not initialized');
        return;
    }

    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const torchBtn = document.getElementById('torchBtn');

    try {
        updateScannerStatus('جاري تشغيل الكاميرا...', 'loading');

        // Use selected camera or default to back camera
        const cameraConfig = currentCameraId || { facingMode: "environment" };

        await html5Qrcode.start(
            cameraConfig,
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            },
            onScanSuccess,
            onScanFailure
        );

        isScannerRunning = true;

        // Update UI
        if (startBtn) startBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.remove('hidden');

        // Show torch button if supported
        try {
            const torchSupported = await html5Qrcode.getRunningTrackCameraCapabilities().torchFeature?.isSupported();
            if (torchSupported && torchBtn) {
                torchBtn.classList.remove('hidden');
            }
        } catch (e) {
            // Torch not supported, keep button hidden
        }

        // Apply continuous autofocus and show zoom controls if supported
        try {
            const videoTrack = html5Qrcode.getRunningTrackCameraCapabilities();

            // Try to get the underlying MediaStreamTrack for advanced constraints
            const scannerState = html5Qrcode.getState();
            if (scannerState === 2) { // SCANNING state
                const videoElement = document.querySelector('#scanner-view video');
                if (videoElement && videoElement.srcObject) {
                    const track = videoElement.srcObject.getVideoTracks()[0];
                    if (track) {
                        const capabilities = track.getCapabilities();

                        // Apply continuous autofocus if supported
                        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                            await track.applyConstraints({
                                advanced: [{ focusMode: 'continuous' }]
                            });
                            console.log('✅ Continuous autofocus enabled');
                        }

                        // Show zoom slider if supported
                        if (capabilities.zoom) {
                            const zoomControlRow = document.getElementById('zoomControlRow');
                            const zoomRange = document.getElementById('zoomRange');
                            if (zoomControlRow && zoomRange) {
                                zoomRange.min = capabilities.zoom.min;
                                zoomRange.max = capabilities.zoom.max;
                                zoomRange.step = capabilities.zoom.step || 0.1;
                                zoomRange.value = capabilities.zoom.min;
                                zoomControlRow.classList.remove('hidden');
                                document.getElementById('zoomValue').textContent = `${capabilities.zoom.min}x`;
                            }
                            console.log('✅ Zoom control enabled:', capabilities.zoom);
                        }
                    }
                }
            }
        } catch (e) {
            console.log('ℹ️ Advanced camera features not available:', e.message);
        }

        updateScannerStatus('جاري المسح... وجّه الكاميرا نحو رمز QR', 'scanning');
        console.log('✅ Scanner started successfully');

    } catch (error) {
        console.error('❌ Error starting scanner:', error);
        isScannerRunning = false;

        if (error.toString().includes('Permission')) {
            updateScannerStatus('تم رفض إذن الكاميرا - يرجى السماح بالوصول', 'error');
            showNotification('يرجى السماح بالوصول للكاميرا', 'error');
        } else {
            updateScannerStatus('خطأ في تشغيل الكاميرا', 'error');
            showNotification('خطأ في تشغيل الكاميرا', 'error');
        }
    }
}

// Stop QR scanning
async function stopQRScanning() {
    if (!html5Qrcode || !isScannerRunning) return;

    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const torchBtn = document.getElementById('torchBtn');

    try {
        await html5Qrcode.stop();
        isScannerRunning = false;

        // Update UI
        if (startBtn) startBtn.classList.remove('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (torchBtn) torchBtn.classList.add('hidden');
        const zoomControlRow = document.getElementById('zoomControlRow');
        if (zoomControlRow) zoomControlRow.classList.add('hidden');

        updateScannerStatus('تم إيقاف المسح - اضغط "بدء المسح" للاستئناف', 'stopped');
        console.log('✅ Scanner stopped');

    } catch (error) {
        console.error('Error stopping scanner:', error);
    }
}

// Toggle torch/flashlight
async function toggleTorch() {
    if (!html5Qrcode || !isScannerRunning) return;

    try {
        const capabilities = html5Qrcode.getRunningTrackCameraCapabilities();
        if (capabilities && capabilities.torchFeature) {
            const currentState = capabilities.torchFeature.value();
            await capabilities.torchFeature.apply(!currentState);

            const torchBtn = document.getElementById('torchBtn');
            if (torchBtn) {
                torchBtn.classList.toggle('torch-active', !currentState);
            }
        }
    } catch (error) {
        console.error('Error toggling torch:', error);
    }
}

// Handle zoom slider change
async function onZoomChange(value) {
    if (!html5Qrcode || !isScannerRunning) return;

    try {
        const videoElement = document.querySelector('#scanner-view video');
        if (videoElement && videoElement.srcObject) {
            const track = videoElement.srcObject.getVideoTracks()[0];
            if (track) {
                await track.applyConstraints({
                    advanced: [{ zoom: parseFloat(value) }]
                });
                const zoomValueEl = document.getElementById('zoomValue');
                if (zoomValueEl) {
                    zoomValueEl.textContent = `${parseFloat(value).toFixed(1)}x`;
                }
            }
        }
    } catch (error) {
        console.error('Error applying zoom:', error);
    }
}

// Update scanner status message
function updateScannerStatus(message, type) {
    const statusEl = document.getElementById('scanner-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'scanner-status';

    if (type) {
        statusEl.classList.add(`status-${type}`);
    }
}

// Resume scanner after action (helper function)
async function resumeScanner() {
    if (html5Qrcode && !isScannerRunning) {
        try {
            await startQRScanning();
        } catch (error) {
            console.log('Error resuming scanner:', error);
        }
    } else if (html5QrcodeScanner) {
        // Fallback for old implementation
        try {
            html5QrcodeScanner.resume();
        } catch (error) {
            console.log('Error resuming old scanner:', error);
        }
    }
}

// File scanning functions
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = document.getElementById('file-drop-zone');
    if (dropZone) {
        dropZone.classList.add('drag-over');
    }
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = document.getElementById('file-drop-zone');
    if (dropZone) {
        dropZone.classList.remove('drag-over');
    }
}

async function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const dropZone = document.getElementById('file-drop-zone');
    if (dropZone) {
        dropZone.classList.remove('drag-over');
    }

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
        await scanFileForQR(files[0]);
    }
}

async function handleFileSelect(event) {
    const files = event.target?.files;
    if (files && files.length > 0) {
        await scanFileForQR(files[0]);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
}

async function scanFileForQR(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showNotification('يرجى اختيار ملف صورة', 'error');
        return;
    }

    updateScannerStatus('جاري مسح الصورة...', 'loading');

    try {
        // Stop camera scanner if running to avoid conflicts
        if (html5Qrcode && isScannerRunning) {
            await html5Qrcode.stop();
            isScannerRunning = false;

            // Update UI buttons
            const startBtn = document.getElementById('startScanBtn');
            const stopBtn = document.getElementById('stopScanBtn');
            const torchBtn = document.getElementById('torchBtn');
            if (startBtn) startBtn.classList.remove('hidden');
            if (stopBtn) stopBtn.classList.add('hidden');
            if (torchBtn) torchBtn.classList.add('hidden');
            const zoomCtrl = document.getElementById('zoomControlRow');
            if (zoomCtrl) zoomCtrl.classList.add('hidden');
        }

        // Create a temporary Html5Qrcode instance for file scanning if needed
        if (!html5Qrcode) {
            html5Qrcode = new Html5Qrcode("scanner-view");
        }

        // Scan the file
        const result = await html5Qrcode.scanFile(file, true);

        console.log('📄 File scan result:', result);
        updateScannerStatus('تم مسح الصورة بنجاح!', 'success');

        // Process the result using the same handler as camera scan
        await onScanSuccess(result, { result: { format: 'FILE' } });

    } catch (error) {
        console.error('❌ File scan error:', error);

        if (error.toString().includes('No QR code found')) {
            updateScannerStatus('لم يتم العثور على رمز QR في الصورة', 'error');
            showNotification('لم يتم العثور على رمز QR في الصورة', 'error');
        } else {
            updateScannerStatus('خطأ في مسح الصورة', 'error');
            showNotification('خطأ في مسح الصورة', 'error');
        }
    }
}

// Store scanned QR data temporarily
let scannedQRData = null;

async function onScanSuccess(decodedText, decodedResult) {
    console.log('═══════════════════════════════════════');
    console.log('🔍 QR SCAN DETECTED');
    console.log(`📝 Raw text: "${decodedText}"`);
    console.log(`📏 Length: ${decodedText.length}`);
    console.log(`🔢 Character codes:`, Array.from(decodedText).map(c => c.charCodeAt(0)));
    console.log(`📱 Scan source:`, decodedResult?.result?.format || 'unknown');
    console.log(`🎯 Full result object:`, decodedResult);
    console.log('═══════════════════════════════════════');

    // Check permission
    if (!canModifyDashboard()) {
        showNotification('ليس لديك صلاحية لإضافة نقاط', 'error');
        return;
    }

    // Validate that we have actual content
    if (!decodedText || decodedText.trim() === '') {
        console.error('❌ Empty QR code scanned!');
        console.error('DecodedResult:', decodedResult);
        showNotification('⚠️ رمز QR فارغ - لا يحتوي على أي بيانات. يرجى التأكد من جودة الصورة أو طباعة QR جديد.', 'error');

        // Resume scanner - don't auto-resume on empty QR, let user manually restart
        return;
    }

    // Stop scanning temporarily
    if (html5Qrcode && isScannerRunning) {
        try {
            await html5Qrcode.stop();
            isScannerRunning = false;
            updateScannerStatus('تم مسح رمز QR بنجاح', 'success');
        } catch (error) {
            console.log('Note: Scanner stop skipped:', error.message);
        }
    } else if (html5QrcodeScanner) {
        // Fallback for old implementation
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Note: Scanner pause skipped:', error.message);
        }
    }

    // Extract student name from QR code
    // Support both old format (name|year|phone|team) and new format (name only)
    let studentName = decodedText.trim();

    if (decodedText.includes('|')) {
        // Old format: extract name from pipe-delimited string
        const parts = decodedText.split('|');
        studentName = parts[0] || decodedText.trim();
    }

    // Clean the scanned name: remove special characters
    const cleanedScannedName = studentName
        .replace(/\?/g, ' ')           // Replace ? with space
        .replace(/[^\u0600-\u06FF\s\w]/g, ' ')  // Remove non-Arabic, non-alphanumeric except spaces
        .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
        .trim();

    console.log('Scanned student name (original):', studentName);
    console.log('Scanned student name (cleaned):', cleanedScannedName);

    // Validate that we have a name
    if (!cleanedScannedName || cleanedScannedName.length === 0) {
        console.error('Empty or invalid name after cleaning');
        showNotification('⚠️ رمز QR غير صالح - الاسم فارغ أو يحتوي على أحرف خاصة فقط', 'error');
        // Resume scanner
        await resumeScanner();
        return;
    }

    // Look up student data in qrCodesData (exact match required after cleaning)
    // First try exact match
    let qrRecord = Object.values(qrCodesData).find(qr =>
        qr.name && qr.name === cleanedScannedName
    );

    // If no exact match found, try case-insensitive match as fallback
    if (!qrRecord) {
        qrRecord = Object.values(qrCodesData).find(qr =>
            qr.name && qr.name.toLowerCase().trim() === cleanedScannedName.toLowerCase().trim()
        );

        // If found via case-insensitive match, warn that it doesn't match exactly
        if (qrRecord) {
            console.warn(`⚠️ QR scanned name "${cleanedScannedName}" doesn't exactly match database name "${qrRecord.name}"`);
            showNotification(`⚠️ تحذير: الاسم الممسوح "${cleanedScannedName}" لا يطابق تماماً الاسم المسجل "${qrRecord.name}". يرجى استخدام QR صحيح.`, 'warning');
            // Resume scanner
            await resumeScanner();
            return;
        }
    }

    let additionalInfo = '';
    let isNewRecord = false;
    let displayName = cleanedScannedName; // Default to cleaned scanned name

    if (qrRecord) {
        // Existing record - use data from database
        console.log('Found existing QR record:', qrRecord);
        scannedQRData = qrRecord;

        // Use the name from database record (clean, no encoding issues)
        displayName = qrRecord.name || cleanedScannedName;

        // Build info string from database record
        const infoParts = [];
        if (qrRecord.academicYear) infoParts.push(`السنة: ${qrRecord.academicYear}`);
        if (qrRecord.phone) infoParts.push(`الهاتف: ${qrRecord.phone}`);
        if (qrRecord.team) infoParts.push(`الفريق: ${qrRecord.team}`);
        if (qrRecord.teamResponsible) infoParts.push(`المسؤول: ${qrRecord.teamResponsible}`);
        additionalInfo = infoParts.length > 0 ? ` (${infoParts.join(', ')})` : '';
    } else {
        // New QR code not in system - create record automatically
        console.log('QR not found in system, creating new record with cleaned name:', cleanedScannedName);
        isNewRecord = true;

        const qrId = sanitizeFirebaseKey(cleanedScannedName) + '_' + Date.now();
        const newQRData = {
            name: cleanedScannedName,
            academicYear: '',
            phone: '',
            team: '',
            createdAt: new Date().toISOString(),
            createdBy: currentAdmin
        };

        // Add to local data
        qrCodesData[qrId] = newQRData;
        scannedQRData = newQRData;

        // Save to Firebase
        await saveQRCodesToFirebase(qrId, newQRData);

        console.log('Created new QR record:', qrId, newQRData);
        additionalInfo = ' (جديد - لم يتم تسجيل البيانات بعد)';

        // Update filter dropdowns and table
        populateFilterDropdowns();
        renderQRCodesTable();
    }

    // Show scoring form as modal popup
    showScoringModal(displayName, additionalInfo, isNewRecord);
}

function onScanFailure(error) {
    // Silently handle scan failures
    console.log(`QR Code scan error: ${error}`);
}

// Show scoring modal dialog
function showScoringModal(displayName, additionalInfo, isNewRecord) {
    console.log('📋 Showing scoring modal for:', displayName);

    // Scanner is already stopped in onScanSuccess, no need to pause again

    // Populate form fields
    document.getElementById('studentName').value = displayName;
    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '1';

    // Create modal overlay if it doesn't exist
    let modalOverlay = document.getElementById('scoringModalOverlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'scoringModalOverlay';
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML = `
            <div class="modal-container scoring-modal-container" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>⭐ إضافة نقاط للمخدوم</h3>
                    <button class="modal-close-btn" onclick="closeScoringModal()">✖️</button>
                </div>
                <div class="modal-body" id="scoringModalBody">
                    <!-- Form fields will be moved here -->
                </div>
                <div class="modal-footer scoring-modal-footer" id="scoringModalFooter">
                    <!-- Buttons will be moved here -->
                </div>
            </div>
        `;
        modalOverlay.onclick = closeScoringModal;
        document.body.appendChild(modalOverlay);
    }

    // Move scoring form fields into modal body and buttons into modal footer
    const scoringFormFields = document.getElementById('scoringFormFields');
    const scoringFormButtons = document.getElementById('scoringFormButtons');
    const modalBody = document.getElementById('scoringModalBody');
    const modalFooter = document.getElementById('scoringModalFooter');

    if (scoringFormFields && modalBody) {
        modalBody.innerHTML = '';
        modalBody.appendChild(scoringFormFields);
    }

    if (scoringFormButtons && modalFooter) {
        modalFooter.innerHTML = '';
        modalFooter.appendChild(scoringFormButtons);
    }

    // Show the form container
    const scoringForm = document.getElementById('scoringForm');
    if (scoringForm) {
        scoringForm.classList.remove('hidden');
    }

    // Show modal
    modalOverlay.classList.add('active');

    // Show notification message
    const message = isNewRecord
        ? `✨ تم إضافة المخدوم: ${displayName} - يمكنك الآن اختيار نوع النشاط`
        : `📋 اسم المخدوم: ${displayName}${additionalInfo}`;

    showNotification(message, 'success');
}

// Close scoring modal
function closeScoringModal() {
    const modalOverlay = document.getElementById('scoringModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');

        // Move form elements back to original location after animation
        setTimeout(() => {
            const scoringForm = document.getElementById('scoringForm');
            const scoringFormFields = document.getElementById('scoringFormFields');
            const scoringFormButtons = document.getElementById('scoringFormButtons');
            const scannerSection = document.getElementById('scannerSection');

            if (scoringForm && scannerSection) {
                // Move fields and buttons back into the form container
                if (scoringFormFields) {
                    scoringForm.appendChild(scoringFormFields);
                }
                if (scoringFormButtons) {
                    scoringForm.appendChild(scoringFormButtons);
                }
                scoringForm.classList.add('hidden');
                scannerSection.appendChild(scoringForm);
            }

            // Remove the modal overlay completely to prevent issues
            modalOverlay.remove();
        }, 300);
    }

    // Resume scanner
    resumeScanner();

    // Clear scanned QR data
    scannedQRData = null;
}

// Scoring functions
async function submitScore(addAnother = false) {
    console.log('🎯 submitScore called, addAnother:', addAnother);
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
            teamResponsible: scannedQRData?.teamResponsible || '',
            scores: {},
            dailyScores: {},
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };
    } else {
        // CRITICAL FIX: Always update academic year and team from scanned QR data
        // This ensures records dashboard shows updated data after QR edit and re-scan
        if (scannedQRData) {
            // Update if QR has data (even if student record already has data)
            if (scannedQRData.academicYear) {
                studentsData[studentId].academicYear = scannedQRData.academicYear;
            }
            if (scannedQRData.team) {
                studentsData[studentId].team = scannedQRData.team;
            }
            if (scannedQRData.teamResponsible) {
                studentsData[studentId].teamResponsible = scannedQRData.teamResponsible;
            }
        }
    }

    // Initialize dailyScores if not exists
    // dailyScores is a flat object: { "2024-02-07__mass": 1, "2024-02-08__lesson": 2 }
    // This format is Firebase-safe (no arrays, no nesting issues)
    if (!studentsData[studentId].dailyScores) {
        studentsData[studentId].dailyScores = {};
    }

    // Check if this score type was already scanned today
    const scoreTypeConfig = SCORE_TYPES[scoreType];
    const dailyKey = `${today}__${scoreType}`;
    if (scoreTypeConfig && !scoreTypeConfig.allowMultiplePerDay) {
        if (studentsData[studentId].dailyScores[dailyKey] !== undefined) {
            showNotification(`⚠️ تم تسجيل "${scoreTypeConfig.label}" لهذا المخدوم اليوم بالفعل. لا يمكن التسجيل أكثر من مرة في اليوم الواحد.`, 'error');
            return;
        }
    }

    // Record this day's score in dailyScores (for per-day dashboard grouping)
    if (studentsData[studentId].dailyScores[dailyKey]) {
        studentsData[studentId].dailyScores[dailyKey] += score;
    } else {
        studentsData[studentId].dailyScores[dailyKey] = score;
    }

    // Add the new score (accumulate total if already exists)
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

    // Update filter dropdowns (in case new team/year was added from QR scan)
    populateFilterDropdowns();

    if (addAnother) {
        // Keep the form open with same student data, just reset score type and points
        document.getElementById('scoreType').value = '';
        document.getElementById('score').value = '1';
        // Keep studentName as is for adding more scores to the same student
    } else {
        // Reset form and close modal
        closeScoringModal();

        // Clear form after a short delay
        setTimeout(() => {
            document.getElementById('studentName').value = '';
            document.getElementById('scoreType').value = '';
            document.getElementById('score').value = '1';
        }, 350);
    }
}

function cancelScoring() {
    // Close modal and resume scanning
    closeScoringModal();
}

// Handle score type selection change - auto-fill score with default points
function onScoreTypeChange() {
    const scoreTypeSelect = document.getElementById('scoreType');
    const scoreInput = document.getElementById('score');

    if (!scoreTypeSelect || !scoreInput) return;

    const selectedTypeId = scoreTypeSelect.value;
    if (selectedTypeId && SCORE_TYPES[selectedTypeId]) {
        const defaultPoints = SCORE_TYPES[selectedTypeId].points !== undefined ? SCORE_TYPES[selectedTypeId].points : 1;
        scoreInput.value = defaultPoints;
        console.log('🔄 Auto-filled score with default points:', defaultPoints, 'for type:', selectedTypeId);
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
    if (!tableContainer) {
        console.error('❌ scoresTable container not found');
        return;
    }

    const dataToRender = filteredData || studentsData;

    // Safety check - if no score types configured yet
    if (!ALL_SCORE_TYPE_IDS || ALL_SCORE_TYPE_IDS.length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">جاري تحميل أنواع النقاط...</p>';
        return;
    }

    if (Object.keys(dataToRender).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
        return;
    }

    // Arabic day names
    const arabicDayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    // Group students by date using dailyScores
    // dailyScores format: { "2024-02-07__mass": 1, "2024-02-08__lesson": 2 }
    const groupedByDate = {};
    Object.entries(dataToRender).forEach(([studentId, student]) => {
        const dailyScores = student.dailyScores || {};
        const dailyKeys = Object.keys(dailyScores);

        if (dailyKeys.length > 0) {
            // Build per-date score maps from dailyScores keys
            const dateScoreMap = {}; // { "2024-02-07": { mass: 1 }, "2024-02-08": { lesson: 2 } }
            dailyKeys.forEach(key => {
                const separatorIndex = key.indexOf('__');
                if (separatorIndex === -1) return;
                const dateStr = key.substring(0, separatorIndex);
                const scoreType = key.substring(separatorIndex + 2);
                if (!dateScoreMap[dateStr]) {
                    dateScoreMap[dateStr] = {};
                }
                dateScoreMap[dateStr][scoreType] = dailyScores[key];
            });

            // Create a row per date
            Object.keys(dateScoreMap).forEach(dateStr => {
                if (!groupedByDate[dateStr]) {
                    groupedByDate[dateStr] = [];
                }
                groupedByDate[dateStr].push({
                    studentId,
                    student: {
                        ...student,
                        scores: dateScoreMap[dateStr],
                        lastUpdated: student.lastUpdated,
                        lastUpdatedBy: student.lastUpdatedBy
                    }
                });
            });
        } else {
            // No dailyScores yet (legacy data) - fall back to lastUpdated
            let dateStr = 'unknown';
            if (student.lastUpdated) {
                if (typeof student.lastUpdated === 'string') {
                    dateStr = student.lastUpdated.split('T')[0];
                } else if (typeof student.lastUpdated === 'number') {
                    dateStr = new Date(student.lastUpdated).toISOString().split('T')[0];
                } else {
                    try {
                        dateStr = new Date(student.lastUpdated).toISOString().split('T')[0];
                    } catch (e) {
                        dateStr = 'unknown';
                    }
                }
            }
            if (!groupedByDate[dateStr]) {
                groupedByDate[dateStr] = [];
            }
            groupedByDate[dateStr].push({ studentId, student });
        }
    });

    // Sort dates in descending order (newest first)
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

    let tableHTML = '<div class="table-scroll-hint">← اسحب للمشاهدة ←</div>';

    // When a filter/search is active, show each student's accumulated total grade
    const isFiltered = filteredData !== null;
    if (isFiltered) {
        const uniqueStudents = Object.entries(dataToRender);
        if (uniqueStudents.length > 0) {
            const scoreTypeHeaders = ALL_SCORE_TYPE_IDS.map(typeId => {
                const scoreType = SCORE_TYPES[typeId];
                return `<th>${scoreType ? scoreType.label : typeId}</th>`;
            }).join('');

            let summaryRows = '';
            // Sort by total descending
            const withTotals = uniqueStudents.map(([id, student]) => {
                const fullStudent = studentsData[id] || student;
                let total = 0;
                ALL_SCORE_TYPE_IDS.forEach(typeId => { total += fullStudent.scores?.[typeId] || 0; });
                return { id, student: fullStudent, total };
            }).sort((a, b) => b.total - a.total);

            withTotals.forEach(({ id, student, total }, index) => {
                const teamColor = getTeamColor(student.team);
                const rowStyle = teamColor
                    ? `border-right: 6px solid ${teamColor}; background: linear-gradient(90deg, ${teamColor}20 0%, transparent 40%);`
                    : '';
                const scoreCells = ALL_SCORE_TYPE_IDS.map(typeId => {
                    const score = student.scores?.[typeId];
                    return score !== undefined ? `<td>${score}</td>` : '<td>-</td>';
                }).join('');
                const rank = index + 1;
                const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
                summaryRows += `
                    <tr style="${rowStyle}">
                        <td><strong>${rankBadge}</strong></td>
                        <td><strong>${student.name}</strong></td>
                        <td>${student.team || '-'}</td>
                        ${scoreCells}
                        <td class="total-column"><strong>${total}</strong></td>
                    </tr>
                `;
            });

            tableHTML += `
                <div class="search-summary-section">
                    <div class="date-section-header" style="margin-bottom:0;border-radius:8px 8px 0 0;">
                        <span class="date-title">📊 إجمالي نقاط المخدومين (${uniqueStudents.length} مخدوم)</span>
                    </div>
                    <div class="date-section-content">
                        <table class="scores-data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>الاسم</th>
                                    <th>الفريق</th>
                                    ${scoreTypeHeaders}
                                    <th class="total-column">الإجمالي الكلي</th>
                                </tr>
                            </thead>
                            <tbody>${summaryRows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    }

    // Render each date group
    sortedDates.forEach(dateStr => {
        const students = groupedByDate[dateStr];

        // Format date header
        let dateHeader = dateStr;
        if (dateStr !== 'unknown') {
            const dateObj = new Date(dateStr);
            const dayName = arabicDayNames[dateObj.getDay()];
            const formattedDate = dateObj.toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            dateHeader = `${dayName} - ${formattedDate}`;

            // Check if it's today
            const today = new Date().toISOString().split('T')[0];
            if (dateStr === today) {
                dateHeader = `📅 اليوم - ${dateHeader}`;
            }
        } else {
            dateHeader = '📅 تاريخ غير محدد';
        }

        // Generate score type headers safely
        const scoreTypeHeaders = ALL_SCORE_TYPE_IDS.map(typeId => {
            const scoreType = SCORE_TYPES[typeId];
            return `<th>${scoreType ? scoreType.label : typeId}</th>`;
        }).join('');

        tableHTML += `
            <div class="date-section">
                <div class="date-section-header">
                    <span class="date-title">${dateHeader}</span>
                    <span class="date-count">${students.length} سجل</span>
                </div>
                <div class="date-section-content">
                    <table class="scores-data-table">
                        <thead>
                            <tr>
                                <th>الاسم</th>
                                <th>السنة</th>
                                <th>الفريق</th>
                                ${scoreTypeHeaders}
                                <th class="total-column">المجموع</th>
                                <th class="col-hide-mobile">الوقت</th>
                                <th class="col-hide-mobile">الخادم</th>
                                <th>تعديل</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Add student rows for this date
        students.forEach(({ studentId, student }) => {
            let total = 0;
            const scoresCells = ALL_SCORE_TYPE_IDS.map(typeId => {
                const score = student.scores?.[typeId];
                if (score !== undefined) {
                    total += score;
                    return `<td>${score}</td>`;
                }
                return '<td>-</td>';
            }).join('');

            // Format time only (not full date since it's in the header)
            const timeOnly = student.lastUpdated ? formatTimeOnly(student.lastUpdated) : '-';

            // Get team color for row styling
            const teamColor = getTeamColor(student.team);
            const rowStyle = teamColor
                ? `border-right: 10px solid ${teamColor}; background: linear-gradient(90deg, ${teamColor}20 0%, transparent 40%);`
                : '';

            tableHTML += `
                <tr style="${rowStyle}">
                    <td><strong>${student.name}</strong></td>
                    <td>${student.academicYear || '-'}</td>
                    <td>${student.team || '-'}</td>
                    ${scoresCells}
                    <td class="total-column"><strong>${total}</strong></td>
                    <td class="col-hide-mobile">${timeOnly}</td>
                    <td class="col-hide-mobile">${student.lastUpdatedBy || 'غير معروف'}</td>
                    <td><button onclick="editStudentRow('${studentId}', '${dateStr}')" class="edit-row-btn action-btn edit-btn">✏️</button></td>
                </tr>
            `;
        });

        tableHTML += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    tableContainer.innerHTML = tableHTML;
}

// Format time only from ISO string
function formatTimeOnly(isoString) {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return '-';
    }
}

// Edit student row function - dateStr indicates which day's row was clicked
async function editStudentRow(studentId, dateStr) {
    const student = studentsData[studentId];
    if (!student) {
        showNotification('المخدوم غير موجود', 'error');
        return;
    }

    // Build academic year options
    let yearOptions = '<option value="">اختر السنة الدراسية</option>';
    let yearMatchFound = false;
    Object.values(academicYearsData).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(year => {
        const selected = year.name === student.academicYear ? 'selected' : '';
        if (selected) yearMatchFound = true;
        yearOptions += `<option value="${year.name}" ${selected}>${year.name}</option>`;
    });
    yearOptions += '<option value="__custom__">مخصص...</option>';

    // Build team options
    let teamOptions = '<option value="">اختر الفريق</option>';
    Object.values(teamsData).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(team => {
        const selected = team.name === student.team ? 'selected' : '';
        teamOptions += `<option value="${team.name}" ${selected}>${team.name}</option>`;
    });

    // Check if current year value is custom (not in configured lists)
    const isYearCustom = student.academicYear && !yearMatchFound;

    // Get this day's scores from dailyScores
    const dailyScores = student.dailyScores || {};
    const dayScores = {};
    Object.keys(dailyScores).forEach(key => {
        if (key.startsWith(dateStr + '__')) {
            const scoreType = key.substring(dateStr.length + 2);
            dayScores[scoreType] = dailyScores[key];
        }
    });

    // Count how many days this student has records
    const allDates = new Set();
    Object.keys(dailyScores).forEach(key => {
        const sep = key.indexOf('__');
        if (sep !== -1) allDates.add(key.substring(0, sep));
    });
    const hasMultipleDays = allDates.size > 1;

    // Create edit dialog content with modal structure
    let scoreFieldsHTML = '';
    ALL_SCORE_TYPE_IDS.forEach(typeId => {
        // Show this day's score (not the total)
        const currentScore = dayScores[typeId] || 0;
        scoreFieldsHTML += `
            <div class="form-group">
                <label>${SCORE_TYPES[typeId].label}:</label>
                <input type="number" id="editScore_${typeId}" value="${currentScore}" min="0" max="1000">
            </div>
        `;
    });

    // Format date for display
    let dateDisplay = dateStr;
    if (dateStr && dateStr !== 'unknown') {
        try {
            const arabicDayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const dateObj = new Date(dateStr);
            const dayName = arabicDayNames[dateObj.getDay()];
            dateDisplay = `${dayName} - ${dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        } catch (e) { /* keep raw dateStr */ }
    }

    // Delete button: if multiple days, only delete this day. If single day, delete entire student.
    const deleteButtonHTML = hasMultipleDays
        ? `<button onclick="deleteDayRecord('${studentId}', '${dateStr}')" class="delete-btn">🗑️ حذف</button>`
        : `<button onclick="deleteStudent('${studentId}')" class="delete-btn">🗑️ حذف</button>`;

    let dialogHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>✏️ تعديل بيانات ${student.name}</h3>
                <small style="color: var(--text-secondary); display: block; margin-top: 4px;">📅 ${dateDisplay}</small>
                <button onclick="closeEditDialog()" class="modal-close-btn">✖️</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>اسم المخدوم:</label>
                    <input type="text" id="editStudentName" value="${student.name}">
                </div>
                <div class="form-group">
                    <label>السنة الدراسية:</label>
                    <select id="editStudentAcademicYearSelect" onchange="onEditStudentAcademicYearSelectChange()">
                        ${yearOptions}
                    </select>
                    <input type="text" id="editStudentAcademicYearCustom" value="${isYearCustom ? student.academicYear : ''}" placeholder="أدخل السنة الدراسية" class="${isYearCustom ? 'custom-input' : 'hidden custom-input'}">
                </div>
                <div class="form-group">
                    <label>الفريق:</label>
                    <select id="editStudentTeamSelect">
                        ${teamOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>المسؤول عن الفريق:</label>
                    <input type="text" id="editStudentTeamResponsible" value="${student.teamResponsible || '-'}" disabled readonly class="disabled-input">
                    <small class="hint">💡 للتعديل استخدم زر "إدارة مسؤولي الفرق"</small>
                </div>
                <h4 class="scores-section-title">النقاط:</h4>
                ${scoreFieldsHTML}
            </div>
            <div class="modal-footer">
                <button onclick="saveStudentEdit('${studentId}', '${dateStr}')" class="vip-button">💾 حفظ التغييرات</button>
                ${deleteButtonHTML}
                <button onclick="closeEditDialog()" class="cancel-btn">✖️ إلغاء</button>
            </div>
        </div>
    `;

    // Show edit dialog
    showEditDialog(dialogHTML);

    // If custom year value, set the select to __custom__
    setTimeout(() => {
        if (isYearCustom) {
            const yearSelect = document.getElementById('editStudentAcademicYearSelect');
            if (yearSelect) yearSelect.value = '__custom__';
        }
    }, 50);
}

function showEditDialog(content) {
    // Create dialog overlay using CSS classes
    const overlay = document.createElement('div');
    overlay.id = 'editDialogOverlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = content;
    overlay.onclick = function(e) {
        if (e.target === overlay) {
            closeEditDialog();
        }
    };
    document.body.appendChild(overlay);
}

function closeEditDialog() {
    const overlay = document.getElementById('editDialogOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// Team Admin Manager - Assign responsible person to entire teams
function showTeamAdminManager() {
    // Get all unique teams from both students and QR codes
    const teams = new Set();

    Object.values(studentsData).forEach(student => {
        if (student.team && student.team.trim()) {
            teams.add(student.team.trim());
        }
    });

    Object.values(qrCodesData).forEach(qr => {
        if (qr.team && qr.team.trim()) {
            teams.add(qr.team.trim());
        }
    });

    if (teams.size === 0) {
        showNotification('لا توجد فرق في النظام حالياً', 'error');
        return;
    }

    // Build team list with current responsible person
    const teamsList = Array.from(teams).sort();
    let dialogHTML = `
        <div style="max-width: 700px; width: 90vw;">
            <h3 style="margin-bottom: 20px; text-align: center; color: #667eea;">👥 إدارة مسؤولي الفرق</h3>
            <p style="text-align: center; color: #666; margin-bottom: 20px;">قم بتعيين أو تغيير المسؤول عن كل فريق. سيتم تحديث جميع أعضاء الفريق تلقائياً.</p>
            <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
    `;

    teamsList.forEach((team, index) => {
        // Find current responsible person for this team
        let currentResponsible = '';

        // Check students first
        const studentInTeam = Object.values(studentsData).find(s => s.team === team);
        if (studentInTeam && studentInTeam.teamResponsible) {
            currentResponsible = studentInTeam.teamResponsible;
        } else {
            // Check QR codes
            const qrInTeam = Object.values(qrCodesData).find(q => q.team === team);
            if (qrInTeam && qrInTeam.teamResponsible) {
                currentResponsible = qrInTeam.teamResponsible;
            }
        }

        // Count members
        const studentCount = Object.values(studentsData).filter(s => s.team === team).length;
        const qrCount = Object.values(qrCodesData).filter(q => q.team === team).length;

        dialogHTML += `
            <div style="background: #f8f9fa; padding: 15px; margin-bottom: 15px; border-radius: 10px; border-left: 4px solid #667eea;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <strong style="font-size: 16px; color: #333;">⚽ ${team}</strong>
                        <div style="font-size: 12px; color: #666; margin-top: 5px;">
                            ${studentCount} مخدوم في السجلات | ${qrCount} رمز QR
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap;">
                    <label style="min-width: 70px; font-weight: 600; color: #555; align-self: center; flex-shrink: 0;">المسؤول:</label>
                    <input
                        type="text"
                        id="teamResponsible_${index}"
                        data-team="${team}"
                        value="${currentResponsible}"
                        placeholder="اسم المسؤول"
                        style="flex: 1; min-width: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px;"
                    >
                    <button
                        onclick="assignTeamResponsible('${team}', 'teamResponsible_${index}')"
                        style="padding: 10px 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 5px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0;"
                    >
                        💾 حفظ
                    </button>
                    ${currentResponsible ? `
                    <button
                        onclick="clearTeamResponsible('${team}', 'teamResponsible_${index}')"
                        style="padding: 10px 15px; background: #dc3545; color: white; border: none; border-radius: 5px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0;"
                        title="إزالة المسؤول"
                    >
                        🗑️ إزالة
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    dialogHTML += `
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
                <button onclick="closeEditDialog()" style="padding: 12px 30px; background: #6c757d; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">إغلاق</button>
            </div>
        </div>
    `;

    showEditDialog(dialogHTML);
}

async function assignTeamResponsible(teamName, inputId) {
    const responsibleName = document.getElementById(inputId).value.trim();

    if (!responsibleName) {
        showNotification('الرجاء إدخال اسم المسؤول', 'error');
        return;
    }

    // Update all students in this team
    let studentsUpdated = 0;
    for (const [studentId, student] of Object.entries(studentsData)) {
        if (student.team === teamName) {
            studentsData[studentId].teamResponsible = responsibleName;
            studentsData[studentId].lastUpdated = new Date().toISOString();
            studentsData[studentId].lastUpdatedBy = currentAdmin;

            // Save to Firebase
            await saveToFirebase(studentId, studentsData[studentId]);
            studentsUpdated++;
        }
    }

    // Update all QR codes in this team
    let qrCodesUpdated = 0;
    for (const [qrId, qr] of Object.entries(qrCodesData)) {
        if (qr.team === teamName) {
            qrCodesData[qrId].teamResponsible = responsibleName;
            qrCodesData[qrId].lastUpdated = new Date().toISOString();
            qrCodesData[qrId].lastUpdatedBy = currentAdmin;

            // Save to Firebase
            await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
            qrCodesUpdated++;
        }
    }

    // Update filter dropdowns
    populateFilterDropdowns();

    // Re-render current view
    if (!document.getElementById('dashboardSection').classList.contains('hidden')) {
        applyFilters();
    } else if (!document.getElementById('qrGeneratorSection').classList.contains('hidden')) {
        applyQRFilters();
    }

    // Refresh the team admin manager dialog to show the remove button
    closeEditDialog();
    showTeamAdminManager();

    showNotification(`✅ تم تعيين "${responsibleName}" مسؤولاً عن فريق "${teamName}"\n(${studentsUpdated} سجل مخدوم، ${qrCodesUpdated} رمز QR)`, 'success');
}

async function clearTeamResponsible(teamName, inputId) {
    if (!confirm(`هل أنت متأكد من إزالة المسؤول عن فريق "${teamName}"؟`)) {
        return;
    }

    // Update all students in this team
    let studentsUpdated = 0;
    for (const [studentId, student] of Object.entries(studentsData)) {
        if (student.team === teamName) {
            studentsData[studentId].teamResponsible = '';
            studentsData[studentId].lastUpdated = new Date().toISOString();
            studentsData[studentId].lastUpdatedBy = currentAdmin;

            // Save to Firebase
            await saveToFirebase(studentId, studentsData[studentId]);
            studentsUpdated++;
        }
    }

    // Update all QR codes in this team
    let qrCodesUpdated = 0;
    for (const [qrId, qr] of Object.entries(qrCodesData)) {
        if (qr.team === teamName) {
            qrCodesData[qrId].teamResponsible = '';
            qrCodesData[qrId].lastUpdated = new Date().toISOString();
            qrCodesData[qrId].lastUpdatedBy = currentAdmin;

            // Save to Firebase
            await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
            qrCodesUpdated++;
        }
    }

    // Update filter dropdowns
    populateFilterDropdowns();

    // Re-render current view
    if (!document.getElementById('dashboardSection').classList.contains('hidden')) {
        applyFilters();
    } else if (!document.getElementById('qrGeneratorSection').classList.contains('hidden')) {
        applyQRFilters();
    }

    // Refresh the team admin manager dialog to hide the remove button
    closeEditDialog();
    showTeamAdminManager();

    showNotification(`✅ تم إزالة المسؤول عن فريق "${teamName}"\n(${studentsUpdated} سجل مخدوم، ${qrCodesUpdated} رمز QR)`, 'success');
}

// Handle student edit modal dropdown changes
function onEditStudentAcademicYearSelectChange() {
    const select = document.getElementById('editStudentAcademicYearSelect');
    const customInput = document.getElementById('editStudentAcademicYearCustom');

    if (!select || !customInput) return;

    if (select.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
        customInput.value = '';
    }
}

async function saveStudentEdit(studentId, dateStr) {
    const newName = document.getElementById('editStudentName').value.trim();

    // Get academic year from dropdown or custom input
    const yearSelect = document.getElementById('editStudentAcademicYearSelect');
    const yearCustom = document.getElementById('editStudentAcademicYearCustom');
    const newAcademicYear = yearSelect && yearSelect.value === '__custom__'
        ? (yearCustom ? yearCustom.value.trim() : '')
        : (yearSelect ? yearSelect.value : '');

    // Get team from dropdown
    const teamSelect = document.getElementById('editStudentTeamSelect');
    const newTeam = teamSelect ? teamSelect.value : '';

    // Get team responsible from team data if team changed
    let newTeamResponsible = studentsData[studentId]?.teamResponsible || '';
    if (newTeam) {
        const teamEntry = Object.values(teamsData).find(t => t.name === newTeam);
        if (teamEntry && teamEntry.responsible) {
            newTeamResponsible = teamEntry.responsible;
        }
    }

    if (!newName) {
        showNotification('الرجاء إدخال اسم المخدوم', 'error');
        return;
    }

    // Collect the edited day scores from the form
    const editedDayScores = {};
    ALL_SCORE_TYPE_IDS.forEach(typeId => {
        const input = document.getElementById(`editScore_${typeId}`);
        if (input) {
            const value = parseFloat(input.value) || 0;
            if (value > 0) {
                editedDayScores[typeId] = value;
            }
        }
    });

    // Get the sanitized version of the new name for Firebase
    const newStudentKey = sanitizeFirebaseKey(newName);
    const oldStudentData = { ...studentsData[studentId] };
    const oldName = oldStudentData.name;

    // Update dailyScores for this specific date, then recalculate totals
    const targetData = (newStudentKey !== studentId) ? oldStudentData : studentsData[studentId];
    if (!targetData.dailyScores) targetData.dailyScores = {};

    // Remove old dailyScores entries for this date
    Object.keys(targetData.dailyScores).forEach(key => {
        if (key.startsWith(dateStr + '__')) {
            delete targetData.dailyScores[key];
        }
    });

    // Add the edited day scores for this date
    Object.keys(editedDayScores).forEach(scoreType => {
        targetData.dailyScores[`${dateStr}__${scoreType}`] = editedDayScores[scoreType];
    });

    // Recalculate total scores from ALL dailyScores entries
    const recalculatedScores = {};
    Object.keys(targetData.dailyScores).forEach(key => {
        const sep = key.indexOf('__');
        if (sep === -1) return;
        const scoreType = key.substring(sep + 2);
        if (!recalculatedScores[scoreType]) {
            recalculatedScores[scoreType] = 0;
        }
        recalculatedScores[scoreType] += targetData.dailyScores[key];
    });

    if (newStudentKey !== studentId) {
        // Name changed - delete old entry and create new one
        delete studentsData[studentId];

        studentsData[newStudentKey] = {
            name: newName,
            academicYear: newAcademicYear,
            team: newTeam,
            teamResponsible: newTeamResponsible,
            scores: recalculatedScores,
            dailyScores: targetData.dailyScores,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };

        // Update Firebase
        if (window.firebase && window.firebase.database) {
            const oldRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
            await window.firebase.set(oldRef, null);
            await saveToFirebase(newStudentKey, studentsData[newStudentKey]);
        }

        saveData();
    } else {
        // Name unchanged - update in place
        studentsData[studentId].academicYear = newAcademicYear;
        studentsData[studentId].team = newTeam;
        studentsData[studentId].teamResponsible = newTeamResponsible;
        studentsData[studentId].scores = recalculatedScores;
        studentsData[studentId].lastUpdated = new Date().toISOString();
        studentsData[studentId].lastUpdatedBy = currentAdmin;

        await saveToFirebase(studentId, studentsData[studentId]);
    }

    // Sync changes to corresponding QR code
    await syncStudentToQRCode(oldName, newName, newAcademicYear, newTeam, newTeamResponsible);

    closeEditDialog();
    populateFilterDropdowns();
    applyFilters();
    renderQRCodesTable();
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

// Delete only a specific day's record for a student (not the entire student)
async function deleteDayRecord(studentId, dateStr) {
    const student = studentsData[studentId];
    if (!student) return;

    if (!confirm(`هل أنت متأكد من حذف سجل "${student.name}" ليوم ${dateStr}؟`)) {
        return;
    }

    if (!student.dailyScores) {
        showNotification('لا يوجد سجلات يومية لهذا المخدوم', 'error');
        return;
    }

    // Remove all dailyScores entries for this specific date
    Object.keys(student.dailyScores).forEach(key => {
        if (key.startsWith(dateStr + '__')) {
            delete student.dailyScores[key];
        }
    });

    // Recalculate total scores from remaining dailyScores
    const recalculatedScores = {};
    Object.keys(student.dailyScores).forEach(key => {
        const sep = key.indexOf('__');
        if (sep === -1) return;
        const scoreType = key.substring(sep + 2);
        if (!recalculatedScores[scoreType]) {
            recalculatedScores[scoreType] = 0;
        }
        recalculatedScores[scoreType] += student.dailyScores[key];
    });

    student.scores = recalculatedScores;
    student.lastUpdated = new Date().toISOString();
    student.lastUpdatedBy = currentAdmin;

    // If no dailyScores left at all, delete the entire student
    if (Object.keys(student.dailyScores).length === 0) {
        delete studentsData[studentId];
        if (window.firebase && window.firebase.database) {
            const studentRef = window.firebase.ref(window.firebase.database, `students/${studentId}`);
            await window.firebase.set(studentRef, null);
        }
    } else {
        // Save updated student
        saveData();
        await saveToFirebase(studentId, student);
    }

    closeEditDialog();
    populateFilterDropdowns();
    applyFilters();
    showNotification('تم حذف سجل اليوم بنجاح', 'success');
}

// Sync student data to corresponding QR code
async function syncStudentToQRCode(oldName, newName, academicYear, team, teamResponsible) {
    // Find QR code(s) that match the old name
    const matchingQRIds = Object.entries(qrCodesData)
        .filter(([id, qr]) => qr.name === oldName)
        .map(([id]) => id);

    if (matchingQRIds.length === 0) {
        console.log(`No QR code found for student: ${oldName}`);
        return;
    }

    for (const qrId of matchingQRIds) {
        // Update QR code data
        qrCodesData[qrId].name = newName;
        qrCodesData[qrId].academicYear = academicYear;
        qrCodesData[qrId].team = team;
        qrCodesData[qrId].teamResponsible = teamResponsible;
        qrCodesData[qrId].lastUpdated = new Date().toISOString();
        qrCodesData[qrId].lastUpdatedBy = currentAdmin;

        // Save to Firebase
        await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
    }

    console.log(`✅ Synced ${matchingQRIds.length} QR code(s) for student: ${oldName} → ${newName}`);
}

// Sync QR code data to corresponding student
async function syncQRCodeToStudent(oldName, newName, academicYear, team, teamResponsible) {
    // Find student that matches the old name
    const matchingStudentId = Object.keys(studentsData).find(id => studentsData[id].name === oldName);

    if (!matchingStudentId) {
        console.log(`No student found for QR code: ${oldName}`);
        return;
    }

    const newStudentKey = sanitizeFirebaseKey(newName);

    // If name changed, need to handle key change
    if (newStudentKey !== matchingStudentId) {
        const oldStudentData = { ...studentsData[matchingStudentId] };
        delete studentsData[matchingStudentId];

        studentsData[newStudentKey] = {
            ...oldStudentData,
            name: newName,
            academicYear: academicYear,
            team: team,
            teamResponsible: teamResponsible,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };

        // Update Firebase - delete old and create new
        if (window.firebase && window.firebase.database) {
            const oldRef = window.firebase.ref(window.firebase.database, `students/${matchingStudentId}`);
            await window.firebase.set(oldRef, null);
            await saveToFirebase(newStudentKey, studentsData[newStudentKey]);
        }
    } else {
        // Just update data
        studentsData[matchingStudentId].academicYear = academicYear;
        studentsData[matchingStudentId].team = team;
        studentsData[matchingStudentId].teamResponsible = teamResponsible;
        studentsData[matchingStudentId].lastUpdated = new Date().toISOString();
        studentsData[matchingStudentId].lastUpdatedBy = currentAdmin;

        // Save to Firebase
        await saveToFirebase(matchingStudentId, studentsData[matchingStudentId]);
    }

    console.log(`✅ Synced student for QR code: ${oldName} → ${newName}`);
}

// Excel export function
function exportToExcel() {
    // Prepare data for Excel
    const excelData = [];

    // Header row with Arabic labels
    const headers = ['اسم المخدوم', 'السنة الدراسية', 'الفريق', 'المسؤول عن الفريق', ...ALL_SCORE_TYPE_IDS.map(id => SCORE_TYPES[id].label), 'المجموع', 'آخر تحديث', 'الخادم'];
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

    // Data rows - track team colors for each row
    const teamColorMap = {}; // rowIndex -> color
    let rowIndex = 1; // Start after header (0-indexed)

    Object.entries(studentsData).forEach(([studentId, student]) => {
        let total = 0;
        const row = [
            student.name,
            student.academicYear || '-',
            student.team || '-',
            student.teamResponsible || '-'
        ];

        // Track team color for this row
        const teamColor = getTeamColor(student.team);
        if (teamColor) {
            teamColorMap[rowIndex] = teamColor;
        }
        rowIndex++;

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

    // Apply team colors to cells if XLSX supports styling
    // Note: Standard XLSX.js has limited styling. For full styling, xlsx-style package is needed.
    // We'll add a "لون الفريق" column to indicate the team color as a fallback
    if (Object.keys(teamColorMap).length > 0) {
        // Add team color as a column indicator
        const colCount = headers.length;
        for (let r = 1; r < excelData.length; r++) {
            const color = teamColorMap[r];
            if (color) {
                // Try to apply fill color if supported
                const range = XLSX.utils.decode_range(ws['!ref']);
                for (let c = 0; c <= range.e.c; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
                    if (ws[cellRef]) {
                        // Add style if available (requires xlsx-style for full support)
                        if (!ws[cellRef].s) ws[cellRef].s = {};
                        const rgb = hexToRgb(color);
                        if (rgb) {
                            ws[cellRef].s.fill = {
                                patternType: 'solid',
                                fgColor: { rgb: `${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`.toUpperCase() }
                            };
                        }
                    }
                }
            }
        }
    }

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
    const teamResponsibleFilter = document.getElementById('filterTeamResponsible')?.value?.trim()?.toLowerCase() || '';
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

    // Filter by team responsible
    if (teamResponsibleFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) =>
                student.teamResponsible && student.teamResponsible.toLowerCase().includes(teamResponsibleFilter)
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

    // Filter by date - check dailyScores keys then fallback to lastUpdated
    if (dateFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, student]) => {
                // Check dailyScores for any key starting with the date
                if (student.dailyScores) {
                    const hasDate = Object.keys(student.dailyScores).some(key => key.startsWith(dateFilter + '__'));
                    if (hasDate) return true;
                }
                // Fallback to lastUpdated
                if (!student.lastUpdated) return false;
                try {
                    const studentDate = new Date(student.lastUpdated).toISOString().split('T')[0];
                    return studentDate === dateFilter;
                } catch (e) {
                    return false;
                }
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
    const filterTeamResponsible = document.getElementById('filterTeamResponsible');
    if (filterTeamResponsible) filterTeamResponsible.value = '';
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
        // Turn off teams leaderboard if active
        if (isTeamsLeaderboardMode) {
            isTeamsLeaderboardMode = false;
            const tlBtn = document.getElementById('teamsLeaderboardBtn');
            if (tlBtn) { tlBtn.textContent = '🥇 ترتيب الفرق'; tlBtn.classList.remove('active'); }
        }
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
        tableContainer.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
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

// Teams leaderboard functionality
let isTeamsLeaderboardMode = false;

function toggleTeamsLeaderboard() {
    isTeamsLeaderboardMode = !isTeamsLeaderboardMode;
    const btn = document.getElementById('teamsLeaderboardBtn');

    if (isTeamsLeaderboardMode) {
        // Turn off individual leaderboard if active
        if (isLeaderboardMode) {
            isLeaderboardMode = false;
            const lbBtn = document.getElementById('leaderboardBtn');
            lbBtn.textContent = '🏆 عرض الترتيب';
            lbBtn.classList.remove('active');
        }
        btn.textContent = '📊 عرض عادي';
        btn.classList.add('active');
        renderTeamsLeaderboard();
    } else {
        btn.textContent = '🥇 ترتيب الفرق';
        btn.classList.remove('active');
        renderScoresTable();
    }
}

function renderTeamsLeaderboard() {
    const tableContainer = document.getElementById('scoresTable');

    if (Object.keys(studentsData).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
        return;
    }

    // Aggregate scores per team
    const teamTotals = {};
    Object.values(studentsData).forEach(student => {
        const teamName = student.team || 'بدون فريق';
        if (!teamTotals[teamName]) {
            teamTotals[teamName] = { total: 0, memberCount: 0, scores: {} };
            ALL_SCORE_TYPE_IDS.forEach(typeId => { teamTotals[teamName].scores[typeId] = 0; });
        }
        teamTotals[teamName].memberCount += 1;
        ALL_SCORE_TYPE_IDS.forEach(typeId => {
            const s = student.scores?.[typeId] || 0;
            teamTotals[teamName].scores[typeId] += s;
            teamTotals[teamName].total += s;
        });
    });

    // Sort teams by total descending
    const sortedTeams = Object.entries(teamTotals).sort((a, b) => b[1].total - a[1].total);

    const scoreTypeHeaders = ALL_SCORE_TYPE_IDS.map(typeId =>
        `<th>${SCORE_TYPES[typeId]?.label || typeId}</th>`
    ).join('');

    let tableHTML = `
        <div class="leaderboard-header">
            <h3>🥇 ترتيب الفرق حسب إجمالي النقاط</h3>
        </div>
        <table>
            <thead>
                <tr>
                    <th>الترتيب</th>
                    <th>الفريق</th>
                    <th>عدد الأعضاء</th>
                    ${scoreTypeHeaders}
                    <th class="total-column">المجموع</th>
                </tr>
            </thead>
            <tbody>
    `;

    sortedTeams.forEach(([teamName, data], index) => {
        const rank = index + 1;
        let rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        const teamColor = getTeamColor(teamName);
        const colorDot = teamColor ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${teamColor};margin-left:6px;vertical-align:middle;"></span>` : '';
        const rowStyle = teamColor
            ? `border-right: 6px solid ${teamColor}; background: linear-gradient(90deg, ${teamColor}20 0%, transparent 40%);`
            : '';

        const scoreCells = ALL_SCORE_TYPE_IDS.map(typeId =>
            `<td>${data.scores[typeId] || 0}</td>`
        ).join('');

        tableHTML += `
            <tr class="rank-${rank}" style="${rowStyle}">
                <td><strong>${rankBadge}</strong></td>
                <td><strong>${colorDot}${teamName}</strong></td>
                <td>${data.memberCount}</td>
                ${scoreCells}
                <td class="total-column"><strong>${data.total}</strong></td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    tableContainer.innerHTML = tableHTML;
}

// ============================================
// SECTION MANAGEMENT SYSTEM - Design Pattern
// ============================================

// Section Registry - Single Source of Truth (Registry Pattern)
const SECTION_REGISTRY = {
    scanner: {
        id: 'scannerSection',
        navId: 'scannerNavBtn',
        onShow: () => initializeScannerIfNeeded(),
        onHide: () => pauseScanner()
    },
    dashboard: {
        id: 'dashboardSection',
        navId: 'dashboardNavBtn',
        onShow: () => {
            hideScoringForm();
            populateFilterDropdowns();
            applyFilters();
        },
        onHide: () => {}
    },
    qrGenerator: {
        id: 'qrGeneratorSection',
        navId: 'qrGeneratorNavBtn',
        onShow: () => {
            hideScoringForm();
            populateFilterDropdowns();
            loadQRCodes().then(() => {
                applyQRFilters();
            }).catch(error => {
                console.error('Error loading QR codes:', error);
                applyQRFilters();
            });
        },
        onHide: () => {}
    },
    profile: {
        id: 'profileSection',
        navId: 'profileNavBtn',
        onShow: () => loadProfileData(),
        onHide: () => {}
    },
    manageAdmins: {
        id: 'manageAdminsSection',
        navId: 'manageAdminsNavBtn',
        onShow: () => renderAdminsList(),
        onHide: () => {},
        permissionCheck: () => isHeadAdmin()
    },
    manageScoreTypes: {
        id: 'manageScoreTypesSection',
        navId: 'manageScoreTypesNavBtn',
        onShow: () => renderScoreTypesList(),
        onHide: () => {},
        permissionCheck: () => isHeadAdmin()
    },
    settings: {
        id: 'settingsSection',
        navId: 'settingsNavBtn',
        onShow: () => {
            loadTeamsData();
            loadAcademicYearsData();
        },
        onHide: () => {},
        permissionCheck: () => isHeadAdmin()
    },
    signupRequests: {
        id: 'signupRequestsSection',
        navId: 'signupRequestsNavBtn',
        onShow: () => renderPendingRequests(),
        onHide: () => {},
        permissionCheck: () => isHeadAdmin()
    }
};

// Helper functions for section lifecycle
async function pauseScanner() {
    // New Html5Qrcode implementation
    if (html5Qrcode && isScannerRunning) {
        try {
            await html5Qrcode.stop();
            isScannerRunning = false;
            console.log('✅ Scanner paused');
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }
    // Fallback for old implementation
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing old scanner:', error);
        }
    }
}

function hideScoringForm() {
    const form = document.getElementById('scoringForm');
    if (form) form.classList.add('hidden');
}

async function initializeScannerIfNeeded() {
    console.log('📱 initializeScannerIfNeeded called');

    const scannerContainer = document.getElementById('qr-reader');
    if (!scannerContainer) {
        console.error('❌ Scanner container (#qr-reader) not found!');
        return;
    }

    const hasContent = scannerContainer.children.length > 0;

    console.log('📊 Scanner state:');
    console.log('  - Container found: ✅');
    console.log('  - Has content:', hasContent ? '✅' : '❌');
    console.log('  - New scanner instance exists:', html5Qrcode ? '✅' : '❌');
    console.log('  - Scanner running:', isScannerRunning ? '✅' : '❌');

    // Check if we need to initialize or resume
    if (!html5Qrcode || !hasContent) {
        console.log('🔧 Initializing scanner for the first time');
        setTimeout(() => {
            initializeQRScanner();
        }, 200);
    } else if (!isScannerRunning) {
        // Scanner exists but not running, restart it
        console.log('▶️ Restarting scanner');
        try {
            await startQRScanning();
            console.log('✅ Scanner restarted successfully');
        } catch (error) {
            console.log('⚠️ Error restarting scanner:', error);
            // Re-initialize if restart fails
            initializeQRScanner();
        }
    } else {
        console.log('✅ Scanner already running');
    }
}

// Central Section Manager (Strategy Pattern + Command Pattern)
function showSection(sectionKey) {
    const section = SECTION_REGISTRY[sectionKey];

    if (!section) {
        console.error(`Section '${sectionKey}' not found in registry`);
        return;
    }

    // Permission check
    if (section.permissionCheck && !section.permissionCheck()) {
        showNotification('غير مصرح لك بالوصول إلى هذه الصفحة', 'error');
        return;
    }

    // Hide all sections and call their onHide hooks
    Object.values(SECTION_REGISTRY).forEach(s => {
        const element = document.getElementById(s.id);
        if (element) {
            element.classList.add('hidden');
            if (s.onHide) s.onHide();
        }
    });

    // Show target section
    const targetElement = document.getElementById(section.id);
    if (targetElement) {
        targetElement.classList.remove('hidden');
    }

    // Set active navigation
    setActiveNav(section.navId);

    // Call onShow hook
    if (section.onShow) {
        section.onShow();
    }

    console.log(`✅ Switched to section: ${sectionKey}`);
}

// Navigation functions
function setActiveNav(navId) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    // Add active class to clicked nav
    if (document.getElementById(navId)) {
        document.getElementById(navId).classList.add('active');
    }

    // On mobile, close sidebar after navigation
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

// Sidebar toggle functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggleIcon = document.getElementById('sidebarToggleIcon');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // Mobile: toggle open/close with overlay
        if (sidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    } else {
        // Desktop: toggle collapsed state
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            if (toggleIcon) toggleIcon.textContent = '◀';
        } else {
            sidebar.classList.add('collapsed');
            if (toggleIcon) toggleIcon.textContent = '▶';
        }
    }
}

function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent scrolling when sidebar is open
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling
}

// Update sidebar user info
function updateSidebarUserInfo() {
    if (!currentAdminData) return;

    const firstLetter = currentAdminData.name.charAt(0).toUpperCase();
    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('sidebarAdminName');
    const roleEl = document.getElementById('sidebarAdminRole');

    if (avatarEl) avatarEl.textContent = firstLetter;
    if (nameEl) nameEl.textContent = currentAdminData.name;
    if (roleEl) roleEl.textContent = currentAdminData.isHeadAdmin ? 'أمين الخدمة' : 'خادم';
}

// Refactored navigation functions using centralized section manager
function showProfile() {
    showSection('profile');
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
    showSection('manageAdmins');
}

function showSignupRequests() {
    showSection('signupRequests');
}

function renderAdminsList() {
    const container = document.getElementById('adminsList');

    console.log('renderAdminsList called, adminsData:', adminsData);
    console.log('adminsData keys:', Object.keys(adminsData));

    if (!Object.keys(adminsData).length) {
        container.innerHTML = '<p style="text-align: center; color: #ffffff;">لا يوجد خدام</p>';
        console.log('No admins data found - showing empty message');
        return;
    }

    let html = '';
    Object.entries(adminsData).forEach(([phone, admin]) => {
        console.log('Processing admin:', phone, admin);
        const isHeadAdmin = admin.isHeadAdmin;
        const roleClass = isHeadAdmin ? 'head-admin-badge' : 'admin-badge';
        const roleText = isHeadAdmin ? '👑 امين الخدمه' : '👤 خادم';

        // Get permissions (with defaults for backwards compatibility)
        const permissions = admin.permissions || {
            canAddQR: false,
            canEditQR: false,
            canDeleteQR: false,
            canModifyDashboard: false,
            canManageTeams: false,
            canManageAcademicYears: false
        };

        // Build permissions display
        let permissionsHtml = '<div class="admin-permissions">';
        if (isHeadAdmin) {
            permissionsHtml += '<span class="permission-badge full-access">✨ صلاحيات كاملة</span>';
        } else {
            if (permissions.canAddQR) permissionsHtml += '<span class="permission-badge">➕ إضافة QR</span>';
            if (permissions.canEditQR) permissionsHtml += '<span class="permission-badge">✏️ تعديل QR</span>';
            if (permissions.canDeleteQR) permissionsHtml += '<span class="permission-badge">🗑️ حذف QR</span>';
            if (permissions.canModifyDashboard) permissionsHtml += '<span class="permission-badge">📊 لوحة التحكم</span>';
            if (permissions.canManageTeams) permissionsHtml += '<span class="permission-badge">⚽ إدارة الفرق</span>';
            if (permissions.canManageAcademicYears) permissionsHtml += '<span class="permission-badge">📅 إدارة السنوات</span>';
            const hasAnyPermission = permissions.canAddQR || permissions.canEditQR || permissions.canDeleteQR ||
                                     permissions.canModifyDashboard || permissions.canManageTeams || permissions.canManageAcademicYears;
            if (!hasAnyPermission) {
                permissionsHtml += '<span class="permission-badge no-permissions">❌ لا توجد صلاحيات</span>';
            }
        }
        permissionsHtml += '</div>';

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
                ${permissionsHtml}
                <div class="admin-card-actions">
                    <button onclick="editAdmin('${phone}')" class="edit-btn">✏️ تعديل</button>
                    <button onclick="deleteAdmin('${phone}')" class="delete-btn">🗑️ حذف</button>
                </div>
            </div>
        `;
    });

    console.log('Generated HTML length:', html.length);
    container.innerHTML = html;
}

// Update requests badge count
async function updateRequestsBadge(pendingCount = null) {
    if (!isHeadAdmin()) return;

    const badge = document.getElementById('requestsBadge');
    if (!badge) return;

    // If pendingCount is provided, use it directly (from real-time listener)
    if (pendingCount !== null) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
        return;
    }

    // Otherwise, fetch from Firebase (backward compatibility)
    if (!window.firebase || !window.firebase.database) {
        badge.classList.add('hidden');
        return;
    }

    try {
        const requestsRef = window.firebase.ref(window.firebase.database, 'signupRequests');
        const snapshot = await window.firebase.get(requestsRef);

        if (!snapshot.exists()) {
            badge.classList.add('hidden');
            return;
        }

        const requests = snapshot.val();
        const count = Object.values(requests).filter(req => req.status === 'pending').length;

        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error updating requests badge:', error);
        badge.classList.add('hidden');
    }
}

// Render pending signup requests from data (used by real-time listener)
function renderPendingRequestsFromData(requestsData) {
    if (!isHeadAdmin()) return;

    const container = document.getElementById('pendingRequestsList');
    if (!container) return;

    const pendingRequests = Object.entries(requestsData).filter(([_, req]) => req.status === 'pending');

    if (pendingRequests.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic;">لا توجد طلبات معلقة</p>';
        return;
    }

    let html = '';
    pendingRequests.forEach(([phone, request]) => {
        const requestDate = new Date(request.requestedAt).toLocaleDateString('ar-EG');
        html += `
            <div class="request-card">
                <div class="request-header">
                    <div class="request-avatar">${request.name.charAt(0).toUpperCase()}</div>
                    <div class="request-info">
                        <h4>${request.name}</h4>
                        <p class="request-phone">${request.phone}</p>
                        <p class="request-date">تاريخ الطلب: ${requestDate}</p>
                    </div>
                </div>
                <div class="request-actions">
                    <button onclick="approveSignupRequest('${phone}')" class="approve-btn">✓ قبول</button>
                    <button onclick="rejectSignupRequest('${phone}')" class="reject-btn">✗ رفض</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render pending signup requests
async function renderPendingRequests() {
    if (!isHeadAdmin()) return;

    const container = document.getElementById('pendingRequestsList');
    if (!container) return;

    if (!window.firebase || !window.firebase.database) {
        container.innerHTML = '<p style="text-align: center; color: #ffffff;">غير متصل بقاعدة البيانات</p>';
        return;
    }

    try {
        const requestsRef = window.firebase.ref(window.firebase.database, 'signupRequests');
        const snapshot = await window.firebase.get(requestsRef);

        if (!snapshot.exists()) {
            container.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic;">لا توجد طلبات معلقة</p>';
            // Update badge
            updateRequestsBadge();
            return;
        }

        const requests = snapshot.val();
        const pendingRequests = Object.entries(requests).filter(([_, req]) => req.status === 'pending');

        if (pendingRequests.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic;">لا توجد طلبات معلقة</p>';
            // Update badge
            updateRequestsBadge();
            return;
        }

        let html = '';
        pendingRequests.forEach(([phone, request]) => {
            const requestDate = new Date(request.requestedAt).toLocaleDateString('ar-EG');
            html += `
                <div class="request-card">
                    <div class="request-header">
                        <div class="request-avatar">${request.name.charAt(0).toUpperCase()}</div>
                        <div class="request-info">
                            <h4>${request.name}</h4>
                            <p class="request-phone">${request.phone}</p>
                            <p class="request-date">تاريخ الطلب: ${requestDate}</p>
                        </div>
                    </div>
                    <div class="request-actions">
                        <button onclick="approveSignupRequest('${phone}')" class="approve-btn">✓ قبول</button>
                        <button onclick="rejectSignupRequest('${phone}')" class="reject-btn">✗ رفض</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        // Update badge
        updateRequestsBadge();
    } catch (error) {
        console.error('Error loading pending requests:', error);
        container.innerHTML = '<p style="text-align: center; color: #f44336;">حدث خطأ في تحميل الطلبات</p>';
    }
}

// Approve signup request
async function approveSignupRequest(phone) {
    if (!isHeadAdmin()) {
        showNotification('ليس لديك صلاحية للموافقة على الطلبات', 'error');
        return;
    }

    try {
        const requestRef = window.firebase.ref(window.firebase.database, `signupRequests/${phone}`);
        const snapshot = await window.firebase.get(requestRef);

        if (!snapshot.exists()) {
            showNotification('الطلب غير موجود', 'error');
            return;
        }

        const request = snapshot.val();

        // Show permissions dialog
        showPermissionsDialog(request, async (permissions, isHeadAdmin) => {
            // Create new admin with encrypted password
            const newAdmin = {
                name: request.name,
                phone: request.phone,
                password: encryptPassword(request.password), // Encrypt password before storing
                isHeadAdmin: isHeadAdmin,
                permissions: permissions,
                createdAt: new Date().toISOString(),
                approvedBy: currentAdmin,
                approvedAt: new Date().toISOString()
            };

            // Save to admins
            const adminRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
            await window.firebase.set(adminRef, newAdmin);

            // Update request status
            await window.firebase.set(requestRef, {
                ...request,
                status: 'approved',
                approvedBy: currentAdmin,
                approvedAt: new Date().toISOString()
            });

            // Update local data
            adminsData[phone] = newAdmin;

            // Refresh admins list (real-time listener will update requests automatically)
            renderAdminsList();

            showNotification(`تم قبول طلب ${request.name}`, 'success');
        });

    } catch (error) {
        console.error('Error approving request:', error);
        showNotification('حدث خطأ أثناء قبول الطلب', 'error');
    }
}

// Reject signup request
async function rejectSignupRequest(phone) {
    if (!isHeadAdmin()) {
        showNotification('ليس لديك صلاحية لرفض الطلبات', 'error');
        return;
    }

    if (!confirm('هل أنت متأكد من رفض هذا الطلب؟')) {
        return;
    }

    try {
        const requestRef = window.firebase.ref(window.firebase.database, `signupRequests/${phone}`);
        const snapshot = await window.firebase.get(requestRef);

        if (!snapshot.exists()) {
            showNotification('الطلب غير موجود', 'error');
            return;
        }

        const request = snapshot.val();

        // Update request status
        await window.firebase.set(requestRef, {
            ...request,
            status: 'rejected',
            rejectedBy: currentAdmin,
            rejectedAt: new Date().toISOString()
        });

        // Real-time listener will automatically update the UI
        showNotification(`تم رفض طلب ${request.name}`, 'info');

    } catch (error) {
        console.error('Error rejecting request:', error);
        showNotification('حدث خطأ أثناء رفض الطلب', 'error');
    }
}

// Show permissions dialog for approval
function showPermissionsDialog(request, callback) {
    const dialog = document.createElement('div');
    dialog.className = 'permissions-dialog-overlay';
    dialog.innerHTML = `
        <div class="permissions-dialog">
            <h3>تعيين صلاحيات لـ ${request.name}</h3>
            <div class="permissions-section">
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermHeadAdmin" onchange="toggleDialogPermissions()">
                    <label for="dialogPermHeadAdmin">👑 امين الخدمه (صلاحيات كاملة)</label>
                </div>
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermAddQR" class="dialog-sub-permission">
                    <label for="dialogPermAddQR">➕ إضافة رموز QR</label>
                </div>
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermEditQR" class="dialog-sub-permission">
                    <label for="dialogPermEditQR">✏️ تعديل رموز QR</label>
                </div>
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermDeleteQR" class="dialog-sub-permission">
                    <label for="dialogPermDeleteQR">🗑️ حذف رموز QR</label>
                </div>
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermModifyDashboard" class="dialog-sub-permission">
                    <label for="dialogPermModifyDashboard">📊 تعديل لوحة التحكم</label>
                </div>
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermManageTeams" class="dialog-sub-permission">
                    <label for="dialogPermManageTeams">⚽ إدارة الفرق</label>
                </div>
                <div class="permission-item">
                    <input type="checkbox" id="dialogPermManageAcademicYears" class="dialog-sub-permission">
                    <label for="dialogPermManageAcademicYears">📅 إدارة السنوات الدراسية</label>
                </div>
            </div>
            <div class="dialog-actions">
                <button onclick="confirmPermissions()" class="vip-button">تأكيد الموافقة</button>
                <button onclick="closePermissionsDialog()" class="cancel-btn">إلغاء</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Store callback
    window.permissionsDialogCallback = callback;
}

function toggleDialogPermissions() {
    const isHeadAdmin = document.getElementById('dialogPermHeadAdmin').checked;
    const subPermissions = document.querySelectorAll('.dialog-sub-permission');

    subPermissions.forEach(checkbox => {
        if (isHeadAdmin) {
            checkbox.checked = true;
            checkbox.disabled = true;
        } else {
            checkbox.disabled = false;
        }
    });
}

function confirmPermissions() {
    const isHeadAdmin = document.getElementById('dialogPermHeadAdmin').checked;
    const permissions = {
        canAddQR: document.getElementById('dialogPermAddQR').checked,
        canEditQR: document.getElementById('dialogPermEditQR').checked,
        canDeleteQR: document.getElementById('dialogPermDeleteQR').checked,
        canModifyDashboard: document.getElementById('dialogPermModifyDashboard').checked,
        canManageTeams: document.getElementById('dialogPermManageTeams').checked,
        canManageAcademicYears: document.getElementById('dialogPermManageAcademicYears').checked
    };

    if (window.permissionsDialogCallback) {
        window.permissionsDialogCallback(permissions, isHeadAdmin);
    }

    closePermissionsDialog();
}

function closePermissionsDialog() {
    const dialog = document.querySelector('.permissions-dialog-overlay');
    if (dialog) {
        document.body.removeChild(dialog);
    }
    window.permissionsDialogCallback = null;
}

function showAddAdminForm() {
    document.getElementById('adminFormTitle').textContent = '➕ إضافة خادم جديد';
    document.getElementById('editAdminPhone').value = '';
    document.getElementById('addAdminForm').classList.remove('hidden');
    document.getElementById('newAdminName').value = '';
    document.getElementById('newAdminPhone').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('newAdminPhone').disabled = false;

    // Reset all permissions
    document.getElementById('permHeadAdmin').checked = false;
    document.getElementById('permAddQR').checked = false;
    document.getElementById('permEditQR').checked = false;
    document.getElementById('permDeleteQR').checked = false;
    document.getElementById('permModifyDashboard').checked = false;

    // Enable sub-permissions
    document.querySelectorAll('.sub-permission').forEach(cb => cb.disabled = false);
}

function hideAddAdminForm() {
    document.getElementById('addAdminForm').classList.add('hidden');
}

function toggleHeadAdminPermissions() {
    const isHeadAdmin = document.getElementById('permHeadAdmin').checked;
    const subPermissions = document.querySelectorAll('.sub-permission');

    subPermissions.forEach(checkbox => {
        if (isHeadAdmin) {
            checkbox.checked = true;
            checkbox.disabled = true;
        } else {
            checkbox.disabled = false;
        }
    });
}

async function saveAdmin() {
    const name = document.getElementById('newAdminName').value.trim();
    const phone = document.getElementById('newAdminPhone').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const editingPhone = document.getElementById('editAdminPhone').value;

    if (!name) {
        showNotification('الرجاء إدخال الاسم', 'error');
        return;
    }

    if (!phone || phone.length !== 11) {
        showNotification('الرجاء إدخال رقم هاتف صحيح (11 رقم)', 'error');
        return;
    }

    // Check password requirement
    const isEditing = editingPhone !== '';
    if (!isEditing && !password) {
        showNotification('الرجاء إدخال كلمة المرور', 'error');
        return;
    }

    // Check if phone already exists (only for new admins)
    if (!isEditing && adminsData[phone]) {
        showNotification('رقم الهاتف مسجل مسبقاً', 'error');
        return;
    }

    // Get permissions
    const isHeadAdmin = document.getElementById('permHeadAdmin').checked;
    const permissions = {
        canAddQR: document.getElementById('permAddQR').checked,
        canEditQR: document.getElementById('permEditQR').checked,
        canDeleteQR: document.getElementById('permDeleteQR').checked,
        canModifyDashboard: document.getElementById('permModifyDashboard').checked,
        canManageTeams: document.getElementById('permManageTeams').checked,
        canManageAcademicYears: document.getElementById('permManageAcademicYears').checked
    };

    // Check if trying to downgrade the last head admin
    if (isEditing) {
        const currentAdmin = adminsData[editingPhone || phone];
        const wasHeadAdmin = currentAdmin && currentAdmin.isHeadAdmin === true;
        const isBecomingNonHeadAdmin = !isHeadAdmin;

        if (wasHeadAdmin && isBecomingNonHeadAdmin && countHeadAdmins() <= 1) {
            showNotification('⚠️ لا يمكن إزالة صلاحية المسؤول الرئيسي من آخر مسؤول رئيسي في النظام!\nيجب أن يكون هناك مسؤول رئيسي واحد على الأقل للتحكم في الصلاحيات.\n\nإذا كنت تريد تغيير المسؤول الرئيسي، قم أولاً بترقية خادم آخر إلى مسؤول رئيسي.', 'error');
            return;
        }
    }

    const adminData = {
        name,
        phone,
        isHeadAdmin,
        permissions,
        createdAt: isEditing ? adminsData[editingPhone || phone].createdAt : new Date().toISOString()
    };

    // Only update password if provided (encrypt before storing)
    if (password) {
        adminData.password = encryptPassword(password);
    } else if (isEditing) {
        // Keep existing encrypted password
        adminData.password = adminsData[editingPhone || phone].password;
    }

    // If editing and phone changed, delete old entry
    if (isEditing && editingPhone !== phone && adminsData[editingPhone]) {
        if (window.firebase && window.firebase.database) {
            const oldAdminRef = window.firebase.ref(window.firebase.database, `admins/${editingPhone}`);
            await window.firebase.set(oldAdminRef, null);
        }
        delete adminsData[editingPhone];
    }

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        const adminRef = window.firebase.ref(window.firebase.database, `admins/${phone}`);
        await window.firebase.set(adminRef, adminData);
    }

    adminsData[phone] = adminData;

    hideAddAdminForm();
    renderAdminsList();
    showNotification(isEditing ? 'تم تحديث بيانات الخادم بنجاح' : 'تم إضافة الخادم بنجاح', 'success');
}

function editAdmin(phone) {
    const admin = adminsData[phone];
    if (!admin) return;

    // Populate form with admin data
    document.getElementById('adminFormTitle').textContent = '✏️ تعديل بيانات الخادم';
    document.getElementById('editAdminPhone').value = phone;
    document.getElementById('newAdminName').value = admin.name;
    document.getElementById('newAdminPhone').value = admin.phone;
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('newAdminPassword').placeholder = 'اتركها فارغة للإبقاء على القديمة';

    // Set permissions
    document.getElementById('permHeadAdmin').checked = admin.isHeadAdmin || false;

    // Ensure permissions object exists
    const permissions = admin.permissions || {
        canAddQR: false,
        canEditQR: false,
        canDeleteQR: false,
        canModifyDashboard: false,
        canManageTeams: false,
        canManageAcademicYears: false
    };

    document.getElementById('permAddQR').checked = permissions.canAddQR;
    document.getElementById('permEditQR').checked = permissions.canEditQR;
    document.getElementById('permDeleteQR').checked = permissions.canDeleteQR;
    document.getElementById('permModifyDashboard').checked = permissions.canModifyDashboard;
    document.getElementById('permManageTeams').checked = permissions.canManageTeams;
    document.getElementById('permManageAcademicYears').checked = permissions.canManageAcademicYears;

    // Apply head admin toggle effect
    toggleHeadAdminPermissions();

    // Show form
    document.getElementById('addAdminForm').classList.remove('hidden');

    // Scroll to top to show the edit form
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper function to count head admins
function countHeadAdmins() {
    return Object.values(adminsData).filter(admin => admin.isHeadAdmin === true).length;
}

async function deleteAdmin(phone) {
    const admin = adminsData[phone];
    if (!admin) return;

    // Check if this is the last head admin
    if (admin.isHeadAdmin && countHeadAdmins() <= 1) {
        showNotification('⚠️ لا يمكن حذف آخر مسؤول رئيسي في النظام!\nيجب أن يكون هناك مسؤول رئيسي واحد على الأقل للتحكم في الصلاحيات.', 'error');
        return;
    }

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
    showSection('manageScoreTypes');
}

function renderScoreTypesList() {
    const container = document.getElementById('scoreTypesList');

    if (!Object.keys(SCORE_TYPES).length) {
        container.innerHTML = '<p style="text-align: center; color: #ffffff;">لا توجد أنواع نقاط</p>';
        return;
    }

    let html = '<div class="score-types-grid">';
    Object.entries(SCORE_TYPES).forEach(([typeId, scoreType]) => {
        const multipleIcon = scoreType.allowMultiplePerDay ? '✅' : '❌';
        const multipleText = scoreType.allowMultiplePerDay ? 'نعم' : 'لا';
        const multipleClass = scoreType.allowMultiplePerDay ? 'indicator-yes' : 'indicator-no';
        const points = scoreType.points !== undefined ? scoreType.points : 1;

        html += `
            <div class="score-type-card">
                <div class="score-type-card-header">
                    <div class="score-type-avatar">⭐</div>
                    <div class="score-type-card-info">
                        <h4>${scoreType.label}</h4>
                        <code class="score-type-id">${typeId}</code>
                    </div>
                </div>
                <div class="score-type-details">
                    <div class="score-type-detail-row">
                        <span class="detail-label">النقاط الافتراضية:</span>
                        <span class="points-badge">${points}</span>
                    </div>
                    <div class="score-type-detail-row">
                        <span class="detail-label">تسجيل متعدد:</span>
                        <span class="selection-indicator ${multipleClass}">${multipleIcon} ${multipleText}</span>
                    </div>
                </div>
                <div class="score-type-actions">
                    <button onclick="editScoreType('${typeId}')" class="action-btn edit-btn">✏️ تعديل</button>
                    <button onclick="deleteScoreType('${typeId}')" class="action-btn delete-btn">🗑️ حذف</button>
                </div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

// Update multiple indicator to show current selection
function updateMultipleIndicator(formType) {
    const selectId = formType === 'Add' ? 'newScoreTypeMultiple' : 'editScoreTypeMultiple';
    const indicatorId = `multipleIndicator${formType}`;

    const select = document.getElementById(selectId);
    const indicator = document.getElementById(indicatorId);

    if (!select || !indicator) return;

    const value = select.value;

    if (value === 'true') {
        indicator.textContent = '✅ نعم';
        indicator.className = 'selection-indicator indicator-yes';
    } else {
        indicator.textContent = '❌ لا';
        indicator.className = 'selection-indicator indicator-no';
    }
}

function showAddScoreTypeForm() {
    document.getElementById('addScoreTypeForm').classList.remove('hidden');
    document.getElementById('newScoreTypeId').value = '';
    document.getElementById('newScoreTypeLabel').value = '';
    document.getElementById('newScoreTypeMultiple').value = 'false';
    const pointsInput = document.getElementById('newScoreTypePoints');
    if (pointsInput) pointsInput.value = '1';
    updateMultipleIndicator('Add');
}

function hideAddScoreTypeForm() {
    document.getElementById('addScoreTypeForm').classList.add('hidden');
}

// Auto-generate ID from Arabic label
function generateIdFromLabel(label) {
    // Transliteration map for Arabic to English
    const translitMap = {
        'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a',
        'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
        'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
        'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
        'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
        'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
        'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
        'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
        'ة': 'h', 'ئ': 'y', 'ء': '', 'ؤ': 'w'
    };

    let id = '';
    for (let char of label) {
        if (translitMap[char]) {
            id += translitMap[char];
        } else if (char === ' ') {
            id += '_';
        } else if (/[a-z0-9_]/.test(char.toLowerCase())) {
            id += char.toLowerCase();
        }
    }

    // Clean up multiple underscores and trim
    id = id.replace(/_+/g, '_').replace(/^_|_$/g, '');

    // If empty, use a default
    if (!id) id = 'custom_' + Date.now();

    // Ensure uniqueness
    let finalId = id;
    let counter = 1;
    while (SCORE_TYPES[finalId]) {
        finalId = id + '_' + counter;
        counter++;
    }

    return finalId;
}

async function addScoreType() {
    let id = document.getElementById('newScoreTypeId').value.trim().toLowerCase();
    const label = document.getElementById('newScoreTypeLabel').value.trim();
    const allowMultiple = document.getElementById('newScoreTypeMultiple').value === 'true';
    const pointsInput = document.getElementById('newScoreTypePoints');
    const points = pointsInput ? parseInt(pointsInput.value) || 1 : 1;

    // Auto-generate ID if not provided
    if (!id) {
        id = generateIdFromLabel(label);
        console.log('🔄 Auto-generated ID:', id);
    }

    console.log('➕ Adding new score type:', { id, label, allowMultiple, points });

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
        allowMultiplePerDay: allowMultiple,
        points: points
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

// Show edit form (as modal popup)
function editScoreType(typeId) {
    console.log('🔍 editScoreType called with typeId:', typeId);

    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) {
        console.error('❌ Score type not found:', typeId);
        return;
    }

    console.log('✏️ Opening edit modal for score type:', typeId, scoreType);

    // Hide add form if visible
    hideAddScoreTypeForm();

    // Populate form
    document.getElementById('editScoreTypeId').value = typeId;
    document.getElementById('editScoreTypeIdDisplay').value = typeId;
    document.getElementById('editScoreTypeLabel').value = scoreType.label;
    document.getElementById('editScoreTypeMultiple').value = scoreType.allowMultiplePerDay ? 'true' : 'false';
    const pointsInput = document.getElementById('editScoreTypePoints');
    if (pointsInput) {
        pointsInput.value = scoreType.points !== undefined ? scoreType.points : 1;
    }

    // Update indicator
    updateMultipleIndicator('Edit');

    // Show modal
    const modal = document.getElementById('editScoreTypeModal');
    console.log('📦 Modal element:', modal);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
        console.log('✅ Modal shown');
    } else {
        console.error('❌ Modal element not found!');
    }
}

// Hide edit form modal
function hideEditScoreTypeForm() {
    const modal = document.getElementById('editScoreTypeModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }
}

// Setup modal backdrop click handler
function setupEditModalBackdrop() {
    const modalOverlay = document.getElementById('editScoreTypeModal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            // Only close if clicking the overlay itself, not the modal container
            if (e.target === modalOverlay) {
                hideEditScoreTypeForm();
            }
        });
    }
}

// Call setup when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEditModalBackdrop);
} else {
    setupEditModalBackdrop();
}

// Save edited score type
async function saveScoreTypeEdit() {
    const typeId = document.getElementById('editScoreTypeId').value;
    const newLabel = document.getElementById('editScoreTypeLabel').value.trim();
    const allowMultiple = document.getElementById('editScoreTypeMultiple').value === 'true';
    const pointsInput = document.getElementById('editScoreTypePoints');
    const points = pointsInput ? parseInt(pointsInput.value) || 1 : 1;

    if (!newLabel) {
        showNotification('الرجاء إدخال الاسم العربي', 'error');
        return;
    }

    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) {
        showNotification('نوع النقاط غير موجود', 'error');
        return;
    }

    console.log('💾 Saving score type edit:', typeId, { newLabel, allowMultiple, points });

    // Update local data
    SCORE_TYPES[typeId] = {
        ...scoreType,
        label: newLabel,
        allowMultiplePerDay: allowMultiple,
        points: points
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

    hideEditScoreTypeForm();
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
        // Also remove from dailyScores
        if (studentsData[studentId].dailyScores) {
            Object.keys(studentsData[studentId].dailyScores).forEach(key => {
                if (key.endsWith('__' + typeId)) {
                    delete studentsData[studentId].dailyScores[key];
                }
            });
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
    showSection('scanner');
}

function showDashboard() {
    showSection('dashboard');
}

function showQRGenerator() {
    showSection('qrGenerator');
}

function showSettings() {
    showSection('settings');

    // Update tab visibility based on permissions
    const teamsTabBtn = document.getElementById('teamsTabBtn');
    const academicYearsTabBtn = document.getElementById('academicYearsTabBtn');
    const teamsSettingsTab = document.getElementById('teamsSettingsTab');
    const academicYearsSettingsTab = document.getElementById('academicYearsSettingsTab');

    const canTeams = canManageTeams();
    const canYears = canManageAcademicYears();

    // Show/hide tab buttons based on permissions
    if (teamsTabBtn) {
        teamsTabBtn.style.display = canTeams ? '' : 'none';
    }
    if (academicYearsTabBtn) {
        academicYearsTabBtn.style.display = canYears ? '' : 'none';
    }

    // Set the active tab to the first available one
    if (canTeams) {
        switchSettingsTab('teams');
    } else if (canYears) {
        switchSettingsTab('academicYears');
    }
}

// ============================================
// TEAMS AND ACADEMIC YEARS MANAGEMENT
// ============================================

// Load teams data from Firebase
function loadTeamsData() {
    if (!window.firebase || !window.firebase.database) {
        console.log('ℹ️ Firebase not available, teams data will load from listener');
        return;
    }
    // Data is loaded via the Firebase listener, this just triggers rendering
    renderTeamsList();
    populateTeamDropdowns();
}

// Load academic years data from Firebase
function loadAcademicYearsData() {
    if (!window.firebase || !window.firebase.database) {
        console.log('ℹ️ Firebase not available, academic years data will load from listener');
        return;
    }
    // Data is loaded via the Firebase listener, this just triggers rendering
    renderAcademicYearsList();
    populateAcademicYearDropdowns();
}

// Switch between settings tabs
function switchSettingsTab(tab) {
    // Check permissions before switching
    if (tab === 'teams' && !canManageTeams()) {
        showNotification('ليس لديك صلاحية إدارة الفرق', 'error');
        return;
    }
    if (tab === 'academicYears' && !canManageAcademicYears()) {
        showNotification('ليس لديك صلاحية إدارة السنوات الدراسية', 'error');
        return;
    }

    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));

    if (tab === 'teams') {
        document.getElementById('teamsTabBtn').classList.add('active');
        document.getElementById('teamsSettingsTab').classList.remove('hidden');
        document.getElementById('academicYearsSettingsTab').classList.add('hidden');
    } else {
        document.getElementById('academicYearsTabBtn').classList.add('active');
        document.getElementById('teamsSettingsTab').classList.add('hidden');
        document.getElementById('academicYearsSettingsTab').classList.remove('hidden');
    }
}

// Update color preview when color picker changes
function updateColorPreview() {
    const colorInput = document.getElementById('newTeamColor');
    const colorPreview = document.getElementById('newTeamColorPreview');
    const colorHex = document.getElementById('newTeamColorHex');

    if (colorInput && colorPreview) {
        colorPreview.style.backgroundColor = colorInput.value;
    }
    if (colorHex) {
        colorHex.textContent = colorInput.value.toUpperCase();
    }
}

// Get team color by team name
function getTeamColor(teamName) {
    if (!teamName) return null;

    const team = Object.values(teamsData).find(t =>
        t.name && t.name.toLowerCase() === teamName.toLowerCase()
    );

    return team ? team.color : null;
}

// Show add team form
function showAddTeamForm() {
    document.getElementById('addTeamForm').classList.remove('hidden');
    document.getElementById('newTeamName').value = '';
    document.getElementById('newTeamColor').value = '#667eea';
    document.getElementById('newTeamResponsible').value = '';
    updateColorPreview();
}

// Hide add team form
function hideAddTeamForm() {
    document.getElementById('addTeamForm').classList.add('hidden');
}

// Add new team
async function addTeam() {
    if (!canManageTeams()) {
        showNotification('ليس لديك صلاحية إدارة الفرق', 'error');
        return;
    }

    const name = document.getElementById('newTeamName').value.trim();
    const color = document.getElementById('newTeamColor').value;
    const responsible = document.getElementById('newTeamResponsible')?.value?.trim() || '';

    if (!name) {
        showNotification('الرجاء إدخال اسم الفريق', 'error');
        return;
    }

    // Check for duplicate name
    const isDuplicateName = Object.values(teamsData).some(t =>
        t.name && t.name.toLowerCase() === name.toLowerCase()
    );
    if (isDuplicateName) {
        showNotification('يوجد فريق بهذا الاسم بالفعل', 'error');
        return;
    }

    // Check for duplicate color
    const isDuplicateColor = Object.values(teamsData).some(t =>
        t.color && t.color.toLowerCase() === color.toLowerCase()
    );
    if (isDuplicateColor) {
        showNotification('هذا اللون مستخدم بالفعل. الرجاء اختيار لون مختلف', 'error');
        return;
    }

    const teamId = sanitizeFirebaseKey(name);
    const teamData = {
        name,
        color,
        responsible,
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin
    };

    try {
        const teamRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.TEAMS}/${teamId}`);
        await window.firebase.set(teamRef, teamData);

        // Update all QR codes and students with this team to have the responsible
        if (responsible) {
            await updateTeamResponsibleForAll(name, responsible);
        }

        // Clear form and hide it
        document.getElementById('newTeamName').value = '';
        document.getElementById('newTeamColor').value = '#667eea';
        if (document.getElementById('newTeamResponsible')) {
            document.getElementById('newTeamResponsible').value = '';
        }
        updateColorPreview();
        hideAddTeamForm();

        showNotification('✅ تم إضافة الفريق بنجاح', 'success');
    } catch (error) {
        console.error('Error adding team:', error);
        showNotification('حدث خطأ أثناء إضافة الفريق', 'error');
    }
}

// Edit team
function editTeam(teamId) {
    if (!canManageTeams()) {
        showNotification('ليس لديك صلاحية إدارة الفرق', 'error');
        return;
    }

    const team = teamsData[teamId];
    if (!team) return;

    let dialogHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>✏️ تعديل الفريق</h3>
                <button onclick="closeEditDialog()" class="modal-close-btn">✖️</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>اسم الفريق:</label>
                    <input type="text" id="editTeamName" value="${team.name}">
                </div>
                <div class="form-group">
                    <label>لون الفريق:</label>
                    <div class="color-picker-container">
                        <input type="color" id="editTeamColor" value="${team.color}">
                        <span id="editTeamColorPreview" class="color-preview" style="background-color: ${team.color};"></span>
                    </div>
                </div>
                <div class="form-group">
                    <label>👨‍💼 المسؤول عن الفريق:</label>
                    <input type="text" id="editTeamResponsible" value="${team.responsible || ''}" placeholder="اسم المسؤول أو الخادم المشرف">
                    <small class="hint">💡 سيتم تحديث المسؤول لجميع أعضاء الفريق تلقائياً</small>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="saveTeamEdit('${teamId}')" class="vip-button">💾 حفظ التغييرات</button>
                <button onclick="closeEditDialog()" class="cancel-btn">✖️ إلغاء</button>
            </div>
        </div>
    `;

    showEditDialog(dialogHTML);

    // Add color preview update listener
    setTimeout(() => {
        const editColorInput = document.getElementById('editTeamColor');
        if (editColorInput) {
            editColorInput.addEventListener('input', function() {
                const preview = document.getElementById('editTeamColorPreview');
                if (preview) preview.style.backgroundColor = this.value;
            });
        }
    }, 100);
}

// Save team edit
async function saveTeamEdit(teamId) {
    if (!canManageTeams()) {
        showNotification('ليس لديك صلاحية إدارة الفرق', 'error');
        return;
    }

    const newName = document.getElementById('editTeamName').value.trim();
    const newColor = document.getElementById('editTeamColor').value;
    const newResponsible = document.getElementById('editTeamResponsible')?.value?.trim() || '';

    if (!newName) {
        showNotification('الرجاء إدخال اسم الفريق', 'error');
        return;
    }

    const oldTeam = teamsData[teamId];
    if (!oldTeam) {
        showNotification('الفريق غير موجود', 'error');
        return;
    }

    // Check for duplicate color (excluding current team)
    const isDuplicateColor = Object.entries(teamsData).some(([id, t]) =>
        id !== teamId && t.color && t.color.toLowerCase() === newColor.toLowerCase()
    );
    if (isDuplicateColor) {
        showNotification('هذا اللون مستخدم بالفعل', 'error');
        return;
    }

    const oldTeamName = oldTeam.name;
    const oldResponsible = oldTeam.responsible || '';

    try {
        // Update team data
        const updatedTeamData = {
            ...oldTeam,
            name: newName,
            color: newColor,
            responsible: newResponsible,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };

        const teamRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.TEAMS}/${teamId}`);
        await window.firebase.set(teamRef, updatedTeamData);

        // Update all students and QR codes with the old team name
        if (oldTeamName !== newName) {
            await updateTeamNameInRecords(oldTeamName, newName);
        }

        // Update team responsible for all members if changed
        if (oldResponsible !== newResponsible) {
            await updateTeamResponsibleForAll(newName, newResponsible);
        }

        closeEditDialog();
        showNotification('✅ تم تحديث الفريق بنجاح', 'success');
    } catch (error) {
        console.error('Error saving team edit:', error);
        showNotification('حدث خطأ أثناء حفظ التغييرات', 'error');
    }
}

// Update team responsible for all team members (students and QR codes)
async function updateTeamResponsibleForAll(teamName, responsibleName) {
    let studentsUpdated = 0;
    let qrCodesUpdated = 0;

    // Update students
    for (const [studentId, student] of Object.entries(studentsData)) {
        if (student.team === teamName) {
            studentsData[studentId].teamResponsible = responsibleName;
            studentsData[studentId].lastUpdated = new Date().toISOString();
            studentsData[studentId].lastUpdatedBy = currentAdmin;
            await saveToFirebase(studentId, studentsData[studentId]);
            studentsUpdated++;
        }
    }

    // Update QR codes
    for (const [qrId, qr] of Object.entries(qrCodesData)) {
        if (qr.team === teamName) {
            qrCodesData[qrId].teamResponsible = responsibleName;
            qrCodesData[qrId].lastUpdated = new Date().toISOString();
            qrCodesData[qrId].lastUpdatedBy = currentAdmin;
            await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
            qrCodesUpdated++;
        }
    }

    if (studentsUpdated > 0 || qrCodesUpdated > 0) {
        console.log(`✅ Updated team responsible in ${studentsUpdated} students and ${qrCodesUpdated} QR codes`);
    }

    return { studentsUpdated, qrCodesUpdated };
}

// Update team name in all student and QR records
async function updateTeamNameInRecords(oldName, newName) {
    let studentsUpdated = 0;
    let qrCodesUpdated = 0;

    // Update students
    for (const [studentId, student] of Object.entries(studentsData)) {
        if (student.team === oldName) {
            studentsData[studentId].team = newName;
            studentsData[studentId].lastUpdated = new Date().toISOString();
            studentsData[studentId].lastUpdatedBy = currentAdmin;
            await saveToFirebase(studentId, studentsData[studentId]);
            studentsUpdated++;
        }
    }

    // Update QR codes
    for (const [qrId, qr] of Object.entries(qrCodesData)) {
        if (qr.team === oldName) {
            qrCodesData[qrId].team = newName;
            qrCodesData[qrId].lastUpdated = new Date().toISOString();
            qrCodesData[qrId].lastUpdatedBy = currentAdmin;
            await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
            qrCodesUpdated++;
        }
    }

    if (studentsUpdated > 0 || qrCodesUpdated > 0) {
        console.log(`✅ Updated team name in ${studentsUpdated} students and ${qrCodesUpdated} QR codes`);
    }
}

// Delete team
async function deleteTeam(teamId) {
    if (!canManageTeams()) {
        showNotification('ليس لديك صلاحية إدارة الفرق', 'error');
        return;
    }

    const team = teamsData[teamId];
    if (!team) return;

    // Check if team is in use
    const studentsWithTeam = Object.values(studentsData).filter(s => s.team === team.name).length;
    const qrCodesWithTeam = Object.values(qrCodesData).filter(q => q.team === team.name).length;

    let confirmMessage = `هل أنت متأكد من حذف فريق "${team.name}"؟`;
    if (studentsWithTeam > 0 || qrCodesWithTeam > 0) {
        confirmMessage += `\n\n⚠️ تنبيه: يوجد ${studentsWithTeam} مخدوم و ${qrCodesWithTeam} رمز QR مرتبط بهذا الفريق.`;
    }

    if (!confirm(confirmMessage)) return;

    try {
        const teamRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.TEAMS}/${teamId}`);
        await window.firebase.set(teamRef, null);

        showNotification('✅ تم حذف الفريق بنجاح', 'success');
    } catch (error) {
        console.error('Error deleting team:', error);
        showNotification('حدث خطأ أثناء حذف الفريق', 'error');
    }
}

// Render teams list
function renderTeamsList() {
    const container = document.getElementById('teamsList');
    if (!container) return;

    if (Object.keys(teamsData).length === 0) {
        container.innerHTML = `
            <div class="settings-empty-state">
                <span>⚽</span>
                <p>لا توجد فرق مضافة</p>
            </div>
        `;
        return;
    }

    let html = '';
    Object.entries(teamsData).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || '', 'ar')).forEach(([teamId, team]) => {
        const responsibleText = team.responsible ? `👨‍💼 المسؤول: ${team.responsible}` : '👨‍💼 لم يتم تعيين مسؤول';

        // Show friendly name for creator - replace system values with actual admin name
        let creatorName = team.createdBy || 'غير معروف';
        if (creatorName === 'system-init' || creatorName === 'system' || creatorName === 'النظام') {
            creatorName = 'النظام (إعداد تلقائي)';
        }

        html += `
            <div class="team-card" style="border-right: 4px solid ${team.color};">
                <div class="team-color-preview" style="background-color: ${team.color};"></div>
                <div class="team-info">
                    <h4>${team.name}</h4>
                    <small style="display: block; color: ${team.responsible ? '#667eea' : '#999'};">${responsibleText}</small>
                    <small style="display: block; margin-top: 4px;">أنشأه: ${creatorName}</small>
                </div>
                <div class="team-actions">
                    <button onclick="editTeam('${teamId}')" class="action-btn edit-btn" title="تعديل">✏️ تعديل</button>
                    <button onclick="deleteTeam('${teamId}')" class="action-btn delete-btn" title="حذف">🗑️ حذف</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Add new academic year
async function addAcademicYear() {
    if (!canManageAcademicYears()) {
        showNotification('ليس لديك صلاحية إدارة السنوات الدراسية', 'error');
        return;
    }

    const name = document.getElementById('newAcademicYearName').value.trim();

    if (!name) {
        showNotification('الرجاء إدخال اسم السنة الدراسية', 'error');
        return;
    }

    // Check for duplicate
    const isDuplicate = Object.values(academicYearsData).some(y =>
        y.name && y.name.toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
        showNotification('توجد سنة دراسية بهذا الاسم بالفعل', 'error');
        return;
    }

    const yearId = sanitizeFirebaseKey(name);
    const yearData = {
        name,
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin
    };

    try {
        const yearRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.ACADEMIC_YEARS}/${yearId}`);
        await window.firebase.set(yearRef, yearData);

        document.getElementById('newAcademicYearName').value = '';
        showNotification('✅ تم إضافة السنة الدراسية بنجاح', 'success');
    } catch (error) {
        console.error('Error adding academic year:', error);
        showNotification('حدث خطأ أثناء إضافة السنة الدراسية', 'error');
    }
}

// Edit academic year
function editAcademicYear(yearId) {
    if (!canManageAcademicYears()) {
        showNotification('ليس لديك صلاحية إدارة السنوات الدراسية', 'error');
        return;
    }

    const year = academicYearsData[yearId];
    if (!year) return;

    let dialogHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>✏️ تعديل السنة الدراسية</h3>
                <button onclick="closeEditDialog()" class="modal-close-btn">✖️</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>اسم السنة الدراسية:</label>
                    <input type="text" id="editAcademicYearName" value="${year.name}">
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="saveAcademicYearEdit('${yearId}')" class="vip-button">💾 حفظ التغييرات</button>
                <button onclick="closeEditDialog()" class="cancel-btn">✖️ إلغاء</button>
            </div>
        </div>
    `;

    showEditDialog(dialogHTML);
}

// Save academic year edit
async function saveAcademicYearEdit(yearId) {
    if (!canManageAcademicYears()) {
        showNotification('ليس لديك صلاحية إدارة السنوات الدراسية', 'error');
        return;
    }

    const newName = document.getElementById('editAcademicYearName').value.trim();

    if (!newName) {
        showNotification('الرجاء إدخال اسم السنة الدراسية', 'error');
        return;
    }

    const oldYear = academicYearsData[yearId];
    if (!oldYear) {
        showNotification('السنة الدراسية غير موجودة', 'error');
        return;
    }

    const oldYearName = oldYear.name;

    try {
        const updatedYearData = {
            ...oldYear,
            name: newName,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };

        const yearRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.ACADEMIC_YEARS}/${yearId}`);
        await window.firebase.set(yearRef, updatedYearData);

        // Update all students and QR codes with the old year name
        if (oldYearName !== newName) {
            await updateAcademicYearInRecords(oldYearName, newName);
        }

        closeEditDialog();
        showNotification('✅ تم تحديث السنة الدراسية بنجاح', 'success');
    } catch (error) {
        console.error('Error saving academic year edit:', error);
        showNotification('حدث خطأ أثناء حفظ التغييرات', 'error');
    }
}

// Update academic year in all student and QR records
async function updateAcademicYearInRecords(oldName, newName) {
    let studentsUpdated = 0;
    let qrCodesUpdated = 0;

    // Update students
    for (const [studentId, student] of Object.entries(studentsData)) {
        if (student.academicYear === oldName) {
            studentsData[studentId].academicYear = newName;
            studentsData[studentId].lastUpdated = new Date().toISOString();
            studentsData[studentId].lastUpdatedBy = currentAdmin;
            await saveToFirebase(studentId, studentsData[studentId]);
            studentsUpdated++;
        }
    }

    // Update QR codes
    for (const [qrId, qr] of Object.entries(qrCodesData)) {
        if (qr.academicYear === oldName) {
            qrCodesData[qrId].academicYear = newName;
            qrCodesData[qrId].lastUpdated = new Date().toISOString();
            qrCodesData[qrId].lastUpdatedBy = currentAdmin;
            await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
            qrCodesUpdated++;
        }
    }

    if (studentsUpdated > 0 || qrCodesUpdated > 0) {
        console.log(`✅ Updated academic year in ${studentsUpdated} students and ${qrCodesUpdated} QR codes`);
    }
}

// Delete academic year
async function deleteAcademicYear(yearId) {
    if (!canManageAcademicYears()) {
        showNotification('ليس لديك صلاحية إدارة السنوات الدراسية', 'error');
        return;
    }

    const year = academicYearsData[yearId];
    if (!year) return;

    // Check if year is in use
    const studentsWithYear = Object.values(studentsData).filter(s => s.academicYear === year.name).length;
    const qrCodesWithYear = Object.values(qrCodesData).filter(q => q.academicYear === year.name).length;

    let confirmMessage = `هل أنت متأكد من حذف السنة الدراسية "${year.name}"؟`;
    if (studentsWithYear > 0 || qrCodesWithYear > 0) {
        confirmMessage += `\n\n⚠️ تنبيه: يوجد ${studentsWithYear} مخدوم و ${qrCodesWithYear} رمز QR مرتبط بهذه السنة الدراسية.`;
    }

    if (!confirm(confirmMessage)) return;

    try {
        const yearRef = window.firebase.ref(window.firebase.database, `${FIREBASE_PATHS.ACADEMIC_YEARS}/${yearId}`);
        await window.firebase.set(yearRef, null);

        showNotification('✅ تم حذف السنة الدراسية بنجاح', 'success');
    } catch (error) {
        console.error('Error deleting academic year:', error);
        showNotification('حدث خطأ أثناء حذف السنة الدراسية', 'error');
    }
}

// Render academic years list
function renderAcademicYearsList() {
    const container = document.getElementById('academicYearsList');
    if (!container) return;

    if (Object.keys(academicYearsData).length === 0) {
        container.innerHTML = `
            <div class="settings-empty-state">
                <span>📚</span>
                <p>لا توجد سنوات دراسية مضافة</p>
            </div>
        `;
        return;
    }

    let html = '';
    Object.entries(academicYearsData).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || '', 'ar')).forEach(([yearId, year]) => {
        // Show friendly name for creator - replace system values with actual admin name
        let creatorName = year.createdBy || 'غير معروف';
        if (creatorName === 'system-init' || creatorName === 'system' || creatorName === 'النظام') {
            creatorName = 'النظام (إعداد تلقائي)';
        }

        html += `
            <div class="academic-year-card">
                <div class="academic-year-info">
                    <h4>📚 ${year.name}</h4>
                    <small>أنشأه: ${creatorName}</small>
                </div>
                <div class="academic-year-actions">
                    <button onclick="editAcademicYear('${yearId}')" class="action-btn edit-btn" title="تعديل">✏️ تعديل</button>
                    <button onclick="deleteAcademicYear('${yearId}')" class="action-btn delete-btn" title="حذف">🗑️ حذف</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Populate team dropdowns
function populateTeamDropdowns() {
    const dropdownIds = ['qrTeamSelect'];

    dropdownIds.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        const currentValue = dropdown.value;
        dropdown.innerHTML = '<option value="">اختر الفريق</option>';

        Object.values(teamsData).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(team => {
            const option = document.createElement('option');
            option.value = team.name;
            option.textContent = team.name;
            dropdown.appendChild(option);
        });

        // Restore value if exists
        if (currentValue) {
            dropdown.value = currentValue;
        }
    });
}

// Populate academic year dropdowns
function populateAcademicYearDropdowns() {
    const dropdownIds = ['qrAcademicYearSelect'];

    dropdownIds.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        const currentValue = dropdown.value;
        dropdown.innerHTML = '<option value="">اختر السنة الدراسية</option>';

        Object.values(academicYearsData).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(year => {
            const option = document.createElement('option');
            option.value = year.name;
            option.textContent = year.name;
            dropdown.appendChild(option);
        });

        // Add custom option
        const customOption = document.createElement('option');
        customOption.value = '__custom__';
        customOption.textContent = 'مخصص...';
        dropdown.appendChild(customOption);

        // Restore value if exists
        if (currentValue && currentValue !== '__custom__') {
            dropdown.value = currentValue;
        }
    });
}

// Handle academic year dropdown change
function onAcademicYearSelectChange() {
    const select = document.getElementById('qrAcademicYearSelect');
    const customInput = document.getElementById('qrAcademicYearCustom');

    if (!select || !customInput) return;

    if (select.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
        customInput.value = '';
    }
}

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// ============================================
// QR CODE GENERATION AND MANAGEMENT SYSTEM
// ============================================

// QR Codes data storage
let qrCodesData = {};

// Helper function to decode QR data (pipe-delimited format)
// Format: name|academicYear|phone|team|teamResponsible
function decodeQRData(qrString) {
    try {
        const parts = qrString.split('|');
        return {
            name: parts[0] || '',
            academicYear: parts[1] || '',
            phone: parts[2] || '',
            team: parts[3] || '',
            teamResponsible: parts[4] || ''
        };
    } catch (error) {
        console.error('Error decoding QR data:', error);
        return null;
    }
}

// Load QR codes from localStorage only
// Firebase real-time listener (initializeFirebaseSync) handles Firebase data loading
async function loadQRCodes() {
    // Load from localStorage
    const stored = localStorage.getItem('qrCodesData');
    if (stored) {
        try {
            qrCodesData = JSON.parse(stored);
            console.log('✅ Loaded QR codes from localStorage:', Object.keys(qrCodesData).length, 'codes');
        } catch (error) {
            console.error('Error parsing QR codes from localStorage:', error);
            qrCodesData = {};
        }
    } else {
        qrCodesData = {};
        console.log('ℹ️ No QR codes in localStorage, waiting for Firebase sync...');
    }

    // Real-time listener will sync from Firebase automatically when ready
}

// Save QR codes to Firebase and localStorage
async function saveQRCodesToFirebase(qrId, qrData) {
    console.log('💾 saveQRCodesToFirebase called for:', qrId, qrData);

    // Validate qrData
    if (!qrData || !qrData.name) {
        console.error('❌ Invalid QR data - missing name!', qrData);
        showNotification('خطأ: بيانات QR غير صالحة', 'error');
        return;
    }

    // Save to localStorage
    localStorage.setItem('qrCodesData', JSON.stringify(qrCodesData));
    console.log('✅ Saved to localStorage');

    // Save to Firebase
    if (window.firebase && window.firebase.database) {
        // Check if user is authenticated
        if (!window.firebase.auth || !window.firebase.auth.currentUser) {
            console.warn('⚠️ Firebase auth not ready yet, data saved to localStorage');
            showNotification('تم الحفظ محلياً - جاري المزامنة مع الخادم...', 'info');
            return;
        }

        try {
            console.log('📤 Saving to Firebase at path: qrcodes/' + qrId);
            console.log('📤 User authenticated:', window.firebase.auth.currentUser.uid);
            const qrRef = window.firebase.ref(window.firebase.database, `qrcodes/${qrId}`);
            await window.firebase.set(qrRef, qrData);
            console.log('✅ Successfully saved to Firebase');
        } catch (error) {
            console.error('❌ Error saving QR code to Firebase:', error);
            console.error('Error details:', error.code, error.message);

            if (error.code === 'PERMISSION_DENIED') {
                showNotification('⚠️ خطأ في الصلاحيات - تم الحفظ محلياً فقط', 'warning');
            } else {
                showNotification('حدث خطأ في حفظ QR للخادم: ' + error.message, 'error');
            }
        }
    } else {
        console.warn('⚠️ Firebase not available - only saved to localStorage');
    }
}

// Generate QR Code
async function generateQRCode() {
    // Check permission
    if (!canAddQR()) {
        showNotification('ليس لديك صلاحية لإضافة رموز QR', 'error');
        return;
    }

    const rawName = document.getElementById('qrStudentName').value.trim();

    // Get academic year from dropdown or custom input
    const yearSelect = document.getElementById('qrAcademicYearSelect');
    const yearCustom = document.getElementById('qrAcademicYearCustom');
    const academicYear = yearSelect && yearSelect.value === '__custom__'
        ? (yearCustom ? yearCustom.value.trim() : '')
        : (yearSelect ? yearSelect.value : '');

    const phone = document.getElementById('qrPhone').value.trim();

    // Get team from dropdown
    const teamSelect = document.getElementById('qrTeamSelect');
    const team = teamSelect ? teamSelect.value : '';

    // Validation
    if (!rawName) {
        showNotification('الرجاء إدخال اسم المخدوم', 'error');
        return;
    }

    // Clean the name: remove special characters like ?, replace with proper spaces
    const cleanedName = rawName
        .replace(/\?/g, ' ')           // Replace ? with space
        .replace(/[^\u0600-\u06FF\s\w]/g, ' ')  // Remove non-Arabic, non-alphanumeric except spaces
        .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
        .trim();

    if (!cleanedName) {
        showNotification('الاسم غير صالح بعد إزالة الأحرف الخاصة', 'error');
        return;
    }

    // Phone validation (if provided)
    if (phone && (phone.length !== 11 || !/^[0-9]{11}$/.test(phone))) {
        showNotification('رقم الهاتف يجب أن يكون 11 رقم', 'error');
        return;
    }

    // Check for duplicate names (name must be unique)
    const isDuplicate = Object.values(qrCodesData).some(qr =>
        qr.name.toLowerCase() === cleanedName.toLowerCase()
    );

    if (isDuplicate) {
        showNotification('يوجد مخدوم بهذا الاسم بالفعل. الرجاء استخدام اسم مختلف', 'error');
        return;
    }

    // Get team responsible from team data
    let teamResponsible = '';
    if (team) {
        const teamEntry = Object.values(teamsData).find(t => t.name === team);
        if (teamEntry && teamEntry.responsible) {
            teamResponsible = teamEntry.responsible;
        }
    }

    // Create QR data object with cleaned name
    const qrData = {
        name: cleanedName,
        academicYear: academicYear || '',
        phone: phone || '',
        team: team || '',
        teamResponsible: teamResponsible,
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin
    };

    // Generate unique ID
    const qrId = sanitizeFirebaseKey(cleanedName) + '_' + Date.now();

    // Add to qrCodesData
    qrCodesData[qrId] = qrData;

    // Save to Firebase (real-time listener will update all users)
    await saveQRCodesToFirebase(qrId, qrData);

    // Show success notification
    showNotification('تم إنشاء رمز QR بنجاح', 'success');

    // Reset form
    resetQRForm();

    // Update filter dropdowns with new values
    populateFilterDropdowns();

    // Render table
    renderQRCodesTable();
}

// Populate filter dropdowns with unique values from existing data
function populateFilterDropdowns() {
    // Get unique academic years, teams, admins, and team responsibles from both students and QR codes
    const academicYears = new Set();
    const teams = new Set();
    const admins = new Set();
    const teamResponsibles = new Set();

    // Collect from students data
    Object.values(studentsData).forEach(student => {
        if (student.academicYear && student.academicYear.trim()) {
            academicYears.add(student.academicYear.trim());
        }
        if (student.team && student.team.trim()) {
            teams.add(student.team.trim());
        }
        if (student.lastUpdatedBy && student.lastUpdatedBy.trim()) {
            admins.add(student.lastUpdatedBy.trim());
        }
        if (student.teamResponsible && student.teamResponsible.trim()) {
            teamResponsibles.add(student.teamResponsible.trim());
        }
    });

    // Collect from QR codes data
    Object.values(qrCodesData).forEach(qr => {
        if (qr.academicYear && qr.academicYear.trim()) {
            academicYears.add(qr.academicYear.trim());
        }
        if (qr.team && qr.team.trim()) {
            teams.add(qr.team.trim());
        }
        if (qr.createdBy && qr.createdBy.trim()) {
            admins.add(qr.createdBy.trim());
        }
        if (qr.teamResponsible && qr.teamResponsible.trim()) {
            teamResponsibles.add(qr.teamResponsible.trim());
        }
    });

    // Populate Dashboard Academic Year filter
    const dashboardAcademicYearFilter = document.getElementById('filterAcademicYear');
    if (dashboardAcademicYearFilter) {
        const currentValue = dashboardAcademicYearFilter.value;
        dashboardAcademicYearFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(academicYears).sort().forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            dashboardAcademicYearFilter.appendChild(option);
        });
        if (currentValue) dashboardAcademicYearFilter.value = currentValue;
    }

    // Populate Dashboard Team filter
    const dashboardTeamFilter = document.getElementById('filterTeam');
    if (dashboardTeamFilter) {
        const currentValue = dashboardTeamFilter.value;
        dashboardTeamFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(teams).sort().forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            dashboardTeamFilter.appendChild(option);
        });
        if (currentValue) dashboardTeamFilter.value = currentValue;
    }

    // Populate Dashboard Team Responsible filter
    const dashboardTeamResponsibleFilter = document.getElementById('filterTeamResponsible');
    if (dashboardTeamResponsibleFilter) {
        const currentValue = dashboardTeamResponsibleFilter.value;
        dashboardTeamResponsibleFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(teamResponsibles).sort().forEach(responsible => {
            const option = document.createElement('option');
            option.value = responsible;
            option.textContent = responsible;
            dashboardTeamResponsibleFilter.appendChild(option);
        });
        if (currentValue) dashboardTeamResponsibleFilter.value = currentValue;
    }

    // Populate Dashboard Admin/Servant filter
    const dashboardAdminFilter = document.getElementById('filterAdmin');
    if (dashboardAdminFilter) {
        const currentValue = dashboardAdminFilter.value;
        dashboardAdminFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(admins).sort().forEach(admin => {
            const option = document.createElement('option');
            option.value = admin;
            option.textContent = admin;
            dashboardAdminFilter.appendChild(option);
        });
        if (currentValue) dashboardAdminFilter.value = currentValue;
    }

    // Populate QR Generator Academic Year filter
    const qrAcademicYearFilter = document.getElementById('qrFilterYear');
    if (qrAcademicYearFilter) {
        const currentValue = qrAcademicYearFilter.value;
        qrAcademicYearFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(academicYears).sort().forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            qrAcademicYearFilter.appendChild(option);
        });
        if (currentValue) qrAcademicYearFilter.value = currentValue;
    }

    // Populate QR Generator Team filter
    const qrTeamFilter = document.getElementById('qrFilterTeam');
    if (qrTeamFilter) {
        const currentValue = qrTeamFilter.value;
        qrTeamFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(teams).sort().forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            qrTeamFilter.appendChild(option);
        });
        if (currentValue) qrTeamFilter.value = currentValue;
    }

    // Populate QR Generator Team Responsible filter
    const qrTeamResponsibleFilter = document.getElementById('qrFilterTeamResponsible');
    if (qrTeamResponsibleFilter) {
        const currentValue = qrTeamResponsibleFilter.value;
        qrTeamResponsibleFilter.innerHTML = '<option value="">الكل</option>';
        Array.from(teamResponsibles).sort().forEach(responsible => {
            const option = document.createElement('option');
            option.value = responsible;
            option.textContent = responsible;
            qrTeamResponsibleFilter.appendChild(option);
        });
        if (currentValue) qrTeamResponsibleFilter.value = currentValue;
    }
}

// Reset QR form

function resetQRForm() {
    document.getElementById('qrStudentName').value = '';

    // Reset academic year dropdown and custom input
    const yearSelect = document.getElementById('qrAcademicYearSelect');
    const yearCustom = document.getElementById('qrAcademicYearCustom');
    if (yearSelect) yearSelect.value = '';
    if (yearCustom) {
        yearCustom.value = '';
        yearCustom.classList.add('hidden');
    }

    document.getElementById('qrPhone').value = '';

    // Reset team dropdown
    const teamSelect = document.getElementById('qrTeamSelect');
    if (teamSelect) teamSelect.value = '';
}

// Render QR Codes Table
function renderQRCodesTable(filteredData = null) {
    const tableContainer = document.getElementById('qrCodesTable');
    const dataToRender = filteredData || qrCodesData;

    if (Object.keys(dataToRender).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic; padding: 40px;">لم يتم إنشاء أي رموز QR بعد.</p>';
        return;
    }

    const recordCount = Object.keys(dataToRender).length;
    let tableHTML = `
        <div class="qr-section">
            <div class="qr-section-header">
                <span class="date-title">📋 رموز QR</span>
                <span class="date-count">${recordCount} رمز</span>
            </div>
            <div class="qr-section-content">
                <div class="table-scroll-hint">← اسحب للمشاهدة ←</div>
                <table class="modern-table qr-table">
                    <thead>
                        <tr>
                            <th>الاسم</th>
                            <th>السنة</th>
                            <th>الهاتف</th>
                            <th>الفريق</th>
                            <th class="col-hide-mobile">المسؤول</th>
                            <th class="col-hide-mobile">تاريخ الإنشاء</th>
                            <th class="col-hide-mobile">أنشأه</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    Object.entries(dataToRender).forEach(([qrId, qr]) => {
        const createdDate = formatDateTwoLines(qr.createdAt);

        // Build action buttons based on permissions
        let actionButtons = '';
        if (canEditQR()) {
            actionButtons += `<button onclick="editQRCode('${qrId}')" class="action-btn edit-btn" title="تعديل">✏️</button>`;
        }
        actionButtons += `<button onclick="downloadQRCode('${qrId}')" class="action-btn download-btn" title="تحميل QR">⬇️</button>`;
        actionButtons += `<button onclick="downloadBookmark('${qrId}')" class="action-btn bookmark-btn" title="تحميل علامة">🔖</button>`;
        if (canDeleteQR()) {
            actionButtons += `<button onclick="deleteQRCode('${qrId}')" class="action-btn delete-btn" title="حذف">🗑️</button>`;
        }

        // Get team color for row styling
        const teamColor = getTeamColor(qr.team);
        const rowStyle = teamColor
            ? `border-right: 10px solid ${teamColor}; background: linear-gradient(90deg, ${teamColor}20 0%, transparent 40%);`
            : '';

        tableHTML += `
            <tr style="${rowStyle}">
                <td><strong>${qr.name}</strong></td>
                <td>${qr.academicYear || '-'}</td>
                <td class="phone-cell">${qr.phone || '-'}</td>
                <td>${qr.team || '-'}</td>
                <td class="col-hide-mobile">${qr.teamResponsible || '-'}</td>
                <td class="col-hide-mobile">${createdDate}</td>
                <td class="col-hide-mobile">${qr.createdBy || 'غير معروف'}</td>
                <td>
                    <div class="action-buttons">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    tableContainer.innerHTML = tableHTML;
}

// Edit QR Code
async function editQRCode(qrId) {
    // Check permission
    if (!canEditQR()) {
        showNotification('ليس لديك صلاحية لتعديل رموز QR', 'error');
        return;
    }

    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    // Build academic year options
    let yearOptions = '<option value="">اختر السنة الدراسية</option>';
    let yearMatchFound = false;
    Object.values(academicYearsData).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(year => {
        const selected = year.name === qr.academicYear ? 'selected' : '';
        if (selected) yearMatchFound = true;
        yearOptions += `<option value="${year.name}" ${selected}>${year.name}</option>`;
    });
    yearOptions += '<option value="__custom__">مخصص...</option>';

    // Build team options
    let teamOptions = '<option value="">اختر الفريق</option>';
    Object.values(teamsData).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(team => {
        const selected = team.name === qr.team ? 'selected' : '';
        teamOptions += `<option value="${team.name}" ${selected}>${team.name}</option>`;
    });

    // Check if current year value is custom (not in configured lists)
    const isYearCustom = qr.academicYear && !yearMatchFound;

    let dialogHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>✏️ تعديل رمز QR</h3>
                <button onclick="closeEditDialog()" class="modal-close-btn">✖️</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>اسم المخدوم: <span class="required">*</span></label>
                    <input type="text" id="editQRName" value="${qr.name}">
                </div>
                <div class="form-group">
                    <label>السنة الدراسية:</label>
                    <select id="editQRAcademicYearSelect" onchange="onEditAcademicYearSelectChange()">
                        ${yearOptions}
                    </select>
                    <input type="text" id="editQRAcademicYearCustom" value="${isYearCustom ? qr.academicYear : ''}" placeholder="أدخل السنة الدراسية" class="${isYearCustom ? 'custom-input' : 'hidden custom-input'}">
                </div>
                <div class="form-group">
                    <label>رقم الهاتف:</label>
                    <input type="tel" id="editQRPhone" value="${qr.phone || ''}" maxlength="11" pattern="[0-9]{11}">
                </div>
                <div class="form-group">
                    <label>الفريق:</label>
                    <select id="editQRTeamSelect">
                        ${teamOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>المسؤول عن الفريق:</label>
                    <input type="text" id="editQRTeamResponsible" value="${qr.teamResponsible || '-'}" disabled readonly class="disabled-input">
                    <small class="hint">💡 للتعديل استخدم زر "إدارة مسؤولي الفرق"</small>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="saveQREdit('${qrId}')" class="vip-button">💾 حفظ التغييرات</button>
                <button onclick="closeEditDialog()" class="cancel-btn">✖️ إلغاء</button>
            </div>
        </div>
    `;

    showEditDialog(dialogHTML);

    // If custom year value, set the select to __custom__
    setTimeout(() => {
        if (isYearCustom) {
            const yearSelect = document.getElementById('editQRAcademicYearSelect');
            if (yearSelect) yearSelect.value = '__custom__';
        }
    }, 50);
}

// Handle edit modal dropdown changes
function onEditAcademicYearSelectChange() {
    const select = document.getElementById('editQRAcademicYearSelect');
    const customInput = document.getElementById('editQRAcademicYearCustom');

    if (!select || !customInput) return;

    if (select.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
        customInput.value = '';
    }
}

// Save QR Edit
async function saveQREdit(qrId) {
    const newName = document.getElementById('editQRName').value.trim();

    // Get academic year from dropdown or custom input
    const yearSelect = document.getElementById('editQRAcademicYearSelect');
    const yearCustom = document.getElementById('editQRAcademicYearCustom');
    const newAcademicYear = yearSelect && yearSelect.value === '__custom__'
        ? (yearCustom ? yearCustom.value.trim() : '')
        : (yearSelect ? yearSelect.value : '');

    const newPhone = document.getElementById('editQRPhone').value.trim();

    // Get team from dropdown
    const teamSelect = document.getElementById('editQRTeamSelect');
    const newTeam = teamSelect ? teamSelect.value : '';

    // Get team responsible from team data when team changes
    let newTeamResponsible = qrCodesData[qrId]?.teamResponsible || '';
    if (newTeam) {
        const teamEntry = Object.values(teamsData).find(t => t.name === newTeam);
        if (teamEntry && teamEntry.responsible) {
            newTeamResponsible = teamEntry.responsible;
        }
    }

    if (!newName) {
        showNotification('الرجاء إدخال اسم المخدوم', 'error');
        return;
    }

    // Phone validation (if provided)
    if (newPhone && (newPhone.length !== 11 || !/^[0-9]{11}$/.test(newPhone))) {
        showNotification('رقم الهاتف يجب أن يكون 11 رقم', 'error');
        return;
    }

    // Check for duplicate names (excluding current QR being edited)
    const isDuplicate = Object.entries(qrCodesData).some(([id, qr]) =>
        id !== qrId &&
        qr.name.toLowerCase() === newName.toLowerCase()
    );

    if (isDuplicate) {
        showNotification('يوجد مخدوم آخر بهذا الاسم. الرجاء استخدام اسم مختلف', 'error');
        return;
    }

    const oldName = qrCodesData[qrId].name;

    // Update QR data
    qrCodesData[qrId].name = newName;
    qrCodesData[qrId].academicYear = newAcademicYear;
    qrCodesData[qrId].phone = newPhone;
    qrCodesData[qrId].team = newTeam;
    qrCodesData[qrId].teamResponsible = newTeamResponsible;
    qrCodesData[qrId].lastUpdated = new Date().toISOString();
    qrCodesData[qrId].lastUpdatedBy = currentAdmin;

    // Save to Firebase (real-time listener will update the UI automatically)
    await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);

    // CRITICAL FIX: Update all existing student records that match the old name
    // This ensures the records dashboard shows updated data after QR edit
    const oldStudentId = sanitizeFirebaseKey(oldName);
    const newStudentId = sanitizeFirebaseKey(newName);

    if (studentsData[oldStudentId]) {
        console.log(`📝 Updating student record from "${oldName}" to "${newName}"`);

        // If name changed, we need to move the record to new key
        if (oldName !== newName) {
            // Copy to new key with updated name
            studentsData[newStudentId] = {
                ...studentsData[oldStudentId],
                name: newName,
                academicYear: newAcademicYear,
                team: newTeam,
                teamResponsible: newTeamResponsible,
                lastUpdated: new Date().toISOString(),
                lastUpdatedBy: currentAdmin
            };

            // Save new record to Firebase
            await saveToFirebase(newStudentId, studentsData[newStudentId]);

            // Delete old record from Firebase by setting to null
            try {
                const oldStudentRef = window.firebase.ref(window.firebase.database, `students/${oldStudentId}`);
                await window.firebase.set(oldStudentRef, null);
                console.log(`✅ Deleted old student record: ${oldStudentId}`);
            } catch (error) {
                console.error('Error deleting old student record:', error);
            }

            // Delete old record from local data
            delete studentsData[oldStudentId];
        } else {
            // Just update the existing record with new metadata
            studentsData[oldStudentId].academicYear = newAcademicYear;
            studentsData[oldStudentId].team = newTeam;
            studentsData[oldStudentId].teamResponsible = newTeamResponsible;
            studentsData[oldStudentId].lastUpdated = new Date().toISOString();
            studentsData[oldStudentId].lastUpdatedBy = currentAdmin;

            // Save updated record to Firebase
            await saveToFirebase(oldStudentId, studentsData[oldStudentId]);
        }

        // Save local data backup
        saveData();

        // Re-render scores table to show updated data
        renderScoresTable();
    }

    // Manually update UI immediately for better UX (real-time listener will sync across devices)
    populateFilterDropdowns();
    applyQRFilters();

    closeEditDialog();
    showNotification('تم تحديث رمز QR بنجاح', 'success');
}

// Helper function to generate QR code canvas using kjua library
function generateQRCanvas(text, size) {
    // Check if kjua library is loaded
    if (typeof window.kjua === 'undefined') {
        throw new Error('QR library not available. Please refresh the page.');
    }

    try {
        console.log('📝 Generating QR for text:', text);
        console.log('📝 Text length:', text.length);
        console.log('📝 Character codes:', Array.from(text).map(c => c.charCodeAt(0)));

        // Generate QR code using kjua (returns a canvas element)
        // kjua properly handles UTF-8 by default
        const canvas = window.kjua({
            text: text,
            size: size,
            ecLevel: 'H',       // High error correction (30%)
            mode: 'plain',      // Plain mode (no logo)
            rounded: 0,         // Square modules
            quiet: 2,           // Quiet zone (border modules)
            fill: '#000000',    // Black QR modules
            back: '#ffffff',    // White background
            render: 'canvas'    // Return canvas element
        });

        console.log('✅ QR code generated successfully with kjua');
        console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);

        return canvas;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

// Download QR Code with student name underneath
async function downloadQRCode(qrId) {
    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    console.log('📥 Downloading QR for:', qrId);
    console.log('📥 QR Data:', qr);
    console.log('📥 Student Name:', qr.name);

    // QR code contains only the student name (which is unique)
    // All other data (phone, team, year) is looked up from database when scanned
    const qrDataString = qr.name;

    if (!qrDataString || qrDataString.trim() === '') {
        console.error('❌ Empty QR data string!');
        showNotification('خطأ: اسم المخدوم فارغ في قاعدة البيانات', 'error');
        return;
    }

    console.log('✅ QR Data String:', qrDataString);
    console.log('✅ QR Data String length:', qrDataString.length);

    try {
        console.log('🔄 Generating QR code with kjua, text:', JSON.stringify(qrDataString));

        // Generate QR code canvas
        const qrCanvas = generateQRCanvas(qrDataString, 700);
        const actualQrSize = qrCanvas.width;

        console.log('✅ QR code generated successfully');
        console.log('QR Canvas dimensions:', actualQrSize, 'x', actualQrSize);

        // Create final canvas with extra height for text
        const textHeight = 180;
        const padding = 30;
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = actualQrSize;
        finalCanvas.height = actualQrSize + textHeight;

        const ctx = finalCanvas.getContext('2d');

        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        // Create temporary canvas for gradient manipulation
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = actualQrSize;
        tempCanvas.height = actualQrSize;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw original QR to temp canvas
        tempCtx.drawImage(qrCanvas, 0, 0);

        // Get pixel data for gradient application
        const imageData = tempCtx.getImageData(0, 0, actualQrSize, actualQrSize);
        const data = imageData.data;

        // Apply gradient only to dark pixels (QR modules)
        for (let y = 0; y < actualQrSize; y++) {
            const ratio = y / actualQrSize;
            // Purple at top: RGB(124, 58, 237) -> Dark at bottom: RGB(31, 31, 31)
            const r = Math.round(124 - (93 * ratio));
            const g = Math.round(58 - (27 * ratio));
            const b = Math.round(237 - (206 * ratio));

            for (let x = 0; x < actualQrSize; x++) {
                const index = (y * actualQrSize + x) * 4;
                // Only modify dark pixels (threshold at 128)
                if (data[index] < 128) {
                    data[index] = r;
                    data[index + 1] = g;
                    data[index + 2] = b;
                }
            }
        }

        // Put modified pixel data back
        tempCtx.putImageData(imageData, 0, 0);

        // Draw the gradient QR to final canvas
        ctx.drawImage(tempCanvas, 0, 0);

        // Draw student name below QR code (very large font)
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 96px Arial, sans-serif'; // Increased font size from 72px to 96px
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap for long names
        const maxWidth = actualQrSize - (padding * 2);
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

        // Draw lines centered with larger line height, positioned closer to QR
        const lineHeight = 100; // Increased line height for 96px font
        const startY = actualQrSize + 40 + (lineHeight / 2); // Moved closer to QR (40px gap instead of calculated center)

        lines.forEach((line, index) => {
            ctx.fillText(line.trim(), actualQrSize / 2, startY + (index * lineHeight));
        });

        // Convert to blob and download
        finalCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `QR_${qr.name.replace(/\s+/g, '_')}.png`;
            link.click();
            URL.revokeObjectURL(url);
            showNotification('تم تحميل رمز QR بنجاح', 'success');
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        showNotification('حدث خطأ في إنشاء رمز QR: ' + error.message, 'error');
    }
}

// Download Bookmark with QR Code
async function downloadBookmark(qrId) {
    const qr = qrCodesData[qrId];
    if (!qr) {
        showNotification('رمز QR غير موجود', 'error');
        return;
    }

    console.log('🔖 Downloading Bookmark for:', qrId);
    console.log('🔖 QR Data:', qr);
    console.log('🔖 Student Name:', qr.name);

    // QR code contains only the student name (consistent with downloadQRCode)
    const qrDataString = qr.name;

    if (!qrDataString || qrDataString.trim() === '') {
        console.error('❌ Empty QR data string for bookmark!');
        showNotification('خطأ: اسم المخدوم فارغ في قاعدة البيانات', 'error');
        return;
    }

    console.log('✅ Bookmark QR Data String:', qrDataString);

    try {
        // Generate QR code using kjua library (reliable UTF-8 support)
        console.log('🔄 Generating bookmark QR with kjua');

        // Generate QR code canvas
        const qrCanvas = generateQRCanvas(qrDataString, 700);

        console.log('✅ Bookmark QR code generated successfully');
        console.log('Bookmark QR Canvas dimensions:', qrCanvas.width, 'x', qrCanvas.height);

        // Load bookmark template image from base64 data (avoids CORS issues)
        const bookmarkImg = new Image();

        bookmarkImg.onload = function() {
                // Get actual QR canvas size
                const actualQrSize = qrCanvas.width;

                // Create a temporary canvas for applying gradient to QR
                const tempGradientCanvas = document.createElement('canvas');
                tempGradientCanvas.width = actualQrSize;
                tempGradientCanvas.height = actualQrSize;
                const tempCtx = tempGradientCanvas.getContext('2d');

                // Draw original QR
                tempCtx.drawImage(qrCanvas, 0, 0);

                // Get pixel data
                const imageData = tempCtx.getImageData(0, 0, actualQrSize, actualQrSize);
                const data = imageData.data;

                // Apply gradient only to dark pixels
                for (let y = 0; y < actualQrSize; y++) {
                    const ratio = y / actualQrSize;
                    const r = Math.round(124 - (93 * ratio));  // 124 -> 31
                    const g = Math.round(58 - (27 * ratio));   // 58 -> 31
                    const b = Math.round(237 - (206 * ratio)); // 237 -> 31

                    for (let x = 0; x < actualQrSize; x++) {
                        const index = (y * actualQrSize + x) * 4;
                        if (data[index] < 128) {
                            data[index] = r;
                            data[index + 1] = g;
                            data[index + 2] = b;
                        }
                    }
                }

                // Put modified pixel data back
                tempCtx.putImageData(imageData, 0, 0);

                // Create final canvas with bookmark dimensions
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = bookmarkImg.width;
                finalCanvas.height = bookmarkImg.height;
                const ctx = finalCanvas.getContext('2d');

                // Draw bookmark template
                ctx.drawImage(bookmarkImg, 0, 0);

                // Calculate QR position - smaller, fits comfortably in white frame
                const qrSize = 210; // Smaller QR code that fits well inside white frame
                const qrX = 45; // Positioned inside white frame (bottom left)
                const qrY = bookmarkImg.height - 265; // Positioned in white frame with margin

                // Draw gradient QR code on bookmark
                ctx.drawImage(tempGradientCanvas, qrX, qrY, qrSize, qrSize);

                // Add student name below QR code - auto-scale to fit on one line
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const nameX = qrX + (qrSize / 2);
                const nameY = qrY + qrSize + 1; // Minimal gap between QR and name
                const maxWidth = qrSize; // Max width for text

                // Start with large font and scale down if needed to fit on one line
                let fontSize = 36; // Starting font size
                ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                let textWidth = ctx.measureText(qr.name).width;

                // Reduce font size until text fits on one line
                while (textWidth > maxWidth && fontSize > 20) {
                    fontSize -= 1;
                    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                    textWidth = ctx.measureText(qr.name).width;
                }

                // Draw the name on a single line
                ctx.fillText(qr.name, nameX, nameY);

                // Convert to data URL and download (avoids tainted canvas issues)
                try {
                    const dataURL = finalCanvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.href = dataURL;
                    link.download = `Bookmark_${qr.name.replace(/\s+/g, '_')}.png`;
                    link.click();
                    showNotification('تم تحميل علامة الكتاب بنجاح', 'success');
                } catch (err) {
                    console.error('Canvas export error:', err);
                    showNotification('خطأ في تصدير علامة الكتاب. تأكد من فتح الملف عبر خادم ويب محلي', 'error');
                }
        };

        bookmarkImg.onerror = function() {
            showNotification('تعذر تحميل قالب علامة الكتاب. تأكد من وجود ملف bookmark-template-data.js', 'error');
        };

        // Load the bookmark template from base64 data
        if (typeof BOOKMARK_TEMPLATE_DATA !== 'undefined') {
            bookmarkImg.src = BOOKMARK_TEMPLATE_DATA;
        } else {
            // Fallback to file if base64 not available
            showNotification('ملف bookmark-template-data.js غير محمل. تحديث الصفحة قد يحل المشكلة', 'error');
        }

    } catch (error) {
        console.error('Error generating bookmark:', error);
        showNotification('حدث خطأ في إنشاء علامة الكتاب: ' + error.message, 'error');
    }
}

// Helper function to generate standalone QR image as blob
async function generateStandaloneQRBlob(qr) {
    const qrDataString = qr.name;

    // Generate QR code canvas
    const qrCanvas = generateQRCanvas(qrDataString, 700);
    const actualQrSize = qrCanvas.width;

    // Create final canvas with extra height for text
    const textHeight = 180;
    const padding = 30;
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = actualQrSize;
    finalCanvas.height = actualQrSize + textHeight;

    const ctx = finalCanvas.getContext('2d');

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    // Create temporary canvas for gradient manipulation
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = actualQrSize;
    tempCanvas.height = actualQrSize;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw original QR to temp canvas
    tempCtx.drawImage(qrCanvas, 0, 0);

    // Get pixel data for gradient application
    const imageData = tempCtx.getImageData(0, 0, actualQrSize, actualQrSize);
    const data = imageData.data;

    // Apply gradient only to dark pixels (QR modules)
    for (let y = 0; y < actualQrSize; y++) {
        const ratio = y / actualQrSize;
        const r = Math.round(124 - (93 * ratio));
        const g = Math.round(58 - (27 * ratio));
        const b = Math.round(237 - (206 * ratio));

        for (let x = 0; x < actualQrSize; x++) {
            const index = (y * actualQrSize + x) * 4;
            if (data[index] < 128) {
                data[index] = r;
                data[index + 1] = g;
                data[index + 2] = b;
            }
        }
    }

    // Put modified pixel data back
    tempCtx.putImageData(imageData, 0, 0);

    // Draw the gradient QR to final canvas
    ctx.drawImage(tempCanvas, 0, 0);

    // Draw student name below QR code
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 96px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Word wrap for long names
    const maxWidth = actualQrSize - (padding * 2);
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

    // Draw lines centered with larger line height, positioned closer to QR
    const lineHeight = 100;
    const startY = actualQrSize + 40 + (lineHeight / 2);

    lines.forEach((line, index) => {
        ctx.fillText(line.trim(), actualQrSize / 2, startY + (index * lineHeight));
    });

    // Convert to blob
    return new Promise((resolve) => {
        finalCanvas.toBlob((blob) => resolve(blob));
    });
}

// Helper function to generate bookmark QR image as blob
async function generateBookmarkQRBlob(qr) {
    return new Promise((resolve, reject) => {
        const qrDataString = qr.name;

        // Check if bookmark template is available
        if (typeof BOOKMARK_TEMPLATE_DATA === 'undefined') {
            reject(new Error('Bookmark template not loaded. Please refresh the page.'));
            return;
        }

        try {
            // Generate QR code canvas
            const qrCanvas = generateQRCanvas(qrDataString, 700);

            // Load bookmark template image from base64 data
            const bookmarkImg = new Image();

            bookmarkImg.onload = function() {
                const actualQrSize = qrCanvas.width;

                // Create a temporary canvas for applying gradient to QR
                const tempGradientCanvas = document.createElement('canvas');
                tempGradientCanvas.width = actualQrSize;
                tempGradientCanvas.height = actualQrSize;
                const tempCtx = tempGradientCanvas.getContext('2d');

                // Draw original QR
                tempCtx.drawImage(qrCanvas, 0, 0);

                // Get pixel data
                const imageData = tempCtx.getImageData(0, 0, actualQrSize, actualQrSize);
                const data = imageData.data;

                // Apply gradient only to dark pixels
                for (let y = 0; y < actualQrSize; y++) {
                    const ratio = y / actualQrSize;
                    const r = Math.round(124 - (93 * ratio));
                    const g = Math.round(58 - (27 * ratio));
                    const b = Math.round(237 - (206 * ratio));

                    for (let x = 0; x < actualQrSize; x++) {
                        const index = (y * actualQrSize + x) * 4;
                        if (data[index] < 128) {
                            data[index] = r;
                            data[index + 1] = g;
                            data[index + 2] = b;
                        }
                    }
                }

                // Put modified pixel data back
                tempCtx.putImageData(imageData, 0, 0);

                // Create final canvas with bookmark dimensions
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = bookmarkImg.width;
                finalCanvas.height = bookmarkImg.height;
                const ctx = finalCanvas.getContext('2d');

                // Draw bookmark template
                ctx.drawImage(bookmarkImg, 0, 0);

                // Calculate QR position
                const qrSize = 210;
                const qrX = 45;
                const qrY = bookmarkImg.height - 265;

                // Draw gradient QR code on bookmark
                ctx.drawImage(tempGradientCanvas, qrX, qrY, qrSize, qrSize);

                // Add student name below QR code
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const nameX = qrX + (qrSize / 2);
                const nameY = qrY + qrSize + 1;
                const maxWidth = qrSize;

                // Start with large font and scale down if needed
                let fontSize = 36;
                let nameText = qr.name;
                ctx.font = `bold ${fontSize}px Arial, sans-serif`;

                while (ctx.measureText(nameText).width > maxWidth && fontSize > 20) {
                    fontSize -= 2;
                    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                }

                ctx.fillText(nameText, nameX, nameY);

                // Convert to blob
                finalCanvas.toBlob((blob) => resolve(blob));
            };

            bookmarkImg.onerror = () => reject(new Error('Failed to load bookmark template'));
            bookmarkImg.src = BOOKMARK_TEMPLATE_DATA;
        } catch (error) {
            reject(error);
        }
    });
}

// Export QR Images (standalone or bookmark) as ZIP
async function exportQRImages(type) {
    if (Object.keys(qrCodesData).length === 0) {
        showNotification('لا توجد بيانات لتصديرها', 'error');
        return;
    }

    // Check if bookmark template is loaded when exporting bookmarks
    if (type === 'bookmark' && typeof BOOKMARK_TEMPLATE_DATA === 'undefined') {
        showNotification('قالب البوك مارك غير محمل. يرجى تحديث الصفحة والمحاولة مرة أخرى', 'error');
        return;
    }

    // Get filtered data
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

    const filteredQRs = Object.values(filteredData);

    if (filteredQRs.length === 0) {
        showNotification('لا توجد بيانات تطابق الفلاتر المحددة', 'error');
        return;
    }

    const typeName = type === 'bookmark' ? 'Bookmarks' : 'QR_Images';
    showNotification(`جاري إنشاء ${filteredQRs.length} صورة...`, 'info');

    try {
        if (filteredQRs.length === 1) {
            // Single image - download directly
            const qr = filteredQRs[0];
            const blob = type === 'bookmark'
                ? await generateBookmarkQRBlob(qr)
                : await generateStandaloneQRBlob(qr);

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${typeName}_${qr.name.replace(/\s+/g, '_')}.png`;
            link.click();
            URL.revokeObjectURL(url);
            showNotification('تم تحميل الصورة بنجاح', 'success');
        } else {
            // Multiple images - create ZIP
            const zip = new JSZip();

            for (let i = 0; i < filteredQRs.length; i++) {
                const qr = filteredQRs[i];
                const blob = type === 'bookmark'
                    ? await generateBookmarkQRBlob(qr)
                    : await generateStandaloneQRBlob(qr);

                const fileName = `${qr.name.replace(/\s+/g, '_')}.png`;
                zip.file(fileName, blob);

                // Update progress
                if ((i + 1) % 5 === 0 || i === filteredQRs.length - 1) {
                    showNotification(`جاري المعالجة: ${i + 1} من ${filteredQRs.length}`, 'info');
                }
            }

            // Generate and download ZIP
            showNotification('جاري إنشاء ملف ZIP...', 'info');
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().split('T')[0];
            link.download = `${typeName}_${timestamp}.zip`;
            link.click();
            URL.revokeObjectURL(url);

            showNotification(`تم تصدير ${filteredQRs.length} صورة بنجاح في ملف ZIP`, 'success');
        }
    } catch (error) {
        console.error('Error exporting QR images:', error);
        showNotification('حدث خطأ أثناء تصدير الصور: ' + error.message, 'error');
    }
}

// Delete QR Code
async function deleteQRCode(qrId) {
    // Check permission
    if (!canDeleteQR()) {
        showNotification('ليس لديك صلاحية لحذف رموز QR', 'error');
        return;
    }

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
    const teamResponsibleFilter = document.getElementById('qrFilterTeamResponsible')?.value?.trim()?.toLowerCase() || '';

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

    if (teamResponsibleFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, qr]) =>
                qr.teamResponsible && qr.teamResponsible.toLowerCase().includes(teamResponsibleFilter)
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
    const qrFilterTeamResponsible = document.getElementById('qrFilterTeamResponsible');
    if (qrFilterTeamResponsible) qrFilterTeamResponsible.value = '';
    renderQRCodesTable();
}

// Export Filtered QR Data to Excel
function exportFilteredQRs() {
    if (Object.keys(qrCodesData).length === 0) {
        showNotification('لا توجد بيانات لتصديرها', 'error');
        return;
    }

    // Get current filter values
    const nameFilter = document.getElementById('qrFilterName').value.trim().toLowerCase();
    const yearFilter = document.getElementById('qrFilterYear').value.trim().toLowerCase();
    const phoneFilter = document.getElementById('qrFilterPhone').value.trim();
    const teamFilter = document.getElementById('qrFilterTeam').value.trim().toLowerCase();
    const teamResponsibleFilter = document.getElementById('qrFilterTeamResponsible')?.value?.trim()?.toLowerCase() || '';

    // Apply filters to get filtered data
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

    if (teamResponsibleFilter) {
        filteredData = Object.fromEntries(
            Object.entries(filteredData).filter(([id, qr]) =>
                qr.teamResponsible && qr.teamResponsible.toLowerCase().includes(teamResponsibleFilter)
            )
        );
    }

    // Check if any data matches the filters
    if (Object.keys(filteredData).length === 0) {
        showNotification('لا توجد بيانات تطابق الفلاتر المحددة', 'error');
        return;
    }

    // Prepare export data
    const exportData = Object.values(filteredData).map(qr => ({
        'الاسم': qr.name,
        'السنة الدراسية': qr.academicYear || '-',
        'رقم الهاتف': qr.phone || '-',
        'الفريق': qr.team || '-',
        'المسؤول عن الفريق': qr.teamResponsible || '-',
        'تاريخ الإنشاء': new Date(qr.createdAt).toLocaleString('ar-EG'),
        'الخادم': qr.createdBy || 'غير معروف'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'QR Codes Filtered');

    const timestamp = new Date().toISOString().split('T')[0];
    const filterSuffix = (nameFilter || yearFilter || phoneFilter || teamFilter || teamResponsibleFilter) ? '_Filtered' : '';
    XLSX.writeFile(wb, `QR_Codes${filterSuffix}_${timestamp}.xlsx`);

    // Show notification with count and hint
    const totalCount = Object.keys(qrCodesData).length;
    const filteredCount = Object.keys(filteredData).length;
    const message = filteredCount === totalCount
        ? `تم تصدير جميع رموز QR (${filteredCount} رمز) بنجاح`
        : `تم تصدير ${filteredCount} من ${totalCount} رمز QR (حسب الفلتر المحدد)`;

    showNotification(message, 'success');
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
        // Page is hidden, pause scanner
        pauseScanner();
    } else {
        // Page is visible, resume scanner if on scanner section
        const scannerSection = document.getElementById('scannerSection');
        if (scannerSection && !scannerSection.classList.contains('hidden')) {
            resumeScanner();
        }
    }
});

// Handle browser back/forward
window.addEventListener('beforeunload', async function() {
    // Stop new scanner
    if (html5Qrcode && isScannerRunning) {
        try {
            await html5Qrcode.stop();
        } catch (e) {}
    }
    // Clear old scanner (fallback)
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.clear();
        } catch (e) {}
    }

    // Clean up Firebase listeners
    firebaseListeners.forEach(unsubscribe => unsubscribe());
});

// ============================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================
// Make functions accessible to onclick handlers in HTML
window.login = login;
window.logout = logout;
window.switchAuthTab = switchAuthTab;
window.submitSignupRequest = submitSignupRequest;
window.toggleSidebar = toggleSidebar;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.showScanner = showScanner;
window.showDashboard = showDashboard;
window.showQRGenerator = showQRGenerator;
window.showProfile = showProfile;
window.showSignupRequests = showSignupRequests;
window.showManageAdmins = showManageAdmins;
window.showManageScoreTypes = showManageScoreTypes;
window.submitScore = submitScore;
window.cancelScoring = cancelScoring;
window.clearFilters = clearFilters;
window.toggleLeaderboard = toggleLeaderboard;
window.toggleTeamsLeaderboard = toggleTeamsLeaderboard;
window.exportToExcel = exportToExcel;
window.clearAllData = clearAllData;
window.generateQRCode = generateQRCode;
window.resetQRForm = resetQRForm;
window.exportQRDataToExcel = exportQRDataToExcel;
window.exportFilteredQRs = exportFilteredQRs;
window.exportQRImages = exportQRImages;
window.clearQRFilters = clearQRFilters;
window.applyQRFilters = applyQRFilters;
window.showTeamAdminManager = showTeamAdminManager;
window.assignTeamResponsible = assignTeamResponsible;
window.clearTeamResponsible = clearTeamResponsible;
window.updateProfile = updateProfile;
window.showAddAdminForm = showAddAdminForm;
window.hideAddAdminForm = hideAddAdminForm;
window.saveAdmin = saveAdmin;
window.showAddScoreTypeForm = showAddScoreTypeForm;
window.hideAddScoreTypeForm = hideAddScoreTypeForm;
window.addScoreType = addScoreType;
window.editScoreType = editScoreType;
window.deleteScoreType = deleteScoreType;
window.hideEditScoreTypeForm = hideEditScoreTypeForm;
window.saveScoreTypeEdit = saveScoreTypeEdit;
window.applyFilters = applyFilters;
window.toggleHeadAdminPermissions = toggleHeadAdminPermissions;
window.updateMultipleIndicator = updateMultipleIndicator;

// Teams and Academic Years Management
window.showSettings = showSettings;
window.switchSettingsTab = switchSettingsTab;
window.updateColorPreview = updateColorPreview;
window.showAddTeamForm = showAddTeamForm;
window.hideAddTeamForm = hideAddTeamForm;
window.addTeam = addTeam;
window.editTeam = editTeam;
window.saveTeamEdit = saveTeamEdit;
window.deleteTeam = deleteTeam;
window.addAcademicYear = addAcademicYear;
window.editAcademicYear = editAcademicYear;
window.saveAcademicYearEdit = saveAcademicYearEdit;
window.deleteAcademicYear = deleteAcademicYear;
window.onAcademicYearSelectChange = onAcademicYearSelectChange;
window.onEditAcademicYearSelectChange = onEditAcademicYearSelectChange;
window.onEditStudentAcademicYearSelectChange = onEditStudentAcademicYearSelectChange;
