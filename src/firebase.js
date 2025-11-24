// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDKuuTbniuAki0SACbd8LuSOQflcjdcIlk",
    authDomain: "blink-stop.firebaseapp.com",
    projectId: "blink-stop",
    storageBucket: "blink-stop.firebasestorage.app",
    messagingSenderId: "100962673098",
    appId: "1:100962673098:web:cc0e8061708bcc7191af33",
    measurementId: "G-1QBFKCTZZB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global Leaderboard Functions
export const GlobalLeaderboard = {
    async save(mode, score, name) {
        try {
            const docRef = await addDoc(collection(db, 'leaderboard', mode, 'scores'), {
                name: name || 'ANONYMOUS',
                score: score,
                timestamp: new Date()
            });
            console.log('Score saved to global leaderboard:', docRef.id);
            return true;
        } catch (error) {
            console.error('Error saving to global leaderboard:', error);
            return false;
        }
    },

    async getTop(mode, count = 10) {
        try {
            const scoresRef = collection(db, 'leaderboard', mode, 'scores');

            // Sort: Classic (higher is better), Precision (lower is better)
            const sortOrder = mode === 'CLASSIC' ? 'desc' : 'asc';
            const q = query(scoresRef, orderBy('score', sortOrder), limit(count));

            const querySnapshot = await getDocs(q);
            const scores = [];

            querySnapshot.forEach((doc) => {
                scores.push(doc.data());
            });

            return scores;
        } catch (error) {
            console.error('Error fetching global leaderboard:', error);
            return [];
        }
    }
};
