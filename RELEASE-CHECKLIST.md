# Release Checklist

## Preflight
1. Install dependencies in root and functions directories.
2. Ensure Firebase project is set to exam-language-trainer-3abec.
3. Confirm ANTHROPIC_API_KEY secret exists for Cloud Functions.

## Local Verification
1. Start emulators:
```bash
firebase emulators:start --only functions,firestore
```
2. Run smoke checks in a second terminal:
```bash
npm run smoke:api
```
3. Verify frontend flows manually:
- Lecturer sign-in, mode selection, upload, extraction, review, generate, save.
- Student quiz load, answer flow, result screen, retake.

## Security Checks
1. Confirm Firestore rules file is present: firestore.rules.
2. Confirm quiz ownership rules are enforced for list/create/update/delete.
3. Confirm rate limiting returns HTTP 429 and Retry-After header under repeated requests.

## Deploy
1. Deploy Firestore rules and functions:
```bash
firebase deploy --only firestore:rules,functions
```
2. Re-run smoke checks against deployed endpoint:
```bash
bash scripts/smoke-api.sh https://us-central1-exam-language-trainer-3abec.cloudfunctions.net/api
```

## Post-Deploy
1. Open app and create one real quiz end-to-end.
2. Verify share link and QR open the correct quiz.
3. Check Cloud Function logs for unexpected errors.
