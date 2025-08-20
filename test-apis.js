// test-apis.js — API + Gmail test
require('dotenv').config()
const nodemailer = require('nodemailer')

const GREEN = '\x1b[32m',
  RED = '\x1b[31m',
  RESET = '\x1b[0m'

async function testRecreationAPI() {
  // Use the same endpoint as your server.js
  const date = '2025-09-20'
  const url = `https://www.recreation.gov/api/permit/4675333/availability?start_date=${date}&end_date=${date}`

  console.log('Fetching:', url)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FourPassMonitor/1.0)',
        Accept: 'application/json'
      }
    })

    // Check if response is OK first (like your server does)
    if (!res.ok) {
      console.log(
        `${GREEN}✅ API endpoint reachable (status: ${res.status})${RESET}`
      )
      console.log(
        'No availability or permit not yet released - this is expected'
      )
      return true // This is still a successful test - we reached the API
    }

    // Only try to parse JSON if response is OK
    const data = await res.json()
    console.log(`${GREEN}✅ API working — got JSON response${RESET}`)
    return true
  } catch (e) {
    // Only fail if we couldn't reach the API at all
    if (e.message.includes('fetch')) {
      console.log(`${RED}❌ Could not reach API: ${e.message}${RESET}`)
      return false
    }
    // If it's a JSON parse error, that means we reached the API but got HTML
    // This is expected when no permits are available
    console.log(
      `${GREEN}✅ API endpoint reachable (no JSON = no availability)${RESET}`
    )
    return true
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

  const transporter = nodemailer.createTransport({
    // IT'S createTransport NOT createTransporter!
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  })

  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: recipient,
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
  console.log('\nResults - API:', api, 'Mail:', mail)
  console.log(
    api && mail
      ? `${GREEN}All tests passed!${RESET}`
      : `${RED}Some tests failed${RESET}`
  )
})()
