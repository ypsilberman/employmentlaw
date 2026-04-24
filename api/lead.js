export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { triage, formData } = req.body;

  if (!triage || !formData) {
    return res.status(400).json({ error: 'Missing triage or formData' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL = 'ypsilberman@gmail.com';
  const FROM_EMAIL = 'onboarding@resend.dev'; // update to 'leads@workerrights.ai' once you have a domain verified in Resend

  const tierColors = { HIGH: '#2E6B4F', MEDIUM: '#B07010', LOW: '#5C5A55' };
  const priorityLabels = {
    'P1-immediate': '🔴 P1 — Call immediately',
    'P2-48h': '🟡 P2 — Follow up within 48 hours',
    'P3-nurture': '⚪ P3 — Email nurture only'
  };
  const tierColor = tierColors[triage.tier] || '#5C5A55';
  const priorityLabel = priorityLabels[triage.priority] || triage.priority;
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f0;padding:2rem;margin:0">
  <div style="max-width:620px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    
    <!-- Header -->
    <div style="background:#0D1B2A;padding:1.5rem 2rem;border-bottom:3px solid #C9A84C">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#C9A84C;margin-bottom:0.25rem">WorkerRights.ai — New Lead</div>
      <div style="font-size:1.3rem;font-weight:700;color:white">${formData.name || 'Unknown'}</div>
      <div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:4px">${timestamp} ET</div>
    </div>

    <!-- Priority Banner -->
    <div style="background:${tierColor};padding:0.9rem 2rem">
      <div style="color:white;font-weight:600;font-size:0.95rem">${priorityLabel}</div>
      <div style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin-top:2px">Tier: ${triage.tier} · Estimated value: ${triage.estimatedValue || 'unknown'} · Deadline urgency: ${triage.deadlineUrgency || 'unknown'}</div>
    </div>

    <div style="padding:1.75rem 2rem">

      <!-- Contact Info -->
      <div style="margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Contact Information</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <tr><td style="color:#5C5A55;padding:5px 0;width:130px">Name</td><td style="color:#1A1816;font-weight:500">${formData.name || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Email</td><td><a href="mailto:${formData.email}" style="color:#0D1B2A">${formData.email || '—'}</a></td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Phone</td><td style="color:#1A1816">${formData.phone || 'Not provided'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">State</td><td style="color:#1A1816">${formData.state || '—'}</td></tr>
        </table>
      </div>

      <!-- Screening Data -->
      <div style="margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Screening Form Data</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <tr><td style="color:#5C5A55;padding:5px 0;width:130px">Situation</td><td style="color:#1A1816">${formData.situation || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Timeline</td><td style="color:#1A1816">${formData.timeline || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Employer size</td><td style="color:#1A1816">${formData.empSize || '—'}</td></tr>
          <tr><td style="color:#5C5A55;padding:5px 0">Claim types</td><td style="color:#1A1816">${(formData.claimTypes || []).join(', ') || '—'}</td></tr>
        </table>
      </div>

      <!-- AI Assessment -->
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

      <!-- Recommended Action -->
      <div style="background:#F2F0EB;border-left:3px solid #C9A84C;padding:1rem 1.25rem;border-radius:0 4px 4px 0;margin-bottom:1.5rem">
        <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.4rem">Recommended action</div>
        <div style="font-size:0.9rem;color:#1A1816;font-weight:500">${triage.recommendedAction || 'Review case details and determine appropriate follow-up.'}</div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        ${formData.email ? `<a href="mailto:${formData.email}?subject=Your Employment Law Case Evaluation — WorkerRights.ai&body=Dear ${(formData.name||'').split(' ')[0]}," style="display:inline-block;background:#0D1B2A;color:white;padding:0.65rem 1.25rem;border-radius:4px;text-decoration:none;font-size:0.85rem;font-weight:500">Email ${(formData.name||'').split(' ')[0]} →</a>` : ''}
        ${formData.phone ? `<a href="tel:${formData.phone}" style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:0.65rem 1.25rem;border-radius:4px;text-decoration:none;font-size:0.85rem;font-weight:500">Call ${formData.phone} →</a>` : ''}
      </div>

    </div>

    <!-- Footer -->
    <div style="background:#F2F0EB;padding:1rem 2rem;border-top:1px solid #E0DDD5;font-size:0.72rem;color:#9C9890">
      WorkerRights.ai · Automated lead notification · ${timestamp}
    </div>
  </div>
</body>
</html>`;

  const textBody = `
NEW LEAD — WorkerRights.ai
==========================
${priorityLabel}
Tier: ${triage.tier} | Value: ${triage.estimatedValue} | Deadline: ${triage.deadlineUrgency}

CONTACT
Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone || 'Not provided'}
State: ${formData.state}

SCREENING
Situation: ${formData.situation}
Timeline: ${formData.timeline}
Employer size: ${formData.empSize}
Claim types: ${(formData.claimTypes || []).join(', ')}

AI ASSESSMENT
Claims: ${triage.claims}
Strength: ${triage.strengthNotes}
Salary: ${triage.salary || 'Not mentioned'}
Tenure: ${triage.tenure || 'Not mentioned'}
Evidence: ${triage.evidence}
Red flags: ${triage.redFlags || 'None'}

RECOMMENDED ACTION
${triage.recommendedAction}
`.trim();

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
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
      // Don't fail the whole request if email fails — lead data is still captured
      return res.status(200).json({ success: true, emailSent: false, error: err });
    }

    return res.status(200).json({ success: true, emailSent: true });

  } catch (err) {
    console.error('Lead handler error:', err);
    return res.status(200).json({ success: true, emailSent: false, error: err.message });
  }
}
