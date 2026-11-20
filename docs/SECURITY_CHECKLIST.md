# Production security checklist

- [ ] Serve the application only over HTTPS. Set `FORCE_HTTPS=true` behind a correctly configured reverse proxy; the app trusts one proxy hop.
- [ ] Set a unique `JWT_SECRET` with at least 32 characters. Production startup fails if it is missing, weak, or a known placeholder. Keep secrets in the hosting provider's secret manager, never in source control.
- [ ] Set `CORS_ORIGIN` to the exact trusted frontend origin(s), comma-separated when needed. Do not leave the wildcard default in a public production deployment.
- [ ] Keep request validation enabled. Registration, course creation, and other write operations validate their required values; JSON input is normalized and unsafe object keys/null bytes are removed.
- [ ] Keep the global API and stricter authentication sliding-window limits enabled. Monitor 429 responses and tune only for known traffic patterns.
- [ ] Keep Helmet enabled, including content security policy, MIME sniffing protection, clickjacking protection, and HSTS headers.
- [ ] Passwords are stored using bcryptjs with a work factor of 12; never log or return passwords or password hashes.
- [ ] Uploads are limited to one file and 10 MB. Only PDF, DOCX, PNG, and JPG are accepted, and content signatures are checked. Store production uploads on persistent/private storage and back them up; the container filesystem is ephemeral.
- [ ] Configure production MySQL credentials, SMTP, and payment-provider credentials through protected environment settings. Use live provider credentials only for live payments and never expose them to browsers.
- [ ] Keep dependencies current, review `npm audit` findings, and run `npm test` and `npm run lint` before releases.
