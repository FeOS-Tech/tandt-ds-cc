// src/controllers/messageController.js - STEP-BASED FLOW
const User = require('../models/User')
const whatsappService = require('../services/whatsappService')
const { config } = require('../config')
const logger = require('../utils/logger')

const mongoService = require('../services/mongoService')

class MessageController {
  constructor () {
    // Initialize mappings
    this.initializeMaps()

    // Session storage
    this.userSessions = new Map()
    this.sessionMap = new Map()

    // Step definitions
    this.STEPS = {
      WELCOME: 0,
      CONSENT: 1,
      BRAND: 2,
      ISSUE: 3,
      SLOT: 4,
      LOCATION: 5,
      SUMMARY: 6,
      COMPLETED: 7
    }
  }

  initializeMaps () {
    this.brandMap = {}
    this.issueMap = {}

    const brands = config.service?.brands || config.brands || []
    brands.forEach(brand => {
      this.brandMap[brand.id] = brand.name
    })

    const issues = config.service?.issues || config.issues || []
    issues.forEach(issue => {
      this.issueMap[issue.id] = issue.name
    })
  }

  async handleMessage (message) {
    const from = message.from
    const messageType = message.type

    const profileName = message?.contacts?.[0]?.profile?.name || null

    // Extract text from message
    let extractedText = ''

    if (messageType === 'text' && message.text?.body) {
      extractedText = message.text.body.toLowerCase().trim()
    } else if (messageType === 'interactive' && message.interactive) {
      extractedText = this.extractInteractiveResponse(message.interactive)
    }
    console.log('the extracted text is ' + extractedText)

    logger.info('Processing message', {
      from,
      step: 'START',
      text: extractedText
    })

    try {
      // Get or create user
      let user = await User.findOne({ phoneNumber: from })

      // Update display name for existing users
      if (user && profileName && user.displayName === 'Customer') {
        user.displayName = profileName
        await user.save()
      }

      if (!user) {
        user = await this.createNewUser(from, message)
        await this.sendStepMessage(user, this.STEPS.WELCOME)
        return
      }

      // Update interaction timestamp
      user.lastInteraction = new Date()
      user.messageCount += 1
      user.lastMessage = extractedText

      // Handle restart commands at any step
      if (this.isRestartCommand(extractedText)) {
        await this.resetToStep(user, this.STEPS.WELCOME)
        return
      }

      // Process based on current step
      const currentStep = user.conversationStep || 0
      console.log('the current step is ' + currentStep)

      logger.info('Current step:', {
        from,
        step: currentStep,
        stepName: this.getStepName(currentStep)
      })

      switch (currentStep) {
        case this.STEPS.WELCOME: // Step 0
          await this.handleStep0(user, extractedText)
          break
        case this.STEPS.CONSENT: // Step 1
          await this.handleStep1(user, extractedText)
          break
        case this.STEPS.BRAND: // Step 2
          await this.handleStep2(user, extractedText)
          break
        case this.STEPS.ISSUE: // Step 3
          await this.handleStep3(user, extractedText)
          break
        case this.STEPS.SLOT: // Step 4
          await this.handleStep4(user, extractedText)
          break
        case this.STEPS.LOCATION: // Step 5
          await this.handleStep5(user, message)
          break
        case this.STEPS.SUMMARY: // Step 6
          await this.handleStep6(user, extractedText)
          break
        default:
          await this.handleUnknownStep(user, extractedText)
      }

      await user.save()
    } catch (error) {
      logger.error('Error in handleMessage:', {
        from,
        error: error.message,
        stack: error.stack
      })

      // On any error, reset to Step 0
      await this.handleError(from, error)
    }
  }

  // Helper Methods
  extractInteractiveResponse (interactive) {
    if (interactive.type === 'list_reply' && interactive.list_reply?.id) {
      return interactive.list_reply.id
    } else if (
      interactive.type === 'button_reply' &&
      interactive.button_reply?.id
    ) {
      return interactive.button_reply.id
    }
    return ''
  }

  isRestartCommand (text) {
    return (
      text.includes('restart') ||
      text.includes('start over') ||
      text.includes('start again') ||
      text === '0'
    )
  }

