// async function generateNextTicketNumber () {
//   const lastUser = await User.findOne(
//     { 'serviceHistory.ticketNumber': { $exists: true } },
//     { serviceHistory: 1 }
//   ).sort({ 'serviceHistory.createdAt': -1 })

//   let lastNumber = 0

//   if (lastUser && lastUser.serviceHistory.length > 0) {
//     const lastTicket =
//       lastUser.serviceHistory[lastUser.serviceHistory.length - 1].ticketNumber

//     if (lastTicket) {
//       lastNumber = parseInt(lastTicket.replace('SR', ''), 10)
//     }
//   }

//   const nextNumber = lastNumber + 1
//   return `SR${String(nextNumber).padStart(7, '0')}`
// }
