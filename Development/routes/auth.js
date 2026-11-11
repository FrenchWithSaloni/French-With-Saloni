import { Router } from 'express'
import { register, login, logout, getMe } from '../controllers/authController.js'
import verifyJWT from '../middleware/verifyJWT.js'
import supabase from '../lib/supabase.js'
import { createClient } from '@supabase/supabase-js'
const router = Router()

router.post('/register', register)
router.post('/login',    login)
router.post('/logout',   logout)
router.get('/me',        verifyJWT, getMe)  // protected

// GET student dashboard data
router.get('/dashboard', verifyJWT, async (req, res) => {
  const studentId = req.user.sub

  // Get student profile
  const { data: student } = await supabase
    .from('students')
    .select('full_name, email, phone, course, created_at')
    .eq('id', studentId)
    .single()

  // Get enrollment
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course, status, enrolled_at')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .single()

  // Get payment history
  const { data: payments } = await supabase
    .from('payments')
    .select('course, amount, currency, status, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  return res.status(200).json({
    student,
    enrollment: enrollment || null,
    payments:   payments  || []
  })
})

// POST forgot password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.CLIENT_URL}/resetPassword.html`
  })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  // Always return success even if email doesn't exist (security best practice)
  return res.status(200).json({ message: 'Reset link sent if email exists' })
})

// POST reset password
router.post('/reset-password', async (req, res) => {
  const { accessToken, newPassword } = req.body

  if (!accessToken || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  // Use the access token to update the password
  const { error } = await supabase.auth.admin.updateUserById(
    (await supabase.auth.getUser(accessToken)).data.user?.id,
    { password: newPassword }
  )

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ message: 'Password updated successfully' })
})

// Separate client so refreshing a student's session never touches the shared service client
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// POST refresh an expired session
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' })

  const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data?.session) {
    // No status = couldn't reach Supabase: don't log the student out for that
    const transient = error && (!error.status || error.status >= 500)
    return res.status(transient ? 503 : 401).json({ error: 'Session expired. Please log in again.' })
  }

  return res.status(200).json({
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token
  })
})

export default router