// Firebase configuration
// Replace these values with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyB29CbGcIQRuMnnMe2C8RT4Qkt5G7Y_L9Q",
  authDomain: "student-scoring-system-1aa10.firebaseapp.com",
  databaseURL: "https://student-scoring-system-1aa10-default-rtdb.firebaseio.com",
  projectId: "student-scoring-system-1aa10",
  storageBucket: "student-scoring-system-1aa10.firebasestorage.app",
  messagingSenderId: "26728761382",
  appId: "1:26728761382:web:a378c1f2714794a8627ee7",
  measurementId: "G-J0HGKX47G7"
};

// Initialize Firebase when the module loads
(async function() {
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const { getDatabase, ref, onValue, set, push, serverTimestamp, get } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');
        const { getAuth, signInAnonymously, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);
        const auth = getAuth(app);

        // Make Firebase available globally
        window.firebase = {
            database,
            ref,
            onValue,
            set,
            push,
            serverTimestamp,
            get,
            auth,
            signInAnonymously,
            onAuthStateChanged,
            signOut
        };

        console.log('🔥 Firebase initialized successfully');

        // Sign in anonymously to enable database writes
        try {
            const userCredential = await signInAnonymously(auth);
            console.log('✅ Firebase Anonymous Authentication successful');
            console.log('👤 Anonymous user ID:', userCredential.user.uid);

            // Store authentication status for debugging
            window.firebaseAuthSuccess = true;
        } catch (authError) {
            console.error('❌ Firebase Authentication failed:', authError);
            console.error('❌ Error code:', authError.code);
            console.error('❌ Error message:', authError.message);

            if (authError.code === 'auth/operation-not-allowed') {
                console.error('🚫 CRITICAL: Anonymous authentication is NOT enabled in Firebase Console!');
                console.error('📝 To fix: Go to Firebase Console → Authentication → Sign-in method → Enable Anonymous');
            }

            window.firebaseAuthSuccess = false;
            alert('⚠️ Firebase Authentication Failed!\n\nAnonymous authentication is not enabled.\n\nPlease enable it in Firebase Console:\nAuthentication → Sign-in method → Anonymous\n\nData will only be saved locally until this is fixed.');
        }

        // Signal that Firebase is ready
        if (window.initFirebase) {
            window.initFirebase();
        }
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        // Fall back to localStorage mode
        window.firebase = null;
        if (window.initFirebase) {
            window.initFirebase();
        }
    }
})();