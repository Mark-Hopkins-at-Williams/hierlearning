export async function loadTranslations() {
  const res = await fetch('/api/translations')
  if (!res.ok) throw new Error('Failed to load translations')
  return res.json()
}

export async function saveTranslations(records) {
  const res = await fetch('/api/translations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records, null, 2),
  })
  if (!res.ok) throw new Error('Failed to save translations')
}
