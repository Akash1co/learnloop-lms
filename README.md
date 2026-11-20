# LearnLoop LMS API

Node.js and Express API for LearnLoop. Live mode uses MySQL; tests use an in-memory
store and do not require a database or external services.

## Setup

Requirements: Node.js 20+ and MySQL 8+.

```bash
npm ci
copy .env.example .env
```

Set the MySQL connection and a private JWT secret in `.env`, create the configured
database, and apply the schema:

```bash
node server/migrate.js
npm start
```

Never commit `.env`. The `uploads/` directory stores uploaded assets locally and is
ignored by git. Production deployments should use persistent storage and TLS.

## Configuration and integrations

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Authentication token signing |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM` | Optional Nodemailer SMTP delivery |
| `PAYMENT_PROVIDER` | `razorpay` (default) or `stripe` |
| `PAYMENT_MODE` | Set to `sandbox` to use local signed sandbox orders |
| `PAYMENT_SECRET` | HMAC secret used to verify checkout signatures |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay live order credentials |
| `STRIPE_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET` | Stripe live order and verification credentials |
| `PAYMENT_CURRENCY` | Order currency (defaults to INR for Razorpay and USD for Stripe) |

Emails use an in-memory mock transport when `NODE_ENV=test` or SMTP credentials are
not configured. Successful sends are recorded by the email service for integration
tests. In production, configure SMTP credentials to send actual messages.

Sandbox checkout returns an order and a sandbox `paymentId`. Submit the order ID,
payment ID, and an HMAC-SHA256 hex signature of `orderId|paymentId` to the verify
endpoint. Verification is bound to the authenticated user and stored order; a
successful verification marks the payment paid and creates the enrollment.

Uploads accept multipart field `file` or JSON `{ "data": "<base64-or-data-url>",
"mimeType": "image/png" }`. Only PDF, DOCX, PNG, and JPG are accepted, with content
signature checks and a 10 MB limit. Private assets return authenticated URLs;
instructors and admins can request public URLs with `?public=true`.

## API

All endpoints are under `/api/v1`. Except registration and login, endpoints require
`Authorization: Bearer <token>`.

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- `GET /courses`, `POST /courses`, `GET /courses/:id`
- `POST /courses/:id/modules`, `POST /modules/:id/lessons`
- `POST /courses/:id/enroll` (free courses), `PATCH /lessons/:id/complete`
- `GET /dashboard` (role-specific analytics)
- `POST /lessons/:id/submit`, `GET /submissions/:id`, `PATCH /submissions/:id/grade`
- `POST /integrations/payments/checkout`, `POST /integrations/payments/verify`
- `POST /integrations/uploads`, `GET /integrations/assets/:filename`

Course creation accepts an optional non-negative `price`. Enrolled students can
complete lessons, submit text and/or an uploaded asset URL, and see their grades.
Only the course instructor (or an admin) can manage its curriculum or grade work.

## Tests and CI

```bash
npm test
npm run lint
```

The Node native test runner exercises auth, course curriculum, enrollment,
completion, email notifications, sandbox payments, upload validation, grading, and
the end-to-end learner journey. GitHub Actions installs from the lockfile, runs
syntax checks, and executes the suite with `NODE_ENV=test`.
