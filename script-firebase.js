// Global variables
let html5QrcodeScanner;
let currentAdmin = '';
let currentAdminData = null;
let studentsData = {};
let adminsData = {};
let isFirebaseConnected = false;
let firebaseListeners = [];

// Debug: Check QRCode library on load
window.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 Checking QR libraries...');
    console.log('window.kjua:', typeof window.kjua);
    if (window.kjua) {
        console.log('✅ kjua library loaded');
    } else {
        console.error('❌ kjua library NOT loaded!');
    }
});

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
                    password: '01283469752',
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
                    password: '01207320088',
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
                    password: '01282201313',
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
    document.getElementById('adminNameDisplay').textContent = `${currentAdmin}`;

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
            document.getElementById('adminNameDisplay').textContent = `${currentAdmin}`;

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

        // Resume scanner
        if (html5QrcodeScanner) {
            try {
                html5QrcodeScanner.resume();
            } catch (error) {
                console.log('Note: Scanner resume skipped:', error.message);
            }
        }
        return;
    }

    // Stop scanning temporarily (don't clear DOM)
    if (html5QrcodeScanner) {
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
        if (html5QrcodeScanner) {
            try {
                html5QrcodeScanner.resume();
            } catch (error) {
                console.log('Error resuming scanner:', error);
            }
        }
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
            if (html5QrcodeScanner) {
                try {
                    html5QrcodeScanner.resume();
                } catch (error) {
                    console.log('Error resuming scanner:', error);
                }
            }
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

    // Pause scanner to prevent additional scans
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Note: Scanner pause skipped:', error.message);
        }
    }

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
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>⭐ إضافة نقاط للمخدوم</h3>
                    <button class="modal-close" onclick="closeScoringModal()">✖</button>
                </div>
                <div class="modal-body" id="scoringModalBody">
                    <!-- Form will be moved here -->
                </div>
            </div>
        `;
        modalOverlay.onclick = closeScoringModal;
        document.body.appendChild(modalOverlay);
    }

    // Move scoring form into modal
    const scoringForm = document.getElementById('scoringForm');
    const modalBody = document.getElementById('scoringModalBody');

    if (scoringForm && modalBody) {
        scoringForm.classList.remove('hidden');
        modalBody.innerHTML = '';
        modalBody.appendChild(scoringForm);
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

        // Move form back to original location after animation
        setTimeout(() => {
            const scoringForm = document.getElementById('scoringForm');
            const scannerSection = document.getElementById('scannerSection');
            if (scoringForm && scannerSection) {
                scoringForm.classList.add('hidden');
                scannerSection.appendChild(scoringForm);
            }
        }, 300);
    }

    // Resume scanner
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.resume();
        } catch (error) {
            console.log('Note: Scanner resume skipped:', error.message);
        }
    }

    // Clear scanned QR data
    scannedQRData = null;
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

    // Update filter dropdowns (in case new team/year was added from QR scan)
    populateFilterDropdowns();

    // Reset form and close modal
    closeScoringModal();

    // Clear form after a short delay
    setTimeout(() => {
        document.getElementById('studentName').value = '';
        document.getElementById('scoreType').value = '';
        document.getElementById('score').value = '1';
    }, 350);
}

function cancelScoring() {
    // Close modal and resume scanning
    closeScoringModal();
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
        tableContainer.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic;">لم يتم تسجيل أي نقاط بعد.</p>';
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

// ============================================
// SECTION MANAGEMENT SYSTEM - Design Pattern
// ============================================

// Section Registry - Single Source of Truth (Registry Pattern)
const SECTIONS = {
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
            renderScoresTable();
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
                renderQRCodesTable();
            }).catch(error => {
                console.error('Error loading QR codes:', error);
                renderQRCodesTable();
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
    signupRequests: {
        id: 'signupRequestsSection',
        navId: 'signupRequestsNavBtn',
        onShow: () => renderPendingRequests(),
        onHide: () => {},
        permissionCheck: () => isHeadAdmin()
    }
};

// Helper functions for section lifecycle
function pauseScanner() {
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.pause(false);
        } catch (error) {
            console.log('Error pausing scanner:', error);
        }
    }
}

function hideScoringForm() {
    const form = document.getElementById('scoringForm');
    if (form) form.classList.add('hidden');
}

function initializeScannerIfNeeded() {
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

// Central Section Manager (Strategy Pattern + Command Pattern)
function showSection(sectionKey) {
    const section = SECTIONS[sectionKey];

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
    Object.values(SECTIONS).forEach(s => {
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
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Add active class to clicked nav
    if (document.getElementById(navId)) {
        document.getElementById(navId).classList.add('active');
    }
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
            canModifyDashboard: false
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
            if (!permissions.canAddQR && !permissions.canEditQR && !permissions.canDeleteQR && !permissions.canModifyDashboard) {
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
        canModifyDashboard: document.getElementById('dialogPermModifyDashboard').checked
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
        canModifyDashboard: document.getElementById('permModifyDashboard').checked
    };

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
        canModifyDashboard: false
    };

    document.getElementById('permAddQR').checked = permissions.canAddQR;
    document.getElementById('permEditQR').checked = permissions.canEditQR;
    document.getElementById('permDeleteQR').checked = permissions.canDeleteQR;
    document.getElementById('permModifyDashboard').checked = permissions.canModifyDashboard;

    // Apply head admin toggle effect
    toggleHeadAdminPermissions();

    // Show form
    document.getElementById('addAdminForm').classList.remove('hidden');
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

        html += `
            <div class="score-type-card">
                <div class="score-type-header">
                    <h4>${scoreType.label}</h4>
                    <code class="score-type-id">${typeId}</code>
                </div>
                <div class="score-type-info">
                    <p><strong>تسجيل متعدد:</strong> <span class="selection-indicator ${multipleClass}">${multipleIcon} ${multipleText}</span></p>
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

    // Auto-generate ID if not provided
    if (!id) {
        id = generateIdFromLabel(label);
        console.log('🔄 Auto-generated ID:', id);
    }

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

    // Update indicator
    updateMultipleIndicator('Edit');

    // Show modal
    const modal = document.getElementById('editScoreTypeModal');
    console.log('📦 Modal element:', modal);
    if (modal) {
        modal.classList.remove('hidden');
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

    if (!newLabel) {
        showNotification('الرجاء إدخال الاسم العربي', 'error');
        return;
    }

    const scoreType = SCORE_TYPES[typeId];
    if (!scoreType) {
        showNotification('نوع النقاط غير موجود', 'error');
        return;
    }

    console.log('💾 Saving score type edit:', typeId, { newLabel, allowMultiple });

    // Update local data
    SCORE_TYPES[typeId] = {
        ...scoreType,
        label: newLabel,
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
    const academicYear = document.getElementById('qrAcademicYear').value.trim();
    const phone = document.getElementById('qrPhone').value.trim();
    const team = document.getElementById('qrTeam').value.trim();

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

    // Create QR data object with cleaned name
    const qrData = {
        name: cleanedName,
        academicYear: academicYear || '',
        phone: phone || '',
        team: team || '',
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
    // Get unique academic years, teams, and admins from both students and QR codes
    const academicYears = new Set();
    const teams = new Set();
    const admins = new Set();

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
        tableContainer.innerHTML = '<p style="text-align: center; color: #ffffff; font-style: italic; padding: 40px;">لم يتم إنشاء أي رموز QR بعد.</p>';
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
                        ${actionButtons}
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
    renderQRCodesTable();

    closeEditDialog();
    showNotification('تم تحديث رمز QR بنجاح', 'success');
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
    console.log('✅ QR Data String bytes:', Array.from(qrDataString).map(c => c.charCodeAt(0)));

    try {
        // Generate QR code using kjua library (proper UTF-8 support)
        console.log('🔄 Generating QR code with kjua, text:', JSON.stringify(qrDataString));

        // Check if kjua library is loaded
        if (typeof window.kjua === 'undefined') {
            console.error('❌ kjua library not loaded');
            throw new Error('QR library not available. Please refresh the page.');
        }

        // Generate QR code with kjua (returns a canvas element)
        const qrCanvas = window.kjua({
            text: qrDataString,
            size: 700,
            ecLevel: 'H',  // High error correction
            mode: 'plain',  // Plain mode (no logo)
            rounded: 0,     // Square modules
            quiet: 2,       // Quiet zone (border modules)
            fill: '#000000',
            back: '#ffffff',
            render: 'canvas'
        });

        console.log('✅ QR code generated successfully with kjua');
        console.log('QR Canvas dimensions:', qrCanvas.width, 'x', qrCanvas.height);

        // Process the QR code immediately (no timeout needed)
        (function() {
            if (qrCanvas) {
                // Get actual QR canvas size
                const actualQrSize = qrCanvas.width;
                const textHeight = 100;
                const padding = 30;

                // Create a new canvas with extra height for the name
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

                // Draw original QR to temp canvas (actual size)
                tempCtx.drawImage(qrCanvas, 0, 0);

                // Get pixel data
                const imageData = tempCtx.getImageData(0, 0, actualQrSize, actualQrSize);
                const data = imageData.data;

                // Apply gradient only to dark pixels (QR modules)
                // Keep dark pixels dark enough for scanning
                for (let y = 0; y < actualQrSize; y++) {
                    // Calculate gradient color for this row
                    const ratio = y / actualQrSize;
                    // Purple at top: RGB(124, 58, 237)
                    // Dark at bottom: RGB(31, 31, 31)
                    const r = Math.round(124 - (93 * ratio));  // 124 -> 31
                    const g = Math.round(58 - (27 * ratio));   // 58 -> 31
                    const b = Math.round(237 - (206 * ratio)); // 237 -> 31

                    for (let x = 0; x < actualQrSize; x++) {
                        const index = (y * actualQrSize + x) * 4;
                        // Only modify dark pixels (QR code modules)
                        // Threshold at 128 to detect black pixels
                        if (data[index] < 128) {
                            data[index] = r;
                            data[index + 1] = g;
                            data[index + 2] = b;
                            // Keep alpha at 255
                        }
                    }
                }

                // Put modified pixel data back
                tempCtx.putImageData(imageData, 0, 0);

                // Draw the gradient QR to final canvas
                ctx.drawImage(tempCanvas, 0, 0);

                // Draw student name below QR code (larger font)
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 56px Arial, sans-serif'; // Larger, more prominent text
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Draw name (split into multiple lines if too long)
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

                // Draw lines centered (adjusted for larger font)
                const lineHeight = 64; // Increased for 56px font
                const startY = actualQrSize + (textHeight / 2) - ((lines.length - 1) * lineHeight / 2);

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
            } else {
                showNotification('حدث خطأ في إنشاء رمز QR', 'error');
            }
        })();  // End of IIFE
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
        // Generate QR code using kjua library (proper UTF-8 support)
        console.log('🔄 Generating bookmark QR with kjua');

        // Check if kjua library is loaded
        if (typeof window.kjua === 'undefined') {
            console.error('❌ kjua library not loaded');
            throw new Error('QR library not available. Please refresh the page.');
        }

        // Generate QR code with kjua
        const qrCanvas = window.kjua({
            text: qrDataString,
            size: 700,
            ecLevel: 'H',
            mode: 'plain',
            rounded: 0,
            quiet: 1,
            fill: '#000000',
            back: '#ffffff',
            render: 'canvas'
        });

        console.log('✅ Bookmark QR code generated successfully with kjua');
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

                // Calculate QR position - slightly moved to trailing (right)
                const qrSize = 200; // Smaller QR code for bookmark
                const qrX = 47; // Slightly to trailing (right) side
                const qrY = bookmarkImg.height - 240; // Adjusted vertical position

                // Draw gradient QR code on bookmark
                ctx.drawImage(tempGradientCanvas, qrX, qrY, qrSize, qrSize);

                // Add student name below QR code with minimal spacing
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 32px Arial, sans-serif'; // Increased font size for better readability
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                // Draw name centered below QR, with word wrap if needed
                const nameX = qrX + (qrSize / 2);
                const nameY = qrY + qrSize + 1; // Minimal gap (1px) between QR and name
                const maxWidth = 200; // Match QR width

                // Simple word wrap
                const words = qr.name.split(' ');
                let line = '';
                let lines = [];

                for (let i = 0; i < words.length; i++) {
                    const testLine = line + words[i] + ' ';
                    const metrics = ctx.measureText(testLine);

                    if (metrics.width > maxWidth && i > 0) {
                        lines.push(line.trim());
                        line = words[i] + ' ';
                    } else {
                        line = testLine;
                    }
                }
                lines.push(line.trim());

                // Draw each line with adjusted line spacing
                lines.forEach((textLine, index) => {
                    ctx.fillText(textLine, nameX, nameY + (index * 32));
                });

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

// Clean up invalid QR records (empty names or special characters only)
async function cleanupInvalidQRRecords() {
    console.log('🧹 Starting QR records cleanup...');

    let invalidRecords = [];
    let fixedRecords = [];

    // Find all invalid records
    Object.entries(qrCodesData).forEach(([qrId, qr]) => {
        const originalName = qr.name || '';

        // Clean the name
        const cleanedName = originalName
            .replace(/\?/g, ' ')           // Replace ? with space
            .replace(/[^\u0600-\u06FF\s\w]/g, ' ')  // Remove non-Arabic, non-alphanumeric except spaces
            .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
            .trim();

        // Check if name is empty or invalid
        if (!cleanedName || cleanedName.length === 0) {
            invalidRecords.push({ qrId, originalName });
        } else if (originalName !== cleanedName) {
            // Name needs cleaning
            fixedRecords.push({ qrId, originalName, cleanedName });
        }
    });

    console.log(`Found ${invalidRecords.length} invalid records (empty names)`);
    console.log(`Found ${fixedRecords.length} records that need cleaning`);

    if (invalidRecords.length === 0 && fixedRecords.length === 0) {
        showNotification('✅ جميع السجلات صحيحة - لا حاجة للتنظيف', 'success');
        return;
    }

    // Ask for confirmation
    const confirmMessage = `تم العثور على:\n- ${invalidRecords.length} سجلات بأسماء فارغة (سيتم حذفها)\n- ${fixedRecords.length} سجلات تحتاج تنظيف\n\nهل تريد المتابعة؟`;

    if (!confirm(confirmMessage)) {
        return;
    }

    // Delete invalid records (empty names)
    for (const { qrId, originalName } of invalidRecords) {
        console.log(`Deleting invalid record: "${originalName}" (${qrId})`);
        delete qrCodesData[qrId];

        // Delete from Firebase
        if (window.firebase && window.firebase.database) {
            try {
                const qrRef = window.firebase.ref(window.firebase.database, `qrcodes/${qrId}`);
                await window.firebase.set(qrRef, null);
            } catch (error) {
                console.error('Error deleting invalid QR from Firebase:', error);
            }
        }
    }

    // Fix records with cleanable names
    for (const { qrId, originalName, cleanedName } of fixedRecords) {
        console.log(`Fixing record: "${originalName}" → "${cleanedName}" (${qrId})`);
        qrCodesData[qrId].name = cleanedName;

        // Update in Firebase
        if (window.firebase && window.firebase.database) {
            try {
                await saveQRCodesToFirebase(qrId, qrCodesData[qrId]);
            } catch (error) {
                console.error('Error updating cleaned QR in Firebase:', error);
            }
        }
    }

    // Save to localStorage
    localStorage.setItem('qrCodesData', JSON.stringify(qrCodesData));

    // Update UI
    renderQRCodesTable();
    populateFilterDropdowns();

    showNotification(`✅ تم التنظيف بنجاح:\n- حذف ${invalidRecords.length} سجلات فارغة\n- تنظيف ${fixedRecords.length} سجلات`, 'success');
    console.log('✅ Cleanup complete');
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
