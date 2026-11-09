export const runtime = "nodejs";

// Where the submitted contact forms are delivered
const TO_EMAIL = "subh295ankar@gmail.com";
// Resend's shared sender works without domain setup (it can only deliver to the Resend account owner's email).
// After verifying your own domain in Resend, set RESEND_FROM on Vercel, e.g. "PDF Create <contact@yourdomain.com>".
const DEFAULT_FROM = "PDF Create Contact <onboarding@resend.dev>";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EMAIL = 254;
const MAX_ISSUE = 3000;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

// Simple best-effort limit per visitor (resets when the serverless instance restarts)
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set");
    return json({ error: "Contact form is not configured yet. Please try again later." }, 500);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Message is too large." }, 413);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // Hidden spam-trap field: bots fill it, humans never see it. Pretend success.
  if (typeof data.website === "string" && data.website.trim() !== "") return json({ ok: true });

  const email = typeof data.email === "string" ? data.email.trim() : "";
  const issue = typeof data.issue === "string" ? data.issue.trim() : "";

  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }
  if (issue.length < 5) return json({ error: "Please describe your issue." }, 400);
  if (issue.length > MAX_ISSUE) return json({ error: `Issue is too long (max ${MAX_ISSUE} characters).` }, 400);

  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (tooMany(ip)) return json({ error: "Too many messages. Please try again in a few minutes." }, 429);

  const safeEmail = escapeHtml(email);
  const safeIssue = escapeHtml(issue).replace(/\n/g, "<br>");
  const subject = `PDF Create contact form: ${email}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
    <h2 style="margin:0 0 12px">New contact form message</h2>
    <p style="margin:0 0 4px"><strong>User email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
    <p style="margin:16px 0 4px"><strong>Issue:</strong></p>
    <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">${safeIssue}</div>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px">Hit Reply to answer the user directly.</p>
  </div>`;
  const text = `New contact form message\n\nUser email: ${email}\n\nIssue:\n${issue}\n`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || DEFAULT_FROM,
        to: [TO_EMAIL],
        reply_to: email,
        subject,
        html,
        text
      })
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Resend error", res.status, detail);
      return json({ error: "Could not send your message. Please try again later." }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("Resend request failed", err);
    return json({ error: "Could not send your message. Please try again later." }, 502);
  }
}

export function GET() {
  return json({ error: "Method not allowed." }, 405);
}
