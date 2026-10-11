# Medimind Project Work Flow

This document explains what Patient, Doctor, and Admin users can do and what happens technically behind each feature.

## 1. Complete request flow

```text
Browser action -> React frontend -> Express backend -> MongoDB or provider -> verified response -> browser
```

The frontend shows screens and captures input. The backend verifies identity, applies permissions, validates data, calls providers, and saves final state to MongoDB.

## 2. Patient flow

### Login and session

1. Patient submits email and password.
2. React calls `POST /api/auth/login`.
3. Backend loads the user from MongoDB and verifies the scrypt password hash.
4. Backend returns a JWT access token and sets an HttpOnly refresh cookie.
5. `src/api.ts` sends the access token on later requests.
6. If it expires, frontend calls `/api/auth/refresh` and retries once.

### Find a doctor

1. Patient opens **Find a doctor**.
2. Frontend calls `GET /api/doctor/directory`.
3. Backend returns only setup-complete clinics with Google Calendar connected.
4. If location is shared, backend calculates distance from clinic coordinates.
5. Frontend renders searchable doctor cards and map data.

### Direct appointment booking

```text
Select doctor -> select date -> check slots -> enter details -> confirm -> calendar event and database appointment
```

Behind the scenes, backend checks clinic hours, existing appointments, and Google Calendar availability. It validates name, phone, date, time, and booking rules. It creates the Google Calendar event first and only saves a final MongoDB appointment after the event ID is returned. If the calendar rejects it, no booking success is claimed.

### Text AI assistant

1. Patient chooses a clinic and sends a message.
2. Frontend posts to `/api/assistant/chat`.
3. Backend resolves doctor and thread context.
4. LangGraph assistant receives verified clinic facts and recent chat context.
5. It replies directly or calls a controlled tool for knowledge, slots, booking, rescheduling, or cancellation.
6. Backend returns the formatted reply.
7. The conversation and latency are saved in `AssistantAuditLog`.

### Assistant booking

```text
Patient requests booking -> assistant collects name phone date time -> assistant shows summary -> patient says Yes confirm -> booking tool runs -> calendar and database result returns
```

The assistant does not book from words like “maybe Friday at 5 PM”. It requires complete details and explicit confirmation. Voice confirmations such as `Yes, confirm.` work because ending punctuation is normalized.

### Voice assistant

1. Patient clicks microphone; browser requests microphone permission.
2. `useAssistant.ts` captures sound and detects when an utterance ends.
3. Browser sends audio over `/ws/assistant/voice`.
4. Backend sends audio to Sarvam Speech-to-Text.
5. Transcript follows the same assistant and tools flow as text chat.
6. Reply text goes to Sarvam Text-to-Speech and returned audio plays in browser.
7. If Sarvam TTS is unavailable, browser speech synthesis can read the text reply locally.

If patient speaks while the assistant is talking, the old response is cancelled and the new speech becomes the next turn. This is expected barge-in behaviour.

## 3. Doctor flow

### Clinic setup

1. Doctor creates account or signs in.
2. Doctor enters clinic name, address, specialty, hours, appointment duration, and optional coordinates.
3. Doctor connects Google Calendar using OAuth.
4. Backend stores calendar refresh credentials with the doctor profile.
5. Doctor completes setup.
6. The clinic becomes visible to patients only after setup and calendar connection are complete.

### Doctor configuration

Doctor can manage clinic profile, hours, appointment duration, assistant name, welcome message, instructions, languages, workflow notes, knowledge PDFs, calendar, patients, and appointments.

Every doctor-protected endpoint verifies doctor JWT role and tenant context. The backend scopes data through verified doctor identity instead of trusting a browser-supplied clinic ID.

### Knowledge base

1. Doctor uploads a clinic PDF.
2. Backend validates and extracts the document content.
3. Knowledge is stored against that doctor.
4. When a patient asks a clinic-specific question, assistant searches only that doctor’s approved knowledge.
5. Assistant answers from grounded content rather than inventing facts.

### Doctor assistant playground

Doctor can test their clinic assistant using the same text and voice flow, clinic context, tools, and safety guards as the patient-facing assistant.

## 4. Admin flow

Admin accounts are created only through `npm run seed:admin`; public registration cannot create them.

### Admin dashboard capabilities

Admin can inspect recent real chats, text or voice channel, messages, timestamps, latency, live analyzer findings, real assistant-triggered appointment outcomes, and sandbox regression results.

### Live conversation analysis

```text
AssistantAuditLog + AssistantActionAudit -> analyzer -> admin findings
```

The analyzer flags premature booking claims, confirmation loops, privacy-risk wording, and responses slower than eight seconds. These findings are review signals, not a replacement for human judgement.

### Actual appointment action audit

When assistant tools book, reschedule, or cancel, the backend saves `AssistantActionAudit` with thread ID, doctor ID, action type, success or failure, appointment ID on success, error details on failure, and timestamp.

This is separate from chat text. A reply saying “appointment booked” is not proof until the dashboard finds a matching successful tool and database audit with an appointment ID.

### Sandbox evaluation

The **Run evaluation** button never changes live appointments, Google Calendar, or patient data. It evaluates deterministic mock scenarios: confirmed booking, no availability, ambiguous date/time, changed preference, tentative request, no confirmation, cancellation, rescheduling, tool failure, prompt injection, missing patient details, and voice punctuation.

The report compares an intentionally unsafe baseline with the active guarded policy: **10/12 before** and **12/12 after**.

## 5. AI provider fallback

```text
Groq -> xAI -> Gemini
```

For recoverable provider failures such as rate limits, server errors, or network failures, backend tries the next configured model provider. This applies to language replies only. Appointment availability and mutations always use Google Calendar and MongoDB.

## 6. Security model

- Passwords use scrypt hashes.
- JWT access tokens carry role information and expire quickly.
- Refresh tokens are stored as hashes and sent in HttpOnly cookies.
- Doctor tenant context prevents cross-clinic record access.
- Admin APIs require the admin role.
- Private OAuth refresh tokens and assistant configuration are removed from public doctor results.
- Booking success requires real calendar and database success.
- Conversation and action audit logs make assistant activity reviewable.

## 7. End-to-end example

```text
Patient says book Friday at 5 PM
Assistant collects missing name and phone
Assistant summarizes exact clinic date time and patient details
Patient says Yes confirm
Assistant calls booking tool
Tool checks Google Calendar and database
Google event is created
Appointment record is saved
Action audit records success and appointment ID
Assistant reports booked
Conversation audit records message and latency
Admin can later verify both chat and actual action outcome
```
