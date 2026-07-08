# GrowEasy CSV Importer — AI-Mapped Lead Import Pipeline

An AI-powered CSV importer that ingests CSV files with varying column layouts — including Facebook Lead Ads exports, Google Ads exports, real-estate CRM exports, and manual spreadsheets — and converts them into clean, validated GrowEasy CRM records.

# GrowEasy CSV Importer — AI-Mapped Lead Import Pipeline

An AI-powered CSV importer that ingests CSV files with varying column layouts — including Facebook Lead Ads exports, Google Ads exports, real-estate CRM exports, and manual spreadsheets — and converts them into clean, validated GrowEasy CRM records.

## Live Demo

**Hosted Application:**  
https://groweasy-csv-importer-weld.vercel.app/

## What makes this approach different

A basic implementation could send every CSV row through one large LLM prompt. This project instead uses a two-phase pipeline designed to improve efficiency, visibility, resilience, and output validation.

### 1. Phase 1 — Schema Fingerprinting

The AI analyzes only:

- CSV column headers
- Up to 3 sample rows

It returns:

- A source-column → CRM-field mapping
- A confidence score for each mapping
- A best-effort guess of the source format

Examples of source-format guesses include:

- Facebook Lead Export
- Manual Spreadsheet
- CRM Export
- Other structured lead source

The mapping is fingerprinted using a hash of the header set and cached in memory. If another CSV with the same column structure is processed by the same warm server instance, the application can reuse the mapping and avoid repeating the schema-analysis AI call.

### 2. Phase 2 — Streaming Batch Extraction

Rows are processed in batches of 15.

Each completed batch is streamed back to the browser using newline-delimited JSON (NDJSON), allowing the interface to display progress while processing continues.

The pipeline includes:

- Batch-level progress events
- Retry handling
- Up to 2 retries after an initial failed extraction attempt
- Graceful fallback for failed batches
- Imported and skipped record separation

If a batch still fails after all attempts, its rows are marked as skipped rather than silently discarded.

### 3. Server-Side Validation

AI output is not trusted blindly.

The validation layer checks and sanitizes extracted records before they are accepted. In particular:

- `crm_status` is checked against allowed values
- `data_source` is checked against allowed values
- Contact information is validated after extraction
- Rows without usable email or mobile information are skipped
- Invalid AI-generated enum values are prevented from being silently written as trusted CRM data

This provides a second validation boundary after AI extraction.

## Tech Stack

- **Frontend + Backend:** Next.js 16.2.10 with App Router
- **Language:** TypeScript
- **AI Inference:** Groq API
- **Model:** `llama-3.3-70b-versatile`
- **CSV Parsing:** PapaParse
- **Styling:** Tailwind CSS
- **Streaming:** NDJSON over the Fetch API
- **Hosting:** Vercel
- **Database:** None required; the application is stateless by design
- **Containerization:** Dockerfile included

---

## Part A — Run Locally

### 1. Prerequisites

Install or create:

- Node.js 18 or later
- A Groq account
- A GitHub account
- A Vercel account for deployment

Check Node.js and npm:

```bash
node -v
npm -v
```

### 2. Create a Groq API Key

1. Open the Groq Console.
2. Sign in or create an account.
3. Open the API Keys section.
4. Create a new API key.
5. Copy the key and store it securely.

Do not commit API keys to GitHub or place them in frontend code.

### 3. Configure Environment Variables

The repository contains:

```text
.env.example
```

Create a local environment file.

On Windows Command Prompt:

```cmd
copy .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Open `.env.local` and add your Groq API key:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Do not add quotes around the key.

### 4. Install Dependencies

```bash
npm install
```

### 5. Start Development Mode

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Upload one of the CSV files from the `samples/` directory.

### 6. Verify the Production Build

Before deployment, run:

```bash
npm run build
```

Then test the production server:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

This project has been verified with a successful optimized production build.

---

## Part B — Push to GitHub

### 1. Verify Secrets Are Ignored

Before committing, confirm that `.gitignore` excludes local environment files.

Recommended entries:

```gitignore
node_modules
.next
.env.local
.env*.local
```

Never commit `.env.local`.

### 2. Initialize Git

```bash
git init
git add .
git commit -m "Build AI-powered CSV lead import pipeline"
```

### 3. Create a Repository

Create a new repository on GitHub.

Example repository name:

```text
groweasy-csv-importer
```

If you already have a local README, do not initialize the remote repository with another README.

### 4. Push the Project

Replace `<your-username>` with your GitHub username:

```bash
git remote add origin https://github.com/<your-username>/groweasy-csv-importer.git
git branch -M main
git push -u origin main
```

---

## Part C — Deploy to Vercel

### 1. Import the Repository

1. Sign in to Vercel.
2. Choose **Add New Project**.
3. Import the GitHub repository.
4. Allow Vercel to detect the Next.js application automatically.

### 2. Add the Environment Variable

Before deploying, add:

```text
Key: GROQ_API_KEY
Value: your valid Groq API key
```

The key is read only by the server-side API route.

It is not exposed through a `NEXT_PUBLIC_` environment variable.

### 3. Deploy

Deploy the application and wait for the production build to complete.

After deployment, Vercel provides a hosted URL similar to:

```text
https://your-project-name.vercel.app
```

### 4. Test the Live Application

After deployment:

1. Open the hosted URL.
2. Upload a sample CSV.
3. Confirm the preview step works.
4. Start AI processing.
5. Verify imported and skipped counts.
6. Test CSV download.
7. Test JSON download.
8. Test dark mode.
9. Test importing another file.

---

## Part D — Submission

Submit the required information according to the assignment instructions.

Typical submission details include:

- Hosted application URL
- GitHub repository URL
- Position applied for

Before submitting, verify both URLs in an incognito/private browser window.

---

## Project Structure

```text
app/
  page.tsx
    UI workflow:
    upload → preview → confirm → AI processing → results

  layout.tsx
    Application layout

  globals.css
    Global styling

  api/
    import/
      route.ts
        Streaming server API
        Phase 1 schema mapping
        Phase 2 batch extraction
        Retry handling
        NDJSON progress events

