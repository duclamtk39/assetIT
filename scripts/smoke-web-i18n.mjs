import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const baseUrl = process.env.ASSETFLOW_WEB_URL || 'http://127.0.0.1:5173'
const candidates =
  process.platform === 'win32'
    ? [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ].filter(Boolean)
    : [process.env.CHROME_PATH, 'google-chrome', 'chromium', 'chromium-browser'].filter(Boolean)
const browserPath = candidates.find(candidate => (candidate.includes('/') ? fs.existsSync(candidate) : true))
if (!browserPath) throw new Error('Chrome/Edge was not found. Set CHROME_PATH.')

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'assetflow-i18n-'))
const port = 9337
const browser = spawn(
  browserPath,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function json(url, options) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response.json()
    } catch {
      // The endpoint is not listening yet; fall through to the retry below.
    }
    await wait(100)
  }
  throw new Error(`Cannot reach browser debugging endpoint: ${url}`)
}

let socket
try {
  const target = await json(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
  })
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const callId = ++id
      pending.set(callId, { resolve, reject })
      socket.send(JSON.stringify({ id: callId, method, params }))
    })
  const evaluate = async expression =>
    (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
  await call('Runtime.enable')
  await wait(500)
  await evaluate(
    `localStorage.setItem('assetflow-session','admin');localStorage.setItem('assetflow-local-admin-credential-v3',JSON.stringify({mustChangePassword:false}));localStorage.setItem('assetflow-regional-settings',JSON.stringify({language:'en-US',timezone:'Asia/Ho_Chi_Minh',dateFormat:'DD/MM/YYYY',timeFormat:'24h',firstDayOfWeek:'monday'}));location.reload()`,
  )
  await wait(900)

  const routes = [
    '/',
    '/assets',
    '/assignments',
    '/inventory',
    '/audit',
    '/barcode',
    '/discovery',
    '/warehouse/receipts',
    '/warehouse/issues',
    '/warehouses',
    '/procurement',
    '/vendors',
    '/renewals',
    '/maintenance',
    '/reports',
    '/settings',
  ]
  const failures = []
  for (const route of routes) {
    await evaluate(`history.pushState({},'',${JSON.stringify(route)});dispatchEvent(new PopStateEvent('popstate'))`)
    await wait(180)
    const snapshot = await evaluate(
      `(()=>{const selector='main h1,main h2,.page-heading p,main button,main label,main th,main input[placeholder],main textarea[placeholder]';const ui=[...document.querySelectorAll(selector)].filter(element=>!element.closest('table,.recent-dashboard-list')&&!(element.tagName==='LABEL'&&element.querySelector('select'))).map(element=>element.getAttribute('placeholder')||[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' ')||element.textContent||'').map(value=>value.replace(/\\s+/g,' ').trim()).filter(Boolean);return {company:document.querySelector('.company-identity b')?.textContent?.trim(),crumb:document.querySelector('.crumb b')?.textContent?.trim(),ui:[...new Set(ui.filter(value=>/[À-ỹĐđ]/u.test(value)&&!value.startsWith('Inventory session ')))]}})()`,
    )
    const routeFailures = []
    if (snapshot.company !== 'Your company') routeFailures.push(`company=${JSON.stringify(snapshot.company)}`)
    if (/[À-ỹĐđ]/u.test(snapshot.crumb || '')) routeFailures.push(`breadcrumb=${JSON.stringify(snapshot.crumb)}`)
    if (snapshot.ui.length) routeFailures.push(`Vietnamese UI=${JSON.stringify(snapshot.ui)}`)
    if (routeFailures.length) failures.push(`${route}: ${routeFailures.join(', ')}`)
  }
  const dashboardWelcome = await evaluate(
    `history.pushState({},'','/');dispatchEvent(new PopStateEvent('popstate'));new Promise(resolve=>setTimeout(()=>resolve(document.querySelector('.dashboard-heading p')?.textContent?.trim()),200))`,
  )
  if (dashboardWelcome?.includes('Quản trị viên'))
    failures.push(`/: untranslated default administrator in ${JSON.stringify(dashboardWelcome)}`)
  await evaluate(`document.querySelector('.quick-language')?.click()`)
  await wait(250)
  const vietnameseToggle = await evaluate(
    `(()=>({language:document.documentElement.lang,company:document.querySelector('.company-identity b')?.textContent?.trim(),heading:document.querySelector('.dashboard-heading h1')?.textContent?.trim()}))()`,
  )
  if (
    vietnameseToggle.language !== 'vi-VN' ||
    vietnameseToggle.company !== 'Công ty của bạn' ||
    vietnameseToggle.heading !== 'Tổng quan tài sản'
  )
    failures.push(`EN → VI toggle failed: ${JSON.stringify(vietnameseToggle)}`)
  await evaluate(`document.querySelector('.quick-language')?.click()`)
  await wait(250)
  const englishToggle = await evaluate(
    `(()=>({language:document.documentElement.lang,company:document.querySelector('.company-identity b')?.textContent?.trim(),heading:document.querySelector('.dashboard-heading h1')?.textContent?.trim()}))()`,
  )
  if (
    englishToggle.language !== 'en-US' ||
    englishToggle.company !== 'Your company' ||
    englishToggle.heading !== 'Dashboard'
  )
    failures.push(`VI → EN toggle failed: ${JSON.stringify(englishToggle)}`)
  await evaluate(`history.pushState({},'','/settings');dispatchEvent(new PopStateEvent('popstate'))`)
  await wait(200)
  await evaluate(`document.querySelectorAll('.settings-hub-nav button')[1]?.click()`)
  await wait(120)
  await evaluate(`document.querySelectorAll('.identity-tabs button')[1]?.click()`)
  await wait(180)
  await evaluate(`document.querySelector('.user-management .page-heading .btn.primary')?.click()`)
  await wait(100)
  const userForm = await evaluate(
    `(()=>({message:document.querySelector('.user-management .directory-message')?.textContent?.trim()||'',departmentOptions:document.querySelectorAll('.user-management select[name="departmentId"] option').length,departmentDisabled:document.querySelector('.user-management select[name="departmentId"]')?.disabled}))()`,
  )
  if (
    /Failed to fetch|Cannot read properties/i.test(userForm.message) ||
    userForm.departmentOptions < 2 ||
    userForm.departmentDisabled
  )
    failures.push(`Local user department lookup failed: ${JSON.stringify(userForm)}`)
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else console.log(`Browser i18n smoke test passed for ${routes.length} routes.`)
} finally {
  socket?.close()
  browser.kill()
  await wait(300)
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    // Best-effort cleanup of the throwaway browser profile.
  }
}
