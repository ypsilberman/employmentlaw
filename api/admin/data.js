const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function checkAuth(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  return token === process.env.ADMIN_PASSWORD;
}

async function supa(method, table, options = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  const { select, filter, order, limit, id } = options;
  if (select) url.searchParams.set('select', select);
  if (order) url.searchParams.set('order', order);
  if (limit) url.searchParams.set('limit', String(limit));
  if (id) url.searchParams.set('id', `eq.${id}`);
  if (filter) Object.entries(filter).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase error (${res.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function getStats() {
  const [leads, cases] = await Promise.all([
    supa('GET', 'leads', { select: 'id,tier,status,created_at' }),
    supa('GET', 'cases', { select: 'id,status,expected_fee,received_fee' }),
  ]);
  return {
    totalLeads: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    highLeads: leads.filter(l => l.tier === 'HIGH').length,
    referred: leads.filter(l => l.status === 'referred').length,
    activeCases: cases.filter(c => ['accepted', 'active'].includes(c.status)).length,
    totalCases: cases.length,
    feesExpected: cases.reduce((s, c) => s + (parseFloat(c.expected_fee) || 0), 0),
    feesReceived: cases.reduce((s, c) => s + (parseFloat(c.received_fee) || 0), 0),
  };
}

// Non-engagement / decline letter sent to a client when a lead is passed on.
// Carefully worded: thanks them, declines without judging the merits, warns
// that employment claims have strict deadlines and to consult other counsel
// promptly, and makes clear no attorney-client relationship was formed.
async function sendDeclineEmail(lead) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY || !lead.email) return false;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'leads@workerrights.ai';
  const REPLY_TO = process.env.REPLY_TO_EMAIL || 'leads@workerrights.ai';
  const first = (lead.name || '').trim().split(/\s+/)[0] || 'there';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,'Times New Roman',serif;background:#f4f4f0;padding:2rem;margin:0;color:#1A1816">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0D1B2A;padding:1.25rem 2rem;border-bottom:3px solid #C9A84C">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#C9A84C">WorkerRights.ai</div>
    </div>
    <div style="padding:2rem;font-size:0.95rem;line-height:1.7">
      <p>Dear ${first},</p>
      <p>Thank you for taking the time to share the details of your situation with us. We appreciate the trust you placed in WorkerRights.ai.</p>
      <p>After carefully reviewing the information you provided, we have decided that we are not able to take on your matter at this time. This decision is not a judgment that your concerns lack merit &mdash; only that we are not the right fit to assist you. Another attorney may evaluate your situation differently.</p>
      <p><strong>Please keep this in mind:</strong> Employment-related claims are subject to strict deadlines (often called statutes of limitations), and some require filing a charge with a government agency within a limited window. Because these deadlines can be short, we strongly encourage you to consult another attorney as soon as possible if you wish to pursue your matter, so that your rights are not lost.</p>
      <p>If you would like help finding other counsel, your state or local bar association&rsquo;s lawyer referral service can be a good place to start.</p>
      <p>Please understand that this message is not legal advice, and no attorney-client relationship has been formed between you and WorkerRights.ai.</p>
      <p>We wish you the very best.</p>
      <p style="margin-top:1.5rem">Sincerely,<br>The WorkerRights.ai Team</p>
    </div>
  </div>
</body></html>`;

  const text = `Dear ${first},

Thank you for taking the time to share the details of your situation with us. We appreciate the trust you placed in WorkerRights.ai.

After carefully reviewing the information you provided, we have decided that we are not able to take on your matter at this time. This decision is not a judgment that your concerns lack merit — only that we are not the right fit to assist you. Another attorney may evaluate your situation differently.

PLEASE KEEP THIS IN MIND: Employment-related claims are subject to strict deadlines (often called statutes of limitations), and some require filing a charge with a government agency within a limited window. Because these deadlines can be short, we strongly encourage you to consult another attorney as soon as possible if you wish to pursue your matter, so that your rights are not lost.

If you would like help finding other counsel, your state or local bar association's lawyer referral service can be a good place to start.

Please understand that this message is not legal advice, and no attorney-client relationship has been formed between you and WorkerRights.ai.

We wish you the very best.

Sincerely,
The WorkerRights.ai Team`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: lead.email,
        reply_to: REPLY_TO,
        subject: 'Regarding your employment law inquiry — WorkerRights.ai',
        html,
        text,
      })
    });
    if (!r.ok) { console.error('Decline email error:', await r.text()); return false; }
    return true;
  } catch (e) {
    console.error('Decline email send failed:', e.message);
    return false;
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wrap an admin-edited plain-text referral in a simple branded HTML shell.
function referralHtmlShell(bodyText) {
  const safe = escapeHtml(bodyText).replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f4f0;padding:2rem">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0D1B2A;padding:1rem 2rem;border-bottom:3px solid #C9A84C">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#C9A84C">WorkerRights.ai — Referral</div>
    </div>
    <div style="padding:1.75rem 2rem;font-family:Georgia,'Times New Roman',serif;font-size:0.95rem;line-height:1.7;color:#1A1816">${safe}</div>
  </div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { resource, id } = req.query;

  try {
    // ── GET ────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (resource === 'stats') {
        return res.status(200).json(await getStats());
      }

      if (resource === 'leads') {
        const filter = {};
        if (req.query.tier) filter['tier'] = `eq.${req.query.tier}`;
        if (req.query.status) filter['status'] = `eq.${req.query.status}`;
        const leads = await supa('GET', 'leads', {
          select: '*',
          order: 'created_at.desc',
          filter,
        });
        return res.status(200).json(leads);
      }

      if (resource === 'cases') {
        const filter = {};
        if (req.query.status) filter['status'] = `eq.${req.query.status}`;
        if (req.query.firm_id) filter['firm_id'] = `eq.${req.query.firm_id}`;
        const cases = await supa('GET', 'cases', {
          select: '*,leads(id,name,email,phone,state,tier,claims,strength_notes,deadline_urgency),firms(id,name,state,contact_name,contact_email)',
          order: 'referred_at.desc',
          filter,
        });
        return res.status(200).json(cases);
      }

      if (resource === 'firms') {
        const firms = await supa('GET', 'firms', {
          select: '*',
          order: 'state.asc,name.asc',
        });
        return res.status(200).json(firms);
      }

      if (resource === 'updates' && req.query.case_id) {
        const updates = await supa('GET', 'status_updates', {
          select: '*',
          filter: { 'case_id': `eq.${req.query.case_id}` },
          order: 'created_at.desc',
        });
        return res.status(200).json(updates);
      }

      return res.status(400).json({ error: 'Unknown resource' });
    }

    // ── POST ───────────────────────────────────────────────────────
    if (req.method === 'POST') {

      // Pass on a lead → mark 'passed' and email the client a decline letter
      if (resource === 'decline') {
        if (!id) return res.status(400).json({ error: 'id required' });
        const [lead] = await supa('GET', 'leads', { select: '*', id });
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        await supa('PATCH', 'leads', { id, body: { status: 'passed' } });
        const emailSent = lead.email ? await sendDeclineEmail(lead) : false;
        return res.status(200).json({ success: true, emailSent, hadEmail: !!lead.email });
      }

      // Refer a lead to a firm → creates case + sends intro email
      if (resource === 'cases') {
        const { lead_id, firm_id, expected_fee, note, email_subject, email_body, skip_email } = req.body;
        if (!lead_id || !firm_id) return res.status(400).json({ error: 'lead_id and firm_id required' });

        const [lead] = await supa('GET', 'leads', { select: '*', id: lead_id });
        const [firm] = await supa('GET', 'firms', { select: '*', id: firm_id });
        if (!lead || !firm) return res.status(404).json({ error: 'Lead or firm not found' });

        // Create case
        const [newCase] = await supa('POST', 'cases', {
          body: {
            lead_id,
            firm_id,
            status: 'referred',
            expected_fee: expected_fee || null,
            notes: note || null,
          }
        });

        // Update lead status
        await supa('PATCH', 'leads', { id: lead_id, body: { status: 'referred' } });

        // Record status update
        await supa('POST', 'status_updates', {
          body: { case_id: newCase.id, status: 'referred', update_text: skip_email ? `Referred to ${firm.name} (manual — no email sent)` : `Referred to ${firm.name}`, source: 'admin' }
        });

        // Send intro email to firm
        const feeNote = expected_fee ? `Expected referral fee: $${parseFloat(expected_fee).toLocaleString()} (${firm.fee_percentage || 25}% of contingency)` : `Fee arrangement: ${firm.fee_percentage || 25}% of your contingency fee per our referral agreement.`;

        const emailHtml = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f0;padding:2rem;margin:0">
<div style="max-width:620px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#0D1B2A;padding:1.5rem 2rem;border-bottom:3px solid #C9A84C">
    <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#C9A84C;margin-bottom:0.25rem">WorkerRights.ai — New Referral</div>
    <div style="font-size:1.4rem;font-weight:700;color:white">${lead.name || 'New Client'}</div>
    <div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:4px">${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</div>
  </div>
  <div style="padding:1.75rem 2rem">
    <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Client Contact</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:1.5rem">
      <tr><td style="color:#5C5A55;padding:5px 0;width:130px">Name</td><td style="color:#1A1816;font-weight:500">${lead.name || '—'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0">Email</td><td><a href="mailto:${lead.email}" style="color:#0D1B2A">${lead.email || '—'}</a></td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0">Phone</td><td>${lead.phone || 'Not provided'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0">State</td><td>${lead.state || '—'}</td></tr>
    </table>
    <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.75rem">Case Assessment</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:1.5rem">
      <tr><td style="color:#5C5A55;padding:5px 0;width:130px;vertical-align:top">Claims</td><td style="color:#1A1816">${lead.claims || '—'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0;vertical-align:top">Strength</td><td style="color:#1A1816">${lead.strength_notes || '—'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0">Tier</td><td style="color:#1A1816;font-weight:600">${lead.tier || '—'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0">Deadline</td><td style="color:${lead.deadline_urgency === 'urgent' ? '#993C1D' : '#1A1816'}">${lead.deadline_urgency || '—'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0;vertical-align:top">Evidence</td><td style="color:#1A1816">${lead.evidence || '—'}</td></tr>
      <tr><td style="color:#5C5A55;padding:5px 0;vertical-align:top">Red flags</td><td style="color:#993C1D">${lead.red_flags || 'None noted'}</td></tr>
    </table>
    <div style="background:#F2F0EB;border-left:3px solid #C9A84C;padding:1rem 1.25rem;border-radius:0 4px 4px 0;margin-bottom:1.5rem">
      <div style="font-size:0.7rem;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.4rem">Fee Arrangement</div>
      <div style="font-size:0.9rem;color:#1A1816">${feeNote}</div>
    </div>
    ${note ? `<div style="margin-bottom:1.5rem"><div style="font-size:0.7rem;text-transform:uppercase;color:#9C9890;font-weight:600;margin-bottom:0.4rem">Note from Yaacov</div><div style="font-size:0.9rem;color:#1A1816">${note}</div></div>` : ''}
    <div style="font-size:0.85rem;color:#5C5A55;border-top:1px solid #E0DDD5;padding-top:1rem">
      Please reply to this email to confirm receipt and let me know if you'll be taking this case. Updates on case status are always appreciated.
    </div>
  </div>
  <div style="background:#F2F0EB;padding:1rem 2rem;border-top:1px solid #E0DDD5;font-size:0.72rem;color:#9C9890">
    WorkerRights.ai · Referral from Yaacov Silberman · ypsilberman@gmail.com
  </div>
</div></body></html>`;

        // Send the intro email — unless the admin chose to refer manually.
        if (!skip_email) {
          // Prefer the admin-reviewed subject/body; fall back to the auto-built email.
          const useCustom = email_body && String(email_body).trim();
          const outSubject = useCustom
            ? (email_subject && email_subject.trim() ? email_subject.trim() : `[WorkerRights.ai Referral] ${lead.name || 'New Client'}`)
            : `[WorkerRights.ai Referral] ${lead.name || 'New Client'} — ${lead.state || ''} — ${(lead.claims || 'Employment claim').split(',')[0].split('(')[0].trim()}`;

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
              body: JSON.stringify({
                from: process.env.FROM_EMAIL || 'leads@workerrights.ai',
                to: firm.contact_email,
                subject: outSubject,
                html: useCustom ? referralHtmlShell(email_body) : emailHtml,
                ...(useCustom ? { text: String(email_body) } : {}),
              })
            });
          } catch (e) {
            console.error('Email send error:', e.message);
          }
        }

        return res.status(200).json({ success: true, case: newCase });
      }

      // Add a lead manually
      if (resource === 'leads') {
        const [newLead] = await supa('POST', 'leads', { body: { ...req.body, status: 'new' } });
        return res.status(200).json(newLead);
      }

      // Add a firm
      if (resource === 'firms') {
        const [newFirm] = await supa('POST', 'firms', { body: req.body });
        return res.status(200).json(newFirm);
      }

      // Add a status update note to a case
      if (resource === 'updates') {
        const { case_id, status, update_text } = req.body;
        const [update] = await supa('POST', 'status_updates', { body: { case_id, status, update_text, source: 'admin' } });
        // Also update case status + updated_at
        if (status) {
          const patchBody = { status, updated_at: new Date().toISOString() };
          if (status === 'accepted') patchBody.accepted_at = new Date().toISOString();
          if (status === 'settled') patchBody.settled_at = new Date().toISOString();
          await supa('PATCH', 'cases', { id: case_id, body: patchBody });
        }
        return res.status(200).json(update);
      }

      return res.status(400).json({ error: 'Unknown resource' });
    }

    // ── PATCH ──────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id required for PATCH' });

      if (resource === 'leads') {
        const [updated] = await supa('PATCH', 'leads', { id, body: req.body });
        return res.status(200).json(updated);
      }

      if (resource === 'cases') {
        const body = { ...req.body, updated_at: new Date().toISOString() };
        if (req.body.status === 'accepted') body.accepted_at = new Date().toISOString();
        if (req.body.status === 'settled') body.settled_at = new Date().toISOString();
        const [updated] = await supa('PATCH', 'cases', { id, body });
        return res.status(200).json(updated);
      }

      if (resource === 'firms') {
        const [updated] = await supa('PATCH', 'firms', { id, body: req.body });
        return res.status(200).json(updated);
      }

      return res.status(400).json({ error: 'Unknown resource' });
    }

    // ── DELETE ─────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required for DELETE' });
      if (!['leads', 'cases', 'firms'].includes(resource)) {
        return res.status(400).json({ error: 'Unknown resource' });
      }

      // Schema-level cascades handle the rest: deleting a lead cascades to its
      // cases and their status_updates; deleting a firm sets its cases' firm_id
      // to NULL. Deleting a case additionally frees its lead to be referred
      // again by reverting it to 'new'.
      if (resource === 'cases') {
        const [existing] = await supa('GET', 'cases', { select: 'lead_id', id });
        await supa('DELETE', 'cases', { id });
        if (existing?.lead_id) {
          await supa('PATCH', 'leads', { id: existing.lead_id, body: { status: 'new' } });
        }
        return res.status(200).json({ success: true });
      }

      await supa('DELETE', resource, { id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Admin data error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
