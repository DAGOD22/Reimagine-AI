# Hearthform

**See your space differently.**

Hearthform is a full-stack visual renovation studio. A user uploads a real room, exterior, garden, office, or other space; a server-side OpenRouter vision model analyzes it and creates a structured renovation plan; a separate image-editing provider renders a redesigned version of the same photograph; and every project, image, plan, estimate, and version is stored privately.

This repository contains the product—not a static concept page. Authentication, uploads, vision requests, structured plans, image editing, iterative versions, project storage, budgeting, product discovery, paint-color estimation, comparisons, and exports are wired end to end.

## Product flow

```text
USER IMAGE(S)
  → secure backend upload
  → OpenRouter vision + reasoning
  → structured space analysis
  → structured renovation plan
  → separate image-editing provider
  → stored redesign version
  → before / after + iterative editing
```

## Core capabilities

- Real email/password authentication plus Google and Microsoft OAuth with PKCE, signed ID-token verification, opaque server sessions, HttpOnly cookies, and per-user data access checks
- A one-renovation guest demo whose private project transfers into password or OAuth accounts
- Private persistent projects in SQLite
- Validated, normalized image uploads with pixel and byte limits, plus private PDF and UTF-8 project-document uploads
- Real OpenRouter multimodal requests using `google/gemma-4-26b-a4b-it:free`
- Structured space analysis, design plans, budget estimates, product search briefs, color estimates, design Q&A, and image-edit prompts
- Separate image generation/editing through FLUX on FAL (production) or Pollinations Kontext (community evaluation)
- Multiple inspiration references
- Structure-aware initial redesigns and version-to-version iterative edits
- Honest object-area pointer fallback (explicitly not presented as pixel-perfect segmentation)
- Before/after slider, fullscreen, zoom, final-image download, comparison export, and printable project summary
- Visible provider/configuration status with categorized failures; there are no sample AI responses or silent fake fallbacks
- Responsive editor layouts for desktop, tablet, and mobile; light and dark themes

## Stack

- Next.js 16 App Router + React 19 + TypeScript
- SQLite via `better-sqlite3`
- `bcryptjs` password hashing and opaque SHA-256 session tokens
- `sharp` upload verification, orientation, optimization, and thumbnails
- OpenRouter Chat Completions API for multimodal reasoning
- FAL FLUX.2 Pro or Pollinations Kontext for image editing
- Zod validation throughout server boundaries and model output parsing

## Environment

Copy `.env.example` to `.env.local` and set server-side values:

```bash
cp .env.example .env.local
```

Required:

```dotenv
OPENROUTER_API_KEY=your_server_side_key
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
AUTH_SECRET=a_random_secret_at_least_32_characters_long
```

Generate an auth secret:

```bash
openssl rand -hex 48
```

Optional Google and Microsoft sign-in:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

Register `${APP_URL}/api/auth/oauth/google/callback` and `${APP_URL}/api/auth/oauth/microsoft/callback` with the corresponding providers. Buttons report missing provider configuration instead of simulating login.

### Image editor

For production-quality private image editing, use FAL:

```dotenv
IMAGE_PROVIDER=fal
FAL_KEY=your_server_side_fal_key
```

For local evaluation, the default community provider makes a real Pollinations Kontext request:

```dotenv
IMAGE_PROVIDER=pollinations
# Optional authenticated quota:
POLLINATIONS_API_KEY=
```

The community provider needs a publicly reachable application origin so Pollinations can fetch the source through a signed, 15-minute media URL:

```dotenv
APP_URL=https://your-public-app.example
```

When the app is opened through Arena's live preview, the forwarded public origin is discovered automatically. Localhost is intentionally rejected for community image editing because an external provider cannot fetch it. Configure FAL for local-only/private deployments.

## Security properties

- AI and image-provider keys are read only from server environment variables.
- No secret is rendered, logged, returned by a status endpoint, or included in client JavaScript.
- Images and project documents are stored outside `public/` and served through ownership-checked routes.
- OAuth authorization uses one-time state, browser binding, PKCE, nonce checks, and provider JWKS signature validation.
- External image editors receive either provider uploads (FAL) or short-lived signed URLs (Pollinations).
- Password hashes use bcrypt with cost 12.
- Session tokens are random, only hashes are stored, and cookies are HttpOnly/SameSite.
- Project, image, analysis, plan, version, budget, and preference queries are scoped by `user_id`.
- Uploads are limited by MIME type, file signature, byte size, decode validity, and pixel count.
- Provider errors are normalized without leaking credentials or raw sensitive payloads.
- Invalid/malformed model responses are rejected. Hearthform never substitutes hardcoded AI content.

## Local development

```bash
npm install
npm run db:init
npm run dev
```

Open `http://localhost:3000`.

The database and uploaded files live under `data/` and are intentionally gitignored.

## Quality checks

```bash
npm test
npm run typecheck
npm run build
npm audit --audit-level=high
```

The test suite covers structured model-response parsing, schema rejection, and core serialization utilities. API integration can be exercised with a real account, project, upload, and `/api/analyze` request.

## API surface

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/sign-out`
- `GET /api/auth/oauth/:provider/start`
- `GET /api/auth/oauth/:provider/callback`
- `GET /api/auth/providers`
- `GET /demo`
- `PATCH /api/account`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/images`
- `POST /api/projects/:id/files`
- `DELETE /api/projects/:id/files?fileId=...`
- `GET /api/files/:id`
- `POST /api/analyze` (also `/api/ai/analyze`)
- `POST /api/ai/chat`
- `POST /api/generate`
- `POST /api/edit`
- `GET /api/config/status`
- `GET /api/media/:id`
- `GET /api/settings`
- `PUT /api/settings`

## Provider failure categories

The workspace's **Development status** panel distinguishes:

- missing API key
- authentication failure
- free-tier rate limit
- invalid or unavailable model
- invalid image input
- network/API failure
- timeout
- malformed or schema-invalid response
- image-generation configuration or provider failure

This is deliberate: external services can fail, but the product does not pretend that they succeeded.
