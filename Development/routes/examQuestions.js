import { Router } from 'express'
import supabase from '../lib/supabase.js'
import verifyJWT from '../middleware/verifyJWT.js'
import isAdmin from '../middleware/isAdmin.js'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// ── ADMIN ROUTES ────────────────────────────────────

// GET all exam questions
router.get('/admin', verifyJWT, isAdmin, async (req, res) => {
  const { exam_type, section } = req.query

    let query = supabase
    .from('exam_questions')
    .select('*')
    .order('sub_section', { ascending: true })
    .order('order_num', { ascending: true })
    .limit(5000)

  if (exam_type) query = query.eq('exam_type', exam_type)
  if (section)   query = query.eq('section', section)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ questions: data })
})

// POST create exam question
router.post('/admin', verifyJWT, isAdmin, async (req, res) => {
 const { exam_type, section, sub_section, question_text, model_answer, source_year, order_num, image_path } = req.body

  if (!exam_type || !section || !sub_section || !question_text) {
    return res.status(400).json({ error: 'exam_type, section, sub_section and question_text are required' })
  }

  const { data, error } = await supabase
  .from('exam_questions')
  .insert({
    exam_type,
    section,
    sub_section,
    question_text,
    model_answer:  model_answer || null,
    source_year:   source_year  || null,
    image_path:    image_path   || null,
    order_num:     parseInt(order_num) || 1
  })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ message: 'Question added', question: data })
})


// POST upload image for exam question
router.post('/admin/upload-image', verifyJWT, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { exam_type, section } = req.body

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' })
    }

    const safeName  = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-')}`
    const filePath  = `${exam_type}/${section}/${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('ExamImages')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      })

    if (uploadError) {
      return res.status(500).json({ error: `Upload failed: ${uploadError.message}` })
    }

    // Get public URL
    const { data: publicUrl } = supabase.storage
      .from('ExamImages')
      .getPublicUrl(filePath)

    return res.status(200).json({
      message:    'Image uploaded',
      image_path: publicUrl.publicUrl
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})


// PATCH update exam question
router.patch('/admin/:id', verifyJWT, isAdmin, async (req, res) => {
  const { id } = req.params
  const { exam_type, section, sub_section, question_text, model_answer, source_year, order_num, is_active, image_path } = req.body

  const { data, error } = await supabase
    .from('exam_questions')
    .update({ exam_type, section, sub_section, question_text, model_answer, source_year, order_num, is_active, image_path })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Question updated', question: data })
})

// DELETE exam question
router.delete('/admin/:id', verifyJWT, isAdmin, async (req, res) => {
  const { id } = req.params

  const { error } = await supabase
    .from('exam_questions')
    .delete()
    .eq('id', id)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Question deleted' })
})

// ── PUBLIC ROUTES ────────────────────────────────────

// GET teaser questions for landing page (3 questions, no model answers)
router.get('/teaser', async (req, res) => {
  const { data, error } = await supabase
    .from('exam_questions')
    .select('id, exam_type, section, sub_section, question_text')
    .eq('is_active', true)
    .limit(3)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ questions: data })
})

// ── STUDENT ROUTES ────────────────────────────────────

// GET full questions for enrolled TEF/TCF students
router.get('/:examType', verifyJWT, async (req, res) => {
  const { examType } = req.params
  const { section }  = req.query

  let query = supabase
    .from('exam_questions')
    .select('id, exam_type, section, sub_section, question_text, model_answer, source_year, order_num, image_path')
    .eq('exam_type', examType.toUpperCase())
    .eq('is_active', true)
    .order('sub_section', { ascending: true })
    .order('order_num', { ascending: true })
    .limit(5000)

  if (section) query = query.eq('section', section)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ questions: data })
})

export default router