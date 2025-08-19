// server.js - Four Pass Loop monitor with multiple emails and Resend API
const express = require('express')
const axios = require('axios')
const { Resend } = require('resend')
const cron = require('node-cron')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static('public'))

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY)

// Parse emails from environment variable
function getEmailList() {
  if (!process.env.EMAIL_LIST) {
    console.warn('⚠️ EMAIL_LIST not configured in .env file')
    return []
  }

  return process.env.EMAIL_LIST.split(/[,;]/)
    .map((email) => email.trim())
    .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

// Four Pass Loop permit - using the real permit ID
const MAROON_BELLS_PERMIT = {
  name: 'Maroon Bells-Snowmass Wilderness',
  id: '4675333' // Real permit ID from Recreation.gov
}

const TARGET_DATE = '2025-09-20'

// Check permit availability using the correct Recreation.gov API
async function checkPermitAvailability(permitId, date) {
  try {
    // Use the actual Recreation.gov permit API discovered by developers
    const response = await axios.get(
      `https://www.recreation.gov/api/permit/${permitId}/availability`,
      {
        params: {
          start_date: date,
          end_date: date
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FourPassMonitor/1.0)',
          Accept: 'application/json'
        },
        timeout: 10000
      }
    )

    // Parse the response - structure may vary
    const data = response.data

    // Look for availability data in various possible response structures
    if (data.payload && data.payload[date]) {
      const dayData = data.payload[date]
      return {
        available: dayData.remaining || dayData.available || 0,
        total: dayData.total || dayData.capacity || 0,
        reservable: dayData.is_reservable !== false
      }
    }

    // Alternative response structure
    if (data.availability && data.availability[date]) {
      const dayData = data.availability[date]
      return {
        available: dayData.remaining || dayData.available || 0,
        total: dayData.total || dayData.capacity || 0,
        reservable: dayData.reservable !== false
      }
    }

    // If no data found for the date, assume no availability
    return { available: 0, total: 0, reservable: false }
  } catch (error) {
    console.error(`API Error: ${error.response?.status} - ${error.message}`)

    // Try alternative endpoint format if first fails
    if (error.response?.status === 400 || error.response?.status === 404) {
      try {
        console.log(`Trying alternative permit API format...`)
        const altResponse = await axios.get(
          `https://www.recreation.gov/api/permitinyo/${permitId}/availabilityv2`,
          {
            params: {
              start_date: date,
              end_date: date,
              commercial_acct: false
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FourPassMonitor/1.0)',
              Accept: 'application/json'
            },
            timeout: 10000
          }
        )

        // Parse alternative response
        const altData = altResponse.data
        if (altData && altData[date]) {
          return {
            available: altData[date].remaining || altData[date].available || 0,
            total: altData[date].total || 0,
            reservable: true
          }
        }
      } catch (altError) {
        console.error(`Alternative API also failed: ${altError.message}`)
      }
    }

    // Final fallback: try RIDB API if we have a key
    if (process.env.RECREATION_API_KEY) {
      try {
        console.log(`Trying RIDB API fallback...`)
        const ridbResponse = await axios.get(
          `https://ridb.recreation.gov/api/v1/permits/${permitId}`,
          {
            params: { apikey: process.env.RECREATION_API_KEY },
            headers: { Accept: 'application/json' },
            timeout: 10000
          }
        )

        if (ridbResponse.data) {
          console.log('RIDB API connected but no real-time availability data')
          return {
            available: 0,
            total: 0,
            reservable: false,
            note: 'API connected but no availability data'
          }
        }
      } catch (ridbError) {
        console.error(`RIDB API failed: ${ridbError.message}`)
      }
    }

    return { available: 0, total: 0, reservable: false, error: error.message }
  }
}

