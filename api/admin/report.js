const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function checkAuth(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  return token === process.env.ADMIN_PASSWORD;
}

async function supa(method, table, options = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  const { select, filter, order } = options;
  if (select) url.searchParams.set('select', select);
  if (order) url.searchParams.set('order', order);
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
  if (!res.ok) throw new Error(`Supabase error: ${text}`);
  return text ? JSON.parse(text) : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Get all active cases with firm and lead info
    const activeCases = await supa('GET', 'cases', {
      select: '*,leads(id,name,email,phone,state,claims,tier,referred_at),firms(id,name,contact_name,contact_email)',
      filter: { 'status': `in.(referred,accepted,active)` },
      order: 'firm_id.asc',
    });

    if (!activeCases.length) {
      return res.status(200).json({ success: true, sent: 0, message: 'No active cases to report on' });
    }

    // Group by firm
    const byFirm = {};
    for (const c of activeCases) {
      if (!c.firms) continue;
      const firmId = c.firms.id;
      if (!byFirm[firmId]) byFirm[firmId] = { firm: c.firms, cases: [] };
      byFirm[firmId].cases.push(c);
    }

    const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    let sent = 0;
    const errors = [];

    for (const { firm, cases } of Object.values(byFirm)) {
      if (!firm.contact_email) continue;

      const caseRows = cases.map(c => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E0DDD5;font-size:0.88rem;color:#1A1816;font-weight:500">${c.leads?.name || 'Unknown'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E0DDD5;font-size:0.88rem;color:#5C5A55">${c.leads?.state || '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E0DDD5;font-size:0.88rem;color:#5C5A55">${(c.leads?.claims || '—').split(',')[0].split('(')[0].trim()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E0DDD5;font-size:0.88rem;color:#5C5A55">${c.status}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E0DDD5;font-size:0.88rem;color:#5C5A55">${c.referred_at ? new Date(c.referred_at).toLocaleDateString() : '—'}</td>
        </tr>`).join('');

      const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f0;padding:2rem;margin:0">
<div style="max-width:640px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#0D1B2A;padding:1.5rem 2rem;border-bottom:3px solid #C9A84C">
    <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#C9A84C;margin-bottom:0.25rem">WorkerRights.ai — Monthly Case Status Request</div>
    <div style="font-size:1.2rem;font-weight:700;color:white">${month}</div>
  </div>
  <div style="padding:1.75rem 2rem">
    <p style="font-size:0.92rem;color:#1A1816;margin:0 0 1.25rem">Hi ${firm.contact_name || 'there'},</p>
    <p style="font-size:0.88rem;color:#5C5A55;line-height:1.7;margin:0 0 1.5rem">
      This is your monthly case status check-in from WorkerRights.ai. You have <strong>${cases.length} active referral${cases.length > 1 ? 's' : ''}</strong> from our network. Please reply to this email with a brief status update on each case — even a one-liner per case is helpful.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem">
      <thead>
        <tr style="background:#0D1B2A">
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;color:white;font-weight:600">Client</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;color:white;font-weight:600">State</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;color:white;font-weight:600">Claim</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;color:white;font-weight:600">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;color:white;font-weight:600">Referred</th>
        </tr>
      </thead>
      <tbody>${caseRows}</tbody>
    </table>
    <p style="font-size:0.85rem;color:#5C5A55;line-height:1.7;margin:0">
      Simply reply to this email with updates. If any case has settled, please include the settlement amount so we can calculate the referral fee. Thank you.
    </p>
  </div>
  <div style="background:#F2F0EB;padding:1rem 2rem;border-top:1px solid #E0DDD5;font-size:0.72rem;color:#9C9890">
    WorkerRights.ai · Yaacov Silberman · ypsilberman@gmail.com
  </div>
</div></body></html>`;

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.FROM_EMAIL || 'leads@workerrights.ai',
            to: firm.contact_email,
            subject: `[WorkerRights.ai] Monthly Case Status Request — ${month} — ${cases.length} Active Case${cases.length > 1 ? 's' : ''}`,
            html,
          })
        });
        if (emailRes.ok) sent++;
        else errors.push(`${firm.name}: ${await emailRes.text()}`);
      } catch (e) {
        errors.push(`${firm.name}: ${e.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      sent,
      firms: Object.keys(byFirm).length,
      cases: activeCases.length,
      errors: errors.length ? errors : undefined,
    });

  } catch (err) {
    console.error('Report error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
