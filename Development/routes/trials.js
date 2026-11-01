import { Router } from 'express'
import { Resend } from 'resend'
import supabase from '../lib/supabase.js'
import verifyJWT from '../middleware/verifyJWT.js'
import isAdmin from '../middleware/isAdmin.js'


const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'French with Saloni <noreply@frenchwithsaloni.com>'

// ── EMAIL HELPERS ─────────────────────────────────
// Resend returns { data, error } instead of throwing, so we check it explicitly
async function sendEmail(payload) {
  const { error } = await resend.emails.send({ from: FROM, ...payload })
  if (error) {
    console.error('Resend error for "' + payload.subject + '":', error)
    return false
  }
  return true
}

function emailShell(inner) {
  return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#f8faff;">
      <div style="background:#0A2342;border-radius:12px 12px 0 0;padding:30px;text-align:center;">
        <h1 style="color:#fff;font-size:24px;margin:0;">French with Saloni</h1>
      </div>
      <div style="background:#fff;padding:40px 30px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,.08);">
        ${inner}
      </div>
    </div>`
}

const meetButton = (link) => `
  <div style="text-align:center;margin:30px 0;">
    <a href="${link}" style="background:#1355A0;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:700;display:inline-block;">
      🎥 Join Google Meet
    </a>
  </div>`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Use the visitor's timezone if it's valid, otherwise fall back to Pacific
function safeTimezone(tz) {
  if (!tz || typeof tz !== 'string') return 'America/Vancouver'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return tz
  } catch {
    return 'America/Vancouver'
  }
}

// The name is typed by the visitor and goes into an HTML email, so escape it
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]))


// ── PUBLIC ROUTES (no login) ──────────────────────

// GET upcoming slots that still have space
router.get('/slots', async (req, res) => {
  const { data, error } = await supabase
    .from('trial_slots')
    .select('id, scheduled_at, max_bookings, current_bookings')
    .eq('is_active', true)
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const available = (data || []).filter(s => s.current_bookings < s.max_bookings)
  return res.status(200).json({ slots: available })
})

// POST book a demo class (public, no login)
router.post('/book', async (req, res) => {
  const { slot_id, student_email, student_phone, timezone } = req.body
  const student_name = String(req.body.student_name || '').trim().slice(0, 100)

  if (!slot_id || !student_name || !student_email || !student_phone) {
    return res.status(400).json({ error: 'All fields are required' })
  }
  if (!EMAIL_RE.test(student_email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' })
  }

  const { data: slot } = await supabase
    .from('trial_slots')
    .select('*')
    .eq('id', slot_id)
    .eq('is_active', true)
    .single()

  if (!slot)           return res.status(404).json({ error: 'Slot not found' })
  if (!slot.meet_link) return res.status(400).json({ error: 'This slot is not ready yet' })
  if (slot.current_bookings >= slot.max_bookings) {
    return res.status(400).json({ error: 'This slot is fully booked' })
  }

  const slotDate = new Date(slot.scheduled_at)
  const now      = new Date()
  if (slotDate <= now) return res.status(400).json({ error: 'This slot has already passed' })

  const { data: existing } = await supabase
    .from('trial_bookings')
    .select('id')
    .eq('slot_id', slot_id)
    .eq('student_email', student_email)
    .maybeSingle()

  if (existing) return res.status(400).json({ error: 'You have already booked this slot' })

  const studentTz = safeTimezone(timezone)

  const { data: booking, error } = await supabase
    .from('trial_bookings')
    .insert({
      slot_id, student_name, student_email, student_phone,
      meet_link: slot.meet_link,
      status:    'confirmed',
      timezone:  studentTz
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await supabase
    .from('trial_slots')
    .update({ current_bookings: slot.current_bookings + 1 })
    .eq('id', slot_id)

  // Format the class time in the student's timezone and in Saloni's (Pacific)
  const fmtSlot = (tz) => ({
    date: slotDate.toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz
    }),
    time: slotDate.toLocaleTimeString('en-CA', {
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: tz
    })
  })

  const student = fmtSlot(studentTz)
  const saloni  = fmtSlot('America/Vancouver')
  const name    = esc(student_name)

  // 1. Confirmation + Meet link, sent immediately
  const confirmationSent = await sendEmail({
    to:      student_email,
    subject: '🎉 Your Demo Class is Confirmed — Meet Link Inside',
    html: emailShell(`
      <h2 style="color:#0A2342;font-size:20px;margin:0 0 16px;">Bonjour ${name}! 👋</h2>
      <p style="color:#5E7A99;font-size:15px;line-height:1.6;">Your free demo class is confirmed. Here are the details:</p>
      <div style="background:#f0f6ff;border-radius:10px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#0A2342;font-weight:700;">📅 ${student.date}</p>
        <p style="margin:0 0 8px;color:#0A2342;font-weight:700;">🕐 ${student.time} <span style="font-weight:400;color:#5E7A99;">(your local time)</span></p>
        <p style="margin:0 0 8px;color:#5E7A99;font-size:13px;">Saloni's time: ${saloni.time}</p>
        <p style="margin:0;color:#0A2342;font-weight:700;">⏱️ 30 minutes</p>
      </div>
      ${meetButton(slot.meet_link)}
      ${/^\d{8,15}$/.test(process.env.WHATSAPP_NUMBER || '') ? `
  <p style="color:#5E7A99;font-size:13px;">Can't make it? <a href="https://wa.me/${process.env.WHATSAPP_NUMBER}" style="color:#1355A0;font-weight:700;">Message Saloni on WhatsApp</a> to reschedule.</p>
` : ''}
      <p style="color:#5E7A99;font-size:13px;">You'll get a reminder email 1 hour before class. Keep this email handy for your link.</p>
    `)
  })

  // 2. Reminder 1 hour before (skipped if class starts within the hour)
  const reminderAt = new Date(slotDate.getTime() - 60 * 60 * 1000)
  if (reminderAt > now) {
    await sendEmail({
      to:          student_email,
      subject:     '⏰ Your demo class starts in 1 hour!',
      scheduledAt: reminderAt.toISOString(),
      html: emailShell(`
        <h2 style="color:#0A2342;font-size:20px;margin:0 0 16px;">Class in 1 hour, ${name}!</h2>
        <p style="color:#5E7A99;font-size:15px;line-height:1.6;">Find a quiet spot with a good internet connection.</p>
        ${meetButton(slot.meet_link)}
        <p style="color:#5E7A99;font-size:13px;">📅 ${student.date} at ${student.time}</p>
      `)
    })
  }

  // 3. Follow-up 30 minutes after the class ends
  await sendEmail({
    to:          student_email,
    subject:     '💬 How was your demo class with Saloni?',
    scheduledAt: new Date(slotDate.getTime() + 60 * 60 * 1000).toISOString(),
    html: emailShell(`
      <h2 style="color:#0A2342;font-size:20px;margin:0 0 16px;">Merci, ${name}! 🙏</h2>
      <p style="color:#5E7A99;font-size:15px;line-height:1.6;">Thanks for joining the demo class. We'd love to hear how it went.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://www.frenchwithsaloni.com/#reviews" style="background:#1355A0;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">⭐ Leave a Review</a>
      </div>
      <div style="background:#f0f6ff;border-radius:10px;padding:20px;text-align:center;">
        <p style="color:#0A2342;font-weight:700;margin:0 0 12px;">Ready to continue learning French?</p>
        <a href="https://www.frenchwithsaloni.com/#courses" style="background:#10B981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">🚀 Enroll Now</a>
      </div>
    `)
  })

  return res.status(201).json({
    message: confirmationSent
      ? "You're booked! Check your email for the Meet link (check spam if you don't see it)."
      : "You're booked, but we couldn't send your confirmation email. Saloni will contact you with the link.",
    booking
  })
})

// ── ADMIN ROUTES ──────────────────────────────────

// GET all slots
router.get('/admin/slots', verifyJWT, isAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('trial_slots')
    .select('*')
    .order('scheduled_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ slots: data })
})

// POST create slot
router.post('/admin/slots', verifyJWT, isAdmin, async (req, res) => {
  const { scheduled_at, max_bookings, meet_link } = req.body

  if (!scheduled_at || !meet_link) {
    return res.status(400).json({ error: 'Date/time and Meet link are required' })
  }

  const { data, error } = await supabase
    .from('trial_slots')
    .insert({ scheduled_at, max_bookings: parseInt(max_bookings) || 1, meet_link })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ message: 'Slot created', slot: data })
})

// DELETE slot (its bookings are deleted too)
router.delete('/admin/slots/:id', verifyJWT, isAdmin, async (req, res) => {
  const { error } = await supabase
    .from('trial_slots')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Slot deleted' })
})

// GET all bookings
router.get('/admin/bookings', verifyJWT, isAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('trial_bookings')
    .select('*, trial_slots(scheduled_at)')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ bookings: data })
})

// PATCH booking status (completed / cancelled)
router.patch('/admin/bookings/:id', verifyJWT, isAdmin, async (req, res) => {
  const { status } = req.body

  const { data, error } = await supabase
    .from('trial_bookings')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Booking updated', booking: data })
})

export default router