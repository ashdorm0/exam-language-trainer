import { db } from './firebase.js'
import {
    addDoc,
    collection,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'

export async function saveQuiz (title, questions, lecturerId) {
    const quizData = {
        title,
        createdAt: serverTimestamp(),
        questions,
        lecturerId
    }

    const docRef = await addDoc(collection(db, 'quizzes'), quizData)
    return docRef.id
}