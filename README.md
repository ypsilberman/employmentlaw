# WorkerRights.ai — Deployment Guide

## What's in this repo

```
workerrights-site/
├── public/
│   └── index.html        ← The full website + evaluator UI
├── api/
│   ├── chat.js           ← Proxies Claude API calls (keeps your API key secret)
│   └── lead.js           ← Emails you a triage report when someone requests a consult
├── vercel.json           ← Tells Vercel how to wire everything together
└── README.md             ← This file
```

---

## Step 1 — Get your API keys

You need two keys. Both are free to sign up for.

### Anthropic API key (for Claude)
1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **API Keys** → **Create Key**
4. Copy the key — it starts with `sk-ant-...`
5. Add credits — $5 will handle hundreds of evaluations

### Resend API key (for email delivery)
1. Go to https://resend.com
2. Sign up with your Gmail
3. Go to **API Keys** → **Create API Key**
4. Copy the key — it starts with `re_...`
5. **Important:** Go to **Domains** and add/verify `workerrights.ai` once you have a domain.
   - For testing without a domain, Resend lets you send from `onboarding@resend.dev` — just update the `FROM_EMAIL` line in `api/lead.js` to `onboarding@resend.dev`

---

## Step 2 — Push to GitHub

1. Create a new repo at https://github.com/new
   - Name it `workerrights-site` (or anything you like)
   - Set it to **Private** (your API keys will be in Vercel, not here, so public is also fine)
   - Do NOT initialize with a README (you already have one)

2. In your terminal, from inside the `workerrights-site` folder:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/workerrights-site.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Deploy to Vercel

1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New Project**
3. Import your `workerrights-site` repository
4. Vercel will auto-detect the configuration from `vercel.json`
5. **Before clicking Deploy**, click **Environment Variables** and add:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (your Anthropic key) |
| `RESEND_API_KEY` | `re_...` (your Resend key) |

6. Click **Deploy**
7. In ~60 seconds you'll get a live URL like `https://workerrights-site.vercel.app`

That's it. The site is live.

---

## Step 4 — Test it

1. Open your Vercel URL
2. Go through the form (5 steps)
3. Have a conversation with the AI — describe a fake employment scenario
4. Click "Request consultation" at the end
5. Check `ypsilberman@gmail.com` — you should receive a formatted triage email within a few seconds

---

## Quick fixes

### Emails not arriving
- Check your spam folder first
- In Resend dashboard, go to **Logs** — you'll see if the email was sent or failed
- For testing: change `FROM_EMAIL` in `api/lead.js` to `onboarding@resend.dev`

### Claude not responding in the chat
- Go to Vercel dashboard → your project → **Functions** tab
- Click on the `api/chat` function → **Logs** — errors will show here
- Most likely cause: API key not set correctly in Environment Variables

### Making changes
- Edit files locally
- `git add . && git commit -m "update" && git push`
- Vercel auto-deploys every push — live in ~30 seconds

---

## When you're ready to go live

1. Buy the domain (workerrights.ai or similar) from Namecheap/Cloudflare
2. Add it in Vercel: **Project Settings** → **Domains**
3. Verify it in Resend: **Domains** → **Add Domain** — update `FROM_EMAIL` in `api/lead.js`
4. Push the change and redeploy

---

## Cost estimates (at scale)

| Service | Cost |
|---------|------|
| Vercel hosting | Free (Hobby plan handles significant traffic) |
| Claude API | ~$0.01–0.03 per full evaluation conversation |
| Resend email | Free up to 3,000 emails/month |
| **1,000 evaluations/month** | **~$10–30 in API costs** |
