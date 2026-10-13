import { captureLoadedFragrancePage } from './capture.js'

const captureButton = document.querySelector('#capture')
const downloadButton = document.querySelector('#download')
const status = document.querySelector('#status')
let captured

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true
  downloadButton.hidden = true
  captured = undefined
  status.textContent = 'Reading the loaded section…'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !/^https:\/\/(?:www\.)?(?:fragrantica\.com\/(?:perfume\/|p\/)|parfumo\.com\/Perfumes\/)/.test(tab.url ?? '')) {
      throw new Error('Open an English Fragrantica or Parfumo fragrance page first.')
    }
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureLoadedFragrancePage })
    if (!result?.ok) throw new Error(result?.message ?? 'The section could not be captured.')
    captured = result.capture
    status.textContent = 'Section captured. Download it, then load the file in Scent Map.'
    downloadButton.hidden = false
  } catch (caught) {
    status.textContent = caught.message || 'The section could not be captured.'
  } finally {
    captureButton.disabled = false
  }
})

downloadButton.addEventListener('click', () => {
  if (!captured) return
  const blob = new Blob([JSON.stringify(captured, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${captured.source}-capture.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})
