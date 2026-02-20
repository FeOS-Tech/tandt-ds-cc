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
      CATEGORY: 2,
      SERVICE: 3,
      SLOT: 4,
      LOCATION: 5,
      SUMMARY: 6,
      COMPLETED: 7
    }
  }
 
  initializeMaps () {
    this.categoryMap = {}
    this.serviceMap = {}
 
    const categories = config.service?.categories || config.categories || []
    categories.forEach(category => {
      this.categoryMap[category.id] = category.name
    })
 
    const services = config.service?.services || config.services || []
    services.forEach(service => {
      this.serviceMap[service.id] = service.name
    })
  }
 
  async handleMessage (message) {
    const from = message.from
    const messageType = message.type
    const profileName = message?.contacts?.[0]?.profile?.name || null

    console.log('INSIDE handleMessage') // NEWLY ADDED
 
    // Extract text from message
    let extractedText = ''
 
    if (messageType === 'text' && message.text?.body) {
      extractedText = message.text.body.toLowerCase().trim()
    } else if (messageType === 'interactive' && message.interactive) {
      extractedText = this.extractInteractiveResponse(message.interactive)
    }
    console.log('INSIDE HANDLE MESSAGE, the extracted text is ' + extractedText) // NEWLY ADDED
 
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
        console.log('INSIDE UPDATE DISPLAY NAME is ' + profileName) // NEWLY ADDED
        user.displayName = profileName
        await user.save()
      }
 
      if (!user) {
        console.log('inside NOT USER') // NEWLY ADDED
        user = await this.createNewUser(from, message)
        await this.sendStepMessage(user, this.STEPS.WELCOME)
        //NEW ADD
        await this.updateUserStep(user, this.STEPS.CONSENT)
        await this.sendStepMessage(user, this.STEPS.CONSENT)
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
        case this.STEPS.CATEGORY: // Step 2
          await this.handleStep2(user, extractedText)
          break
        case this.STEPS.SERVICE: // Step 3
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
      2: 'CATEGORY',
      3: 'SERVICE',
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
        selectedCategory: null,
        selectedService: null,
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
    if (step <= this.STEPS.CATEGORY) {
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
    console.log('Inside HANDEL STEP 0') // NEWLY ADDED
    // Step 0: Welcome
    if (
      text.includes('hi') ||
      text.includes('hello') ||
      text.includes('start')
    ) {
      const userName =
      user.displayName !== 'Customer' ? user.displayName : 'there'
      
      //NEW ADD

      //await this.sendWelcomeMessage(user)
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        `*Dear ${userName},*\n\nWelcome to Track & Trail Service@Home\n`
        
      )
      await this.updateUserStep(user, this.STEPS.CONSENT)
      await this.sendStepMessage(user, this.STEPS.CONSENT)
      } else {
      const userName =
      user.displayName !== 'Customer' ? user.displayName : 'there'
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        `🚲 Dear ${userName}, Welcome to Track & Trail Service@Home`
        //*Welcome to Track and Trail, Doorstep Cycle Care.*\n\nSay *'Hi'* to start service booking.
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
 
      await this.updateUserStep(user, this.STEPS.CATEGORY)
      await this.sendCategoryMessage(user)

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
    // Step 2: Category Selection
    const session = this.getUserSession(user.phoneNumber)
 
    
    const categoryMap = {
      category_bicycle: 'bicycle',
      category_e_cycle: 'e_cycle',
      category_fitness: 'fitness',
 
      bicycle: 'bicycle',
      'e-cycle': 'e_cycle',
      fitness: 'fitness',
 
      1: 'bicycle',
      2: 'e_cycle',
      3: 'fitness'
    }
 
    const selectedCategory = categoryMap[text]
 
    if (selectedCategory) {
      session.selectedCategory = selectedCategory
      user.currentRequest = user.currentRequest || {}
      user.currentRequest.category = selectedCategory
 
      await this.updateUserStep(user, this.STEPS.SERVICE)
      await this.sendStepMessage(user, this.STEPS.SERVICE)
    } else {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        '⚠️ Please select a category from the list above.'
      )
    }
  }
   
  async handleStep3(user, text) {
    const session = this.getUserSession(user.phoneNumber)
 
    console.log("Service selection received:", text)
 
    const serviceSelectionMap = {
      basic_service: "basic_service",
      advanced_service: "advanced_service",
 
      basic: "basic_service",
      advance: "advanced_service",
      advanced: "advanced_service",
 
      1: "basic_service",
      2: "advanced_service"
    }
 
    const selectedService = serviceSelectionMap[text]
 
    if (selectedService) {
      session.selectedService = selectedService
      user.currentRequest.service = selectedService
 
      const serviceDisplayName = this.getServiceDisplayName(selectedService)
 
    
      await this.updateUserStep(user, this.STEPS.SLOT)
      await this.sendSlotMessage(user)
    } else {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        "⚠️ Please select a service using the buttons above."
      )
 
      await this.sendServiceMessage(user)
    }
  }
  
  getServiceDisplayName(serviceId) {
    const serviceNames = {
      basic_service: "Basic Service",
      advanced_service: "Advanced Service"
    }
 
    return serviceNames[serviceId] || serviceId
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




async handleStep5(user, message) {
  const session = this.getUserSession(user.phoneNumber)
  console.log('The MESSAGE JSON is ' + JSON.stringify(message))
  if (message.type === "location") {
    const locationData = {
      //address: message.location.name + `\n` + message.location.address || message.location.name || "Shared Location",
      address: message.location.name + `\n` + message.location.address || "Shared Location",
      coordinates: [message.location.longitude, message.location.latitude]
    }

    session.location = locationData
    user.currentRequest.location = locationData

    await this.updateUserStep(user, this.STEPS.SUMMARY)
    await this.sendStepMessage(user, this.STEPS.SUMMARY)
    return
  }

  if (message.type === "interactive") {
    const text = this.extractInteractiveResponse(message.interactive)

    if (text === "location_manual") {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        "📝 Please type your complete address."
      )
      return
    }

    if (text === "location_share") {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        "📍 Please attach your location 📎"
      )
      return
    }
  }

  if (message.type === "text" && message.text?.body) {
    session.location = {
      address: message.text.body,
      coordinates: [null, null]
    }

    user.currentRequest.location = session.location

    await this.updateUserStep(user, this.STEPS.SUMMARY)
    await this.sendStepMessage(user, this.STEPS.SUMMARY)
  }
}

 
  async handleStep6 (user, text) {
    console.log('The text value inside Handle Step 6 is ' + text)
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
      }\n\nOur team will confirm the visit date/ time and our technician will call you before the visit.\n\nThank you for choosing Track and Trail, Service@Home.  🚴‍♂️`
 
      await whatsappService.sendTextMessage(user.phoneNumber, confirmation)
 
      // Clear session
      //this.clearUserSession(user.phoneNumber)
    } else if (text === 'summary_cancel') {
      await whatsappService.sendTextMessage(
        user.phoneNumber,
        '❌ *Booking Cancelled*\n\nYour service request has been cancelled.\n\n🚲'
      )
      //this.clearUserSession(user.phoneNumber)
      await this.resetToStep(user, this.STEPS.WELCOME)
      this.clearUserSession(user.phoneNumber)
    }
      
  }
 
  async handleUnknownStep (user, text) {
    // If in unknown state, reset to Step 0
    console.log('Inside Handle Unknow Step') // NEWLY ADDED
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
      case this.STEPS.CATEGORY:
        await this.sendCategoryMessage(user)
        break
      case this.STEPS.SERVICE:
        await this.sendServiceMessage(user)
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
    console.log('INSIDE SENDWELCOMEMSG the user displayname is ' + user.displayName) // NEWLY ADDED
    //console.log('INSIDE SENDWELCOMEMSG the user displayname is ' + user.displayName)
    const userName =
      user.displayName !== 'Customer' ? user.displayName : 'there'
    await whatsappService.sendTextMessage(
      user.phoneNumber,
      `*Dear ${userName},*\n\nSay *'Hi'* to start service booking`
    )
  }
 
  async sendConsentMessage (user) {
    const userName =
      user.displayName !== 'Customer' ? user.displayName : 'there'
 
    // Consent message with buttons in the same message
    const consentMessage = `📜 *Consent Required* \n\n Dear ${userName}, Your consent is required for TI Cyles to process personal information for service fulfillment in line with applicable data protection laws.\n\n*Click YES to proceed.*`
 
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
 
 
async sendCategoryMessage(user) {
  const message = `📌 *Select your category:*`

  const buttons = [
    { id: "category_bicycle", title: "🚲 Bicycle" },
    { id: "category_e_cycle", title: "⚡ E-Cycle" },
    { id: "category_fitness", title: "🏋️ Fitness Equipment" }
  ]

  await whatsappService.sendInteractiveButtonMessage(
    user.phoneNumber,
    message,
    buttons
  )
}



  async sendServiceMessage(user) {
    const message =
      `🛠️ *Select the service you need:*\n\n` +
      `🔹 *Basic Service* - Wear-and-tear inspection, standard checks and adjustments, cleaning and lubrication.\n` +
      `(Replacement parts, if required, will be charged separately)\n\n` +
      `🔹 *Advanced Service* - Part replacement, partial or full restoration to proper working condition.`
 
    const buttons = [
      { id: "basic_service", title: "🛠️ Basic Service" },
      { id: "advanced_service", title: "⚙️ Advanced Service" }
    ]
 
    await whatsappService.sendInteractiveButtonMessage(
      user.phoneNumber,
      message,
      buttons
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
            title: '📝 Enter Complete Address',
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
 
    const categoryName =
      this.categoryMap[session.selectedCategory] || session.selectedCategory
    const serviceName =
      this.serviceMap[session.selectedService] || session.selectedService
    const slotTime = session.selectedSlots?.[0]?.displayShort || 'Not selected'
    const location = session.location?.address || 'Not provided'
    //const parts = location.split(`|`)[1].split(`,`).map(s => s.trim());
    //const formattedLocation = location.split(`|`)[0].trim() + `\n` + parts.slice(0,3).join(`,`) + '\n' + parts.slice(3,5).join(`,`);

 
    const summary = `📋 *Booking Summary*\n
🚲 *Category    :* ${categoryName}
🔧 *Service Type:* ${serviceName}  
📅 *Date/Time   :* ${slotTime}
📍 *Address     :* ${location}
 
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
    console.log('Inside Create NEW USER')
    const user = new User({
      phoneNumber: phoneNumber,
      displayName: 'Customer',
      awaitingName: true,
      conversationStep: this.STEPS.CONSENT,
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