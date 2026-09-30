import { Router } from "express";
import supabase from "../lib/supabase.js";
import verifyJWT from "../middleware/verifyJWT.js";

const router = Router();

// ── SHARED HELPER ────────────────────────────────────
async function attachUrls(items, bucket) {
  const pathField = bucket === 'Lectures' ? 'video_path' : 'file_path'
  const urlField  = bucket === 'Lectures' ? 'url' : 'downloadUrl'

  const withPaths = (items || []).filter(item => item[pathField])
  if (withPaths.length === 0) {
    return (items || []).map(item => ({ ...item, [urlField]: item.url || null }))
  }

  const { data: signedUrls } = await supabase.storage
    .from(bucket)
    .createSignedUrls(withPaths.map(item => item[pathField]), 7200)

  const urlMap = {}
  ;(signedUrls || []).forEach(({ path, signedUrl }) => { urlMap[path] = signedUrl })

  return (items || []).map(item => ({
    ...item,
    [urlField]: item[pathField] ? (urlMap[item[pathField]] || null) : (item.url || null)
  }))
}

// ── GET enrollment list (lightweight) ───────────────
router.get('/enrollments', verifyJWT, async (req, res) => {
  const studentId = req.user.sub

  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select(`
      id, course, exam_type, status, enrolled_at, batch_id,
      batches ( id, batch_name, days, timing, meet_link )
    `)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('enrolled_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const enrollmentList = (enrollments || []).map(e => ({
    enrollmentId: e.id,
    course:       e.course,
    examType:     e.exam_type || null,
    enrolledAt:   e.enrolled_at,
    batch:        e.batches || null,
    meetLink:     e.batches?.meet_link || null
  }))

  return res.status(200).json({
    enrolled:    enrollmentList.length > 0,
    enrollments: enrollmentList
  })
})

// ── GET lectures for enrollment (lazy) ──────────────
router.get('/lectures/:enrollmentId', verifyJWT, async (req, res) => {
  const { enrollmentId } = req.params
  const studentId = req.user.sub

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course, batch_id')
    .eq('id', enrollmentId)
    .eq('student_id', studentId)
    .single()

  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })

  let lectureQuery = supabase
    .from('lectures')
    .select('id,title,description,video_path,order_num,level,course,batch_id')
    .order('order_num', { ascending: true })

  if (enrollment.batch_id) {
    lectureQuery = lectureQuery.eq('batch_id', enrollment.batch_id)
  } else {
    lectureQuery = lectureQuery.eq('course', enrollment.course).is('batch_id', null)
  }

  const { data: lectures } = await lectureQuery
  const lecturesWithUrls   = await attachUrls(lectures, 'Lectures')

  const groupedLectures = {}
  lecturesWithUrls.forEach(l => {
    const level = l.level || 'General'
    if (!groupedLectures[level]) groupedLectures[level] = []
    groupedLectures[level].push(l)
  })

  return res.status(200).json({ lectures: lecturesWithUrls, groupedLectures })
})

// ── GET materials for enrollment (lazy) ─────────────
router.get('/materials/:enrollmentId', verifyJWT, async (req, res) => {
  const { enrollmentId } = req.params
  const studentId = req.user.sub

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course, exam_type')
    .eq('id', enrollmentId)
    .eq('student_id', studentId)
    .single()

  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })

  const [classNotesResult, examMaterialsResult] = await Promise.all([
    supabase.from('study_materials')
      .select('id,title,description,type,file_path,url,level,order_num,material_category,section')
      .eq('material_category', 'class_notes')
      .eq('course', enrollment.course)
      .order('order_num', { ascending: true }),
    supabase.from('study_materials')
      .select('id,title,description,type,file_path,url,level,order_num,material_category')
      .eq('material_category', 'exam_prep')
      .eq('exam_type', enrollment.exam_type || 'TEF')
      .order('order_num', { ascending: true })
  ])

  const [classNotes, examMaterials] = await Promise.all([
    attachUrls(classNotesResult.data, 'Material'),
    attachUrls(examMaterialsResult.data, 'Material')
  ])

  return res.status(200).json({ classNotes, examMaterials })
})

// ── GET worksheets for enrollment (lazy) ────────────
router.get('/worksheets/:enrollmentId', verifyJWT, async (req, res) => {
  const { enrollmentId } = req.params
  const studentId = req.user.sub

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course')
    .eq('id', enrollmentId)
    .eq('student_id', studentId)
    .single()

  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })

  const { data: worksheets } = await supabase
    .from('study_materials')
    .select('id,title,description,type,file_path,url,level,order_num,material_category,section')
    .eq('material_category', 'worksheet')
    .eq('course', enrollment.course)
    .order('order_num', { ascending: true })

  const worksheetsWithUrls = await attachUrls(worksheets, 'Material')

  return res.status(200).json({ worksheets: worksheetsWithUrls })
})

// ── GET course settings (meet link etc.) ────────────
router.get('/settings/:course', verifyJWT, async (req, res) => {
  const { course } = req.params

  const { data: settings } = await supabase
    .from('course_settings')
    .select('meet_link, meet_schedule')
    .eq('course', course)
    .single()

  return res.status(200).json({ settings: settings || null })
})

// ── GET single lecture with signed URL ───────────────
router.get("/lecture/:id", verifyJWT, async (req, res) => {
  const { id } = req.params
  const studentId = req.user.sub

  const { data: lecture, error } = await supabase
    .from("lectures")
    .select("id, title, description, video_path, order_num, level, course, batch_id")
    .eq("id", id)
    .single()

  if (error || !lecture) {
    return res.status(404).json({ error: "Lecture not found" })
  }

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course, batch_id")
    .eq("student_id", studentId)
    .eq("status", "active")

  const hasAccess = (enrollments || []).some(enrollment => {
    return (
      (lecture.batch_id && lecture.batch_id === enrollment.batch_id) ||
      (!lecture.batch_id && lecture.course === enrollment.course)
    )
  })

  if (!hasAccess) {
    return res.status(403).json({ error: "Access denied" })
  }

  const { data: signedUrl } = await supabase.storage
    .from("Lectures")
    .createSignedUrl(lecture.video_path, 7200)

  return res.status(200).json({
    lecture: { ...lecture, url: signedUrl?.signedUrl || null }
  })
})

export default router;