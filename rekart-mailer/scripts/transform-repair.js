const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "src");

const replacements = [
  ["use-sell-templates", "use-repair-journeys"],
  ["use-sell-request-id", "use-repair-request-id"],
  ["sell.service", "repair.service"],
  ["types/sell", "types/repair"],
  ["useSellStats", "useRepairStats"],
  ["useSellAnalytics", "useRepairAnalytics"],
  ["useJourneys", "useRepairJourneys"],
  ["useJourney(", "useRepairJourney("],
  ["useCreateJourney", "useCreateRepairJourney"],
  ["useSendNextStep", "useSendNextRepairStep"],
  ["useSendJourneyStep", "useSendRepairJourneyStep"],
  ["useResendJourneyStep", "useResendRepairJourneyStep"],
  ["useDeleteJourney", "useDeleteRepairJourney"],
  ["useCancelJourney", "useCancelRepairJourney"],
  ["useDeclineOffer", "useDeclineQuote"],
  ["useUpdateJourneyData", "useUpdateRepairJourneyData"],
  ["useJourneyActions", "useRepairJourneyActions"],
  ["useOfferEmailLogs", "useQuoteEmailLogs"],
  ["sellService", "repairService"],
  ["SellRequestJourney", "RepairRequestJourney"],
  ["SellJourneyAction", "RepairJourneyAction"],
  ["SellOfferEmailLogItem", "RepairQuoteEmailLogItem"],
  ["SellStats", "RepairStats"],
  ["SellOverviewClient", "RepairOverviewClient"],
  ["SellAnalyticsClient", "RepairAnalyticsClient"],
  ["SellDesignClient", "RepairDesignClient"],
  ["SellOverviewPage", "RepairOverviewPage"],
  ["SellAnalyticsPage", "RepairAnalyticsPage"],
  ["SellDesignPage", "RepairDesignPage"],
  ["JOURNEY_KEYS", "REPAIR_JOURNEY_KEYS"],
  ["JOURNEY_WORKFLOW_STEPS", "REPAIR_JOURNEY_WORKFLOW_STEPS"],
  ["JOURNEY_STEP_LABELS", "REPAIR_JOURNEY_STEP_LABELS"],
  ["journeyStepLabel", "repairJourneyStepLabel"],
  ["JourneyWorkflowStep", "RepairJourneyWorkflowStep"],
  ["revisedOffers", "revisedQuotes"],
  ["revisedOfferJourneys", "revisedQuoteJourneys"],
  ["totalRevisedOfferEmails", "totalRevisedQuoteEmails"],
  ["offer_declined", "quote_declined"],
  ["request_declined", "booking_declined"],
  ["request-received-reminder", "booking-confirmed-reminder"],
  ["inspection-underway", "diagnosing"],
  ["request-received", "booking-confirmed"],
  ["offer-ready", "quote-ready"],
  ["payment-sent", "repair-in-progress"],
  ["device-collected", "device-received"],
  ["offerGeneration", "quoteGeneration"],
  ["requestAckGeneration", "bookingAckGeneration"],
  ["offerExpiresAt", "quoteExpiresAt"],
  ["offerAcceptedByCustomer", "quoteAcceptedByCustomer"],
  ["offerAcceptedGeneration", "quoteAcceptedGeneration"],
  ["offerRoundHistory", "quoteRoundHistory"],
  ["requestAckByCustomer", "bookingAckByCustomer"],
  ["requestAckAcceptedGen", "bookingAckAcceptedGen"],
  ["requestAckDeclined", "bookingAckDeclined"],
  ["offerEffectiveGen", "quoteEffectiveGen"],
  ["customerAcceptedCurrentOffer", "customerAcceptedCurrentQuote"],
  ["requestAckEffectiveGen", "bookingAckEffectiveGen"],
  ["customerAcknowledgedCurrentRequest", "customerAcknowledgedCurrentBooking"],
  ["needsOfferRevision", "needsQuoteRevision"],
  ["needsRequestRevision", "needsBookingRevision"],
  ["awaitingOfferResponse", "awaitingQuoteResponse"],
  ["awaitingRequestAck", "awaitingBookingAck"],
  ["requestAckDone", "bookingAckDone"],
  ["offerDeclined", "quoteDeclined"],
  ["requestDeclined", "bookingDeclined"],
  ["OfferRoundHistoryList", "QuoteRoundHistoryList"],
  ["OfferEmailSendsBlock", "QuoteEmailSendsBlock"],
  ["ROUTES.SELL", "ROUTES.REPAIR"],
  ['"/dashboard/sell', '"/dashboard/repair'],
  ['"/sell/', '"/repair/'],
  ["SELL ", "Repair "],
  ["RKTS", "RKRP"],
  ["sell-stats", "repair-stats"],
  ["sell-journey-analytics", "repair-journey-analytics"],
  ["sell-journeys", "repair-journeys"],
  ["journey-actions", "repair-journey-actions"],
  ["Sell Analytics", "Repair Analytics"],
  ["Sell Overview", "Repair Overview"],
  ["device sell journey", "device repair journey"],
  ["sell journey", "repair journey"],
  ["Send Offer", "Send Quote"],
  ["Offer Declined", "Quote Declined"],
  ["Request Declined", "Booking Declined"],
  ["Request Received", "Booking Confirmed"],
  ["Inspection Underway", "Diagnosing"],
  ["Payment Sent", "Repair In Progress"],
  ["Item Collected", "Device Received"],
  ["Offer amount", "Quote amount"],
  ["SEND_REQUEST_EMAIL_ACTION", "SEND_BOOKING_EMAIL_ACTION"],
  ["Send Request Received Email", "Send Booking Confirmed Email"],
  ["decline-offer", "decline-quote"],
  ["getOfferEmailLogs", "getQuoteEmailLogs"],
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|ts)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const dirs = [
  path.join(root, "app/(dashboard)/dashboard/repair"),
  path.join(root, "modules/repair"),
];

const files = [...new Set(dirs.flatMap((d) => walk(d)))];

for (const f of files) {
  let c = fs.readFileSync(f, "utf8");
  for (const [a, b] of replacements) c = c.split(a).join(b);
  fs.writeFileSync(f, c);
}

console.log("Transformed", files.length, "files");
