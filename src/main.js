import './style.css'
import {
  isConfigured, watchUser, signIn, signOut, idToken,
  watchBooks, watchMeta, newBookId, saveBook, deleteBook, saveMeta,
} from './store.js'
import { searchBooks } from './books-api.js'

const STATUS = { a_lire: 'À lire', en_cours: 'En cours', lu: 'Lu', envie: 'Envie' }
const CLOTH = ['#5c1f24', '#1f3352', '#23432f', '#6b4a1a', '#3f2a4f', '#1e4a4a', '#4a2a1e', '#2b2f45', '#5a3a12', '#33402a']
const MOODS = ['léger', 'émouvant', 'haletant', 'dépaysant', 'drôle', 'classique']
const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const year = new Date().getFullYear()

let user = null, unsub = []
let books = [], settings = { name: '' }, reco = { items: [], at: 0 }
let loaded = false, view = 'lib', filter = 'tous', sortBy = 'recent'
const moods = new Set()
let shelfAnimated = false
try { sortBy = localStorage.getItem('libris-sort') || 'recent'; $('sort').value = sortBy } catch { /* stockage indisponible */ }

function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }
const cloth = b => CLOTH[hash(b.title + b.author) % CLOTH.length]
const img = src => src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''
function cover(b, cls = '') { return `<div class="cover ${cls}" style="background:${cloth(b)}" aria-hidden="true"><span>${esc(b.title).slice(0, 52)}</span>${img(b.cover)}</div>` }
function stars(n) { n = +n || 0; return n ? `<span class="stars" aria-label="${n} sur 5">${'★'.repeat(n)}</span>` : '' }
function state(s) { return `<span class="state ${s}"><i></i>${STATUS[s]}</span>` }
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2400) }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const firstName = u => (u?.displayName || '').trim().split(' ')[0]

/* ---------- connexion ---------- */
function showLogin(msg = '') {
  $('vLogin').hidden = false; $('vApp').hidden = true; $('tabs').hidden = true
  $('loginStat').textContent = msg
  $('loginBtn').hidden = !isConfigured
}
$('loginBtn').onclick = async () => {
  $('loginBtn').disabled = true; $('loginStat').textContent = ''
  try { await signIn() } catch (e) {
    $('loginStat').textContent = e?.code === 'auth/unauthorized-domain'
      ? "Cette adresse n'est pas autorisée dans Firebase (Authentication > Paramètres > Domaines autorisés)."
      : 'La connexion a échoué. Réessaie.'
  } finally { $('loginBtn').disabled = false }
}

if (!isConfigured) showLogin('Configuration Firebase manquante : remplis src/firebase-config.js.')
else watchUser(u => {
  unsub.forEach(f => f()); unsub = []
  user = u; loaded = false; books = []
  if (!u) { showLogin(); return }
  $('vLogin').hidden = true; $('vApp').hidden = false; $('tabs').hidden = false
  render()
  unsub.push(watchBooks(u.uid, list => { books = list; loaded = true; render() },
    () => { $('ledger').textContent = "Les livres n'ont pas pu se charger. Vérifie ta connexion et rouvre l'appli." }))
  unsub.push(watchMeta(u.uid, 'settings', d => { settings = d || { name: firstName(u) }; render() }))
  unsub.push(watchMeta(u.uid, 'reco', d => { reco = d || { items: [], at: 0 }; renderReco() }))
})

const putBook = b => saveBook(user.uid, b)
const removeBook = id => deleteBook(user.uid, id)
const putMeta = (k, d) => saveMeta(user.uid, k, d)

