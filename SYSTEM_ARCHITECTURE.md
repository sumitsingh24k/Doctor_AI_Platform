# Medimind System Architecture

> Last updated: 11 October 2026

## 1. High level architecture

```mermaid
flowchart LR
    Patient["Patient Browser"] --> Frontend["React Frontend"]
    Doctor["Doctor Browser"] --> Frontend
    Admin["Admin Browser"] --> Frontend
    Frontend -->|"REST requests"| Backend["Node Express API"]
    Frontend -->|"Voice WebSocket"| Voice["Voice WebSocket Server"]
    Voice --> Backend
    Backend --> Mongo["MongoDB Atlas"]
    Backend --> Calendar["Google Calendar"]
    Backend --> Models["Groq xAI Gemini"]
    Backend --> Sarvam["Sarvam Speech Services"]
    Backend --> Twilio["Twilio Voice"]
```

## 2. Frontend structure

```mermaid
flowchart TD
    App["App Component"] --> Auth["Authentication Session Hook"]
    App --> Care["Patient Care Hook"]
    App --> Assistant["Assistant and Voice Hook"]
    App --> Profile["Doctor Profile Hook"]
    App --> Shell["App Shell and Portal Router"]
    Shell --> PatientPages["Patient Pages"]
    Shell --> DoctorPages["Doctor Pages"]
    Shell --> AdminPage["Admin Quality Dashboard"]
```

The React frontend provides role-aware pages. `src/api.ts` sends authenticated API calls and refreshes expired access tokens. `useAssistant.ts` handles text chat, microphone capture, voice activity detection, WebSocket messages, and audio playback.

## 3. Backend route layout

```mermaid
flowchart TD
    Server["HTTP Server on Port 3000"] --> Express["Express Middleware"]
    Server --> Socket["Voice WebSocket Endpoint"]
    Express --> AuthRoutes["Authentication Routes"]
    Express --> DoctorRoutes["Doctor Routes"]
    Express --> AppointmentRoutes["Appointment Routes"]
    Express --> AssistantRoutes["Assistant Routes"]
    Express --> CalendarRoutes["Calendar Routes"]
    Express --> TwilioRoutes["Twilio Routes"]
    Express --> AdminRoutes["Admin Routes"]
```

| Area | Responsibility |
| --- | --- |
| Authentication | Login, registration, refresh token, logout, current session. |
| Doctor | Clinic profile, setup, assistant configuration, knowledge uploads. |
| Appointment | Availability, booking, reschedule, cancellation, doctor patient list. |
| Assistant | Text assistant, voice upload fallback, and voice WebSocket. |
| Calendar | Google OAuth and calendar event access. |
| Admin | AI conversations, live analysis, real action audits, regression evaluations. |

## 4. Authentication and tenant isolation

```mermaid
sequenceDiagram
    participant Browser
    participant API
    participant Database
    Browser->>API: Login with email and password
    API->>Database: Load user and password hash
    API->>API: Verify password and role
    API-->>Browser: Access token and refresh cookie
    Browser->>API: Authenticated request with access token
    API->>API: Verify token role and clinic scope
```

- Roles are `patient`, `doctor`, and `admin`.
- Access tokens are JWTs. Refresh tokens are opaque values stored as hashes and sent in HttpOnly cookies.
- Doctor and assistant operations use a `doctorId` tenant context so a clinic cannot query or mutate another clinic’s records.
- Admin routes require both authentication and the `admin` role.

## 5. Appointment and calendar flow

```mermaid
sequenceDiagram
    participant Patient
    participant Frontend
    participant API
    participant BookingService
    participant Calendar
    participant Database
    Patient->>Frontend: Select clinic date and time
    Frontend->>API: Request available slots
    API->>Calendar: Check calendar availability
    Calendar-->>API: Available slots
    API-->>Frontend: Verified slots
    Patient->>Frontend: Confirm appointment details
    Frontend->>API: Submit booking
    API->>BookingService: Validate booking
    BookingService->>Calendar: Create calendar event
    BookingService->>Database: Save patient and appointment
    API-->>Frontend: Booking success
```

Booking guards:

1. Date must be valid, future-facing, and within the booking window.
2. The time must be inside clinic working hours.
3. Google Calendar and existing Medimind appointments are checked for conflicts.
4. A booking is not reported as successful until the calendar event ID and appointment record are saved.

## 6. Text assistant architecture

