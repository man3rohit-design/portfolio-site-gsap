# Rohit Kumar Mandal - Portfolio with Admin Backend

Node.js + Express. No database to install (data is stored as JSON in `data/`).

## Run locally
1. Install Node.js 18+ from nodejs.org
2. `npm install`
3. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD` (8+ chars) and `SESSION_SECRET`
4. `npm start`
5. Site: http://localhost:3000  Admin: http://localhost:3000/admin

## What the admin can do
- Read, mark and delete contact-form messages
- Add, edit, delete projects (title, tools, overview, problem, results, GitHub, demo, screenshot upload)
- Add, edit, delete certifications
- Upload/replace the resume PDF (served at /resume.pdf)

## Deploy (needs a Node host: Render, Railway, Fly.io, a VPS)
Set env vars `ADMIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`. Use HTTPS.
Keep the `data/` folder on a persistent disk/volume or messages, uploads and resume are lost on redeploy.
Netlify, Vercel and GitHub Pages are static hosts and cannot run this backend.

## Security built in
Password login with signed HttpOnly cookie, login and contact rate limits, spam honeypot,
input validation, URL and file-type checks (PDF/JPG/PNG/WEBP only), HTML escaping on all output.
