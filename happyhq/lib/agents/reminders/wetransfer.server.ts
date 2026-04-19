/**
 * Reminder: WeTransfer Download
 *
 * Conditions: User message contains a we.tl or wetransfer.com/downloads link.
 * Why: WebFetch gets a JS-rendered shell from WeTransfer. Without this,
 *      Q gives up and tells the user to download manually. WeTransfer has
 *      a simple unauthenticated API that works with curl.
 */

const WETRANSFER_PATTERN = /we\.tl\/t-|wetransfer\.com\/downloads\//i

/** Detect WeTransfer links in user message. */
export function hasWeTransferLinks(message: string): boolean {
  return WETRANSFER_PATTERN.test(message)
}

/** Static instructions for downloading from WeTransfer via their API. */
export function wetransferReminder(): string {
  return [
    `The user's message contains a WeTransfer link. WeTransfer pages are JS-rendered — WebFetch won't work. Use their download API instead:`,
    ``,
    `1. If the URL is a short link (we.tl/t-xxx), resolve it: \`curl -sI 'https://we.tl/t-xxx'\` and find the Location header to get the full URL`,
    `2. Extract transferId and securityHash from the full URL: wetransfer.com/downloads/{transferId}/{securityHash}?...`,
    `3. Get the direct download link:`,
    `   curl -s -X POST 'https://wetransfer.com/api/v4/transfers/{transferId}/download' \\`,
    `     -H 'Content-Type: application/json' \\`,
    `     -H 'x-requested-with: XMLHttpRequest' \\`,
    `     -d '{"security_hash":"{securityHash}","intent":"entire_transfer"}'`,
    `4. Download from the \`direct_link\` in the JSON response: \`curl -L -o /tmp/filename.zip '{direct_link}'\``,
  ].join('\n')
}
