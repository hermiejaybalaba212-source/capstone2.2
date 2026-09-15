# Scholarship Management System

A full-stack scholarship management system for a college (SPC). Students apply to
scholarship programs, submit supporting documents and CHED application forms, and are
ranked by a Machine Learning (Random Forest) model written in TypeScript. CHED personnel
and an Administrator review, approve, and notify applicants.

## Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, TypeScript
- **Database & Auth:** Supabase (PostgreSQL + RLS)
- **ML Ranking:** Random Forest Classifier implemented in TypeScript (no external ML server)

The Random Forest model is implemented in pure TypeScript (`lib/ml/`) and runs inside
Next.js API routes (`app/api/ml/`), so there is **no Python backend** to deploy. Training
and prediction happen in a single serverless request, so it works on Vercel out of the box.

## Features

- **Student:** register, apply to scholarship programs, upload documents (COR, Valid ID,
  Signature Form, Academic Record) and academic records, view application status & notifications.
- **Admin:** manage applications (status filter, batch approve/reject/notify, notify missing
  documents, full detail view, CSV export), run ML ranking, approve beneficiaries.
- **CHED:** review ranking result, manage applications (mirrors Admin), approve beneficiaries,
  export final list.
- **Faculty:** early warning alerts and interventions.
- **Business rule:** a student may apply to multiple programs, but approving **one** application
  automatically marks all their other applications as **Not Approved** and notifies them.
- **Notifications:** bell with unread badge across all dashboards.

## Roles

| Role | Access |
|------|--------|
| Student | Apply, upload docs, view status |
| Faculty | Alerts, interventions |
| CHED | Applications (manage), Ranking Result, Approvals |
| Admin | Applications (manage), Ranking, Approvals, Programs, Users |

## Getting Started (local)

```bash
npm install
npm run dev        # app on http://localhost:3000
```

Set the environment variables (see `DEPLOYMENT.md`). The ML ranking feature needs no
separate server - it runs inside the Next.js app.

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the Vercel deployment guide.