/* ---------- rendu ---------- */
function sorted(rows) {
  const lastName = b => norm(String(b.author).split(',')[0].trim().split(' ').pop())
  const by = {
    recent: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
    title: (a, b) => norm(a.title).localeCompare(norm(b.title), 'fr'),
    author: (a, b) => lastName(a).localeCompare(lastName(b), 'fr') || norm(a.title).localeCompare(norm(b.title), 'fr'),
    rating: (a, b) => (+b.rating || 0) - (+a.rating || 0) || (b.addedAt || 0) - (a.addedAt || 0),
    year: (a, b) => (+b.year || -1e9) - (+a.year || -1e9),
    pages: (a, b) => (+a.pages || 1e9) - (+b.pages || 1e9),
  }
  return [...rows].sort(by[sortBy] || by.recent)
}
function render() {
  const owned = books.filter(b => b.status !== 'envie'), wish = books.filter(b => b.status === 'envie')
  const nm = (settings.name || '').trim()
  $('name').textContent = nm ? `La bibliothèque de ${nm}` : 'La bibliothèque'
  const readY = owned.filter(b => b.status === 'lu' && String(b.finishedYear || '') === String(year)).length
  const cur = owned.filter(b => b.status === 'en_cours').length
  const pile = owned.filter(b => b.status === 'a_lire').length
  if (loaded) $('ledger').innerHTML = owned.length || wish.length
    ? `<b>${owned.length}</b> volume${owned.length > 1 ? 's' : ''} · <b>${readY}</b> lu${readY > 1 ? 's' : ''} en ${year} · <b>${cur}</b> en cours · <b>${pile}</b> sur la pile`
    : "Aucun volume pour l'instant."

  $('vLib').hidden = view === 'reco'; $('vReco').hidden = view !== 'reco'
  ;[['tabLib', 'lib'], ['tabWish', 'wish'], ['tabReco', 'reco']].forEach(([id, v]) => $(id).setAttribute('aria-selected', view === v))

  const shelfBooks = view === 'wish' ? wish : sorted(owned)
  renderShelf(shelfBooks)
  $('shelfcap').textContent = view === 'wish' ? "Les livres que tu aimerais avoir." : (cur ? 'Les livres penchés sont en cours de lecture.' : '')

  const opts = view === 'wish' ? [] : [['tous', 'Tous'], ['en_cours', 'En cours'], ['a_lire', 'À lire'], ['lu', 'Lus']]
  $('chips').hidden = !opts.length
  $('chips').innerHTML = opts.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')
  const q = norm($('q').value)
  let rows = view === 'wish' ? wish : owned
  if (view !== 'wish' && filter !== 'tous') rows = rows.filter(b => b.status === filter)
  if (q) rows = rows.filter(b => norm(b.title + ' ' + b.author + ' ' + (b.genre || '')).includes(q))
  rows = sorted(rows)
  $('list').innerHTML = !loaded ? '' : rows.length ? rows.map(b => `
    <button class="book" data-id="${esc(b.id)}">
      ${cover(b)}
      <div class="meta"><div class="t">${esc(b.title)}</div><div class="a">${esc(b.author)}${b.year ? ', ' + esc(b.year) : ''}</div>
        <div class="row">${state(b.status)}${stars(b.rating)}${b.genre ? `<span>${esc(b.genre)}</span>` : ''}</div></div>
      <span class="chev" aria-hidden="true">›</span>
    </button>`).join('')
    : `<div class="empty"><b>${q ? 'Aucun livre ne correspond' : view === 'wish' ? "Pas encore d'envie" : 'Rien sur ce rayon'}</b>${q ? 'Essaie un autre mot.' : 'Touche le bouton doré pour ajouter un livre : tape son titre ou son ISBN, la fiche se remplit toute seule.'}</div>`
  renderReco()
}
$('q').addEventListener('input', render)
$('sort').addEventListener('change', e => { sortBy = e.target.value; try { localStorage.setItem('libris-sort', sortBy) } catch { /* stockage indisponible */ } render() })
$('chips').addEventListener('click', e => { const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; render() } })
$('tabLib').onclick = () => { view = 'lib'; render() }
$('tabWish').onclick = () => { view = 'wish'; render() }
$('tabReco').onclick = () => { view = 'reco'; render() }
$('list').addEventListener('click', e => { const b = e.target.closest('.book'); if (b) openBook(b.dataset.id, b.querySelector('.cover')) })
$('case').addEventListener('click', e => { const b = e.target.closest('.spine'); if (b) openBook(b.dataset.id, b) })

