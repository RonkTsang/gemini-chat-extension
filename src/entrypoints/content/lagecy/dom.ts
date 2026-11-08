export function readSubmittedQuoteText(userQuery: Element): string {
  const quotes = userQuery.querySelectorAll('.submitted-quote-in-query')
  return quotes.length === 1 ? quotes[0].textContent?.trim() ?? '' : ''
}
