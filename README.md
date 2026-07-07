# Nuurul Ihsaan Foundation Website

A static front-end website with a Node.js Express backend for form submissions and portal access.

## Run locally

1. Install Node.js from https://nodejs.org/
2. Open a terminal in this project folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000/nif2.html` in your browser.

## Files

- `nif2.html` — home page
- `about.html`, `information.html`, `announcements.html`, `portal.html`, `leaders.html`, `hq.html`, `contributions.html`, `contact.html` — separate site pages
- `server.js` — backend server with API routes
- `script.js` — shared frontend form submit handler
- `backendData.json` — local storage for submissions

## API endpoints

- `POST /api/contact`
- `POST /api/membership`
- `POST /api/announcement`
- `POST /api/contribution`
- `POST /api/verify`
- `POST /api/leader-access`
- `POST /api/hq-access`
