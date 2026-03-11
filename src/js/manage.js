/**
 * manage.js — Exam Language Trainer, Quiz Management Page
 * Displays the logged-in lecturer's quizzes and allows viewing links/QR and deleting.
 */

import { db, auth } from './firebase.js'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js'

// ── State ──────────────────────────────────────────────────────────────────────

let currentUser = null
let quizzes = [] // Array of { id, title, createdAt, questions }
let deleteTargetId = null // Quiz ID pending deletion
let deleteModal = null

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'))

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await signOut(auth)
    window.location.href = 'index.html'
  })

  document.getElementById('confirmDeleteBtn').addEventListener('click', onConfirmDelete)

  // Listen for auth state
  onAuthStateChanged(auth, (user) => {
    currentUser = user
    const userInfo = document.getElementById('userInfo')
    const userEmail = document.getElementById('userEmail')

    if (user) {
      userInfo.classList.remove('d-none')
      userEmail.textContent = user.email
      loadQuizzes()
    } else {
      // Not signed in — redirect to main page
      window.location.href = 'index.html'
    }
  })
})

// ── Load Quizzes ──────────────────────────────────────────────────────────────

async function loadQuizzes () {
  const spinner = document.getElementById('spinner-loading')
  const quizList = document.getElementById('quizList')

  try {
    const q = query(
      collection(db, 'quizzes'),
      where('lecturerId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)

    quizzes = []
    snapshot.forEach(docSnap => {
      quizzes.push({ id: docSnap.id, ...docSnap.data() })
    })

    spinner.classList.add('d-none')
    renderQuizzes()
  } catch (error) {
    console.error('Error loading quizzes:', error)
    spinner.classList.add('d-none')
    quizList.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-exclamation-circle text-danger"></i>
        <p>Failed to load quizzes. Please try refreshing the page.</p>
      </div>`
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderQuizzes () {
  const quizList = document.getElementById('quizList')

  if (quizzes.length === 0) {
    quizList.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-journal-plus"></i>
        <p>You haven't created any quizzes yet.</p>
        <a href="index.html" class="nav-link-back">
          <i class="bi bi-plus-circle"></i> Create your first quiz
        </a>
      </div>`
    return
  }

  quizList.innerHTML = quizzes.map(quiz => {
    // Format the date
    const date = quiz.createdAt
      ? quiz.createdAt.toDate().toLocaleDateString('en-IE', {
          day: 'numeric', month: 'short', year: 'numeric'
        })
      : 'Unknown date'

    const questionCount = quiz.questions ? quiz.questions.length : 0

    return `
      <div class="quiz-item" data-id="${quiz.id}">
        <div class="quiz-title">${quiz.title}</div>
        <div class="quiz-meta">
          ${date} · ${questionCount} questions
        </div>
        <div class="quiz-actions">
          <button class="btn-action btn-share" data-id="${quiz.id}">
            <i class="bi bi-link-45deg"></i> Link & QR
          </button>
          <button class="btn-action btn-delete" data-id="${quiz.id}" data-title="${quiz.title}">
            <i class="bi bi-trash"></i> Delete
          </button>
        </div>
        <div class="quiz-detail-panel" id="detail-${quiz.id}">
          <div class="share-url" id="url-${quiz.id}"></div>
          <button class="btn-action mt-2 btn-copy" data-id="${quiz.id}" style="font-size:0.75rem;">
            <i class="bi bi-clipboard"></i> Copy link
          </button>
          <div class="qr-container" id="qr-${quiz.id}"></div>
        </div>
      </div>`
  }).join('')

  // Wire up share buttons
  document.querySelectorAll('.btn-share').forEach(btn => {
    btn.addEventListener('click', () => toggleDetail(btn.dataset.id))
  })

  // Wire up delete buttons
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteTargetId = btn.dataset.id
      document.getElementById('deleteQuizTitle').textContent = btn.dataset.title
      deleteModal.show()
    })
  })

  // Wire up copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const urlEl = document.getElementById(`url-${btn.dataset.id}`)
      navigator.clipboard.writeText(urlEl.textContent)
      btn.innerHTML = '<i class="bi bi-check"></i> Copied!'
      setTimeout(() => {
        btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy link'
      }, 2000)
    })
  })
}

// ── Toggle Detail Panel (Link + QR) ──────────────────────────────────────────

function toggleDetail (quizId) {
  const panel = document.getElementById(`detail-${quizId}`)
  const isOpen = panel.classList.contains('open')

  // Close all other panels
  document.querySelectorAll('.quiz-detail-panel').forEach(p => p.classList.remove('open'))

  if (!isOpen) {
    panel.classList.add('open')

    // Set the URL
    const quizUrl = `${window.location.origin}/quiz.html?id=${quizId}`
    const urlEl = document.getElementById(`url-${quizId}`)
    urlEl.textContent = quizUrl

    // Generate QR code (only if not already generated)
    const qrContainer = document.getElementById(`qr-${quizId}`)
    if (qrContainer.children.length === 0) {
      new QRCode(qrContainer, {
        text: quizUrl,
        width: 140,
        height: 140,
        colorDark: '#1e293b',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      })
    }
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function onConfirmDelete () {
  if (!deleteTargetId) return

  const btn = document.getElementById('confirmDeleteBtn')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting…'

  try {
    await deleteDoc(doc(db, 'quizzes', deleteTargetId))

    // Remove from local state and re-render
    quizzes = quizzes.filter(q => q.id !== deleteTargetId)
    deleteTargetId = null
    deleteModal.hide()
    renderQuizzes()
  } catch (error) {
    console.error('Delete error:', error)
    alert('Failed to delete quiz. Please try again.')
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="bi bi-trash"></i> Delete Quiz'
  }
}