# Medimind

Medimind is a healthcare appointment platform with separate patient and doctor experiences. Patients can discover clinics, view nearby locations on an OpenStreetMap, book appointments, and talk to a text/voice assistant. Doctors can manage their clinic profile, appointments, patients, knowledge documents, and Google Calendar connection.

## Project structure

```text
Backend/   Express + TypeScript API, MongoDB models, assistant, Google Calendar OAuth
Frontend/  React + TypeScript + Vite patient and doctor portals
```

The frontend component and logic layout is documented in [Frontend/README.md](./Frontend/README.md).

For the complete push-ready technical design, diagrams, AI audit flow, and verification checklist, see [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md).

## Requirements

- Node.js 20 or newer
- npm
- MongoDB database
- API credentials for the optional integrations you plan to use (Google Calendar, Gemini, Sarvam AI, Twilio)

## Local setup

### 1. Configure the backend

In PowerShell:

```powershell
Copy-Item Backend\.env.example Backend\.env
```

Edit `Backend\.env` and set the required private values:

- `MONGO_URI` — MongoDB connection string.
- `AUTH_TOKEN_SECRET` and `AGENT_TOKEN_SECRET` — use long, unique random secrets.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` — needed for Google Calendar. Register `http://localhost:3000/api/calendar/callback` as the local authorized redirect URI in Google Cloud Console.
- `FRONTEND_URL` — local frontend origin, normally `http://localhost:5173`.

For optional features, configure `GEMINI_API_KEY` for clinic knowledge-base AI, `SARVAM_API_KEY` for voice transcription/replies, and the `TWILIO_*` values for phone-based assistant calls. Do not commit `.env` or paste credentials into source files.

Install dependencies and start the API:

```powershell
Set-Location Backend
npm install
npm run dev
```

The backend listens on `http://localhost:3000` by default.

### 2. Configure and start the frontend

In a second PowerShell window, from the project root:

```powershell
Set-Location Frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The development server proxies `/api` and `/ws` to the backend on `127.0.0.1:3000`.

## Main flows

### Patient

1. Register or sign in with a patient account.
2. Browse specialists or explicitly grant location permission to see nearby clinics on the map.
3. Search/filter doctors and choose an appointment slot.
4. Confirm the booking, or use the assistant by text or voice.

The map uses OpenStreetMap tiles and shows clinic markers only when a clinic has valid coordinates in its doctor profile. Patients can choose to share location; it is not requested until they opt in.

### Doctor

1. Register or sign in with a doctor account.
2. Complete the clinic profile, including clinic hours and optional map coordinates.
3. In **Settings**, connect Google Calendar and approve access.
4. View the connected calendar events alongside Medimind appointments in **Calendar**.
5. Manage patients and upload clinic PDFs in the corresponding portal sections.

Google Calendar setup instructions and the redirect URI are also documented in [Frontend/README.md](./Frontend/README.md).

## Build

Run these commands from the project root:

```powershell
npm --prefix Backend run build
npm --prefix Frontend run build
```

## Admin AI quality control

The admin-only **AI quality control** workspace provides a separate view of
recent assistant conversations and a safe evaluation suite. It does not call
the live appointment or Google Calendar services: each of its 12 scenarios
uses mock tool state, so it can verify that a response claiming success really
has `bookingCreated: true`.

Create or refresh the configured admin account once (this uses
`ADMIN_EMAIL` and `ADMIN_PASSWORD` from `Backend/.env`):

```powershell
Set-Location Backend
npm run seed:admin
```

Sign in through the **Admin** tab. Admin routes require an authenticated admin
token; patient and doctor accounts cannot read conversation audits or run the
evaluation. Run the same suite in the terminal with:

```powershell
npm --prefix Backend run evaluate:assistant
```

The report compares a deliberately unsafe baseline with the current guarded
policy (10/12 to 12/12). It documents that it is a deterministic
policy-and-mock-state evaluator, not a replacement for human review or an
LLM-as-judge for writing quality.

## Security notes

- Keep `Backend/.env` private and out of version control.
- Use separate strong secrets and OAuth credentials for each environment.
- Configure the production OAuth redirect URI and frontend origin to match the deployed domains.
- Location is requested only after the patient chooses to share it.