lib/
  groq.ts
    Groq API wrapper
    JSON-only response handling
    Retry/backoff behavior

  prompts.ts
    Mapping instructions
    Extraction instructions
    Response schemas

  schema-cache.ts
    Header fingerprint generation
    In-memory mapping cache

  types.ts
    CRM record types
    Mapping types
    Streaming event contracts

  validate.ts
    Record sanitization
    Enum enforcement
    Contact-information checks

samples/
  facebook_leads_export.csv
  manual_spreadsheet.csv

.env.example
Dockerfile
next.config.js
package.json
tailwind.config.js
tsconfig.json
README.md
```

---

## Processing Architecture

```text
CSV Upload
    |
    v
Client-Side Preview
    |
    v
User Confirmation
    |
    v
POST /api/import
    |
    v
CSV Parsing with PapaParse
    |
    v
Header Fingerprint
    |
    +---------------------------+
    |                           |
    v                           v
Cached Mapping Found      No Cached Mapping
    |                           |
    |                           v
    |                    Groq Schema Analysis
    |                           |
    +-------------+-------------+
                  |
                  v
         Column → CRM Mapping
                  |
                  v
          Split Rows into Batches
                  |
                  v
          Groq AI Extraction
                  |
                  v
       Server-Side Sanitization
                  |
          +-------+-------+
          |               |
          v               v
      Imported         Skipped
          |               |
          +-------+-------+
                  |
                  v
        NDJSON Streaming Results
                  |
                  v
        CSV / JSON Export
```

---

## How Each Requirement Is Addressed

| Requirement | Implementation |
|---|---|
| CSV upload | Drag-and-drop and file picker in `app/page.tsx` |
| Preview before AI | CSV is previewed before confirmation |
| Explicit confirmation | Backend processing starts only after user confirmation |
| Batch extraction | `BATCH_SIZE = 15` in `app/api/import/route.ts` |
| Flexible column layouts | Phase 1 schema mapping |
| AI-based field mapping | Groq-powered schema analysis |
| Enum enforcement | `lib/validate.ts` |
| Missing-contact handling | AI extraction rule plus server-side `hasContactInfo()` check |
| Imported/skipped separation | Separate result collections and UI tabs |
| Streaming progress | NDJSON stream events |
| Retry mechanism | Batch retry loop |
| Download CSV | Result export in UI |
| Download JSON | Result export in UI |
| Dark mode | UI theme toggle |
| Docker support | Root `Dockerfile` |
| Secret protection | Server-side environment variable |

---

## Reliability and Edge-Case Handling

The application handles several failure scenarios.

### Empty CSV

If no data rows are found, processing stops with an error event.

### Missing API Key

If `GROQ_API_KEY` is unavailable, the server returns a clear streamed error message.

### Rows Without Contact Information

Rows without usable email or mobile data are skipped.

### AI Output Validation

Extracted records pass through server-side sanitization before being accepted.

### Batch Failure

A failed extraction batch is retried. If all attempts fail, rows are preserved as skipped records rather than silently lost.

### Repeated CSV Layouts

Header fingerprints allow schema mappings to be reused within the lifetime of a warm server instance.

---

## Security Considerations

### API Key Isolation

The Groq API key is accessed server-side:

```ts
process.env.GROQ_API_KEY
```

The browser does not receive the key.

### Environment Files

Local secrets belong in:

```text
.env.local
```

The example file contains only a placeholder:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### Output Validation

AI-generated records are sanitized before being treated as trusted CRM data.

### No Database Persistence

The current implementation does not persist uploaded CSV contents to a database.

---

## Scaling Notes

The current schema fingerprint cache is stored in server memory.

This is suitable for:

- Local development
- Assignment demonstration
- A single warm runtime instance

However, serverless instances can restart, and memory is not shared globally.

For a larger production deployment, the cache could be moved to a shared key-value store such as Redis without changing the rest of the pipeline significantly because cache access is isolated behind:

```ts
getCachedMapping()
setCachedMapping()
```

Additional production improvements could include:

- Persistent job queues
- Concurrency controls
- Request-size limits
- Rate-limit-aware scheduling
- Durable processing state
- Authentication
- Audit logging
- Persistent import history
- Observability and tracing

---

## Design Decisions

### Why Two AI Phases?

Separating schema understanding from row extraction avoids repeatedly asking the model to rediscover the same column meanings for every row.

### Why Batch Processing?

Batching balances:

- Request overhead
- Prompt size
- Progress visibility
- Retry granularity

### Why Stream Results?

Streaming provides visible progress and avoids making the user wait for the entire file before seeing processing activity.

### Why Validate After AI?

LLM output should not be treated as trusted application data. Server-side validation provides a deterministic enforcement layer after probabilistic extraction.

---

## Author

**Jayanth Sadurla**

B.Tech Computer Science and Engineering (Data Science)  
Class of 2026

GitHub: Jayanthsadurla

This project was developed as part of the GrowEasy Software Developer assignment.
