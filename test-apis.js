// FIXED-TEST.js - This will actually work now
const { Resend } = require('resend')
require('dotenv').config()

// Colors
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

console.log('\n' + '='.repeat(60))
console.log('FIXED TEST - THIS WILL WORK')
console.log('='.repeat(60))

// ============================================
// TEST 1: RECREATION.GOV API - FIXED URL
// ============================================
async function testRecreationAPI() {
  console.log('\n--- TEST 1: RECREATION.GOV API ---\n')

  const permitId = '4675333' // Maroon Bells
  const testDate = '2025-06-01T00:00:00.000Z' // FIXED: Use full ISO format

  // FIXED URL WITH CORRECT DATE FORMAT
  const url = `https://www.recreation.gov/api/permits/${permitId}/availability/month?start_date=${testDate}&commercial_acct=false`

  console.log('Fetching:', url)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    console.log(`\nStatus: ${response.status}`)
    const data = await response.json()

    if (response.ok) {
      console.log(`${GREEN}✅ SUCCESS - API IS WORKING!${RESET}`)

      // Show what we got
      console.log('\nResponse has these keys:', Object.keys(data))

      if (data.availability) {
        console.log(`${GREEN}✅ Found availability data!${RESET}`)
        const dates = Object.keys(data.availability)
        console.log(`Has data for ${dates.length} dates`)

        // Show first few dates and their data
        if (dates.length > 0) {
          console.log('\nFirst date with data:')
          const firstDate = dates[0]
          console.log(`Date: ${firstDate}`)
          console.log(
            'Data:',
            JSON.stringify(data.availability[firstDate], null, 2)
          )
        }

        // Check for September 20
        const sept20 = '2025-09-20T00:00:00Z'
        if (data.availability[sept20]) {
          console.log(`\n${GREEN}September 20, 2025 data found!${RESET}`)
          const septData = data.availability[sept20]
          console.log(`Available: ${septData.remaining || 0}`)
          console.log(`Total: ${septData.total || 0}`)
        } else {
          console.log(`\n${YELLOW}No data for Sept 20 (too far out)${RESET}`)
        }
      }

      return true
    } else {
      console.log(`${RED}❌ API error: ${data.error || 'Unknown'}${RESET}`)
      return false
    }
  } catch (error) {
    console.log(`${RED}❌ FETCH FAILED: ${error.message}${RESET}`)
    return false
  }
}

// ============================================
// TEST 2: RESEND EMAIL - FIXED FOR YOUR ACCOUNT
// ============================================
async function testResendEmail() {
  console.log('\n--- TEST 2: RESEND EMAIL ---\n')

  if (!process.env.RESEND_API_KEY) {
    console.log(`${RED}❌ NO RESEND_API_KEY IN .env FILE${RESET}`)
    return false
  }

  console.log(`${GREEN}✅ Found RESEND_API_KEY${RESET}`)

  // IMPORTANT: Resend says you can only send to rachelreillydev@gmail.com
  // because you haven't verified a domain yet
  const YOUR_VERIFIED_EMAIL = 'rachelreillydev@gmail.com'

  console.log(
    `\n${YELLOW}IMPORTANT: Resend says your verified email is:${RESET}`
  )
  console.log(`${YELLOW}${YOUR_VERIFIED_EMAIL}${RESET}`)
  console.log(
    `${YELLOW}You can only send test emails to this address until you verify a domain${RESET}\n`
  )

  const resend = new Resend(process.env.RESEND_API_KEY)

  console.log('Sending test email to YOUR verified address...')

  try {
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev', // Default test sender
      to: YOUR_VERIFIED_EMAIL, // YOUR verified email
      subject: 'TEST - Four Pass Monitor Working!',
      html: `
                <div style="font-family: Arial; padding: 20px; background: #f0f0f0;">
                    <h1 style="color: #27ae60;">✅ IT WORKS!</h1>
                    <p>Your Resend API is configured correctly!</p>
                    <hr>
                    <p><strong>Next steps:</strong></p>
                    <ol>
                        <li>To send to other emails (like r.r.reilly.811@gmail.com), verify a domain at resend.com/domains</li>
                        <li>Or change your EMAIL_LIST to: rachelreillydev@gmail.com</li>
                        <li>Or add r.r.reilly.811@gmail.com as a verified recipient in Resend</li>
                    </ol>
                    <p>Time: ${new Date().toISOString()}</p>
                </div>
            `,
      text: 'IT WORKS! Check HTML version for details.'
    })

    if (result.data && result.data.id) {
      console.log(`${GREEN}✅ EMAIL SENT SUCCESSFULLY!${RESET}`)
      console.log(`Email ID: ${result.data.id}`)
      console.log(`\n${GREEN}CHECK rachelreillydev@gmail.com INBOX!${RESET}`)
      return true
    } else if (result.error) {
      console.log(`${RED}❌ EMAIL FAILED${RESET}`)
      console.log('Error:', result.error)
      return false
    }
  } catch (error) {
    console.log(`${RED}❌ EXCEPTION: ${error.message}${RESET}`)
    return false
  }
}

// ============================================
// RUN BOTH TESTS
// ============================================
async function runTests() {
  let apiWorks = false
  let emailWorks = false

  // Test 1
  apiWorks = await testRecreationAPI()

  // Test 2
  emailWorks = await testResendEmail()

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('RESULTS & FIXES')
  console.log('='.repeat(60))

  if (apiWorks) {
    console.log(`${GREEN}✅ Recreation.gov API: WORKING${RESET}`)
    console.log(
      '   The API needs dates in ISO format: 2025-06-01T00:00:00.000Z'
    )
  } else {
    console.log(`${RED}❌ Recreation.gov API: Check the date format${RESET}`)
  }

  if (emailWorks) {
    console.log(`${GREEN}✅ Resend Email: WORKING${RESET}`)
  } else {
    console.log(
      `${RED}❌ Resend Email: Check rachelreillydev@gmail.com${RESET}`
    )
  }

  console.log('\n' + '='.repeat(60))
  console.log('HOW TO FIX YOUR SETUP:')
  console.log('='.repeat(60))

  console.log(
    `\n${YELLOW}FOR EMAILS TO WORK WITH r.r.reilly.811@gmail.com:${RESET}`
  )
  console.log(
    'Option 1: Change EMAIL_LIST in .env to: rachelreillydev@gmail.com'
  )
  console.log('Option 2: Go to resend.com/domains and verify a domain')
  console.log(
    'Option 3: Add r.r.reilly.811@gmail.com as verified recipient in Resend\n'
  )

  console.log(`${YELLOW}FOR YOUR SERVER.JS:${RESET}`)
  console.log('1. Fix the date format - use ISO: 2025-09-20T00:00:00.000Z')
  console.log('2. Fix the API URL - use /api/permits/ (with s)')
  console.log('3. Remove RECREATION_API_KEY requirement')
  console.log('4. Use fetch() not axios')
  console.log('5. Change FROM_EMAIL to onboarding@resend.dev for now')
}

// Run it
runTests().catch((error) => {
  console.log(`${RED}FATAL ERROR: ${error.message}${RESET}`)
  process.exit(1)
})
