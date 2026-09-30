import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'

import authRoutes from './routes/auth.js'
import paymentRoutes from './routes/payment.js'
import enrollmentRoutes from './routes/enrollment.js'
import contactRoutes from './routes/contact.js'
import reviewRoutes from './routes/reviews.js'
import adminRoutes from './routes/admin.js'
import studentRoutes from './routes/student.js'
import quizRoutes from './routes/quiz.js'
import examQuestionRoutes from './routes/examQuestions.js'


const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app = express()

// ── Webhook must use raw body — register BEFORE express.json()
app.use('/payment/webhook', express.raw({ type: 'application/json' }))

// ── Middleware
// ── Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      imgSrc:        ["'self'", "data:", "https:"],
      mediaSrc:      ["'self'", "https://*.supabase.co"],
      connectSrc:    ["'self'", "https://*.supabase.co", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com", "https://drive.google.com", "https://accounts.google.com", "https://*.supabase.co"],
    }
  }
}))
app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    process.env.CLIENT_URL
  ],
  credentials: true
}))
app.use(express.json())

// ── Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')))

// ── Routes
app.use('/auth',        authRoutes)
app.use('/payment',     paymentRoutes)
app.use('/enrollments', enrollmentRoutes)
app.use('/contact',     contactRoutes)
app.use('/reviews', reviewRoutes)
app.use('/admin', adminRoutes)
app.use('/student', studentRoutes)
app.use('/quiz', quizRoutes)
app.use('/exam-questions', examQuestionRoutes)

// ── Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }))

// ── Catch-all — serve index.html
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// ── Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))