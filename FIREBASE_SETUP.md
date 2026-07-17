# Firebase Setup

The app requires Firebase Email/Password Authentication and Cloud Firestore.

Project: `portfolio-x-tracker` (already created, Firestore already provisioned, `.env` already filled with this project's Web SDK config).

## 1. Enable Email/Password Authentication

1. Open `https://console.firebase.google.com/project/portfolio-x-tracker/authentication/providers`.
2. Click **Add new provider**.
3. Select **Email/Password**.
4. Enable **Email/Password** and save.

This step has no CLI equivalent and must be done in the console once.

## 2. Firestore rules

Already deployed from `firestore.rules`:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    match /users/{userId}/{document=**} {
      allow read, write: if isOwner(userId);
    }
  }
}
```

Trades are stored per-user at `users/{uid}/trades/{tradeId}`.

## 3. Run the app locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

## 4. Publish the app

```bash
npm install -g firebase-tools   # if not already installed
firebase login                  # if not already logged in
npm run deploy
```

After deploy, Firebase prints a public URL similar to:

```txt
https://portfolio-x-tracker.web.app
https://portfolio-x-tracker.firebaseapp.com
```