/* ---------- la bibliothèque en bois : les dos se rangent rayon par rayon ---------- */
const spineW = b => Math.max(24, Math.min(48, Math.round((+b.pages || 280) / 12)))
let lastShelf = []
function renderShelf(src) {
  lastShelf = src
  const el = $('case'); let inner = el.clientWidth - 16; if (inner < 120) inner = Math.min(window.innerWidth - 56, 560)
  const rows = [[]]; let acc = 0
  for (const b of src) {
    const w = spineW(b) + 2 + (b.status === 'en_cours' ? 16 : 0)
    if (acc + w > inner && rows[rows.length - 1].length) { rows.push([]); acc = 0 }
    rows[rows.length - 1].push(b); acc += w
  }
  const room = acc + 22 <= inner
  const spine = b => `<button class="spine${b.status === 'en_cours' ? ' lean' : ''}" data-id="${esc(b.id)}" style="width:${spineW(b)}px;height:${142 + hash(b.title) % 34}px;background-color:${cloth(b)}" aria-label="Ouvrir ${esc(b.title)}"><span>${esc(b.title)}</span></button>`
  el.innerHTML = src.length
    ? rows.map((r, i) => `<div class="tier">${r.map(spine).join('')}${i === rows.length - 1 && room ? '<span class="bookend" aria-hidden="true"></span>' : ''}</div><div class="plank${i === rows.length - 1 ? ' last' : ''}"></div>`).join('')
    : `<div class="tier"><div class="shelf-empty">${!loaded ? 'Ouverture des rayonnages…' : view === 'wish' ? 'Les envies viendront se ranger ici.' : 'Le premier rayon attend son livre.'}</div></div><div class="plank last"></div>`
  if (src.length && !shelfAnimated) {
    el.classList.add('ready'); el.querySelectorAll('.spine').forEach((s, i) => (s.style.animationDelay = Math.min(i * 40, 800) + 'ms'))
    shelfAnimated = true; setTimeout(() => el.classList.remove('ready'), 1600)
  }
}
let rsz; window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => renderShelf(lastShelf), 150) })

/* ---------- tiroir ---------- */
function openSheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('scrim').hidden = false; $('sheet').scrollTop = 0 }
function closeSheet() { $('scrim').hidden = true; $('sheet').innerHTML = '' }
$('scrim').addEventListener('click', e => { if (e.target === $('scrim')) closeSheet() })
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('scrim').hidden) closeSheet() })

/* ---------- nom de la bibliothèque, déconnexion ---------- */
$('name').onclick = () => {
  openSheet(`<h2>À qui est cette bibliothèque ?</h2>
    <div class="field"><label for="nm">Prénom</label><input id="nm" value="${esc(settings.name || '')}" placeholder="ex. Julie"></div>
    <div class="actions"><button class="btn" id="cancel">Annuler</button><button class="btn primary" id="ok">Enregistrer</button></div>
    <p class="note">Connectée avec ${esc(user?.email || 'Google')}. <button class="linkbtn" id="logout">Se déconnecter</button></p>`)
  $('nm').focus(); $('cancel').onclick = closeSheet
  $('ok').onclick = async () => { try { await putMeta('settings', { ...settings, name: $('nm').value.trim() }); closeSheet(); toast('Nom enregistré') } catch { toast('Enregistrement impossible.') } }
  $('logout').onclick = async () => { closeSheet(); await signOut() }
}

/* ---------- ajout : recherche Google Books ---------- */
$('addBtn').onclick = () => openAdd()
function openAdd() {
  const target = view === 'wish' ? 'envie' : 'a_lire'
  openSheet(`<h2>Ajouter un livre</h2>
    <div class="field"><label for="find">Titre, auteur ou ISBN</label>
      <div class="findrow"><input id="find" placeholder="ex. L'Amie prodigieuse" enterkeyhint="search"><button class="btn primary" id="go">Chercher</button></div></div>
    <div class="status" id="fstat"></div><div class="results" id="res"></div>
    <button class="linkbtn" id="manual">Ou remplir la fiche à la main</button>`)
  $('find').focus(); $('go').onclick = () => find(target); $('find').onkeydown = e => { if (e.key === 'Enter') find(target) }
  $('manual').onclick = () => openForm({ title: '', author: '', status: target })
}
async function find(target) {
  const q = $('find').value.trim(); if (!q) return
  $('go').disabled = true; $('fstat').textContent = 'Recherche dans les catalogues…'; $('res').innerHTML = ''
  try {
    const list = await searchBooks(q)
    if (!list.length) { $('fstat').textContent = "Aucun livre trouvé. Vérifie l'orthographe ou remplis la fiche à la main."; return }
    $('fstat').textContent = 'Lequel est le bon ?'
    find.list = list
    $('res').innerHTML = list.map((b, i) => `<button class="result" data-i="${i}">${cover(b)}<div><div class="t" style="font-size:16px">${esc(b.title)}</div><small>${esc(b.author)}${b.year ? ', ' + esc(b.year) : ''}${b.pages ? ' · ' + b.pages + ' p.' : ''}</small></div></button>`).join('')
    $('res').onclick = e => { const el = e.target.closest('[data-i]'); if (el) openForm({ ...find.list[+el.dataset.i], status: target }) }
  } catch { $('fstat').textContent = "La recherche n'a pas abouti. Vérifie ta connexion, ou remplis la fiche à la main." }
  finally { const g = $('go'); if (g) g.disabled = false }
}

