# Newsletter phone verification

Both `newsletter.html` and the site-wide popup require a phone OTP before the existing Brevo contact upsert. Email ownership is not verified, and a phone number is not a unique-coupon constraint. Existing contacts are unchanged.

## Setup before enabling production

1. In Meta WhatsApp Business Platform, finish business/sender onboarding and obtain a production phone-number ID and server-side access token with `whatsapp_business_messaging`. Create and get approval for an Italian (`it`) **authentication** template with one OTP body parameter, a copy-code button, and a five-minute expiration notice. Configure its name below. This integration supplies the same code to body and URL-button parameter index 0. A WhatsApp channel URL is not an API sender.
2. Create a Twilio Messaging Service with an SMS-capable sender, enable the intended destination countries, and complete any sender registration required for those destinations. Configure billing limits/alerts on both messaging providers. Trial accounts may restrict recipients. SMS is customer-requested, never automatic.
3. Provision Upstash Redis and use a read/write REST token with EVAL support. Use a separate database for previews/testing. Lua transitions enforce shared limits and state; no process-memory production fallback exists.
4. Create a Brevo contact attribute named `VERIFIED_PHONE` with type **Text**. Confirm lists 46 and 83 and their existing welcome/coupon automations are correct.
5. Configure all variables below in Netlify Functions environment settings. Use Node 22 or newer. Never put credentials in HTML, JavaScript served to browsers, Git, or PR comments. All variables are required; incomplete configuration returns 503 and cannot subscribe contacts.

| Variable | Value |
| --- | --- |
| `BREVO_API_KEY` | Existing contact-write API key |
| `OTP_HMAC_SECRET` | Random secret of at least 32 characters (e.g. generate with `openssl rand -hex 32`) |
| `UPSTASH_REDIS_REST_URL` | Database HTTPS REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Database read/write token |
| `META_ACCESS_TOKEN` | Production system-user access token |
| `META_PHONE_NUMBER_ID` | Production WhatsApp sender ID |
| `META_GRAPH_VERSION` | Supported pinned Graph version for the Meta app, e.g. `v27.0`; verify in your app |
| `META_OTP_TEMPLATE` | Approved Italian authentication template name |
| `TWILIO_ACCOUNT_SID` | SMS account SID |
| `TWILIO_AUTH_TOKEN` | SMS account auth token |
| `TWILIO_MESSAGING_SERVICE_SID` | SMS messaging service SID |

Ensure the existing privacy notice accurately describes phone storage and the messaging processors before launch. Verification does not enroll anyone in WhatsApp marketing.

## API and state

POST JSON to `/.netlify/functions/challenge` with `nome`, `cognome`, `email`, `compleanno` (YYYY-MM-DD), `citta`, `phone` (international format), `consent: true`, and `channel: "whatsapp"`. For resends or SMS fallback include the returned `challengeId`. The response contains `challengeId`, `sent`, `channel`, `expiresIn`, `resendAfter`, and `smsAfter` (durations in seconds), never the OTP. A send failure still returns this timing envelope so the UI can offer SMS immediately after WhatsApp failure. Successful API acceptance is not a delivery receipt; customers can request SMS after 60 seconds even if the accepted WhatsApp message never arrives.

POST the same details plus `challengeId` and `otp` to `/.netlify/functions/subscribe`. The server normalizes the phone using libphonenumber, validates required fields/consent/date/email, and checks the challenge before contacting Brevo. Changed details require a new WhatsApp challenge. Older clients without OTP are rejected.

Codes last five minutes and allow five wrong attempts. A resend replaces the code and resets this lifetime/attempt budget. Resends share a 60-second cooldown and fixed one-hour delivery budgets: five per normalized number and twenty per trusted Netlify client IP, across both channels. Failed provider requests also consume delivery budget. The trusted `x-nf-client-connection-ip` header must be supplied by Netlify; missing it fails closed. Do not expose these functions through a proxy that allows clients to forge this header.

Redis stores only keyed HMACs of the details, number, IP and code; keys expire after five minutes for challenges and one hour for rate counters. Full signup details are supplied again at completion, rather than stored in Redis. No customer details, OTPs, or provider error bodies are logged by this code.

Atomic Lua transitions prevent simultaneous completion calls and resend/verification races. Successful challenge replays return success without another Brevo call within the challenge lifetime. Explicit Brevo 4xx rejection allows retrying the same code while valid. A network timeout, 5xx, lost final state update, or interrupted function can have an unknown upstream outcome: the challenge stays blocked until expiry rather than risking a duplicate automation. Check Brevo/email before starting a fresh challenge in that case. This is challenge-scoped idempotency, not permanent deduplication across independent signups. The existing Brevo `updateEnabled` behavior remains in effect.

## Validation and rollout

Run `npm ci` then `npm test`. Backend tests execute the production Lua script using Fengari with an in-memory Redis command adapter; Meta, Twilio, Redis HTTP and Brevo are mocked. Form tests use jsdom. They do not prove provider credentials, live Redis compatibility, sender deliverability, or welcome-email automation.

Keep the PR draft until a Netlify preview with isolated Redis and controlled recipients passes these checks:

- Check the page and popup at desktop and mobile widths; use keyboard-only navigation to phone input, code input, resend and SMS controls. Confirm clear status/error announcements and that the popup remains scrollable.
- Receive an actual WhatsApp code using the approved template. Check wrong and expired codes, resend replacement, changing email/phone, rate limits, and a direct subscription request without a challenge.
- Request SMS after the cooldown and verify the replacement code. Check immediate SMS availability after a WhatsApp send failure.
- Confirm no Brevo contact/list update before successful verification. Confirm the verified number is stored as Text and the existing email/coupon flow runs only after completion.
- Confirm missing configuration and Redis/provider failures do not subscribe anyone. Confirm a rejected Brevo request can retry and successful completion replay does not trigger another contact write.

Live delivery tests are intentionally pending account setup; do not send to arbitrary customer numbers. Review provider failure rates and Brevo subscription success during controlled testing using provider dashboards without adding OTP/phone payloads to application logs. Merge and production deployment are separate actions, outside this draft PR.

## Provider references

- [Meta authentication templates](https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/)
- [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource)
- [Upstash REST EVAL](https://upstash.com/docs/redis/commands/scripting/eval)
