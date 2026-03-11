// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCW8sjU_Vmmos3h0LnWKLBSJVFAUw0cfaQ",
  authDomain: "exam-language-trainer-3abec.firebaseapp.com",
  projectId: "exam-language-trainer-3abec",
  storageBucket: "exam-language-trainer-3abec.firebasestorage.app",
  messagingSenderId: "386115557496",
  appId: "1:386115557496:web:9daf176ebf038a9f8d758d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); 