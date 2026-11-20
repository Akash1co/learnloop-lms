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

## Production release and deployment

The app is ready to deploy as a Docker container or with the included Render
Blueprint. For Docker:

```bash
docker build -t learnloop-lms .
docker run --env-file .env -p 5000:5000 learnloop-lms
```

For Render, create a new Blueprint from this repository and provide the requested
environment values. Provision an external MySQL 8 database and configure
`DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`; Render's Blueprint does not
provision MySQL. Set `CORS_ORIGIN` to your frontend's exact origin and configure
SMTP and live payment credentials when those integrations are enabled. Apply the
database schema with `node server/migrate.js` before serving traffic. The container
filesystem is ephemeral, so configure persistent storage for uploads before
accepting production files.

Production requires a unique `JWT_SECRET` of at least 32 characters. Keep all
credentials in the deployment platform's secret manager. Set `FORCE_HTTPS=true`
when serving behind a trusted TLS-terminating reverse proxy. `/health` is the
deployment health-check URL.

## Security and API documentation

Production protections include Helmet headers, configurable CORS, optional HTTPS
redirects, global and stricter authentication rate limits, normalized JSON input,
and production JWT secret validation. Uploads are restricted to PDF, DOCX, PNG,
and JPG with signature checks and a 10 MB limit; passwords are hashed with
bcryptjs.

- [Security checklist](docs/SECURITY_CHECKLIST.md)
- [5-minute product walkthrough](docs/PRODUCT_WALKTHROUGH_SCRIPT.md)
- [OpenAPI 3.0.3 specification](docs/openapi.json)
- [Postman collection](docs/LearnLoop_LMS.postman_collection.json)
- Interactive local docs: `http://localhost:5000/api/docs`
- OpenAPI JSON endpoint: `http://localhost:5000/api/docs/openapi.json`

## Configuration and integrations

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `NODE_ENV` | Runtime environment; production requires a strong JWT secret |
| `CORS_ORIGIN` | Allowed origin or comma-separated browser origins (`*` by default for local development) |
| `FORCE_HTTPS` | Set to `true` to redirect non-HTTPS production requests |
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
