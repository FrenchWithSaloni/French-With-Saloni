import { Router } from 'express'
import {
  getAllEnrollments,
  getStudentEnrollment,
  manualEnroll,
  changeEnrollmentStatus
} from '../controllers/enrollmentController.js'
import verifyJWT from '../middleware/verifyJWT.js'
import isAdmin from '../middleware/isAdmin.js'
import supabase from '../lib/supabase.js'

const router = Router()

// ── Check enrollment — any logged in student ──
router.get('/check', verifyJWT, async (req, res) => {
  const { data, error } = await supabase
    .from('enrollments')
    .select('course')
    .eq('student_id', req.user.sub)
    .eq('status', 'active')
    .limit(1)

  if (error) return res.status(500).json({ error: error.message })
  if (!data || data.length === 0) return res.status(404).json({ enrolled: false })
  return res.status(200).json({ enrolled: true, course: data[0].course })
})

// PATCH update enrollment status by enrollment ID (not student ID)
router.patch('/:enrollmentId/status-by-id', async (req, res) => {
  const { enrollmentId } = req.params
  const { status } = req.body

  const { data, error } = await supabase
    .from('enrollments')
    .update({ status })
    .eq('id', enrollmentId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Enrollment updated', data })
})

// ── Admin only routes ─────────────────────────
router.use(verifyJWT, isAdmin)

router.get('/',                     getAllEnrollments)
router.get('/:studentId',           getStudentEnrollment)
router.post('/manual',              manualEnroll)
router.patch('/:studentId/status',  changeEnrollmentStatus)

export default router