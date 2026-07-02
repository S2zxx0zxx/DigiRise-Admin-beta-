# DigiRise Growth Partner OS 2.0

Firebase-powered commission partner management system.

## Live URLs
- GitHub Pages: s2zxx0zxx.github.io/DigiRise-Admin-beta-
- Vercel: digi-rise-admin-beta.vercel.app

## NEW in OS 2.0 (Next-Gen Features)
| Feature | Where | File |
|---|---|---|
| F2 Follow-up Reminders | Partner Overview banner | js/digirise-nextgen.js |
| F9 Live Activity Feed | Partner Overview + Homepage ticker | js/digirise-nextgen.js |
| F4 Monthly Goals + Ring | Partner Overview | js/digirise-nextgen.js |
| F8 Smart Insights | Partner Overview | js/digirise-nextgen.js |
| F3 Monthly Report Card | Trophies tab + WhatsApp share | js/digirise-nextgen.js |
| F7 Referral System | Profile tab + Admin registration + auto bonus | digirise-nextgen.js + admin-nextgen.js |
| F10 Online Presence | Admin Partners table green dots | admin-nextgen.js |
| Calculator 2.0 | Slider + pace projection + share | js/digirise-nextgen.js |
| Mobile Bottom Nav | Partner, <560px, gold FAB | css/digirise-nextgen.css |

## Deploy
```
git add . && git commit -m "OS 2.0 next-gen features" && git push origin main
```
Vercel + GitHub Pages auto-deploy on push.

## IMPORTANT: Firebase Rules
database.rules.json now includes the new `presence` and `notifications` nodes.
Paste updated rules in Firebase Console → Realtime Database → Rules.

## Files
- index.html / partner.html / admin.html — 3 pages
- js/digirise-nextgen.js — NEW partner+home features
- js/admin-nextgen.js — NEW admin features  
- css/digirise-nextgen.css — NEW feature styles
- service-worker.js — cache bumped to v3

## Architecture
- **Frontend:** HTML5, Vanilla JavaScript (ES6+), Custom CSS3
- **Database:** Firebase Realtime Database
- **Authentication:** Custom Partner Code + Admin Secret Protocol

## Commission Structure
| Package Name | Package Value | Commission Rate | You Earn (Per Deal) |
| :--- | :--- | :--- | :--- |
| **Starter** | ₹8,000 | 10% | **₹800** |
| **Growth** | ₹25,000 | 10% | **₹2,500** |
| **Pro** | ₹35,000 | 15% | **₹5,250** |
| **Elite** | ₹75,000 | 15% | **₹11,250** |

---
<div align="center">
  <i>Engineered for Performance. Built for Growth.</i><br>
  <b>© DigiRise India</b>
</div>
