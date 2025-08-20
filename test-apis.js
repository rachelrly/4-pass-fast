// test-apis.js — API + Gmail test
require('dotenv').config()
const nodemailer = require('nodemailer')

const GREEN = '\x1b[32m',
  RED = '\x1b[31m',
  RESET = '\x1b[0m'

async function testRecreationAPI() {
  const url =
    'https://www.recreation.gov/api/permits/4675333/availability/month?start_date=2025-06-01T00:00:00.000Z&commercial_acct=false'
  console.log('Fetching:', url)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const data = await res.json()
    if (!res.ok) {
      console.log(`${RED}❌ API failed${RESET}`)
      return false
    }
    console.log(`${GREEN}✅ API working — keys: ${Object.keys(data)}${RESET}`)
    return true
  } catch (e) {
    console.log(`${RED}❌ Fetch failed: ${e.message}${RESET}`)
    return false
  }
}

async function testEmail() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.log(`${RED}❌ GMAIL_USER/GMAIL_PASS missing${RESET}`)
    return false
  }

  // Get first email from EMAIL_LIST
  let recipient = process.env.GMAIL_USER // default fallback
  if (process.env.EMAIL_LIST) {
    const emails = process.env.EMAIL_LIST.split(/[,;]/)
      .map((e) => e.trim())
      .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))

    if (emails.length > 0) {
      recipient = emails[0] // Use only the first email
      console.log(`Using first email from list: ${recipient}`)
    }
  }

  const tx = nodemailer.createTransporter({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  })

  try {
    const info = await tx.sendMail({
      from: process.env.GMAIL_USER,
      to: recipient, // Now using single email address
      subject: 'Test Nodemailer Email',
      html: `<p>✅ Test at ${new Date().toISOString()}</p>`
    })
    console.log(
      `${GREEN}✅ Email sent to ${recipient} — id: ${info.messageId}${RESET}`
    )
    return true
  } catch (e) {
    console.log(`${RED}❌ Email failed: ${e.message}${RESET}`)
    console.log(`Attempted to send to: ${recipient}`)
    return false
  }
}

;(async () => {
  const api = await testRecreationAPI()
  const mail = await testEmail()
  console.log('API:', api, 'Mail:', mail)
})()
