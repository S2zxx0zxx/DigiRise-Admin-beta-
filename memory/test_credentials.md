# DigiRise OS — Test Credentials

These credentials are seeded automatically by `shared.js → seedDemoData()` on
first successful anonymous Firebase authentication. All auth happens through
Firebase Auth's anonymous sign-in; the "credentials" below are logical
identifiers stored in `sessionStorage` (partnerCode + role) rather than
password-protected accounts.

## Login flow
1. Open the app at `/index.html` (or the deployed preview URL).
2. Scroll to the "#login" section.
3. Enter one of the codes below into the Partner Code / Admin Code field.

## Partner accounts (seeded in Firebase Realtime DB)

| Partner Code | Display Name  | Tier    | Deals seeded | Notes                     |
|--------------|---------------|---------|--------------|---------------------------|
| `DR_DEMO`    | Demo Partner  | Bronze  | 3 deals      | Rich sandbox for testing  |
| `DR9304`     | Shalu Kumari  | Joining | ~2 deals     | Real onboarded partner    |
| `DR_PRIYA`   | Priya Singh   | Joining | ~1 deal      | Real onboarded partner    |

## Admin account

| Field             | Value            |
|-------------------|------------------|
| Session role      | `admin`          |
| Session user      | `Satyam Kumar`   |
| Admin code (UI)   | `SATYAM_ADMIN`   |

## Manual quick-set (browser console)

For QA sessions you can bypass the login form entirely:

```js
// Partner
sessionStorage.setItem('sessionUser', 'Demo Partner');
sessionStorage.setItem('sessionRole', 'partner');
sessionStorage.setItem('partnerCode', 'DR_DEMO');
location.href = '/partner.html';

// Admin
sessionStorage.setItem('sessionUser', 'Satyam Kumar');
sessionStorage.setItem('sessionRole', 'admin');
location.href = '/admin.html';
```

## Notes
- No password credentials — this platform uses partner-code-only login
  backed by Firebase anonymous auth.
- If Firebase anon sign-in flaps at cold-start, `shared.js` now auto-retries
  up to 6× with backoff, so subsequent reads will succeed.
