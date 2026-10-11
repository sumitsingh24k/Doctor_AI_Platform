# Medimind frontend

The React/Vite frontend talks to the Express backend through the Vite development proxy.

## Run locally

1. Start the backend from `Backend` with `npm run dev` (default: `http://localhost:3000`).
2. From `Frontend`, run `npm install` once and `npm run dev`.
3. Open the URL printed by Vite. Patient and doctor accounts use the backend's `/api/auth` routes.

The development proxy uses `127.0.0.1:3000` to avoid Windows `localhost` IPv4/IPv6 resolution mismatches. If the backend runs on a different host or port, update the proxy targets in `vite.config.ts`. Production deployments should route `/api` and `/ws` to the backend origin.

If frontend and backend run on different hosts, create `Frontend/.env.local` with `VITE_BACKEND_URL=http://localhost:3000` (replace the host/port with the backend address), then restart Vite. The same setting selects the backend WebSocket origin for voice calls. For an HTTPS frontend, the backend must be reachable over HTTPS so the voice connection can use secure WebSockets (`wss`).

Patient location is requested only after the patient chooses **Use my location**. Once permission is granted, the doctor directory displays an interactive OpenStreetMap with the patient's position and nearby clinics that have saved coordinates. Patients can open a clinic marker and start the usual booking flow from its popup. OpenStreetMap attribution is displayed on the map. Doctor results are limited to the closest 10 matching clinics; clinics need saved latitude/longitude in doctor settings to appear as map markers.

Frontend structure:

- `src/App.tsx` composes the application hooks, portal layout, and booking dialog.
- `src/hooks` owns authentication/session, patient/booking, voice assistant, and doctor profile logic.
- `src/components/layout` contains the shared portal shell and role-based page selection.
- `src/components/auth`, `src/components/patient`, `src/components/doctor`, and `src/components/booking` contain focused UI components.
- `src/pages/patient` and `src/pages/doctor` contain the patient and clinic portal screens.
- `src/types` and `src/utils` hold shared frontend types and formatting helpers.

## Google Calendar for doctors

To enable the Settings **Connect Google Calendar** button:

1. In Google Cloud Console, enable the Google Calendar API and create a Web application OAuth client.
2. Add `http://localhost:3000/api/calendar/callback` as an authorized redirect URI (use your deployed backend URL in production).
3. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact matching `GOOGLE_REDIRECT_URI` to `Backend/.env`. Set `FRONTEND_URL` to the frontend origin (locally, `http://localhost:5173`).
4. Restart the backend, sign in with a doctor account, save the clinic profile, then choose **Connect Google Calendar** in Settings and approve calendar access.

The doctor Calendar page loads events from the connected Google Calendar for the selected week. Medimind bookings are created on that calendar and remain listed in the clinic schedule. Google OAuth credentials must be supplied by the project owner and should never be committed.