  getStepName (step) {
    const stepNames = {
      0: 'WELCOME',
      1: 'CONSENT',
      2: 'BRAND',
      3: 'ISSUE',
      4: 'SLOT',
      5: 'LOCATION',
      6: 'SUMMARY',
      7: 'COMPLETED'
    }
    return stepNames[step] || 'UNKNOWN'
  }

  getUserSession (phoneNumber) {
    if (!this.userSessions.has(phoneNumber)) {
      this.userSessions.set(phoneNumber, {
        selectedBrand: null,
        selectedIssue: null,
        selectedSlots: [],
        location: null,
        stepHistory: []
      })
    }
    return this.userSessions.get(phoneNumber)
  }

  getSessionId (phoneNumber) {
    if (!this.sessionMap.has(phoneNumber)) {
      this.sessionMap.set(
        phoneNumber,
        `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      )
    }
    return this.sessionMap.get(phoneNumber)
  }

  async logStepToMongo (user, step) {
    try {
      const sessionId = this.getSessionId(user.phoneNumber)

      // Start activity if this is step 0
      // if (step === 0) {
      //   await mongoService.startUserActivity(user.phoneNumber, sessionId);
      // }

      await mongoService.startUserActivity(user.phoneNumber, sessionId)
      // Log the step
      await mongoService.logStepActivity(user.phoneNumber, step, sessionId)

      logger.info('Step logged to MongoDB', { phone: user.phoneNumber, step })
    } catch (error) {
      logger.error('Error logging step to MongoDB:', error)
      // Don't throw error - MongoDB logging should not break the flow
    }
  }

  clearUserSession (phoneNumber) {
    this.userSessions.delete(phoneNumber)
  }

  async updateUserStep (user, newStep) {
    user.conversationStep = newStep
    user.conversationState = user.getStateFromStep()

    // this.logStepToMongo(user, newStep).catch(() => {}); // Silent fail
    try {
      await this.logStepToMongo(user, newStep)
    } catch (err) {
      logger.error('User activity log failed', err)
    }

    // Record step history in session
    const session = this.getUserSession(user.phoneNumber)
    session.stepHistory.push({
      step: newStep,
      timestamp: new Date(),
      stepName: this.getStepName(newStep)
    })

    logger.info('Step updated:', {
      phone: user.phoneNumber,
      fromStep: user.conversationStep,
      toStep: newStep
    })
  }

  async resetToStep (user, step) {
    // Clear session data
    this.clearUserSession(user.phoneNumber)

    // Reset user data based on step
    if (step <= this.STEPS.CONSENT) {
      user.consentGiven = false
      user.consentTimestamp = null
    }
    if (step <= this.STEPS.BRAND) {
      user.currentRequest = {}
    }

    // Update step
    await this.updateUserStep(user, step)
    await user.save()

    // Send message for the new step
    await this.sendStepMessage(user, step)
  }

  async handleError (phoneNumber, error) {
    logger.error('Resetting user due to error:', {
      phoneNumber,
      error: error.message
    })

    const user = await User.findOne({ phoneNumber })
    if (user) {
      await this.resetToStep(user, this.STEPS.WELCOME)

      await whatsappService.sendTextMessage(
        phoneNumber,
        "⚠️ *Oops! Something went wrong.*\n\nWe've reset your session. Starting from the beginning...\n\nSay *'Hi'* to continue."
      )
    }
  }

  // Step Handlers
  async handleStep0 (user, text) {
    // Step 0: Welcome
    if (
      text.includes('hi') ||
      text.includes('hello') ||
      text.includes('start')
    ) {
      await this.updateUserStep(user, this.STEPS.CONSENT)
      await this.sendStepMessage(user, this.STEPS.CONSENT)
    } else {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        "🚲 *Welcome to Track and Trail, Doorstep Cycle Care.*\n\nSay *'Hi'* to start service booking."
      )
    }
  }

  async handleStep1 (user, text) {
    const session = this.getUserSession(user.phoneNumber)

    console.log('Consent response:', text)

    if (text === 'consent_yes') {
      user.consentGiven = true
      user.consentTimestamp = new Date()

      try {
        await mongoService.createOrUpdateUserMaster(user.phoneNumber, {
          userConsent: true,
          userProfileName: user.displayName
        })
      } catch (error) {
        logger.error('Error saving consent to MongoDB:', error)
      }

      await this.updateUserStep(user, this.STEPS.BRAND)
      await this.sendBrandMessage(user)
    } else if (text === 'consent_no') {
      await this.updateUserStep(user, this.STEPS.WELCOME)

      const userName =
        user.displayName !== 'Customer' ? user.displayName : 'there'

      await whatsappService.sendTextMessage(
        user.phoneNumber,
        `Dear ${userName}, Without your consent, we cannot process your service request. Your data is handled securely and only for service fulfillment. Say *'Hi'* anytime to start service booking. 🚲`
      )

      this.clearUserSession(user.phoneNumber)
    } else {
      // Invalid response - resend consent message
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        'Please select an option using the buttons above.'
      )

      await this.sendConsentMessage(user)
    }
  }

  // New HANDLE STEP 2 START

  async handleStep2 (user, text) {
    // Step 2: Brand Selection
    const session = this.getUserSession(user.phoneNumber)

    // Map input to brand - UPDATED with others handling
    const brandMap = {
      brand_montra: 'montra',
      brand_bsa: 'bsa',
      brand_hercules: 'hercules',
      brand_mach_city: 'mach_city',
      brand_others: 'others', // NEW: Handle others selection
      montra: 'montra',
      bsa: 'bsa',
      hercules: 'hercules',
      mach_city: 'mach_city',
      others: 'others', // NEW: Direct input
      1: 'montra',
      2: 'bsa',
      3: 'hercules',
      4: 'mach_city',
      5: 'others' // NEW: If using numbers
    }

    const selectedBrand = brandMap[text]

    // Check if user selected "others"
    if (selectedBrand === 'others' || text === 'brand_others') {
      // Ask user to specify custom brand
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        "🚴‍♂️ *Please specify your other cycle brand:*\n\n (e.g., 'Hero', 'Atlas', 'Firefox', 'Avon', etc.)"
      )

      // Set intermediate state to wait for brand input
      session.waitingForCustomBrand = true
      session.pendingStep = this.STEPS.ISSUE // Store next step to go to

      // Don't update main step yet - stay in brand selection
      console.log(
        `User ${user.phoneNumber} selected "others", waiting for custom brand input`
      )
      return
    }

    // Handle predefined brands
    if (selectedBrand && this.brandMap[selectedBrand]) {
      session.selectedBrand = selectedBrand
      session.customBrand = null // Clear any previous custom brand
      user.currentRequest = user.currentRequest || {}
      user.currentRequest.brand = selectedBrand

      // Clear waiting state if exists
      session.waitingForCustomBrand = false
      session.pendingStep = null

      await this.updateUserStep(user, this.STEPS.ISSUE)
      await this.sendStepMessage(user, this.STEPS.ISSUE)

      console.log(`Brand selected for ${user.phoneNumber}: ${selectedBrand}`)
    } else {
      // Check if user is in custom brand input mode
      if (session.waitingForCustomBrand) {
        await this.handleCustomBrandInput(user, text)
      } else {
        // Invalid selection
        await whatsappService.sendTextMessage(
          user.phoneNumber,
          '⚠️ Please select a brand from the list above or type the brand name.'
        )
      }
    }
  }
  // New HANDLE STEP 2 END
  // NEW HANDLE MESSAGE STARTS
  async handleCustomBrandInput (user, text) {
    const session = this.getUserSession(user.phoneNumber)

    try {
      // Validate brand input
      if (!text || text.trim().length === 0) {
        await whatsappService.sendTextMessage(
          user.phoneNumber,
          "❌ Please enter a valid brand name.\n\nType your cycle brand (e.g., 'Hero Cycles', 'Atlas', 'Firefox'):"
        )
        return
      }

      const customBrand =
        text.trim().charAt(0).toUpperCase() + text.trim().slice(1).toLowerCase()

      // Validate length
      if (customBrand.length > 15) {
        await whatsappService.sendTextMessage(
          user.phoneNumber,
          '❌ Brand name is too long. Please enter a shorter brand name (max 15 characters):'
        )
        return
      }

      // Store custom brand
      session.selectedBrand = customBrand
      //session.customBrand = customBrand;
      user.currentRequest = user.currentRequest || {}
      //user.currentRequest.brand = 'custom';
      //user.currentRequest.customBrand = customBrand;

      // Clear waiting state
      session.waitingForCustomBrand = false

      // Send confirmation
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        `✅ *Brand recorded:* ${customBrand}`
      )

      // Move to next step
      const nextStep = session.pendingStep || this.STEPS.ISSUE
      await this.updateUserStep(user, nextStep)
      await this.sendStepMessage(user, nextStep)

      console.log(`Custom brand saved for ${user.phoneNumber}: ${customBrand}`)

      // Clear pending step
      session.pendingStep = null
    } catch (error) {
      console.error(
        `Error handling custom brand for ${user.phoneNumber}:`,
        error
      )
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        '❌ Sorry, there was an error saving your brand. Please try again.'
      )
    }
  }


  async handleStep3 (user, text) {
    const session = this.getUserSession(user.phoneNumber)

    console.log('Issue selection received:', text)

    // Map button responses to issue categories
    const issueMap = {
      issue_regular_ser: 'regular_ser',
      issue_brake_issue: 'brake_issue',
      issue_wheel_issue: 'wheel_issue',
      issue_drive_issue: 'drive_issue',
      issue_bearing_issue: 'bearing_issue',

      // Alternative inputs (if user types)
      regular: 'issue_regular_ser',
      brake: 'issue_brake_issue',
      braking: 'issue_brake_issue',
      wheel: 'issue_wheel_issue',
      tyre: 'issue_wheel_issue',
      drive: 'drive_issue',
      drivetrain: 'drive_issue',
      bearing: 'bearing_issue',
      rotation: 'bearing_issue',
      other: 'other',

      // Numeric shortcuts (optional)
      1: 'regular_ser',
      2: 'brake_issue',
      3: 'wheel_issue',
      4: 'drive_issue',
      5: 'bearing_issue'
    }

    const selectedIssue = issueMap[text]

    if (selectedIssue) {
      session.selectedIssue = selectedIssue
      user.currentRequest.issue = selectedIssue

      // Get display name for the selected category
      const issueDisplayName = this.getIssueDisplayName(selectedIssue)

      // Confirm selection and move to slots
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        `✅ Selected: ${issueDisplayName}\n`
      )

      await this.updateUserStep(user, this.STEPS.SLOT)
      await this.sendSlotMessage(user)
    } else {
      // Invalid selection
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        'Please select an issue category using the buttons above.'
      )
      await this.sendIssueMessage(user)
    }
  }

  // Helper method to get display name for issue category
  getIssueDisplayName (issueId) {
    const issueNames = {
      frame_chain_pedal: 'Frame, Chain & Pedal',
      tyre_tube_brake: 'Tyre, Tube & Brake',
      other: 'Other Issues'
    }
    return issueNames[issueId] || issueId
  }

  //NEWLY ADDED SIMPLIFIED
  async handleStep4 (user, text) {
    const session = this.getUserSession(user.phoneNumber)

    console.log('Slot selection received:', text)

    let slotIndex = -1

    // Check for Button pattern
    if (text.startsWith('slot_')) {
      const match = text.match(/slot_(\d)/)
      if (match) {
        slotIndex = parseInt(match[1])
      }
    }
    // Check for slot button pattern
    else if (text.startsWith('btn') && text.length === 4) {
      const num = text.charAt(3)
      if (!isNaN(num)) {
        slotIndex = parseInt(num)
      }
    }
    // Check for simple numbers
    else if (text === '1') {
      slotIndex = 0
    } else if (text === '2') {
      slotIndex = 1
    } else if (text === '3') {
      slotIndex = 2
    }

    console.log('Parsed slot index:', slotIndex)

    // Validate and process
    if (slotIndex >= 0 && slotIndex <= 2) {
      // Check if session.availableSlots exists
      if (!session.availableSlots || !Array.isArray(session.availableSlots)) {
        console.error('ERROR: availableSlots is undefined or not an array')

        // Regenerate slots
        const slots = this.generateServiceSlots(3)
        session.availableSlots = slots.map((slot, index) => ({
          ...slot,
          buttonId: `slot_${index}`,
          displayShort: `${slot.dateDisplay.split(' ')[0]} ${slot.time.replace(
            ':00',
            ''
          )} ${slot.period}`
        }))
      }

      if (session.availableSlots && session.availableSlots[slotIndex]) {
        await this.processSlotSelection(session, user, slotIndex)
        return
      }
    }

    // If we get here, something went wrong
    console.error('Invalid slot selection:', {
      text: text,
      slotIndex: slotIndex,
      availableSlots: session.availableSlots
        ? session.availableSlots.length
        : 'undefined'
    })

    await whatsappService.sendTextMessage(
      user.phoneNumber,
      'Please select a time slot by tapping one of the buttons above.'
    )

    // Resend slot options
    setTimeout(() => {
      this.sendSlotMessage(user)
    }, 500)
  }

  async processSlotSelection (session, user, slotIndex) {
    // Double-check availableSlots exists
    if (!session.availableSlots || !session.availableSlots[slotIndex]) {
      console.error('ERROR: Slot not found at index', slotIndex)

      // Regenerate and try again
      const slots = this.generateServiceSlots(3)
      session.availableSlots = slots.map((slot, index) => ({
        ...slot,
        buttonId: `slot_${index}`,
        displayShort: `${slot.dateDisplay.split(' ')[0]} ${slot.time.replace(
          ':00',
          ''
        )} ${slot.period}`
      }))
    }

    const selectedSlot = session.availableSlots[slotIndex]

    // Store selection
    session.selectedSlots = [
      {
        ...selectedSlot,
        index: slotIndex
      }
    ]

    user.currentRequest.selectedSlots = session.selectedSlots

    // Move to location
    await this.updateUserStep(user, this.STEPS.LOCATION)
    await this.sendLocationMessage(user)
  }

  async handleStep5 (user, message) {
    // Step 5: Location
    const session = this.getUserSession(user.phoneNumber)

    if (message.type === 'location') {
      const locationData = {
        address: message.location.name || 'Shared Location',
        coordinates: [message.location.longitude, message.location.latitude]
      }

      session.location = locationData
      user.currentRequest.location = locationData

      await this.updateUserStep(user, this.STEPS.SUMMARY)
      await this.sendStepMessage(user, this.STEPS.SUMMARY)
    } else if (message.type === 'text' || message.type === 'interactive') {
      let text = ''
      if (message.type === 'text') {
        text = message.text.body.toLowerCase()
      } else {
        text = this.extractInteractiveResponse(message.interactive)
      }

      if (text === 'location_manual') {
        await whatsappService.sendTextMessage(
          user.phoneNumber,
          'Please type your complete address.'
        )
      } else if (text && text !== 'location_share') {
        // Assume address input
        session.location = { address: message.text.body, coordinates: [0, 0] }
        user.currentRequest.location = session.location

        await this.updateUserStep(user, this.STEPS.SUMMARY)
        await this.sendStepMessage(user, this.STEPS.SUMMARY)
      }
    }
  }

  async handleStep6 (user, text) {
    console.log('The text value inside HS6 is ' + text)
    const session = this.getUserSession(user.phoneNumber)

    if (text === 'summary_confirm') {
      user.serviceHistory = user.serviceHistory || []
      user.serviceHistory.push({
        ...user.currentRequest,
        status: 'confirmed',
        createdAt: new Date()
      })

      await this.updateUserStep(user, this.STEPS.COMPLETED)

      const ticketNumber = await this.saveBookingToMongo(user, session)

      // Send confirmation
      const confirmation = `🎉 *Service request submitted successfully!*\n\n📋 *Ref Number:* ${
        ticketNumber || 'TI-' + Date.now().toString().slice(-8)
      }\n\nOur backend team will confirm the visit date and time, and our technician will call you before the visit.\n\n Thank you for choosing Track & Trail Doorstep Cycle Care.🚴‍♂️`

      await whatsappService.sendTextMessage(user.phoneNumber, confirmation)

      // Clear session
      this.clearUserSession(user.phoneNumber)
    } else if (text === 'summary_cancel') {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        '❌ *Booking Cancelled*\n\nYour service request has been cancelled.\n\n🚲'
      )

      await this.resetToStep(user, this.STEPS.WELCOME)

      this.clearUserSession(user.phoneNumber)
    }
  }

  async handleUnknownStep (user, text) {
    // If in unknown state, reset to Step 0
    await this.resetToStep(user, this.STEPS.WELCOME)
  }

  // Step Message Senders
  async sendStepMessage (user, step) {
    switch (step) {
      case this.STEPS.WELCOME:
        await this.sendWelcomeMessage(user)
        break
      case this.STEPS.CONSENT:
        await this.sendConsentMessage(user)
        break
      case this.STEPS.BRAND:
        await this.sendBrandMessage(user)
        break
      case this.STEPS.ISSUE:
        await this.sendIssueMessage(user)
        break
      case this.STEPS.SLOT:
        await this.sendSlotMessage(user)
        break
      case this.STEPS.LOCATION:
        await this.sendLocationMessage(user)
        break
      case this.STEPS.SUMMARY:
        await this.sendSummaryMessage(user)
        break
    }
  }

  async sendWelcomeMessage (user) {
    console.log('the user displayname is ' + user.displayName)
    const userName =
      user.displayName !== 'Customer' ? user.displayName : 'there'
    await whatsappService.sendTextMessage(
      user.phoneNumber,
      `*Dear ${userName},*\n\nWelcome to Track and Trail, Doorstep Cycle Care.* 🚲\n\nSay *'Hi'* to start service booking.`
    )
  }

  async sendConsentMessage (user) {
    const userName =
      user.displayName !== 'Customer' ? user.displayName : 'there'

    // Consent message with buttons in the same message
    const consentMessage = `📜 Consent Required*\n*Dear ${userName}, Your consent is required for TI Cyles to process personal information for service fulfillment in line with applicable data protection laws.\n\n*Click YES to proceed.*`

    // Create YES/NO buttons
    const buttons = [
      { id: 'consent_yes', title: '✅ YES, I Consent' },
      { id: 'consent_no', title: '❌ NO, Thank You' }
    ]

    await whatsappService.sendInteractiveButtonMessage(
      user.phoneNumber,
      consentMessage,
      buttons
    )
  }

  async sendBrandMessage (user) {
    const brands = config.service?.brands || config.brands || []

    console.log('The brand value in sendBrandMessage is ' + brands)

    const sections = [
      {
        title: 'Select a Brand',
        rows: brands.map(brand => ({
          id: `brand_${brand.id}`,
          title: `🚲 ${brand.name}`,
          description: `Select ${brand.name}`
        }))
      }
    ]

    await whatsappService.sendListMessage(
      user.phoneNumber,
      '🚴‍♂️ *Please select a brand*',
      'Select Brand',
      sections
    )
  }

  // Changed to Choices - START
  async sendIssueMessage (user) {
    const session = this.getUserSession(user.phoneNumber)
    const brandName =
      this.brandMap[session.selectedBrand] || session.selectedBrand
    const issues = config.service?.issues || config.issues || []

    const sections = [
      {
        title: `${brandName} Issues`,
        rows: issues.map(issue => ({
          id: `issue_${issue.id}`,
          title: `🔧 ${issue.name}`,
          description: `Select for ${issue.name} service`
        }))
      }
    ]

    await whatsappService.sendListMessage(
      user.phoneNumber,
      `🛠️ *Select Issue for ${brandName}:*`,
      'View Issues',
      sections
    )
  }
 
  // SLOT MESSAGE SIMPLIFIED //
  async sendSlotMessage (user) {
    const slots = this.generateServiceSlots(3)
    const session = this.getUserSession(user.phoneNumber)

    // Ensure session has availableSlots
    session.availableSlots = slots.map((slot, index) => ({
      ...slot,
      buttonId: `slot_${index}`,
      displayShort: `${slot.dateDisplay.split(' ')[0]} ${slot.time.replace(
        ':00',
        ''
      )} ${slot.period}`
    }))

    // Show options
    const slotList = session.availableSlots
      .map((slot, index) => `${index + 1}. ${slot.displayShort}`)
      .join('\n')

    // Create buttons with IDs that match what WhatsApp sends
    const buttons = session.availableSlots.map((slot, index) => ({
      id: `slot_${index}`,
      title: slot.displayShort
    }))

    await whatsappService.sendInteractiveButtonMessage(
      user.phoneNumber,
      '*Please select a preferred date/time slot*',
      buttons
    )
  }
  // SIMPLIFIED SLOT MEESAGE END

  async sendLocationMessage (user) {
    const sections = [
      {
        title: 'Share Location',
        rows: [
          {
            id: 'location_share',
            title: '📍 Share Location',
            description: 'Share your current location'
          },
          {
            id: 'location_manual',
            title: '📝 Enter Address',
            description: 'Please type your complete address'
          }
        ]
      }
    ]

    await whatsappService.sendListMessage(
      user.phoneNumber,
      '📍 *Please share your location:*',
      'Location Options',
      sections
    )
  }

  async sendSummaryMessage (user) {
    const session = this.getUserSession(user.phoneNumber)

    const brandName =
      this.brandMap[session.selectedBrand] || session.selectedBrand
    const issueName =
      this.issueMap[session.selectedIssue] || session.selectedIssue
    const slotTime = session.selectedSlots?.[0]?.displayShort || 'Not selected'
    const location = session.location?.address || 'Not provided'

    const summary = `📋 *Booking Summary*\n
🚲 *Brand:* ${brandName}
🔧 *Issue:* ${issueName}  
📅 *Time:* ${slotTime}
📍 *Location:* ${location}

*Please choose:*`

    // Clean 2-button layout with Cancel
    const buttons = [
      { id: 'summary_confirm', title: '✅ CONFIRM BOOKING' },
      { id: 'summary_cancel', title: '❌ CANCEL' }
    ]

    await whatsappService.sendInteractiveButtonMessage(
      user.phoneNumber,
      summary,
      buttons
    )
  }

  async saveBookingToMongo (user, session) {
    try {
      const result = await mongoService.completeServiceBooking(user, session)

      // Clear session ID after completion
      this.sessionMap.delete(user.phoneNumber)

      return result.ticketNumber
    } catch (error) {
      logger.error('Error saving booking to MongoDB:', error)
      return null
    }
  }

  // Utility Methods
  async createNewUser (phoneNumber, message) {
    const profileName = message?.contacts?.[0]?.profile?.name || 'Customer'
    const user = new User({
      phoneNumber: phoneNumber,
      displayName: 'Customer',
      awaitingName: true,
      conversationStep: this.STEPS.WELCOME,
      conversationState: 'new'
    })

    await user.save()
    return user
  }

  generateServiceSlots (count = 3) {
    const slots = []
    const now = new Date()

    for (let day = 1; day <= count; day++) {
      const date = new Date(now)
      date.setDate(now.getDate() + day)

      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
      const dateDisplay = `${date.getDate().toString().padStart(2, '0')}-${(
        date.getMonth() + 1
      )
        .toString()
        .padStart(2, '0')}-${date.getFullYear()} (${dayName})`

      // Vary times
      let time, period
      if (day === 1) {
        time = '10:00'
        period = 'AM'
      } else if (day === 2) {
        time = '02:00'
        period = 'PM'
      } else {
        time = '06:00'
        period = 'PM'
      }

      slots.push({
        dateDisplay: dateDisplay,
        time: time,
        period: period,
        display: `${dateDisplay} ${time} ${period}`
      })
    }

    return slots
  }
}

module.exports = new MessageController()
