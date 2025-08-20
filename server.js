// server.js — Four Pass Loop monitor (Nodemailer + fetch)
const express = require('express')
const cron = require('node-cron')
const nodemailer = require('nodemailer')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static('public'))

// -----------------------------
// Email utils (Nodemailer)
// -----------------------------
function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_PASS // App Password
  if (!user || !pass) {
    console.warn('⚠️ GMAIL_USER or GMAIL_PASS missing. Emails will fail.')
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  })
}

function getEmailList() {
  if (!process.env.EMAIL_LIST) {
    console.warn('⚠️ EMAIL_LIST not configured in .env file')
    return []
  }
  return process.env.EMAIL_LIST.split(/[,;]/)
    .map((email) => email.trim())
    .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

// -----------------------------
// Permit config
// -----------------------------
const MAROON_BELLS_PERMIT = {
  name: 'Maroon Bells-Snowmass Wilderness',
  id: '4675333'
}
const TARGET_DATE = '2025-09-21'

// -----------------------------
// Availability check (fetch)
// -----------------------------
async function checkPermitAvailability(permitId, date) {
  const url = `https://www.recreation.gov/api/permit/${permitId}/availability?start_date=${date}&end_date=${date}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FourPassMonitor/1.0)',
        Accept: 'application/json'
      }
    })
    if (!res.ok) {
      console.error(`API Error: ${res.status} ${res.statusText}`)
      return { available: 0, total: 0, reservable: false }
    }
    const data = await res.json()
    if (data.payload && data.payload[date]) {
      const d = data.payload[date]
      return {
        available: d.remaining || d.available || 0,
        total: d.total || d.capacity || 0,
        reservable: d.is_reservable !== false
      }
    }
    if (data.availability && data.availability[date]) {
      const d = data.availability[date]
      return {
        available: d.remaining || d.available || 0,
        total: d.total || d.capacity || 0,
        reservable: d.reservable !== false
      }
    }
    return { available: 0, total: 0, reservable: false }
  } catch (e) {
    console.error(`Fetch failed: ${e.message}`)
    return { available: 0, total: 0, reservable: false }
  }
}

// -----------------------------
// Email sending
// -----------------------------
async function sendSingleEmail(email, availablePermits) {
  const transporter = createTransporter()
  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Four Pass Loop Permits Available - September 20, 2025!',
      html: `
        <div style="font-family: Arial; max-width:600px;margin:0 auto;">
          <h1 style="color:#27ae60;">Four Pass Loop Alert!</h1>
          <p>${availablePermits
            .map((p) => `<b>${p.name}:</b> ${p.available} spots`)
            .join('<br>')}</p>
          <p><a href="https://www.recreation.gov/permits/4675333">Book now</a></p>
        </div>`
    })
    return { success: true, email, messageId: info.messageId }
  } catch (e) {
    console.error(`Email failed to ${email}: ${e.message}`)
    return { success: false, email, error: e.message }
  }
}

async function sendNotificationsToAll(availablePermits) {
  const emails = getEmailList()
  const results = []
  for (const e of emails) {
    results.push(await sendSingleEmail(e, availablePermits))
    await new Promise((r) => setTimeout(r, 500)) // throttle
  }
  const ok = results.filter((r) => r.success).length
  console.log(`Emails: ${ok} sent, ${results.length - ok} failed`)
  return results
}

// -----------------------------
// Main check
// -----------------------------
async function checkFourPassAvailability() {
  console.log(`Checking permit availability for ${TARGET_DATE}...`)
  const a = await checkPermitAvailability(MAROON_BELLS_PERMIT.id, TARGET_DATE)
  if (a.available > 0) {
    console.log(`${MAROON_BELLS_PERMIT.name}: ${a.available} spots available!`)
    const availablePermits = [
      { name: MAROON_BELLS_PERMIT.name, available: a.available, total: a.total }
    ]
    await sendNotificationsToAll(availablePermits)
    return availablePermits
  } else {
    console.log(`No availability for ${TARGET_DATE}`)
    return []
  }
}

// -----------------------------
// Routes
// -----------------------------
app.post('/test-email', async (req, res) => {
  const emails = getEmailList()
  if (!emails.length)
    return res.status(400).json({ error: 'No EMAIL_LIST configured' })

  const results = []
  const tx = createTransporter()
  for (const e of emails) {
    try {
      const info = await tx.sendMail({
        from: process.env.GMAIL_USER,
        to: e,
        subject: 'Four Pass Monitor — Test Email',
        html: `<p>✅ Test email successful to ${e} at ${new Date().toLocaleString()}</p>`
      })
      results.push({ success: true, email: e, messageId: info.messageId })
    } catch (err) {
      results.push({ success: false, email: e, error: err.message })
    }
  }
  res.json({ results })
})

app.get('/status', (req, res) => {
  res.json({
    targetDate: TARGET_DATE,
    recipients: getEmailList(),
    configured: {
      gmail: !!process.env.GMAIL_USER && !!process.env.GMAIL_PASS
    },
    uptime: process.uptime()
  })
})

app.post('/check-now', async (req, res) => {
  const available = await checkFourPassAvailability()
  res.json({ available, timestamp: new Date().toISOString() })
})

// -----------------------------
// Boot
// -----------------------------
async function initializeServer() {
  console.log('Starting monitor...')
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.warn('⚠️ GMAIL_USER/GMAIL_PASS not set, emails will fail.')
  }
  if (!getEmailList().length) {
    console.warn('⚠️ EMAIL_LIST empty.')
  }
  console.log(`Target: ${TARGET_DATE}, checks every 5 minutes`)
  setTimeout(() => checkFourPassAvailability(), 3000)
}

cron.schedule('*/5 * * * *', checkFourPassAvailability)
setTimeout(initializeServer, 1000)

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

module.exports = app
