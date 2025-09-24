// Firebase configuration
// Replace these values with your Firebase project configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase when the module loads
(async function() {
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const { getDatabase, ref, onValue, set, push, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);

        // Make Firebase available globally
        window.firebase = {
            database,
            ref,
            onValue,
            set,
            push,
            serverTimestamp
        };

        // Signal that Firebase is ready
        if (window.initFirebase) {
            window.initFirebase();
        }

        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        // Fall back to localStorage mode
        window.firebase = null;
        if (window.initFirebase) {
            window.initFirebase();
        }
    }
})();