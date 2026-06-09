/**
 * Light client-and-server-side redaction of obvious secret patterns before
 * storage (brief section 12). This is a safety net, not a guarantee: the
 * system prompt also instructs the assistant never to request secrets.
 *
 * We keep this conservative to avoid mangling legitimate IT content (error
 * codes, asset tags). We redact: things that look like a labelled password/PIN/
 * MFA/OTP, and long digit runs presented as a one-time code.
 */

const REDACTION = "[redacted]";

const PATTERNS: { re: RegExp; replace: string }[] = [
  // "password: hunter2", "pwd = hunter2", "passcode is hunter2"
  {
    re: /\b(password|passwd|pwd|passcode|pass\s*phrase)\b\s*(?:is|:|=)?\s*\S+/gi,
    replace: `$1: ${REDACTION}`,
  },
  // "PIN 1234", "pin: 123456"
  {
    re: /\b(pin)\b\s*(?:is|:|=)?\s*\d{3,8}\b/gi,
    replace: `$1: ${REDACTION}`,
  },
  // "MFA code 123456", "OTP: 1234 56", "one time code 123456"
  {
    re: /\b(mfa|otp|one[-\s]?time\s*(?:code|password)|verification\s*code|auth(?:entication)?\s*code)\b\s*(?:is|:|=)?\s*[\d\s-]{4,10}/gi,
    replace: `$1: ${REDACTION}`,
  },
];

export function redactSecrets(text: string): {
  text: string;
  redacted: boolean;
} {
  let out = text;
  let redacted = false;
  for (const p of PATTERNS) {
    const next = out.replace(p.re, p.replace);
    if (next !== out) redacted = true;
    out = next;
  }
  return { text: out, redacted };
}
