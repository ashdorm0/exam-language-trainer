import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

export async function saveQuiz(title, questions, lecturerId) {
    const quizData = {
        title: title,
        createdAt: serverTimestamp(),
        questions: questions,
        lecturerId: lecturerId
    };

    const docRef = await addDoc(collection(db, "quizzes"), quizData);
    return docRef.id;
}