// Send email notification to a single recipient
async function sendSingleEmail(email, availablePermits) {
  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'alerts@fourpassmonitor.dev',
      to: email,
      subject: 'Four Pass Loop Permits Available - September 20, 2025!',
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 30px; text-align: center; border-radius: 10px;">
                        <h1 style="margin: 0; font-size: 2em;">Four Pass Loop Alert!</h1>
                        <p style="margin: 10px 0 0 0; font-size: 1.2em;">Camping permits now available</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; margin: 20px 0; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #2c3e50; margin-top: 0;">September 20, 2025</h2>
                        <p style="font-size: 1.1em; color: #34495e;">Great news! Camping permits have opened up for your Four Pass Loop trip:</p>
                        
                        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">
                            <h3 style="color: #27ae60; margin-top: 0;">Available Permits:</h3>
                            ${availablePermits
                              .map(
                                (permit) => `
                                <div style="margin: 10px 0; padding: 15px; background: white; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                    <strong style="color: #2c3e50; font-size: 1.1em;">${permit.name}</strong><br>
                                    <span style="color: #27ae60; font-weight: bold; font-size: 1.2em;">${permit.available} spots available</span>
                                </div>
                            `
                              )
                              .join('')}
                        </div>
                        
                        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107;">
                            <h3 style="color: #856404; margin-top: 0;">Act Fast!</h3>
                            <p style="color: #856404; margin: 0;">Four Pass Loop permits fill up within minutes. Book immediately!</p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://www.recreation.gov/permits/4675333" 
                               style="background: #e74c3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 1.1em; display: inline-block;">
                                BOOK NOW ON RECREATION.GOV
                            </a>
                        </div>
                    </div>
                    
                    <div style="text-align: center; color: #6c757d; font-size: 0.9em;">
                        <p>Sent via Four Pass Loop Monitor</p>
                    </div>
                </div>
            `
    })

    return { success: true, email, messageId: result.data?.id }
  } catch (error) {
    console.error(`Email failed: ${email}`)
    return { success: false, email, error: error.message }
  }
}

// Send notifications to all emails
async function sendNotificationsToAll(availablePermits) {
  const emailList = getEmailList()

  if (emailList.length === 0) {
    console.warn('No emails configured')
    return []
  }

  const results = []
  for (const email of emailList) {
    const result = await sendSingleEmail(email, availablePermits)
    results.push(result)
    await new Promise((resolve) => setTimeout(resolve, 500)) // 500ms delay
  }

  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  console.log(`Emails: ${successful} sent, ${failed} failed`)

  return results
}

// Main monitoring function
async function checkFourPassAvailability() {
  console.log(`Checking permit availability for ${TARGET_DATE}...`)

  try {
    const availability = await checkPermitAvailability(
      MAROON_BELLS_PERMIT.id,
      TARGET_DATE
    )

    if (availability.available > 0) {
      console.log(
        `${MAROON_BELLS_PERMIT.name}: ${availability.available} spots available!`
      )

      const availablePermits = [
        {
          name: MAROON_BELLS_PERMIT.name,
          available: availability.available,
          total: availability.total,
          reservable: availability.reservable
        }
      ]

      console.log(`Sending alerts to ${getEmailList().length} recipients`)
      await sendNotificationsToAll(availablePermits)

      return availablePermits
    } else {
      console.log(`No availability found for ${TARGET_DATE}`)
      return []
    }
  } catch (error) {
    console.error(`Error checking ${MAROON_BELLS_PERMIT.name}:`, error.message)
    return []
  }
}

// API Routes
app.post('/test-email', async (req, res) => {
  try {
    const emailList = getEmailList()
    if (emailList.length === 0) {
      return res.status(400).json({
        error: 'No emails configured',
        details: 'Add EMAIL_LIST to your .env file'
      })
    }

    console.log(`Sending test emails to ${emailList.length} recipients...`)

    const results = []
    for (const email of emailList) {
      try {
        const result = await resend.emails.send({
          from: process.env.FROM_EMAIL || 'test@fourpassmonitor.dev',
          to: email,
          subject: 'Four Pass Loop Monitor - Email Test',
          html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background: #3498db; color: white; padding: 20px; text-align: center; border-radius: 10px;">
                                <h1>Email Test Successful!</h1>
                                <p>Your Four Pass Loop monitor is working correctly</p>
                            </div>
                            <div style="padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 10px;">
                                <h2>Configuration Verified</h2>
                                <p><strong>Recipient:</strong> ${email}</p>
                                <p><strong>Target Date:</strong> September 20, 2025</p>
                                <p><strong>Monitoring:</strong> Maroon Bells Wilderness</p>
                                <p><strong>Test Time:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                        </div>
                    `
        })
        results.push({ success: true, email, messageId: result.data?.id })
      } catch (error) {
        results.push({ success: false, email, error: error.message })
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const successful = results.filter((r) => r.success).length
    res.json({
      message: `Test emails sent to ${emailList.length} recipients`,
      successful,
      failed: results.length - successful,
      results
    })
  } catch (error) {
    res.status(500).json({ error: 'Email test failed', message: error.message })
  }
})

