# Deployment Guide

This project is a **single Next.js app** deployed to **Vercel**. The ML ranking
(Random Forest) logic is written in TypeScript and runs inside Next.js API routes
(`app/api/ml/*`), so there is **no separate Python backend** to deploy.

| Part | Tech | Where it runs |
|------|------|---------------|
| App + ML ranking API | Next.js + TypeScript | **Vercel** |
| Database | PostgreSQL | Supabase (already in the cloud) |

---

## 1. Create a GitHub repository

1. Go to https://github.com, sign in (create an account if needed).
2. Click **+ → New repository**.
3. Name it (e.g. `scholar-capstone`), make it **Private**, do **NOT** add a README.
4. Click **Create repository**.
5. On the next screen you'll see commands to push an existing repo.

Run these in your terminal (from this project folder) to upload the code:

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/scholar-capstone.git
git push -u origin main
```

> Make sure `servicerole.txt`, `.env.local`, and scratch `.txt`/`.log` files are NOT pushed
> (they are already ignored). Never push your Supabase service_role key.

---

## 2. Deploy to Vercel

1. Go to https://vercel.com and sign in with your GitHub account.
2. Click **Add New → Project**.
3. Select your `scholar-capstone` repo.
4. Vercel auto-detects Next.js. **Framework: Next.js**.
5. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL (`https://xxxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
   - `NEXT_PUBLIC_REGISTRAR_SUPABASE_URL` = your registrar Supabase project URL
   - `NEXT_PUBLIC_REGISTRAR_SUPABASE_ANON_KEY` = your registrar anon key
6. Click **Deploy**. When done you get a URL like `https://scholar-capstone.vercel.app`.

> The ML ranking page calls the same-origin `/api/ml/*` routes, so no backend URL is needed.

---

## Updating after changes

After you `git push`, Vercel auto-redeploys the app. That's it.

## Env vars recap

| Variable | Example | Where |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xflsxzmniseetvkrddmj.supabase.co` | Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Vercel |
| `NEXT_PUBLIC_REGISTRAR_SUPABASE_URL` | `https://xxxx.supabase.co` | Vercel |
| `NEXT_PUBLIC_REGISTRAR_SUPABASE_ANON_KEY` | `eyJ...` | Vercel |