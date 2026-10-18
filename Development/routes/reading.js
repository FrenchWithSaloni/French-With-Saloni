import { Router } from 'express'
import supabase from '../lib/supabase.js'
import verifyJWT from '../middleware/verifyJWT.js'
import isAdmin from '../middleware/isAdmin.js'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// ── ADMIN ROUTES ──────────────────────────────────

// GET all exercises
router.get('/admin', verifyJWT, isAdmin, async (req, res) => {
  const { exam_type } = req.query
  let query = supabase
    .from('reading_exercises')
    .select('id, title, exam_type, order_num, is_active, reading_questions(id)')
    .order('order_num', { ascending: true })

  if (exam_type) query = query.eq('exam_type', exam_type)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ exercises: data })
})

// POST create exercise
router.post('/admin', verifyJWT, isAdmin, async (req, res) => {
  const { exam_type, title, passage, order_num } = req.body

  if (!exam_type || !title || !passage) {
    return res.status(400).json({ error: 'exam_type, title and passage are required' })
  }

  const { data, error } = await supabase
    .from('reading_exercises')
    .insert({ exam_type, title, passage, order_num: parseInt(order_num) || 1 })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ message: 'Exercise created', exercise: data })
})

// PATCH update exercise
router.patch('/admin/:id', verifyJWT, isAdmin, async (req, res) => {
  const { id } = req.params
  const { title, passage, order_num, is_active } = req.body

  const { data, error } = await supabase
    .from('reading_exercises')
    .update({ title, passage, order_num, is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Updated', exercise: data })
})

// DELETE exercise
router.delete('/admin/:id', verifyJWT, isAdmin, async (req, res) => {
  const { id } = req.params
  const { error } = await supabase.from('reading_exercises').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Deleted' })
})

// GET questions for exercise
router.get('/admin/:id/questions', verifyJWT, isAdmin, async (req, res) => {
  const { id } = req.params
  const { data, error } = await supabase
    .from('reading_questions')
    .select('*')
    .eq('exercise_id', id)
    .order('order_num', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ questions: data })
})

// POST add question
router.post('/admin/:id/questions', verifyJWT, isAdmin, async (req, res) => {
  const { id } = req.params
  const { question_text, options, correct_answer, explanation, image_path, order_num } = req.body

  if (!question_text || !options || !correct_answer) {
    return res.status(400).json({ error: 'Question text, options and correct answer required' })
  }

  const { data, error } = await supabase
    .from('reading_questions')
    .insert({
      exercise_id: id,
      question_text,
      options,
      correct_answer,
      explanation:  explanation  || null,
      image_path:   image_path   || null,
      order_num:    parseInt(order_num) || 1
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ message: 'Question added', question: data })
})

// POST upload image for question
router.post('/admin/upload-image', verifyJWT, isAdmin, upload.single('image'), async (req, res) => {
  try {
    console.log('upload-image hit, file:', req.file?.originalname, 'body:', req.body)
    if (!req.file) return res.status(400).json({ error: 'Image required' })
        
    const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-')}`
    const filePath = `reading/${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('ExamImages')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype })

    if (uploadError) return res.status(500).json({ error: uploadError.message })

    const { data: publicUrl } = supabase.storage.from('ExamImages').getPublicUrl(filePath)
    return res.status(200).json({ image_url: publicUrl.publicUrl })
    } catch (err) {
    console.error('upload-image error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE question
router.delete('/admin/questions/:questionId', verifyJWT, isAdmin, async (req, res) => {
  const { questionId } = req.params
  const { error } = await supabase.from('reading_questions').delete().eq('id', questionId)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Question deleted' })
})

// ── STUDENT ROUTES ────────────────────────────────

// GET exercises for exam type (no correct answers)
router.get('/:examType', verifyJWT, async (req, res) => {
  const { examType } = req.params

  const { data, error } = await supabase
    .from('reading_exercises')
    .select(`
      id, title, passage, order_num,
      reading_questions (
        id, question_text, options, explanation, image_path, order_num
      )
    `)
    .eq('exam_type', examType.toUpperCase())
    .eq('is_active', true)
    .order('order_num', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const exercises = (data || []).map(e => ({
    ...e,
    reading_questions: (e.reading_questions || [])
      .sort((a, b) => a.order_num - b.order_num)
  }))

  return res.status(200).json({ exercises })
})

// POST check answer
router.post('/check-answer', verifyJWT, async (req, res) => {
  const { question_id, answer } = req.body

  const { data: question, error } = await supabase
    .from('reading_questions')
    .select('correct_answer, explanation')
    .eq('id', question_id)
    .single()

  if (error || !question) return res.status(404).json({ error: 'Question not found' })

  const isCorrect = answer.toLowerCase() === question.correct_answer.toLowerCase()

  return res.status(200).json({
    correct:        isCorrect,
    correct_answer: question.correct_answer,
    explanation:    question.explanation
  })
})

export default router