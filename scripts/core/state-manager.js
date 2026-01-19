/**
 * State Manager - Centralized State Management with Observer Pattern
 * Manages application state and notifies subscribers of changes
 */

const StateManager = (() => {
    const { STORAGE_KEYS } = window.APP_CONSTANTS;

    // Application state
    let state = {
        currentAdmin: null,
        currentAdminData: null,
        studentsData: {},
        adminsData: {},
        qrCodesData: {},
        scoreTypes: {},
        signupRequests: {},
        isFirebaseConnected: false,
        isLeaderboardMode: false,
        scannedQRData: null
    };

    // Observers (subscribers) for state changes
    const observers = {};

    /**
     * Initialize state from localStorage
     */
    function initFromLocalStorage() {
        try {
            const storedStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS_DATA);
            const storedAdmins = localStorage.getItem(STORAGE_KEYS.ADMINS_DATA);
            const storedQRCodes = localStorage.getItem(STORAGE_KEYS.QR_CODES_DATA);
            const storedScoreTypes = localStorage.getItem(STORAGE_KEYS.SCORE_TYPES);
            const storedAdmin = localStorage.getItem(STORAGE_KEYS.CURRENT_ADMIN);
            const storedAdminData = localStorage.getItem(STORAGE_KEYS.CURRENT_ADMIN_DATA);

            if (storedStudents) state.studentsData = JSON.parse(storedStudents);
            if (storedAdmins) state.adminsData = JSON.parse(storedAdmins);
            if (storedQRCodes) state.qrCodesData = JSON.parse(storedQRCodes);
            if (storedScoreTypes) state.scoreTypes = JSON.parse(storedScoreTypes);
            if (storedAdmin) state.currentAdmin = storedAdmin;
            if (storedAdminData) state.currentAdminData = JSON.parse(storedAdminData);

            console.log('✅ State initialized from localStorage');
        } catch (error) {
            console.error('Error loading state from localStorage:', error);
        }
    }

    /**
     * Save state to localStorage
     */
    function saveToLocalStorage() {
        try {
            localStorage.setItem(STORAGE_KEYS.STUDENTS_DATA, JSON.stringify(state.studentsData));
            localStorage.setItem(STORAGE_KEYS.ADMINS_DATA, JSON.stringify(state.adminsData));
            localStorage.setItem(STORAGE_KEYS.QR_CODES_DATA, JSON.stringify(state.qrCodesData));
            localStorage.setItem(STORAGE_KEYS.SCORE_TYPES, JSON.stringify(state.scoreTypes));

            if (state.currentAdmin) {
                localStorage.setItem(STORAGE_KEYS.CURRENT_ADMIN, state.currentAdmin);
            }
            if (state.currentAdminData) {
                localStorage.setItem(STORAGE_KEYS.CURRENT_ADMIN_DATA, JSON.stringify(state.currentAdminData));
            }
        } catch (error) {
            console.error('Error saving state to localStorage:', error);
        }
    }

    /**
     * Get current state (read-only)
     */
    function getState() {
        return { ...state }; // Return a copy to prevent direct mutation
    }

    /**
     * Get specific state property
     */
    function get(key) {
        return state[key];
    }

    /**
     * Set state property and notify observers
     */
    function set(key, value) {
        const oldValue = state[key];
        state[key] = value;

        // Notify observers
        notify(key, value, oldValue);

        // Auto-save to localStorage for persistent data
        if (['studentsData', 'adminsData', 'qrCodesData', 'scoreTypes', 'currentAdmin', 'currentAdminData'].includes(key)) {
            saveToLocalStorage();
        }
    }

    /**
     * Update state property (merge for objects)
     */
    function update(key, updates) {
        if (typeof state[key] === 'object' && typeof updates === 'object') {
            state[key] = { ...state[key], ...updates };
        } else {
            state[key] = updates;
        }

        notify(key, state[key]);
        saveToLocalStorage();
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State property to observe
     * @param {function} callback - Function to call on change
     * @returns {function} Unsubscribe function
     */
    function subscribe(key, callback) {
        if (!observers[key]) {
            observers[key] = [];
        }

        observers[key].push(callback);

        // Return unsubscribe function
        return () => {
            const index = observers[key].indexOf(callback);
            if (index > -1) {
                observers[key].splice(index, 1);
            }
        };
    }

    /**
     * Notify observers of state change
     */
    function notify(key, newValue, oldValue) {
        if (observers[key]) {
            observers[key].forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`Error in observer for ${key}:`, error);
                }
            });
        }
    }

    /**
     * Clear all state (logout)
     */
    function clear() {
        state = {
            currentAdmin: null,
            currentAdminData: null,
            studentsData: {},
            adminsData: {},
            qrCodesData: {},
            scoreTypes: {},
            signupRequests: {},
            isFirebaseConnected: false,
            isLeaderboardMode: false,
            scannedQRData: null
        };

        // Clear localStorage
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });

        // Notify all observers of reset
        Object.keys(observers).forEach(key => {
            notify(key, state[key]);
        });
    }

    /**
     * Batch update (multiple properties at once)
     */
    function batchUpdate(updates) {
        const changedKeys = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (state.hasOwnProperty(key)) {
                state[key] = value;
                changedKeys.push(key);
            }
        });

        // Notify observers
        changedKeys.forEach(key => notify(key, state[key]));

        // Save to localStorage
        saveToLocalStorage();
    }

    // Public API
    return {
        initFromLocalStorage,
        saveToLocalStorage,
        getState,
        get,
        set,
        update,
        subscribe,
        clear,
        batchUpdate
    };
})();

// Export for use in other modules
window.StateManager = StateManager;
