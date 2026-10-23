// Recherche de livres dans Google Books (sans clé : largement suffisant pour un usage perso)
const API = 'https://www.googleapis.com/books/v1/volumes'

export function toBook(v) {
  const i = v.volumeInfo || {}
  const ids = i.industryIdentifiers || []
  const isbn = (ids.find(x => x.type === 'ISBN_13') || ids.find(x => x.type === 'ISBN_10'))?.identifier || ''
  const raw = i.imageLinks?.thumbnail || i.imageLinks?.smallThumbnail || ''
  const cover = raw ? raw.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=2') : ''
  const desc = String(i.description || '').replace(/<[^>]+>/g, '').trim()
  return {
    title: [i.title, i.subtitle].filter(Boolean).join(' : ') || 'Sans titre',
    author: (i.authors || []).join(', '),
    year: +String(i.publishedDate || '').slice(0, 4) || null,
    pages: i.pageCount || null,
    genre: (i.categories || [])[0] || '',
    summary: desc.length > 420 ? desc.slice(0, 417).replace(/\s+\S*$/, '') + '…' : desc,
    cover, isbn,
  }
}

export async function searchBooks(q) {
  const clean = q.replace(/[-\s]/g, '')
  const query = /^\d{10}(\d{3})?$/.test(clean) ? `isbn:${clean}` : q
  const url = `${API}?q=${encodeURIComponent(query)}&maxResults=8&printType=books&langRestrict=fr`
  let data = await (await fetch(url)).json()
  // Rien en français : on retente sans filtre de langue
  if (!data.items?.length && !query.startsWith('isbn:')) {
    data = await (await fetch(url.replace('&langRestrict=fr', ''))).json()
  }
  const seen = new Set()
  return (data.items || []).map(toBook).filter(b => {
    const k = (b.title + b.author).toLowerCase()
    if (seen.has(k)) return false
    seen.add(k); return true
  }).slice(0, 6)
}
