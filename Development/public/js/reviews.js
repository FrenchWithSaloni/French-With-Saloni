// Needs utils.js loaded first (uses API and formatCourse)
;(function () {
  const AUTO_MS = 4000
  let reviews = []
  let current = 0
  let perSlide = 3
  let timer = null
  let built = false

  const $ = (id) => document.getElementById(id)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
  const perView = () => window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3

  // Works with the original grid, the old carousel wrapper, or a new #reviews-mount
  function findHost() {
    return $('reviews-mount')
        || $('reviews-grid')
        || $('reviews-carousel')?.parentElement
        || null
  }

  const arrowStyle = 'position:absolute;top:50%;transform:translateY(-50%);z-index:10;width:44px;height:44px;border-radius:50%;background:#fff;border:1.5px solid rgba(19,85,160,.15);box-shadow:0 4px 12px rgba(10,35,66,.1);cursor:pointer;font-size:1.3rem;line-height:1;display:flex;align-items:center;justify-content:center;color:var(--navy);'

  function build(host) {
    host.removeAttribute('class')
    host.style.cssText = 'position:relative;max-width:1100px;margin:0 auto;display:block;'
    host.innerHTML = `
      <button type="button" id="reviews-prev" aria-label="Previous reviews" style="${arrowStyle}left:-16px;">‹</button>
      <button type="button" id="reviews-next" aria-label="Next reviews" style="${arrowStyle}right:-16px;">›</button>
      <div style="overflow:hidden;padding:10px 0;">
        <div id="reviews-track" style="display:flex;"></div>
      </div>
      <div id="reviews-dots" style="display:flex;justify-content:center;gap:.5rem;margin-top:1rem;"></div>`

    $('reviews-prev').addEventListener('click', () => step(-1))
    $('reviews-next').addEventListener('click', () => step(1))
    $('reviews-dots').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]')
      if (b) { go(Number(b.dataset.i)); startAuto() }
    })
    host.addEventListener('mouseenter', stopAuto)
    host.addEventListener('mouseleave', startAuto)
  }

  function card(r) {
    const stars  = Math.max(1, Math.min(5, Number(r.rating) || 5))
    const name   = r.full_name || 'Student'
    const course = r.course && typeof formatCourse === 'function' ? formatCourse(r.course) : 'French with Saloni'
    return `
      <div class="testi-card" style="flex:1;min-width:0;box-sizing:border-box;">
        <div style="margin-bottom:.8rem;color:#F0C040;font-size:1rem;letter-spacing:2px;">${'★'.repeat(stars)}</div>
        <p style="font-size:.9rem;color:#334155;line-height:1.7;margin-bottom:1.2rem;font-style:italic;">"${esc(r.review_text)}"</p>
        <div style="display:flex;align-items:center;gap:.8rem;">
          <div style="width:38px;height:38px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0;">${esc(name.charAt(0).toUpperCase())}</div>
          <div>
            <div style="font-weight:700;color:var(--navy);font-size:.88rem;">${esc(name)}</div>
            <div style="font-size:.75rem;color:var(--muted);">${esc(course)}</div>
          </div>
        </div>
      </div>`
  }

  function render() {
    perSlide = perView()
    const pages = []
    for (let i = 0; i < reviews.length; i += perSlide) pages.push(reviews.slice(i, i + perSlide))

    $('reviews-track').innerHTML = pages.map(page => `
      <div style="display:flex;gap:1.5rem;min-width:100%;box-sizing:border-box;">
        ${page.map(card).join('')}
        ${'<div style="flex:1;min-width:0;"></div>'.repeat(perSlide - page.length)}
      </div>`).join('')

    $('reviews-dots').innerHTML = pages.map((_, i) =>
      `<button type="button" data-i="${i}" aria-label="Page ${i + 1}" style="height:8px;border:none;border-radius:20px;cursor:pointer;padding:0;transition:all .3s;"></button>`
    ).join('')

    const multi = pages.length > 1
    $('reviews-prev').style.display = multi ? 'flex' : 'none'
    $('reviews-next').style.display = multi ? 'flex' : 'none'
    $('reviews-dots').style.display = multi ? 'flex' : 'none'

    current = Math.min(current, pages.length - 1)
    go(current, false)
    startAuto()
  }

  function go(i, animate = true) {
    const track = $('reviews-track')
    if (!track) return
    const pages = track.children.length
    if (!pages) return
    current = Math.max(0, Math.min(i, pages - 1))
    track.style.transition = animate ? 'transform .5s ease' : 'none'
    track.style.transform  = `translateX(-${current * 100}%)`
    ;[...$('reviews-dots').children].forEach((d, idx) => {
      d.style.width      = idx === current ? '24px' : '8px'
      d.style.background = idx === current ? 'var(--blue)' : 'rgba(19,85,160,.2)'
    })
  }

  function step(dir) {
    const pages = $('reviews-track')?.children.length || 0
    if (pages > 1) { go((current + dir + pages) % pages); startAuto() }
  }

  function startAuto() {
    stopAuto()
    if (($('reviews-track')?.children.length || 0) > 1) timer = setInterval(() => step(1), AUTO_MS)
  }
  function stopAuto() { clearInterval(timer) }

  function showMessage(text) {
    $('reviews-track').innerHTML =
      `<div style="min-width:100%;text-align:center;color:var(--muted);padding:2rem;">${text}</div>`
    $('reviews-prev').style.display = 'none'
    $('reviews-next').style.display = 'none'
    $('reviews-dots').style.display = 'none'
  }

  async function load() {
    const host = findHost()
    if (!host) {
      console.error('[reviews] No container found. Need #reviews-mount, #reviews-grid or #reviews-carousel.')
      return
    }
    if (!built) { build(host); built = true }
    showMessage('Loading reviews...')

    try {
      const res = await fetch(`${API}/reviews`)
      if (!res.ok) throw new Error(`GET /reviews returned HTTP ${res.status}`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data.reviews || [])

      reviews = list.filter(r => r && r.review_text && (!r.status || r.status === 'approved'))
      if (reviews.length === 0) { showMessage('No reviews yet.'); return }

      current = 0
      render()
    } catch (err) {
      console.error('[reviews] load failed:', err)
      showMessage("Couldn't load reviews. Please refresh the page.")
    }
  }

  let resizeTimer
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (reviews.length && perView() !== perSlide) { current = 0; render() }
    }, 150)
  })

  // Safety net if any old inline buttons or calls are still on the page
  window.scrollReviews = step
  window.goToSlide     = go
  window.loadReviews   = load

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load)
  else load()
})()