```mermaid
flowchart TD
    Message["Patient Message"] --> Context["Resolve Clinic and Thread Context"]
    Context --> Agent["LangGraph Doctor Assistant"]
    Agent --> Model["AI Model Provider"]
    Agent --> Tools["Grounded Clinic Tools"]
    Tools --> Profile["Doctor Profile"]
    Tools --> Knowledge["Clinic Knowledge Documents"]
    Tools --> Booking["Appointment Action Service"]
    Model --> Reply["Formatted Assistant Reply"]
    Reply --> Audit["Conversation Audit Log"]
```

The provider fallback order is Groq, then xAI, then Gemini for recoverable provider failures. Availability, booking, cancellation, rescheduling, and knowledge search use controlled backend tools rather than model guesses.

## 7. Voice assistant architecture

```mermaid
sequenceDiagram
    participant Browser
    participant VoiceServer
    participant STT as Sarvam Speech To Text
    participant Agent
    participant TTS as Sarvam Text To Speech
    Browser->>Browser: Capture microphone and detect speech
    Browser->>VoiceServer: Send complete audio turn
    VoiceServer->>STT: Transcribe audio
    STT-->>VoiceServer: Transcript and language
    VoiceServer->>Agent: Process transcript
    Agent-->>VoiceServer: Text reply
    VoiceServer->>TTS: Synthesize reply
    TTS-->>VoiceServer: Audio response
    VoiceServer-->>Browser: Transcript reply and audio
```

- Browser voice activity detection commits an utterance after speech ends.
- New speech cancels the active reply. This is expected barge-in behaviour.
- Sarvam TTS failure can use browser speech synthesis for the text reply.

## 8. AI quality and audit architecture

```mermaid
flowchart LR
    Conversation["Live Text or Voice Conversation"] --> ConversationAudit["Conversation Audit Log"]
    Tool["Booking Reschedule Cancel Tool"] --> ActionAudit["Action Audit Log"]
    ConversationAudit --> Analysis["Live Conversation Analyzer"]
    ActionAudit --> Analysis
    Analysis --> Dashboard["Admin Dashboard"]
    Regression["Twelve Case Regression Suite"] --> Dashboard
```

| Source | Proves |
| --- | --- |
| Conversation audit | What the user and assistant said, the channel, timestamp, and latency. |
| Action audit | Whether a real assistant-triggered booking, reschedule, or cancellation succeeded or failed. |
| Regression suite | Whether known safety rules pass in deterministic mock scenarios without touching live data. |

The live analyzer flags confirmation loops, privacy-risk phrasing, slow responses, and booking-success claims without matching successful action audits.

## 9. Evaluation loop

```mermaid
flowchart LR
    Scenario["Hard Scenario"] --> Baseline["Baseline Simulation"]
    Baseline --> Failure["Structured Failure"]
    Failure --> Guardrail["Apply Guardrail"]
    Guardrail --> Rerun["Run Same Tests"]
    Rerun --> Report["Before and After Score"]
```

The regression suite covers confirmed booking, unavailable slots, unclear date/time, changed preferences, tentative requests, cancellation, rescheduling, tool failure, prompt injection, missing details, and voice punctuation. The current comparison is **10/12 before** and **12/12 after** the guardrail.

## 10. Data model

```mermaid
erDiagram
    USER ||--o| DOCTOR : "owns profile"
    DOCTOR ||--o{ PATIENT : "serves"
    DOCTOR ||--o{ APPOINTMENT : "has"
    PATIENT ||--o{ APPOINTMENT : "books"
    DOCTOR ||--o{ DOCTOR_KNOWLEDGE : "owns"
    DOCTOR ||--o{ ASSISTANT_AUDIT_LOG : "scopes"
    DOCTOR ||--o{ ASSISTANT_ACTION_AUDIT : "scopes"
```

Main MongoDB collections are Users, Doctors, Patients, Appointments, DoctorKnowledge, AssistantAuditLog, and AssistantActionAudit. Provider secrets and Google refresh tokens are never returned in public directory or assistant responses.

## 11. Deployment boundary

```mermaid
flowchart TD
    Browser["HTTPS Browser"] --> Web["Frontend Hosting"]
    Web --> Backend["Backend Behind HTTPS Proxy"]
    Backend --> Atlas["MongoDB Atlas"]
    Backend --> Services["Google AI Speech and Twilio Services"]
```

Production requires HTTPS for microphone permissions and secure WebSockets. The backend must have permitted outbound access to MongoDB Atlas and provider APIs.

## 12. Validation before push

```powershell
npm --prefix Backend run build
npm --prefix Backend run evaluate:assistant
npm --prefix Frontend run build
```

For detailed role-by-role explanations and feature flows, see [PROJECT_WORK_FLOW.md](./PROJECT_WORK_FLOW.md).
