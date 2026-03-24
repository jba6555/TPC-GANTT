# Real Estate Gantt Scheduler

Simple MVP scheduler for development projects with:
- Google sign-in
- Project and task creation
- Drag-to-reschedule timeline bars

## Setup

1. Create a Firebase project.
2. Enable Authentication -> Google provider.
3. Create Firestore database.
4. Copy `.env.local.example` to `.env.local` and fill values.
5. Apply `firestore.rules` in Firebase console.

### Google sign-in from localhost

If you see `auth/configuration-not-found` or OAuth errors, open **Google Cloud Console → APIs & Services → Credentials** and edit the **Web** OAuth 2.0 client your Firebase project uses (Project settings → Your apps).

- **Authorized JavaScript origins:** include every origin you use, with port, e.g. `http://localhost:3000`, `http://localhost:3001`.
- **Authorized redirect URIs:** must include Firebase’s handler and localhost handlers:
  - `https://<YOUR_PROJECT_ID>.firebaseapp.com/__/auth/handler`
  - `http://localhost:3000/__/auth/handler` (repeat for `:3001`, `:3002`, etc. if Next uses other ports)

Then save and retry. Enabling **Identity Toolkit API** in API Library can also help if the console suggests it.

If you still see **`auth/configuration-not-found`**: open **Firebase → Authentication → Sign-in method → Google** and under **Web SDK configuration** set **Web client ID** and **Web client secret** to match the **same** Web OAuth client in Google Cloud Credentials (especially if you created a custom client like “TPC Gantt 1”). **Authorized JavaScript origins** must include **every** `http://localhost:PORT` you actually open in the browser (redirect URIs alone are not enough).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Sample data

After logging in:
- Click `+ Project` and create `3217 Rowena Ave`, or use `Seed Example Project`.
- Add tasks:
  - `Pre-Application due` (due: `2026-05-01`)
  - `Full Application due` (due: `2026-05-15`)
  - `Under Contract` (start: `2026-03-13`, due: `2027-01-01`)
  - `Meeting with NCHFA` (due: `2026-06-01`)

Drag the middle of a task bar to move dates, or drag either edge to resize start/end.

## Deploy to Vercel (cloud hosting)

Complete these steps once with your GitHub and Vercel accounts; the live site is served from Vercel (not your PC).

### 1) Push this repo to GitHub

From the project folder (with `.env.local` **not** committed):

```bash
git add -A
git commit -m "Real estate scheduler MVP"
```

Create a new repository on GitHub (empty, no README), then:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 2) Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import the GitHub repo.
2. Framework: **Next.js** (default). Root directory: repo root.
3. **Environment Variables**: add every key from `.env.local.example` using the **same values** as your local `.env.local` (all `NEXT_PUBLIC_FIREBASE_*` keys).
4. **Deploy**.

After deploy, note your URL, e.g. `https://scheduler-xxxxx.vercel.app`.

### 3) Allow the production domain in Firebase

**Firebase Console** → **Authentication** → **Settings** → **Authorized domains** → **Add domain** → enter your Vercel host (e.g. `scheduler-xxxxx.vercel.app`). No `https://` prefix.

### 4) Allow the production URL in Google OAuth (same Web client as local)

**Google Cloud** → **APIs & Services** → **Credentials** → your **Web** OAuth client:

**Authorized JavaScript origins**

- `https://YOUR_VERCEL_HOST.vercel.app`

**Authorized redirect URIs** (add alongside existing localhost / Firebase entries)

- `https://YOUR_VERCEL_HOST.vercel.app/__/auth/handler`

Save. Changes can take a few minutes.

### 5) Redeploy (optional)

If you change env vars in Vercel, trigger **Redeploy** from the Vercel dashboard so the build picks them up.

### CLI alternative

With [Vercel CLI](https://vercel.com/docs/cli): `npx vercel login` then `npx vercel --prod` from this folder (still set env vars in the Vercel project dashboard or via `vercel env`).
