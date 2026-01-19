/**
 * Firebase Adapter - Data Access Layer
 * Provides abstraction over Firebase Realtime Database
 * Allows easy swapping of backend or testing with mocks
 */

const FirebaseAdapter = (() => {
    const { FIREBASE_PATHS } = window.APP_CONSTANTS;

    let db = null;
    let isConnected = false;
    let listeners = [];

    /**
     * Initialize the adapter with Firebase database instance
     */
    function init(database) {
        db = database;
        return this;
    }

    /**
     * Check if Firebase is connected
     */
    function checkConnection() {
        return isConnected;
    }

    /**
     * Set connection status
     */
    function setConnectionStatus(status) {
        isConnected = status;
    }

    /**
     * Generic read operation
     */
    async function read(path) {
        if (!db) throw new Error('Firebase not initialized');

        try {
            const ref = window.firebase.ref(db, path);
            const snapshot = await window.firebase.get(ref);
            return snapshot.exists() ? snapshot.val() : null;
        } catch (error) {
            console.error(`Error reading from ${path}:`, error);
            throw error;
        }
    }

    /**
     * Generic write operation
     */
    async function write(path, data) {
        if (!db) throw new Error('Firebase not initialized');

        try {
            const ref = window.firebase.ref(db, path);
            await window.firebase.set(ref, data);
            return true;
        } catch (error) {
            console.error(`Error writing to ${path}:`, error);
            throw error;
        }
    }

    /**
     * Generic update operation (merge)
     */
    async function update(path, data) {
        if (!db) throw new Error('Firebase not initialized');

        try {
            const ref = window.firebase.ref(db, path);
            await window.firebase.update(ref, data);
            return true;
        } catch (error) {
            console.error(`Error updating ${path}:`, error);
            throw error;
        }
    }

    /**
     * Generic delete operation
     */
    async function remove(path) {
        if (!db) throw new Error('Firebase not initialized');

        try {
            const ref = window.firebase.ref(db, path);
            await window.firebase.set(ref, null);
            return true;
        } catch (error) {
            console.error(`Error deleting ${path}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to real-time updates
     */
    function subscribe(path, callback, eventType = 'value') {
        if (!db) throw new Error('Firebase not initialized');

        const ref = window.firebase.ref(db, path);
        const unsubscribe = window.firebase.onValue(ref, callback);

        listeners.push({ path, unsubscribe });
        return unsubscribe;
    }

    /**
     * Unsubscribe from specific path
     */
    function unsubscribe(path) {
        const index = listeners.findIndex(l => l.path === path);
        if (index !== -1) {
            listeners[index].unsubscribe();
            listeners.splice(index, 1);
        }
    }

    /**
     * Unsubscribe from all listeners
     */
    function unsubscribeAll() {
        listeners.forEach(({ unsubscribe }) => unsubscribe());
        listeners = [];
    }

    // Domain-specific methods for better API

    /**
     * Students operations
     */
    const students = {
        getAll: () => read(FIREBASE_PATHS.STUDENTS),
        get: (id) => read(`${FIREBASE_PATHS.STUDENTS}/${id}`),
        save: (id, data) => write(`${FIREBASE_PATHS.STUDENTS}/${id}`, data),
        update: (id, data) => update(`${FIREBASE_PATHS.STUDENTS}/${id}`, data),
        delete: (id) => remove(`${FIREBASE_PATHS.STUDENTS}/${id}`),
        deleteAll: () => remove(FIREBASE_PATHS.STUDENTS),
        subscribe: (callback) => subscribe(FIREBASE_PATHS.STUDENTS, callback)
    };

    /**
     * Admins operations
     */
    const admins = {
        getAll: () => read(FIREBASE_PATHS.ADMINS),
        get: (id) => read(`${FIREBASE_PATHS.ADMINS}/${id}`),
        save: (id, data) => write(`${FIREBASE_PATHS.ADMINS}/${id}`, data),
        update: (id, data) => update(`${FIREBASE_PATHS.ADMINS}/${id}`, data),
        delete: (id) => remove(`${FIREBASE_PATHS.ADMINS}/${id}`),
        subscribe: (callback) => subscribe(FIREBASE_PATHS.ADMINS, callback)
    };

    /**
     * QR Codes operations
     */
    const qrCodes = {
        getAll: () => read(FIREBASE_PATHS.QR_CODES),
        get: (id) => read(`${FIREBASE_PATHS.QR_CODES}/${id}`),
        save: (id, data) => write(`${FIREBASE_PATHS.QR_CODES}/${id}`, data),
        update: (id, data) => update(`${FIREBASE_PATHS.QR_CODES}/${id}`, data),
        delete: (id) => remove(`${FIREBASE_PATHS.QR_CODES}/${id}`),
        subscribe: (callback) => subscribe(FIREBASE_PATHS.QR_CODES, callback)
    };

    /**
     * Score Types operations
     */
    const scoreTypes = {
        getAll: () => read(FIREBASE_PATHS.SCORE_TYPES),
        get: (id) => read(`${FIREBASE_PATHS.SCORE_TYPES}/${id}`),
        save: (id, data) => write(`${FIREBASE_PATHS.SCORE_TYPES}/${id}`, data),
        delete: (id) => remove(`${FIREBASE_PATHS.SCORE_TYPES}/${id}`),
        subscribe: (callback) => subscribe(FIREBASE_PATHS.SCORE_TYPES, callback)
    };

    /**
     * Signup Requests operations
     */
    const signupRequests = {
        getAll: () => read(FIREBASE_PATHS.SIGNUP_REQUESTS),
        get: (id) => read(`${FIREBASE_PATHS.SIGNUP_REQUESTS}/${id}`),
        save: (id, data) => write(`${FIREBASE_PATHS.SIGNUP_REQUESTS}/${id}`, data),
        delete: (id) => remove(`${FIREBASE_PATHS.SIGNUP_REQUESTS}/${id}`),
        subscribe: (callback) => subscribe(FIREBASE_PATHS.SIGNUP_REQUESTS, callback)
    };

    // Public API
    return {
        init,
        checkConnection,
        setConnectionStatus,
        read,
        write,
        update,
        remove,
        subscribe,
        unsubscribe,
        unsubscribeAll,
        students,
        admins,
        qrCodes,
        scoreTypes,
        signupRequests
    };
})();

// Export for use in other modules
window.FirebaseAdapter = FirebaseAdapter;
