/**
 * Application Constants
 * Centralized configuration for the Student Scoring System
 */

// Firebase Paths
const FIREBASE_PATHS = {
    STUDENTS: 'students',
    ADMINS: 'admins',
    QR_CODES: 'qrcodes',
    SCORE_TYPES: 'scoreTypes',
    SIGNUP_REQUESTS: 'signupRequests',
    TEAMS: 'teams',
    ACADEMIC_YEARS: 'academicYears'
};

// Admin Configuration
const ADMIN_CONFIG = {
    HEAD_ADMIN_PHONE: '01207714622',
    MIN_PASSWORD_LENGTH: 4,
    PHONE_NUMBER_LENGTH: 11
};

// Default Score Types
const DEFAULT_SCORE_TYPES = {
    mass: {
        id: 'mass',
        label: 'حضور القداس',
        icon: '⛪',
        maxScore: 100,
        allowMultiplePerDay: false,
        points: 1
    },
    tunic: {
        id: 'tunic',
        label: 'لبس التونية',
        icon: '👕',
        maxScore: 100,
        allowMultiplePerDay: false,
        points: 1
    },
    meeting: {
        id: 'meeting',
        label: 'حضور الاجتماع',
        icon: '📖',
        maxScore: 100,
        allowMultiplePerDay: false,
        points: 1
    },
    lesson: {
        id: 'lesson',
        label: 'حفظ الدرس',
        icon: '📝',
        maxScore: 100,
        allowMultiplePerDay: false,
        points: 1
    },
    hymn: {
        id: 'hymn',
        label: 'حفظ الألحان',
        icon: '🎵',
        maxScore: 100,
        allowMultiplePerDay: false,
        points: 1
    },
    verse: {
        id: 'verse',
        label: 'حفظ الآيات',
        icon: '✝️',
        maxScore: 100,
        allowMultiplePerDay: false,
        points: 1
    },
    service: {
        id: 'service',
        label: 'الخدمة',
        icon: '🤝',
        maxScore: 100,
        allowMultiplePerDay: true,
        points: 1
    },
    competition: {
        id: 'competition',
        label: 'المسابقة',
        icon: '🏆',
        maxScore: 100,
        allowMultiplePerDay: true,
        points: 1
    }
};

// Permission Types
const PERMISSIONS = {
    MODIFY_DASHBOARD: 'canModifyDashboard',
    DELETE_DATA: 'canDeleteData',
    MANAGE_ADMINS: 'canManageAdmins',
    EXPORT_DATA: 'canExportData',
    ADD_QR: 'canAddQR',
    EDIT_QR: 'canEditQR',
    DELETE_QR: 'canDeleteQR',
    MANAGE_SCORE_TYPES: 'canManageScoreTypes',
    MANAGE_TEAMS: 'canManageTeams',
    MANAGE_ACADEMIC_YEARS: 'canManageAcademicYears'
};

// Default Admin Permissions
const DEFAULT_PERMISSIONS = {
    [PERMISSIONS.MODIFY_DASHBOARD]: true,
    [PERMISSIONS.DELETE_DATA]: false,
    [PERMISSIONS.MANAGE_ADMINS]: false,
    [PERMISSIONS.EXPORT_DATA]: true,
    [PERMISSIONS.ADD_QR]: true,
    [PERMISSIONS.EDIT_QR]: true,
    [PERMISSIONS.DELETE_QR]: false,
    [PERMISSIONS.MANAGE_SCORE_TYPES]: false,
    [PERMISSIONS.MANAGE_TEAMS]: false,
    [PERMISSIONS.MANAGE_ACADEMIC_YEARS]: false
};

// UI Configuration
const UI_CONFIG = {
    NOTIFICATION_DURATION: 3000,  // milliseconds
    DEBOUNCE_DELAY: 300,          // milliseconds
    MAX_QR_SIZE: 700,             // pixels
    BOOKMARK_QR_SIZE: 220,        // pixels
    SOLO_QR_FONT_SIZE: 72,        // pixels
    BOOKMARK_FONT_SIZE: 36,       // pixels
    MIN_BOOKMARK_FONT_SIZE: 20    // pixels
};

// QR Code Configuration
const QR_CONFIG = {
    ERROR_CORRECTION_LEVEL: 'H',  // High (30%)
    MODE: 'plain',
    QUIET_ZONE: 2,                // Border modules
    FILL_COLOR: '#000000',
    BACKGROUND_COLOR: '#ffffff',
    GRADIENT: {
        START: { r: 124, g: 58, b: 237 },   // Purple
        END: { r: 31, g: 31, b: 31 }        // Dark
    }
};

// CSS Class Names
const CSS_CLASSES = {
    HIDDEN: 'hidden',
    MODAL_OVERLAY: 'modal-overlay',
    MODAL_CONTAINER: 'modal-container',
    NOTIFICATION: 'notification',
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
    WARNING: 'warning'
};

// Section IDs
const SECTIONS = {
    LOGIN: 'loginScreen',
    MAIN_APP: 'mainApp',
    SCANNER: 'scannerSection',
    DASHBOARD: 'dashboardSection',
    QR_GENERATOR: 'qrGeneratorSection',
    PROFILE: 'profileSection',
    MANAGE_ADMINS: 'manageAdminsSection',
    MANAGE_SCORE_TYPES: 'manageScoreTypesSection',
    SIGNUP_REQUESTS: 'signupRequestsSection',
    SETTINGS: 'settingsSection'
};

// Validation Rules
const VALIDATION = {
    PHONE_REGEX: /^[0-9]{11}$/,
    ARABIC_NAME_REGEX: /[\u0600-\u06FF]/,
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 100,
    MIN_SCORE: 0,
    MAX_SCORE: 100
};

// Local Storage Keys
const STORAGE_KEYS = {
    STUDENTS_DATA: 'studentsData',
    ADMINS_DATA: 'adminsData',
    QR_CODES_DATA: 'qrCodesData',
    SCORE_TYPES: 'scoreTypes',
    CURRENT_ADMIN: 'currentAdmin',
    CURRENT_ADMIN_DATA: 'currentAdminData'
};

// Export all constants
if (typeof module !== 'undefined' && module.exports) {
    // Node.js/CommonJS
    module.exports = {
        FIREBASE_PATHS,
        ADMIN_CONFIG,
        DEFAULT_SCORE_TYPES,
        PERMISSIONS,
        DEFAULT_PERMISSIONS,
        UI_CONFIG,
        QR_CONFIG,
        CSS_CLASSES,
        SECTIONS,
        VALIDATION,
        STORAGE_KEYS
    };
} else {
    // Browser/Global
    window.APP_CONSTANTS = {
        FIREBASE_PATHS,
        ADMIN_CONFIG,
        DEFAULT_SCORE_TYPES,
        PERMISSIONS,
        DEFAULT_PERMISSIONS,
        UI_CONFIG,
        QR_CONFIG,
        CSS_CLASSES,
        SECTIONS,
        VALIDATION,
        STORAGE_KEYS
    };
}
