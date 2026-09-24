// ============================================================
// EDIT THIS FILE (see README.md, step 4)
// ============================================================

// 1. Paste the config object from:
//    Firebase console -> Project settings -> "Your apps" -> Web app
export const firebaseConfig = {
  apiKey: "AIzaSyBlDYBd1HS90p32UXPL2qMqjg8IIoNZXXc",
  authDomain: "tifrhcanteen.firebaseapp.com",
  projectId: "tifrhcanteen",
  storageBucket: "tifrhcanteen.firebasestorage.app",
  messagingSenderId: "223315055445",
  appId: "1:223315055445:web:a419bdd147d5831da395dc"
};

// 2. Only emails ending with this can use the site
export const ALLOWED_DOMAIN = "tifrh.res.in";

// 3. People who can add / edit / delete food items and delete bad reviews.
//    Write them in lowercase.
//    IMPORTANT: the same emails must also be written in firestore.rules
export const ADMIN_EMAILS = [
  "mkiran@tifrh.res.in"
];
