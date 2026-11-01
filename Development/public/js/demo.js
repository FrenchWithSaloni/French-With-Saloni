// ── DEMO CLASS BOOKING ───────────────────────────────
let selectedDemoSlot = null
const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone

// ── WHATSAPP FALLBACK ────────────────────────────────
// Digits only, with country code, no "+"
const WHATSAPP_NUMBER = '17788828553'

;(function setupWhatsApp() {
  const wrap = document.getElementById('demo-whatsapp')
  const link = document.getElementById('demo-whatsapp-link')
  if (!wrap || !link || !/^\d{8,15}$/.test(WHATSAPP_NUMBER)) return

  const msg = `Hi Saloni! I'd like to book a demo class, but the available times don't work for me. My timezone is ${visitorTz.replace(/_/g, ' ')}.`
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`
  wrap.style.display = 'block'
})()

async function loadDemoSlots() {
  const container = document.getElementById('demo-slots-container')

  try {
    const res   = await fetch(`${API}/trials/slots`)
    const data  = await res.json()
    const slots = data.slots || []

    if (slots.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:2rem;background:#f8faff;border-radius:12px;border:1.5px solid rgba(19,85,160,.1);">
          <div style="font-size:1.5rem;margin-bottom:.5rem;">📅</div>
          <div style="font-weight:700;color:var(--navy);margin-bottom:.3rem;">No demo classes scheduled right now</div>
          <div style="font-size:.85rem;color:var(--muted);">Check back soon — new dates are added regularly.</div>
        </div>`
      return
    }

    container.innerHTML = `
      <div style="font-size:.75rem;font-weight:700;color:var(--muted);margin-bottom:.8rem;letter-spacing:.05em;text-transform:uppercase;">
        Pick a class — times shown in your timezone (${visitorTz.replace(/_/g, ' ')})
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.8rem;">
        ${slots.map(s => {
          const d    = new Date(s.scheduled_at)
          const day  = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
          const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
          const left = s.max_bookings - s.current_bookings
          return `
            <button type="button" class="demo-slot-btn" data-id="${s.id}" data-label="${day} · ${time}"
              style="background:#fff;border:2px solid rgba(19,85,160,.12);border-radius:12px;padding:1.1rem;text-align:left;cursor:pointer;font-family:'Nunito',sans-serif;transition:all .2s;">
              <div style="font-weight:700;color:var(--navy);font-size:.9rem;margin-bottom:.3rem;">${day}</div>
              <div style="font-size:.85rem;color:var(--blue);font-weight:600;">🕐 ${time}</div>
              <div style="font-size:.72rem;color:var(--muted);margin-top:.4rem;">${left} seat${left !== 1 ? 's' : ''} left</div>
            </button>`
        }).join('')}
      </div>`
  } catch (err) {
    console.error('Demo slots error:', err)
    container.innerHTML = `<div style="text-align:center;color:var(--muted);padding:2rem;">Couldn't load classes. Please refresh the page.</div>`
  }
}

// One click handler for all slot buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.demo-slot-btn')
  if (!btn) return

  selectedDemoSlot = btn.dataset.id
  document.querySelectorAll('.demo-slot-btn').forEach(b => {
    b.style.borderColor = b === btn ? 'var(--blue)' : 'rgba(19,85,160,.12)'
    b.style.background  = b === btn ? '#f0f6ff' : '#fff'
  })
  document.getElementById('demo-selected-label').textContent = btn.dataset.label
  document.getElementById('demo-form').style.display = 'block'
  document.getElementById('demo-success').style.display = 'none'
  document.getElementById('demo-form').scrollIntoView({ behavior: 'smooth', block: 'center' })
})

function clearDemoSelection() {
  selectedDemoSlot = null
  document.getElementById('demo-form').style.display = 'none'
  document.querySelectorAll('.demo-slot-btn').forEach(b => {
    b.style.borderColor = 'rgba(19,85,160,.12)'
    b.style.background  = '#fff'
  })
}

async function submitDemoBooking() {
  const name  = document.getElementById('demo-name').value.trim()
  const email = document.getElementById('demo-email').value.trim()
  const phone = document.getElementById('demo-phone').value.trim()
  const errEl = document.getElementById('demo-error')
  errEl.style.display = 'none'

  if (!selectedDemoSlot) {
    errEl.textContent = 'Please pick a class first.'
    errEl.style.display = 'block'
    return
  }
  if (!name || !email || !phone) {
    errEl.textContent = 'Please fill in all fields.'
    errEl.style.display = 'block'
    return
  }

  const btn = document.getElementById('demo-submit')
  btn.disabled = true
  btn.textContent = 'Booking...'

  try {
    const res  = await fetch(`${API}/trials/book`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id:       selectedDemoSlot,
        student_name:  name,
        student_email: email,
        student_phone: phone,
        timezone:      visitorTz
      })
    })
    const data = await res.json()

    if (!res.ok) {
      errEl.textContent = data.error || 'Booking failed. Please try again.'
      errEl.style.display = 'block'
    } else {
      document.getElementById('demo-form').style.display = 'none'
      const ok = document.getElementById('demo-success')
      ok.textContent = '✅ ' + data.message
      ok.style.display = 'block'
      document.getElementById('demo-name').value  = ''
      document.getElementById('demo-email').value = ''
      document.getElementById('demo-phone').value = ''
      selectedDemoSlot = null
      loadDemoSlots()
    }
  } catch {
    errEl.textContent = 'Server error. Please try again.'
    errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.textContent = '📧 Book My Free Demo Class'
  }
}

loadDemoSlots()