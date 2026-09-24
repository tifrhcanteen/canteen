# TIFRH Canteen Ratings

A food rating website for the TIFRH canteen. Only people with an `@tifrh.res.in` email can open it.

## How it works (the big picture)

GitHub Pages can only serve fixed files (HTML, CSS, JS, pictures). It cannot remember anything
people type. So the website is split in two:

- **GitHub Pages** hosts the website files (this folder).
- **Firebase** (by Google, free plan) does two jobs:
  - **Authentication**: sends a one-time login link to the person's `@tifrh.res.in` inbox.
    Clicking it proves they own that email. No passwords.
  - **Firestore**: a database that stores items, ratings, comments and photos.
    `firestore.rules` tells Google's servers who can read/write what, so the data stays
    locked to TIFRH emails even though the website code is public.

There is no build step, nothing to compile, nothing to install. The browser downloads the
Firebase code directly from Google (the `import ... from "https://www.gstatic.com/..."` lines
in `app.js`).

## Files

| File | What it is |
|---|---|
| `index.html` | All the pages (login, home, meal list, item, admin). Only one is shown at a time. |
| `style.css` | Colours and layout. |
| `app.js` | All logic: login, loading/saving ratings, top 5 / worst 5. |
| `firebase-config.js` | **You edit this.** Your Firebase keys and the admin emails. |
| `firestore.rules` | Security rules. **You paste this into Firebase.** |
| `images/` | Put `breakfast.jpg`, `lunch.jpg`, `snacks.jpg`, `dinner.jpg` here for the 4 big buttons. |

## Setup, step by step

### 1. Create a Firebase project
1. Go to https://console.firebase.google.com and sign in with any Google account.
2. **Add project** → give it a name (e.g. `tifrh-canteen`) → you can turn off Google Analytics → Create.
3. Stay on the free **Spark** plan. This site does not use Firebase Storage (which now needs a paid plan);
   photos are shrunk in the browser and saved inside Firestore instead.

### 2. Turn on email-link login
1. Left menu → **Build → Authentication** → **Get started**.
2. **Sign-in method** tab → **Email/Password** → enable it, **and also enable "Email link (passwordless sign-in)"** → Save.

### 3. Create the database and paste the rules
1. Left menu → **Build → Firestore Database** → **Create database**.
   Pick a location (e.g. `asia-south1`, Mumbai). Start in **production mode**.
2. Open the **Rules** tab. Delete what is there, paste the whole `firestore.rules` file.
3. In the pasted text, find `['your.name@tifrh.res.in']` and put the real admin email(s), e.g.
   `['canteen.committee@tifrh.res.in', 'someone@tifrh.res.in']`. **Publish**.

### 4. Connect the website to your project
1. Firebase console → gear icon ⚙ → **Project settings** → scroll to **Your apps** → click the `</>` (Web) icon.
2. Give it a nickname, do **not** tick Firebase Hosting, click Register.
3. It shows a `const firebaseConfig = { ... }` block. Copy the values into `firebase-config.js`.
4. In `firebase-config.js`, set `ADMIN_EMAILS` to the **same** emails you put in the rules (lowercase).

It is fine that these keys are public on GitHub. They only identify the project;
the rules from step 3 are what protect the data.

### 5. Put it on GitHub Pages
1. Create a new repository on GitHub, e.g. `canteen`.
2. Upload all files of this folder (keep `images/` as a folder).
3. Repository → **Settings → Pages** → Source: **Deploy from a branch** → branch `main`, folder `/ (root)` → Save.
4. After a minute the site is at `https://YOUR-GITHUB-USERNAME.github.io/canteen/`.

### 6. Allow your GitHub address to use the login
Firebase only sends login links that return to addresses it trusts.
Authentication → **Settings** tab → **Authorized domains** → **Add domain** →
`YOUR-GITHUB-USERNAME.github.io` (no `https://`, no `/canteen`).

### 7. Try it
1. Open the site, type your `@tifrh.res.in` email, click the button.
2. Open the email (check spam), click the link. You are logged in.
3. If you are an admin, an **Admin** link appears at the top. Add the food items with name, meal,
   MRP, days and a photo.
4. Rate a few items from two different accounts; after `MIN_REVIEWS_FOR_RANKING` (2) reviews an item
   appears in Top 5 / lowest 5.

## Things worth knowing

- **Login emails going to spam / blocked**: the email comes from `noreply@YOUR-PROJECT.firebaseapp.com`.
  If TIFRH mail blocks it, ask IT to allow that sender.
- **Names on reviews**: reviews show the part of the email before `@`. This keeps people accountable,
  but some may hesitate to complain openly. To make reviews anonymous, change
  `name: currentUser.email.split("@")[0]` in `app.js` to `name: "Anonymous"` and in
  `firestore.rules` change the `name` line to `&& request.resource.data.name == "Anonymous"`.
- **One review per person per item**: posting again updates the old one. This stops one person from
  spamming ratings. Each person also has one canteen rating, which they can update anytime.
- **Free plan limits**: 50,000 document reads per day. The home page reads every review once per visit
  (reviews are small; photos are stored separately and only loaded when shown). This is comfortable for
  a campus canteen. If it ever gets tight, that is the place to optimise.
- **Changing an admin**: edit the email in both `firestore.rules` (and Publish) and `firebase-config.js`.
