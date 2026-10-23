// Fonction Vercel : conseils de lecture préparés par Claude.
// Variables Vercel : ANTHROPIC_API_KEY (obligatoire), ALLOWED_EMAILS (facultatif, adresses séparées par des virgules),
// CLAUDE_MODEL (facultatif).
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { firebaseConfig } from '../src/firebase-config.js'

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5'

// Seules les personnes connectées à l'appli (et autorisées, si ALLOWED_EMAILS est rempli) peuvent utiliser la clé
async function checkUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const pid = firebaseConfig.projectId
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${pid}`, audience: pid })
  const allowed = String(process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (allowed.length && !allowed.includes(String(payload.email || '').toLowerCase())) return null
  return payload
}

const line = b => `- ${b.title} (${b.author || '?'})${b.genre ? ' [' + b.genre + ']' : ''}${b.rating ? ' note ' + b.rating + '/5' : ''}${b.note ? ' avis : « ' + String(b.note).slice(0, 200) + ' »' : ''}`

function buildPrompt(books, mood) {
  const lu = books.filter(b => b.status === 'lu').sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 60)
  const others = books.filter(b => b.status !== 'lu').slice(0, 60)
  return `Tu es une libraire francophone fine et cultivée. Conseille 5 livres réels à une lectrice, en tenant compte de ses goûts.
Livres qu'elle a lus (note sur 5 et avis quand elle en a donné) :
${lu.map(line).join('\n') || "(aucun pour l'instant)"}
Autres livres qu'elle possède ou qu'elle a envie de lire :
${others.map(line).join('\n') || '(aucun)'}
${mood ? 'Ce qu\'elle cherche en ce moment : ' + String(mood).slice(0, 300) + '\n' : ''}Règles : appuie-toi surtout sur ce qu'elle a bien noté, évite ce qui ressemble à ce qu'elle a mal noté, ne propose aucun livre de ses listes, varie les auteurs, privilégie des livres disponibles en français.
Réponds uniquement avec un tableau JSON de 5 objets, sans texte autour : {"title":string (titre français),"author":string,"year":number|null,"genre":string (1 à 3 mots),"pages":number|null,"summary":string (une phrase sans rien dévoiler),"why":string (une ou deux phrases qui la tutoient, en citant un livre qu'elle a aimé quand c'est pertinent)}.`
}

// Couverture Google Books pour chaque conseil
async function coverFor(item) {
  try {
    const q = encodeURIComponent(`intitle:${item.title} inauthor:${item.author.split(',')[0]}`)
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&printType=books`)
    const v = (await r.json()).items?.[0]?.volumeInfo
    const raw = v?.imageLinks?.thumbnail || ''
    return raw ? raw.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=2') : ''
  } catch { return '' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Les conseils ne sont pas encore activés : ajoute ANTHROPIC_API_KEY dans Vercel." })

  let who = null
  try { who = await checkUser(req) } catch { who = null }
  if (!who) return res.status(401).json({ error: 'Reconnecte-toi pour recevoir des conseils.' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const books = Array.isArray(body.books) ? body.books.slice(0, 150) : []

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: 'user', content: buildPrompt(books, body.mood) }] }),
    })
    const data = await r.json()
    if (!r.ok) {
      console.error('Claude API', r.status, data?.error?.message)
      return res.status(502).json({ error: r.status === 401 ? 'La clé Anthropic est refusée : vérifie ANTHROPIC_API_KEY dans Vercel.' : "Claude n'a pas pu répondre. Réessaie dans un moment." })
    }
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
    const items = (JSON.parse(json) || []).filter(x => x && x.title).slice(0, 6).map(x => ({
      title: String(x.title), author: String(x.author || ''), year: +x.year || null, genre: String(x.genre || ''),
      pages: +x.pages || null, summary: String(x.summary || ''), why: String(x.why || ''),
    }))
    const covers = await Promise.all(items.map(coverFor))
    items.forEach((it, i) => { it.cover = covers[i] })
    return res.status(200).json({ items })
  } catch (e) {
    console.error(e)
    return res.status(502).json({ error: 'La réponse était illisible. Réessaie.' })
  }
}