/* ---------- fiche ---------- */
function segHtml(cur) { return `<div class="seg" id="seg">${Object.entries(STATUS).map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>` }
function rateHtml(n) { return `<div class="ratepick" id="rate">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-r="${i}" class="${i <= (n || 0) ? 'on' : ''}" aria-label="${i} étoile${i > 1 ? 's' : ''}">★</button>`).join('')}</div>` }
function openForm(b) {
  const editing = !!b.id; let st = b.status || 'a_lire', rating = +b.rating || 0
  openSheet(`<h2>${editing ? 'Modifier la fiche' : 'Nouveau livre'}</h2>
    ${b.cover ? `<div class="formcover">${cover(b, 'mid')}</div>` : ''}
    <div class="field"><label for="fT">Titre</label><input id="fT" value="${esc(b.title)}"></div>
    <div class="field"><label for="fA">Auteur</label><input id="fA" value="${esc(b.author)}"></div>
    <div class="two"><div class="field"><label for="fY">Parution</label><input id="fY" inputmode="numeric" value="${esc(b.year || '')}"></div>
      <div class="field"><label for="fP">Pages</label><input id="fP" inputmode="numeric" value="${esc(b.pages || '')}"></div></div>
    <div class="field"><label for="fG">Genre</label><input id="fG" value="${esc(b.genre || '')}"></div>
    <div class="field"><span class="lbl">Statut</span>${segHtml(st)}</div>
    <div class="field" id="rateF"><span class="lbl">Ta note</span>${rateHtml(rating)}</div>
    <div class="field"><label for="fN">Ton avis</label><textarea id="fN" rows="3" placeholder="Ce que tu en as pensé, une phrase qui t'a marquée…">${esc(b.note || '')}</textarea></div>
    <div class="actions"><button class="btn" id="cancel">Annuler</button><button class="btn primary" id="save">Enregistrer</button></div>`)
  const showRate = () => ($('rateF').hidden = st !== 'lu'); showRate()
  $('seg').onclick = e => { const x = e.target.closest('[data-s]'); if (!x) return; st = x.dataset.s; $('seg').querySelectorAll('button').forEach(y => y.setAttribute('aria-pressed', y.dataset.s === st)); showRate() }
  $('rate').onclick = e => { const x = e.target.closest('[data-r]'); if (!x) return; rating = +x.dataset.r === rating ? 0 : +x.dataset.r; $('rate').querySelectorAll('button').forEach(y => y.classList.toggle('on', +y.dataset.r <= rating)) }
  $('cancel').onclick = closeSheet
  $('save').onclick = async () => {
    const title = $('fT').value.trim(); if (!title) { $('fT').focus(); return }
    const nb = {
      id: b.id || newBookId(user.uid), title, author: $('fA').value.trim(), year: +$('fY').value || null, pages: +$('fP').value || null,
      genre: $('fG').value.trim(), status: st, rating: st === 'lu' ? rating : 0, note: $('fN').value.trim(),
      summary: b.summary || '', why: b.why || '', cover: b.cover || '', isbn: b.isbn || '',
      addedAt: b.addedAt || Date.now(), finishedYear: st === 'lu' ? (b.status === 'lu' && b.finishedYear ? b.finishedYear : year) : null,
    }
    $('save').disabled = true
    try { await putBook(nb); closeSheet(); toast(editing ? 'Fiche enregistrée' : 'Livre ajouté'); if (!editing && view !== 'reco') { view = st === 'envie' ? 'wish' : 'lib'; render() } }
    catch { $('save').disabled = false; toast('Enregistrement impossible. Réessaie.') }
  }
}

/* ---------- le livre qui s'ouvre et se feuillette ---------- */
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
let bk = null
function bookPages(b) {
  const nm = (settings.name || '').trim()
  const next = b.status === 'envie' ? [['a_lire', "Je l'ai acheté"]] : b.status === 'a_lire' ? [['en_cours', 'Je commence']] : b.status === 'en_cours' ? [['lu', "Je l'ai fini"]] : []
  const added = b.addedAt ? new Date(b.addedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const r = +b.rating || 0
  const coverF = `<div class="face coverf${b.cover ? ' has-img' : ''}"><div class="ct">${esc(b.title)}</div><div class="orn">❦</div><div class="ca">${esc(b.author)}</div>${b.cover ? img(b.cover) + '<div class="hinge"></div>' : ''}</div>`
  const endp = `<div class="face back endp"><div class="stamp"><i>Ex-libris</i>${esc(nm || 'Ma bibliothèque')}</div></div>`
  const verso = '<div class="face back"><div class="pg verso"></div></div>'
  const p1 = `<div class="face"><div class="pg"><div class="rh">${esc(b.author || 'Fiche')}</div>
    <h3>${esc(b.title)}</h3><div class="by">${esc(b.author)}</div><div class="orn">· ❦ ·</div>
    <dl>${b.year ? `<dt>Parution</dt><dd>${esc(b.year)}</dd>` : ''}${b.genre ? `<dt>Genre</dt><dd>${esc(b.genre)}</dd>` : ''}${b.pages ? `<dt>Pages</dt><dd>${esc(b.pages)}</dd>` : ''}<dt>Statut</dt><dd>${STATUS[b.status]}</dd></dl>
    ${b.summary ? `<p class="res">${esc(b.summary)}</p>` : ''}
    <div class="folio">1</div></div></div>`
  const p2body = b.status === 'lu'
    ? `<div class="big-stars" aria-label="${r} sur 5">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></div>
      ${b.note ? `<blockquote>${esc(b.note)}</blockquote>` : '<p class="quiet">Pas encore d\'avis écrit. « Modifier la fiche » permet d\'en ajouter un.</p>'}
      <p class="quiet" style="margin-top:auto">${b.finishedYear ? `Lu en ${esc(b.finishedYear)}` : ''}${added ? ` · entré dans la bibliothèque le ${added}` : ''}</p>`
    : b.status === 'envie'
      ? `<p class="quiet">Sur la liste des envies.</p>${b.why ? `<blockquote>${esc(b.why)}</blockquote>` : ''}<p class="quiet" style="margin-top:auto">${added ? `Noté le ${added}` : ''}</p>`
      : `<p class="quiet">${b.status === 'en_cours' ? 'Lecture en cours.' : 'Sur la pile à lire.'} La note et l'avis viendront une fois le livre refermé.</p>${b.note ? `<blockquote>${esc(b.note)}</blockquote>` : ''}<p class="quiet" style="margin-top:auto">${added ? `Entré dans la bibliothèque le ${added}` : ''}</p>`
  const p2 = `<div class="face"><div class="pg"><div class="rh">Ton avis</div><h3>${b.status === 'lu' ? 'Ta note' : b.status === 'envie' ? 'Pourquoi le lire' : 'En attendant'}</h3>${p2body}<div class="folio">2</div></div></div>`
  const p3 = `<div class="pg"><div class="rh">${esc(b.title)}</div><h3>Et maintenant ?</h3>
    <div class="pacts">${next.map(([s, l]) => `<button class="pbtn gold" data-q="${s}">${l}</button>`).join('')}
      <button class="pbtn" data-a="edit">Modifier la fiche</button><button class="pbtn del" data-a="del">Retirer de la bibliothèque</button><div id="bconf"></div></div>
    <div class="folio">3</div></div>`
  return { coverF, endp, verso, p1, p2, p3 }
}
function openBook(id, fromEl) {
  const b = books.find(x => x.id === id); if (!b) return
  const P = bookPages(b), st = $('stage')
  st.innerHTML = `<button class="bclose" id="bClose">Fermer</button>
    <div class="b3d" id="b3d" style="--cloth:${cloth(b)}">
      <div class="bedge"></div><div class="bspine"><span>${esc(b.title)}</span></div>
      <div class="base">${P.p3}</div>
      <div class="leaf" data-i="2" style="--z:11px">${P.p2}${P.verso}</div>
      <div class="leaf" data-i="1" style="--z:12px">${P.p1}${P.verso}</div>
      <div class="leaf" data-i="0" style="--z:13px">${P.coverF}${P.endp}</div>
    </div>
    <div class="bnav"><button id="bPrev" aria-label="Page précédente">‹</button><div class="dots" id="dots"><i></i><i></i><i></i></div><button id="bNext" aria-label="Page suivante">›</button></div>
    <div class="bhint">Touche la page ou fais-la glisser pour tourner</div>`
  st.hidden = false; bk = { b, from: fromEl, page: 0 }
  const b3 = $('b3d')
  const fly = () => {
    if (!bk?.from || !bk.from.isConnected) return 'scale(.3) rotateY(80deg)'
    const r = bk.from.getBoundingClientRect(), br = b3.getBoundingClientRect()
    const s = Math.max(0.08, r.height / br.height)
    return `translate(${r.left + r.width / 2 - (br.left + br.width / 2)}px,${r.top + r.height / 2 - (br.top + br.height / 2)}px) scale(${s}) rotateY(80deg)`
  }
  bk.fly = fly
  if (reduced()) { st.classList.add('show'); setPage(1) }
  else {
    b3.style.transition = 'none'; b3.style.transform = fly(); void b3.offsetWidth
    requestAnimationFrame(() => { b3.style.transition = ''; b3.style.transform = ''; st.classList.add('show') })
    setTimeout(() => bk && setPage(1), 720)
  }
  $('bClose').onclick = () => closeBook()
  $('bPrev').onclick = () => setPage(bk.page - 1)
  $('bNext').onclick = () => setPage(bk.page + 1)
  let sx = null
  b3.addEventListener('pointerdown', e => { sx = e.clientX })
  b3.addEventListener('pointerup', e => {
    if (sx == null) return; const dx = e.clientX - sx; sx = null
    if (Math.abs(dx) > 40) { setPage(bk.page + (dx < 0 ? 1 : -1)); return }
    if (e.target.closest('button')) return
    const r = b3.getBoundingClientRect(); setPage(bk.page + (e.clientX > r.left + r.width * 0.35 ? 1 : -1))
  })
  st.querySelectorAll('[data-q]').forEach(x => (x.onclick = async () => {
    const s = x.dataset.q
    if (s === 'lu') { closeBook(true); openForm({ ...b, status: 'lu' }); return }
    try { await putBook({ ...b, status: s }); closeBook(); toast(s === 'en_cours' ? 'Bonne lecture' : 'Rangé sur la pile à lire') } catch { toast('Enregistrement impossible.') }
  }))
  st.querySelector('[data-a="edit"]').onclick = () => { closeBook(true); openForm(b) }
  st.querySelector('[data-a="del"]').onclick = () => {
    $('bconf').innerHTML = `<p class="quiet" style="margin:4px 0">Retirer « ${esc(b.title)} » ?</p><div style="display:flex;gap:8px"><button class="pbtn" style="flex:1" id="bno">Garder</button><button class="pbtn del" style="flex:1" id="byes">Retirer</button></div>`
    $('bno').onclick = () => ($('bconf').innerHTML = '')
    $('byes').onclick = async () => { try { await removeBook(b.id); closeBook(true); toast('Livre retiré') } catch { toast('Suppression impossible.') } }
  }
}
function setPage(p) {
  if (!bk) return; p = Math.max(bk.page === 0 ? 0 : 1, Math.min(3, p)); bk.page = p
  $('stage').querySelectorAll('.leaf').forEach(l => l.classList.toggle('turned', +l.dataset.i < p))
  $('dots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === p - 1))
  $('bPrev').disabled = p <= 1; $('bNext').disabled = p >= 3
}
function closeBook(instant) {
  if (!bk) return; const st = $('stage'), b3 = $('b3d'), cur = bk; bk = null
  const done = () => { st.hidden = true; st.classList.remove('show'); st.innerHTML = '' }
  if (instant === true || reduced()) { done(); return }
  st.querySelectorAll('.leaf').forEach(l => l.classList.remove('turned'))
  setTimeout(() => { b3.style.transform = cur.fly(); st.classList.remove('show'); setTimeout(done, 600) }, cur.page > 0 ? 520 : 0)
}
document.addEventListener('keydown', e => { if (!bk) return; if (e.key === 'Escape') closeBook(); if (e.key === 'ArrowRight') setPage(bk.page + 1); if (e.key === 'ArrowLeft') setPage(bk.page - 1) })

/* ---------- conseils de lecture ---------- */
$('moods').innerHTML = MOODS.map(m => `<button class="chip" data-m="${m}" aria-pressed="false">${m}</button>`).join('')
$('moods').onclick = e => { const x = e.target.closest('[data-m]'); if (!x) return; const m = x.dataset.m; moods.has(m) ? moods.delete(m) : moods.add(m); x.setAttribute('aria-pressed', moods.has(m)) }
function renderReco() {
  const liked = books.filter(b => b.status === 'lu')
  $('recoIntro').textContent = liked.length
    ? `Des lectures choisies d'après ${liked.length} livre${liked.length > 1 ? 's' : ''} lu${liked.length > 1 ? 's' : ''}, tes notes et tes avis.`
    : 'Note quelques livres lus et les conseils suivront tes goûts. En attendant, ils partent de tes envies.'
  const known = new Set(books.map(b => norm(b.title)))
  const items = reco.items || []
  $('recoList').innerHTML = items.length ? items.map((r, i) => {
    const has = known.has(norm(r.title))
    return `<div class="reco">${cover(r, 'mid')}<div class="meta"><div class="t">${esc(r.title)}</div><div class="a">${esc(r.author)}${r.year ? ', ' + esc(r.year) : ''}</div>
      <p class="why">${esc(r.why)}</p>
      ${has ? '<span class="state envie"><i></i>Déjà dans tes livres</span>' : `<button class="btn" data-r="${i}">Ajouter à mes envies</button>`}</div></div>`
  }).join('')
    + (reco.at ? `<div class="when">Conseils du ${new Date(reco.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${reco.mood ? ' · ' + esc(reco.mood) : ''}</div>` : '') : ''
}
$('recoList').addEventListener('click', async e => {
  const x = e.target.closest('[data-r]'); if (!x) return; const r = reco.items[+x.dataset.r]
  x.disabled = true
  try {
    // On complète avec Google Books pour récupérer la couverture
    let found = null
    try { found = (await searchBooks(`${r.title} ${r.author}`))[0] || null } catch { /* sans couverture */ }
    await putBook({
      id: newBookId(user.uid), title: r.title, author: r.author, year: r.year || found?.year || null, pages: r.pages || found?.pages || null,
      genre: r.genre || '', status: 'envie', rating: 0, note: '', summary: r.summary || found?.summary || '', why: r.why || '',
      cover: r.cover || found?.cover || '', isbn: found?.isbn || '', addedAt: Date.now(), finishedYear: null,
    })
    toast('Ajouté aux envies'); renderReco()
  } catch { x.disabled = false; toast('Ajout impossible.') }
})
$('recoGo').onclick = async () => {
  const pick = b => ({ title: b.title, author: b.author, genre: b.genre, status: b.status, rating: b.rating || 0, note: String(b.note || '').slice(0, 200) })
  const mood = [...moods].join(', ') + ($('recoWish').value.trim() ? (moods.size ? ' ; ' : '') + $('recoWish').value.trim() : '')
  $('recoGo').disabled = true; $('recoStat').textContent = 'La libraire parcourt les rayons… (ça peut prendre une minute)'
  try {
    const res = await fetch('/api/conseils', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
      body: JSON.stringify({ books: books.slice(0, 120).map(pick), mood }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Erreur')
    const items = (data.items || []).slice(0, 6)
    if (!items.length) { $('recoStat').textContent = 'Aucun conseil reçu. Réessaie.'; return }
    $('recoStat').textContent = ''
    reco = { items, at: Date.now(), mood }
    renderReco()
    await putMeta('reco', reco)
  } catch (e) { $('recoStat').textContent = e.message && e.message !== 'Erreur' ? e.message : "Les conseils n'ont pas pu être préparés. Réessaie." }
  finally { $('recoGo').disabled = false }
}
