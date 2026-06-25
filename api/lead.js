function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Assistant turns are stored raw, including the hidden triage block and the
// [READY_FOR_ASSESSMENT] marker. Strip both so the transcript reads as the
// clean conversation the claimant actually saw.
function stripTriage(s) {
  return String(s == null ? '' : s)
    .replace(/===TRIAGE===[\s\S]*?===END===/g, '')
    .replace(/\[READY_FOR_ASSESSMENT\]/g, '')
    .trim();
}

// Text alert for hot leads via Twilio. No-op unless TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN and TWILIO_SMS_FROM are all set in Vercel — so the lead
// flow is completely unaffected until Twilio is configured. Destination
// defaults to the alert number but can be overridden with ALERT_SMS_TO.
async function sendLeadSms(triage, formData, leadId) {
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_SMS_FROM;
  const TO = process.env.ALERT_SMS_TO || '+19175015557';
  if (!SID || !TOKEN || !FROM) return false;

  const name = formData.name || 'Unknown';
  const state = formData.state ? ` (${formData.state})` : '';
  const claim = (triage.claims || 'employment claim').split(',')[0].split('(')[0].trim();
  const link = leadId ? `workerrights.ai/admin?lead=${leadId}` : 'workerrights.ai/admin';
  const body = `🔴 HIGH LEAD: ${name}${state} — ${claim}. ${link}`;

  try {
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
    const params = new URLSearchParams({ To: TO, From: FROM, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!r.ok) { console.error('Twilio SMS error:', await r.text()); return false; }
    return true;
  } catch (e) {
    console.error('Twilio SMS send failed:', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { triage, formData, transcript } = req.body;
  if (!triage || !formData) return res.status(400).json({ error: 'Missing triage or formData' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL = process.env.TO_EMAIL || 'leads@workerrights.ai';
  const FROM_EMAIL = process.env.FROM_EMAIL || 'leads@workerrights.ai';

  const tierColors = { HIGH: '#2E6B4F', MEDIUM: '#B07010', LOW: '#5C5A55' };
  const tierLabels = {
    HIGH: '🟢 HIGH — strong, complete case',
    MEDIUM: '🟡 MEDIUM — viable but incomplete',
    LOW: '⚪ LOW — no viable basis'
  };
  const tierColor = tierColors[triage.tier] || '#5C5A55';
  const tierLabel = tierLabels[triage.tier] || triage.tier || 'Unrated';
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  // ── Save to Supabase ────────────────────────────────────────────────────────
  let savedLeadId = null;
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supaRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name: formData.name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          state: formData.state || null,
          situation: formData.situation || null,
          timeline: formData.timeline || null,
          employer_size: formData.empSize || null,
          claim_types: formData.claimTypes || [],
          tier: triage.tier || null,
          claims: triage.claims || null,
          strength_notes: triage.strengthNotes || null,
          deadline_urgency: triage.deadlineUrgency || null,
          estimated_value: triage.estimatedValue || null,
          salary: triage.salary || null,
          tenure: triage.tenure || null,
          evidence: triage.evidence || null,
          red_flags: triage.redFlags || null,
          recommended_action: triage.recommendedAction || null,
          status: 'new',
        })
      });
      if (supaRes.ok) {
        const [saved] = await supaRes.json();
        savedLeadId = saved?.id;
      }
    }
  } catch (e) {
    console.error('Supabase save error:', e.message);
  }

  // ── Text alert for HIGH-tier leads ──────────────────────────────────────────
  const isHotLead = triage.tier === 'HIGH';
  if (isHotLead) {
    await sendLeadSms(triage, formData, savedLeadId);
  }

  // ── Render intake transcript ────────────────────────────────────────────────
  const turns = Array.isArray(transcript) ? transcript : [];
  const transcriptHtml = turns.map(m => {
    const isUser = m.role === 'user';
    const text = isUser ? String(m.content || '').trim() : stripTriage(m.content);
    if (!text) return '';
    const label = isUser ? 'Claimant' : 'AI Intake';
    const labelColor = isUser ? '#0D1B2A' : '#2E6B4F';
    return `<div style="margin-bottom:0.9rem">
            <div style="font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;color:${labelColor};font-weight:700;margin-bottom:0.25rem">${label}</div>
            <div style="font-size:0.88rem;color:#1A1816;line-height:1.55">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
          </div>`;
  }).filter(Boolean).join('');

  const transcriptSection = transcriptHtml ? `
      <div style="margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Full Intake Transcript</div>
        ${transcriptHtml}
      </div>` : '';

  const transcriptText = turns.map(m => {
    const isUser = m.role === 'user';
    const text = isUser ? String(m.content || '').trim() : stripTriage(m.content);
    if (!text) return '';
    return `${isUser ? 'CLAIMANT' : 'AI INTAKE'}:\n${text}`;
  }).filter(Boolean).join('\n\n');

  // ── Build email ─────────────────────────────────────────────────────────────
  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f0;padding:2rem;margin:0">
  <div style="max-width:620px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0D1B2A;padding:1.5rem 2rem;border-bottom:3px solid #C9A84C">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#C9A84C;margin-bottom:0.25rem">WorkerRights.ai — New Lead</div>
      <div style="font-size:1.3rem;font-weight:700;color:white">${formData.name || 'Unknown'}</div>
      <div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:4px">${timestamp} ET</div>
    </div>
    <div style="background:${tierColor};padding:0.9rem 2rem">
      <div style="color:white;font-weight:600;font-size:0.95rem">${tierLabel}</div>
      <div style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin-top:2px">Value: ${triage.estimatedValue || 'unknown'} · Deadline: ${triage.deadlineUrgency || 'unknown'}</div>
    </div>
    <div style="padding:1.75rem 2rem">
      <div style="margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Contact Information</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <tr><td style="color:#5C5A55;padding:5px 0;width:130px">Name</td><td style="color:#1A1816;font-weight:500">${formData.name || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Email</td><td><a href="mailto:${formData.email}" style="color:#0D1B2A">${formData.email || '—'}</a></td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Phone</td><td style="color:#1A1816">${formData.phone || 'Not provided'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">State</td><td style="color:#1A1816">${formData.state || '—'}</td></tr>
        </table>
      </div>
      <div style="margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Screening Form Data</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <tr><td style="color:#5C5A55;padding:5px 0;width:130px">Situation</td><td style="color:#1A1816">${formData.situation || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Timeline</td><td style="color:#1A1816">${formData.timeline || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Employer size</td><td style="color:#1A1816">${formData.empSize || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Claim types</td><td style="color:#1A1816">${(formData.claimTypes || []).join(', ') || '—'}</td></tr>
        </table>
      </div>
      <div style="margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">AI Case Assessment</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <tr><td style="color:#5C5A55;padding:5px 0;width:130px;vertical-align:top">Identified claims</td><td style="color:#1A1816">${triage.claims || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0;vertical-align:top">Strength notes</td><td style="color:#1A1816">${triage.strengthNotes || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Salary</td><td style="color:#1A1816">${triage.salary || 'Not mentioned'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Tenure</td><td style="color:#1A1816">${triage.tenure || 'Not mentioned'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0;vertical-align:top">Evidence</td><td style="color:#1A1816">${triage.evidence || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0;vertical-align:top">Red flags</td><td style="color:#993C1D">${triage.redFlags || 'None identified'}</td></tr>
        </table>
      </div>
      <div style="background:#F2F0EB;border-left:3px solid #C9A84C;padding:1rem 1.25rem;border-radius:0 4px 4px 0;margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.4rem">Recommended action</div>
        <div style="font-size:0.9rem;color:#1A1816;font-weight:500">${triage.recommendedAction || 'Review case details and determine appropriate follow-up.'}</div>
      </div>
      ${transcriptSection}
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        ${formData.email ? `<a href="mailto:${formData.email}?subject=Your Employment Law Case Evaluation — WorkerRights.ai&body=Dear ${(formData.name||'').split(' ')[0]}," style="display:inline-block;background:#0D1B2A;color:white;padding:0.65rem 1.25rem;border-radius:4px;text-decoration:none;font-size:0.85rem;font-weight:500">Email ${(formData.name||'').split(' ')[0]} →</a>` : ''}
        ${formData.phone ? `<a href="tel:${formData.phone}" style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:0.65rem 1.25rem;border-radius:4px;text-decoration:none;font-size:0.85rem;font-weight:500">Call ${formData.phone} →</a>` : ''}
        <a href="https://workerrights.ai/admin${savedLeadId ? `?lead=${savedLeadId}` : ''}" style="display:inline-block;background:#F2F0EB;color:#0D1B2A;padding:0.65rem 1.25rem;border-radius:4px;text-decoration:none;font-size:0.85rem;font-weight:500">View in Admin →</a>
      </div>
    </div>
    <div style="background:#F2F0EB;padding:1rem 2rem;border-top:1px solid #E0DDD5;font-size:0.72rem;color:#9C9890">
      WorkerRights.ai · Automated lead notification · ${timestamp}${savedLeadId ? ` · Lead ID: ${savedLeadId}` : ''}
    </div>
  </div>
</body>
</html>`;

  const textBody = `NEW LEAD — WorkerRights.ai\n${tierLabel} | Value: ${triage.estimatedValue} | Deadline: ${triage.deadlineUrgency}\n\nCONTACT\nName: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.phone || 'Not provided'}\nState: ${formData.state}\n\nAI ASSESSMENT\nClaims: ${triage.claims}\nStrength: ${triage.strengthNotes}\nRed flags: ${triage.redFlags || 'None'}\n\nRECOMMENDED ACTION\n${triage.recommendedAction}${transcriptText ? `\n\nFULL INTAKE TRANSCRIPT\n${transcriptText}` : ''}`.trim();

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAIL,
        subject: `[${triage.tier}] New Lead: ${formData.name} — ${formData.state} — ${triage.claims ? triage.claims.split(',')[0].trim() : 'Employment claim'}`,
        html: htmlBody,
        text: textBody
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error('Resend error:', err);
      return res.status(200).json({ success: true, emailSent: false, leadSaved: !!savedLeadId, error: err });
    }

    return res.status(200).json({ success: true, emailSent: true, leadSaved: !!savedLeadId, leadId: savedLeadId });

  } catch (err) {
    console.error('Lead handler error:', err);
    return res.status(200).json({ success: true, emailSent: false, leadSaved: !!savedLeadId, error: err.message });
  }
}