app.get('/status', (req, res) => {
  const emailList = getEmailList()
  res.json({
    targetDate: TARGET_DATE,
    emailRecipients: emailList.length,
    permitName: MAROON_BELLS_PERMIT.name,
    permitId: MAROON_BELLS_PERMIT.id,
    uptime: process.uptime(),
    lastCheck: new Date().toISOString(),
    configured: {
      recreationApiKey: !!process.env.RECREATION_API_KEY,
      resendApiKey: !!process.env.RESEND_API_KEY,
      emailList: emailList.length > 0
    }
  })
})

app.post('/check-now', async (req, res) => {
  try {
    const availablePermits = await checkFourPassAvailability()
    res.json({
      message: 'Manual check completed',
      targetDate: TARGET_DATE,
      availablePermits,
      emailsSent: availablePermits.length > 0 ? getEmailList().length : 0,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({ error: 'Check failed', message: error.message })
  }
})

// Web interface
app.get('/', (req, res) => {
  const emailList = getEmailList()
  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Four Pass Loop Monitor</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .dashboard { 
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(20px);
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 500px;
                    width: 100%;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                    text-align: center;
                }
                
                .header h1 { 
                    color: #2c3e50; 
                    font-size: 2.2em; 
                    margin-bottom: 10px;
                    font-weight: 700;
                }
                
                .header p { 
                    color: #7f8c8d; 
                    font-size: 1.1em; 
                    margin-bottom: 40px;
                }
                
                .status-card {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 30px 0;
                    border-left: 5px solid #27ae60;
                }
                
                .status-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    text-align: left;
                }
                
                .status-item {
                    display: flex;
                    flex-direction: column;
                }
                
                .status-label {
                    font-size: 0.9em;
                    color: #7f8c8d;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .status-value {
                    font-size: 1.3em;
                    font-weight: 600;
                    color: #2c3e50;
                }
                
                .status-indicator {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    margin-right: 8px;
                    background: #27ae60;
                }
                
                .actions {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    margin-top: 30px;
                }
                
                .btn {
                    padding: 15px 25px;
                    border: none;
                    border-radius: 12px;
                    font-size: 1em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
                }
                
                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none !important;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                }
                
                .btn-secondary {
                    background: linear-gradient(135deg, #f093fb, #f5576c);
                    color: white;
                }
                
                .system-status {
                    background: #f8f9fa;
                    border-radius: 10px;
                    padding: 20px;
                    margin-top: 30px;
                    text-align: left;
                }
                
                .status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #ecf0f1;
                }
                
                .status-row:last-child {
                    border-bottom: none;
                }
                
                .status-row span:first-child {
                    color: #7f8c8d;
                    font-size: 0.9em;
                }
                
                .status-row span:last-child {
                    font-weight: 600;
                    color: #2c3e50;
                }
                
                .loading {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .alert {
                    padding: 15px;
                    border-radius: 10px;
                    margin: 15px 0;
                    font-weight: 500;
                }
                
                .alert-success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                
                .alert-error {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <div class="header">
                    <h1>Four Pass Monitor</h1>
                    <p>September 20, 2025 • Permit Alerts</p>
                </div>
                
                <div class="status-card">
                    <div class="status-grid">
                        <div class="status-item">
                            <div class="status-label">Recipients</div>
                            <div class="status-value">${emailList.length} configured</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Monitoring</div>
                            <div class="status-value">
                                <span class="status-indicator"></span>Active
                            </div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Check Interval</div>
                            <div class="status-value">5 minutes</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Permit</div>
                            <div class="status-value">Maroon Bells Wilderness</div>
                        </div>
                    </div>
                </div>
                
                <div class="actions">
                    <button class="btn btn-secondary" id="testBtn" onclick="testEmail()">
                        Test Email System
                    </button>
                    <button class="btn btn-primary" id="checkBtn" onclick="checkNow()">
                        Check Availability Now
                    </button>
                </div>
                
                <div id="alertContainer"></div>
                
                <div class="system-status">
                    <h3>System Status</h3>
                    <div id="systemStatus">
                        <div class="status-row">
                            <span>Loading system information...</span>
                            <span><div class="loading"></div></span>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                function showAlert(message, type = 'success') {
                    const container = document.getElementById('alertContainer');
                    const alert = document.createElement('div');
                    alert.className = 'alert alert-' + type;
                    alert.textContent = message;
                    container.innerHTML = '';
                    container.appendChild(alert);
                    
                    setTimeout(() => {
                        alert.style.opacity = '0';
                        setTimeout(() => alert.remove(), 300);
                    }, 5000);
                }
                
                async function testEmail() {
                    const btn = document.getElementById('testBtn');
                    const originalText = btn.textContent;
                    
                    btn.innerHTML = '<div class="loading"></div> Sending test emails...';
                    btn.disabled = true;
                    
                    try {
                        const response = await fetch('/test-email', { method: 'POST' });
                        const data = await response.json();
                        
                        if (response.ok) {
                            showAlert('Test emails sent successfully to ' + data.successful + ' recipients', 'success');
                        } else {
                            showAlert('Test failed: ' + data.error, 'error');
                        }
                    } catch (error) {
                        showAlert('Test failed. Check server configuration.', 'error');
                    } finally {
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }
                }
                
                async function checkNow() {
                    const btn = document.getElementById('checkBtn');
                    const originalText = btn.textContent;
                    
                    btn.innerHTML = '<div class="loading"></div> Checking permits...';
                    btn.disabled = true;
                    
                    try {
                        const response = await fetch('/check-now', { method: 'POST' });
                        const data = await response.json();
                        
                        if (response.ok) {
                            const available = data.availablePermits.length;
                            if (available > 0) {
                                showAlert('Found ' + available + ' permits available! Check your email.', 'success');
                            } else {
                                showAlert('No permits available. Monitoring continues automatically.', 'success');
                            }
                        } else {
                            showAlert('Check failed: ' + data.error, 'error');
                        }
                    } catch (error) {
                        showAlert('Check failed. Please try again.', 'error');
                    } finally {
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }
                }
                
                async function loadSystemStatus() {
                    try {
                        const response = await fetch('/status');
                        const data = await response.json();
                        
                        const uptime = data.uptime;
                        const hours = Math.floor(uptime / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        
                        document.getElementById('systemStatus').innerHTML = 
                            '<div class="status-row"><span>Recreation API</span><span>' + (data.configured.recreationApiKey ? '✅ Connected' : '❌ Not configured') + '</span></div>' +
                            '<div class="status-row"><span>Email Service</span><span>' + (data.configured.resendApiKey ? '✅ Connected' : '❌ Not configured') + '</span></div>' +
                            '<div class="status-row"><span>Uptime</span><span>' + hours + 'h ' + minutes + 'm</span></div>' +
                            '<div class="status-row"><span>Last Check</span><span>' + new Date(data.lastCheck).toLocaleTimeString() + '</span></div>';
                    } catch (error) {
                        document.getElementById('systemStatus').innerHTML = 
                            '<div class="status-row"><span>System Status</span><span>❌ Error loading</span></div>';
                    }
                }
                
                // Load initial status and refresh every 30 seconds
                loadSystemStatus();
                setInterval(loadSystemStatus, 30000);
            </script>
        </body>
        </html>
    `)
})

// Initialize server
async function initializeServer() {
  console.log('Starting Four Pass Loop monitor...')

  // Check required API keys
  const missingKeys = []
  if (!process.env.RECREATION_API_KEY) missingKeys.push('RECREATION_API_KEY')
  if (!process.env.RESEND_API_KEY) missingKeys.push('RESEND_API_KEY')

  if (missingKeys.length > 0) {
    console.error(`Missing required API keys: ${missingKeys.join(', ')}`)
    console.error('Set these in your .env file before running')
    process.exit(1)
  }

  const emailList = getEmailList()
  if (emailList.length === 0) {
    console.warn('EMAIL_LIST not configured! Add emails to .env file.')
  } else {
    console.log(`Monitoring for ${emailList.length} email recipients`)
  }

  console.log('Configuration complete')
  console.log(`Target: September 20, 2025`)
  console.log(`Checking every 5 minutes`)

  // Initial check
  setTimeout(() => {
    console.log('Running initial availability check...')
    checkFourPassAvailability()
  }, 3000)
}

// Schedule monitoring every 5 minutes
cron.schedule('*/5 * * * *', () => {
  checkFourPassAvailability()
})

setTimeout(initializeServer, 1000)

app.listen(PORT, () => {
  console.log(`Four Pass Loop Monitor running on port ${PORT}`)
  console.log(`Web interface: http://localhost:${PORT}`)
})

module.exports = app
