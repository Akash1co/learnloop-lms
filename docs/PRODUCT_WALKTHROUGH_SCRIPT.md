# LearnLoop LMS: 5-minute walkthrough

## 0:00–0:30 — Set the scene

“LearnLoop brings course delivery, learner progress, assignments, and payments into one learning workflow. I’ll show the instructor setup first, then follow a student from discovery through graded work.”

Open the app and point out the course catalogue and sign-in entry point.

## 0:30–1:30 — Instructor builds a course

Sign in as an instructor. Create a course with a short description and price, then add a module and a lesson. Open the course view and show the curriculum structure.

“Instructors own their course content; role-based permissions protect course management and grading.”

## 1:30–2:30 — Student enrolls

Sign in as a student. Open the course and start checkout. In a sandbox demo, verify the simulated payment and show the resulting enrollment.

“Paid enrollment is created only after the server verifies the payment signature. Free courses can be joined directly.”

## 2:30–3:30 — Learn and submit

Open the lesson, mark it complete, upload a small supported file, and submit the work with a short note.

“Progress and submissions are tied to the enrolled learner. Uploads are type-checked and size-limited.”

## 3:30–4:30 — Instructor grades and student sees results

Switch back to the instructor, open the submission, and add a grade and feedback. Return to the student dashboard and show the updated result and course progress.

## 4:30–5:00 — Close with production readiness

Show `/api/docs` and the health endpoint. Mention the production checklist: HTTPS, managed secrets, restricted CORS, security headers, API rate limits, and persistent upload storage.

“The API is documented in OpenAPI and the Postman collection includes a repeatable end-to-end sandbox journey.”
