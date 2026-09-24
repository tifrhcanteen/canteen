// ============================================================
// TIFR-H Canteen Portal - all the website logic lives here
//
// Sections, in order:
//   settings and database layout
//   small helpers
//   light / dark mode
//   side menu
//   login
//   page switching
//   HOME: overall rating, announcements, polls, top 5, recent feedback slider
//   MEAL page
//   ITEM page (with parts of a thali)
//   COMMITTEE page
//   GALLERY page
//   ADMIN page (announcements, polls, starter menu, food items)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_DOMAIN, ADMIN_EMAILS } from "./firebase-config.js";
import { STARTER_MENU } from "./starter-menu.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// the 5 categories, in the order they are shown
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snacks", "fruits"];
const MEAL_NAMES = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks & Tea",
  fruits: "Fruits & Juice"
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// An item needs at least this many reviews before it can appear in Top 5 / Needs Improvement
const MIN_REVIEWS_FOR_RANKING = 2;

// How many comments go into the "Recent Feedback" slider on the home page
const RECENT_FEEDBACK_COUNT = 10;

// How often the "Recent Feedback" slider moves on its own (milliseconds)
const SLIDE_EVERY_MS = 2000;

let currentUser = null;        // the logged-in person (null = just browsing)
let currentItemId = null;      // item open on the item page
let currentItemMeal = null;
let myExistingReview = null;   // my old review of the open item (if any)
let editingItemId = null;      // item being edited on the admin page
let editingMemberId = null;    // committee member being edited

// ============================================================
// Database layout (Firestore)
//
//   items/{itemId}                  name, meal, mrp, days[], parts[]                (public)
//   itemPhotos/{itemId}             image  (small jpeg as text)                     (public)
//   reviews/{itemId_uid}            itemId, meal, uid, stars, comment, hasPhoto, time  (public)
//   partReviews/{itemId_part_uid}   itemId, part, partName, uid, stars, comment, time  (public)
//   reviewNames/{same id as review} uid, itemId, (part), name                       (TIFRH only)
//   photos/{itemId_uid}             uid, itemId, image                              (public)
//   canteenRatings/{uid}            cleanliness, health, quality, time              (public)
//   announcements/{id}              text, time                                      (public)
//   polls/{pollId}                  question, options[], active, time               (public)
//   votes/{pollId_uid}              pollId, uid, choice, time                       (public, no names)
//   committee/{id}                  name, position, order, image                    (public)
//   gallery/{id}                    image, caption, time                            (public)
//
// One review per person per item (and per part). Posting again updates it.
// ============================================================


// ---------------- small helpers ----------------

function escapeHtml(text) {
  // stops people from putting HTML/JavaScript inside comments
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function starString(value) {
  const full = Math.round(value);
  let s = "";
  for (let i = 1; i <= 5; i++) {
    if (i <= full) s += "★";
    else s += "☆";
  }
  return s;
}

function isTifrhEmail(email) {
  return email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}

function isAdmin() {
  if (currentUser === null) return false;
  return ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
}

function todayName() {
  // JavaScript counts Sunday = 0, Monday = 1, ... so shift to Mon..Sun
  const d = new Date().getDay();
  return DAY_NAMES[(d + 6) % 7];
}

function dateText(time) {
  // gives 2026-09-24 style dates in the viewer's local time
  return new Date(time).toLocaleDateString("en-CA");
}

function partKey(partName) {
  // "Dal Tadka" -> "dal-tadka", used inside database ids
  let key = partName.toLowerCase().trim();
  key = key.replace(/[^a-z0-9]+/g, "-");
  if (key === "") key = "part";
  return key;
}

function dayChipsHtml(days) {
  // one small green box per day; today's box is filled in
  const today = todayName();
  let html = "";
  for (let i = 0; i < DAY_NAMES.length; i++) {
    const day = DAY_NAMES[i];
    if (!days.includes(day)) continue;
    if (day === today) html += '<span class="chip chip-today">' + day + '</span>';
    else html += '<span class="chip">' + day + '</span>';
  }
  return html;
}

function setupStarPicker(id) {
  const box = document.getElementById(id);
  box.innerHTML = "";
  box.dataset.value = "0";
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("span");
    star.textContent = "☆";
    star.onclick = function () { setStarPicker(id, i); };
    box.appendChild(star);
  }
}

function setStarPicker(id, value) {
  const box = document.getElementById(id);
  box.dataset.value = String(value);
  for (let i = 0; i < 5; i++) {
    if (i < value) box.children[i].textContent = "★";
    else box.children[i].textContent = "☆";
  }
}

function getStarPicker(id) {
  return parseInt(document.getElementById(id).dataset.value);
}

// Phone photos are 3-5 MB. Shrink to at most maxSize pixels and save as jpeg (~50-150 KB).
function compressImage(file, maxSize) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        let w = img.width;
        let h = img.height;
        if (w >= h && w > maxSize) {
          h = Math.round(h * maxSize / w);
          w = maxSize;
        }
        if (h > w && h > maxSize) {
          w = Math.round(w * maxSize / h);
          h = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadNameInto(reviewId, nameElement) {
  // only works for signed-in TIFRH people (the rules block everyone else)
  const snap = await getDoc(doc(db, "reviewNames", reviewId));
  if (snap.exists()) nameElement.textContent = "@" + snap.data().name;
}

async function loadPhotoInto(collectionName, docId, imgElement) {
  const snap = await getDoc(doc(db, collectionName, docId));
  if (snap.exists()) {
    imgElement.src = snap.data().image;
    imgElement.style.display = "block";
  }
}


// ---------------- light / dark mode ----------------
// index.html already applied the saved choice before the page drew.
// Here we only handle the 🌙 / ☀️ button and remember the choice.

function showThemeIcon() {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") document.getElementById("theme-toggle").textContent = "☀️";
  else document.getElementById("theme-toggle").textContent = "🌙";
}

document.getElementById("theme-toggle").onclick = function () {
  let theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") theme = "light";
  else theme = "dark";
  document.documentElement.setAttribute("data-theme", theme);
  try { window.localStorage.setItem("theme", theme); } catch (e) {}
  showThemeIcon();
};

showThemeIcon();


// ---------------- side menu (☰) ----------------

function openMenu() {
  document.getElementById("side-menu").classList.add("open");
  document.getElementById("menu-backdrop").classList.add("open");
}

function closeMenu() {
  document.getElementById("side-menu").classList.remove("open");
  document.getElementById("menu-backdrop").classList.remove("open");
}

document.getElementById("menu-open").onclick = openMenu;
document.getElementById("menu-close").onclick = closeMenu;
document.getElementById("menu-backdrop").onclick = closeMenu;

// clicking a menu link changes the # in the address, render() then closes the menu.
// Clicking the page you are already on doesn't change the #, so close it here too.
const sideLinks = document.querySelectorAll(".side-link");
for (let i = 0; i < sideLinks.length; i++) {
  sideLinks[i].addEventListener("click", closeMenu);
}


// ---------------- login ----------------
// Anyone can browse. The login pop-up only opens when someone
// clicks "TIFR-H Sign In", or tries to rate / comment / vote.

function showLoginBox(reason) {
  document.getElementById("login-reason").textContent = reason;
  document.getElementById("login-message").textContent = "";
  document.getElementById("login-view").style.display = "flex";
}

function hideLoginBox() {
  document.getElementById("login-view").style.display = "none";
}

document.getElementById("login-open-button").onclick = function () {
  showLoginBox("Sign in with your TIFRH email to rate and comment.");
};

document.getElementById("login-close").onclick = hideLoginBox;

document.getElementById("login-button").onclick = async function () {
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const msg = document.getElementById("login-message");

  if (!isTifrhEmail(email)) {
    msg.textContent = "Only @" + ALLOWED_DOMAIN + " emails can sign in.";
    return;
  }

  msg.textContent = "Sending...";
  try {
    const settings = {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true
    };
    await sendSignInLinkToEmail(auth, email, settings);
    window.localStorage.setItem("emailForSignIn", email);
    // remember which page they were on (e.g. #item/abc123), to bring them back there
    window.localStorage.setItem("returnHash", window.location.hash);
    msg.textContent = "Sent! Open the link in the email sent to " + email + " (check spam too).";
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};

// When someone clicks the link in their email, they land back here with a code in the URL
if (isSignInWithEmailLink(auth, window.location.href)) {
  let email = window.localStorage.getItem("emailForSignIn");
  if (!email) {
    // happens if they opened the link on a different phone/computer
    email = window.prompt("Please type your @" + ALLOWED_DOMAIN + " email again to confirm:");
  }
  try {
    await signInWithEmailLink(auth, email, window.location.href);
    window.localStorage.removeItem("emailForSignIn");
  } catch (error) {
    alert("Sign-in failed: " + error.message + "\nPlease ask for a new link.");
  }
  // remove the long code from the address bar, and go back to the page they were on
  let returnHash = window.localStorage.getItem("returnHash");
  if (returnHash === null) returnHash = "";
  window.localStorage.removeItem("returnHash");
  window.history.replaceState(null, "", window.location.pathname + returnHash);
}

document.getElementById("logout-button").onclick = function () {
  signOut(auth);
};

// This runs once when the page opens, and again every time someone signs in or out
onAuthStateChanged(auth, async function (user) {
  if (user && !isTifrhEmail(user.email)) {
    // a non-TIFRH account somehow signed in: throw it out
    await signOut(auth);
    return;
  }

  if (user) currentUser = user;
  else currentUser = null;

  // the website itself is always visible
  hideLoginBox();
  document.getElementById("app-view").style.display = "block";

  if (currentUser !== null) {
    document.getElementById("user-email").textContent = currentUser.email;
    document.getElementById("user-email").style.display = "inline";
    document.getElementById("logout-button").style.display = "inline-flex";
    document.getElementById("login-open-button").style.display = "none";
  } else {
    document.getElementById("user-email").style.display = "none";
    document.getElementById("logout-button").style.display = "none";
    document.getElementById("login-open-button").style.display = "inline-flex";
  }

  if (isAdmin()) document.getElementById("side-admin-link").style.display = "block";
  else document.getElementById("side-admin-link").style.display = "none";

  render();
});


// ---------------- page switching ----------------
// The part of the URL after # decides the page:
//   #                -> home
//   #meal/lunch      -> list of lunch items
//   #item/abc123     -> one item with its reviews
//   #committee       -> canteen committee
//   #gallery         -> photo gallery
//   #admin           -> admin page

function render() {
  closeMenu();
  document.getElementById("home-view").style.display = "none";
  document.getElementById("meal-view").style.display = "none";
  document.getElementById("item-view").style.display = "none";
  document.getElementById("committee-view").style.display = "none";
  document.getElementById("gallery-view").style.display = "none";
  document.getElementById("admin-view").style.display = "none";
  window.scrollTo(0, 0);

  const hash = window.location.hash;
  if (hash.startsWith("#meal/")) showMealPage(hash.substring(6));
  else if (hash.startsWith("#item/")) showItemPage(hash.substring(6));
  else if (hash === "#committee") showCommitteePage();
  else if (hash === "#gallery") showGalleryPage();
  else if (hash === "#admin") showAdminPage();
  else showHomePage();
}

window.addEventListener("hashchange", render);

setupStarPicker("pick-clean");
setupStarPicker("pick-health");
setupStarPicker("pick-quality");
setupStarPicker("pick-review");


// ============================================================
// HOME PAGE
// ============================================================

async function showHomePage() {
  document.getElementById("home-view").style.display = "block";

  // these load on their own, so a slow one doesn't hold up the rest
  showAnnouncements();
  showPolls();

  // ---- 1. overall canteen rating (the dark green card) ----
  setStarPicker("pick-clean", 0);
  setStarPicker("pick-health", 0);
  setStarPicker("pick-quality", 0);

  const ratingSnap = await getDocs(collection(db, "canteenRatings"));
  let sumClean = 0;
  let sumHealth = 0;
  let sumQuality = 0;
  let count = 0;

  for (const d of ratingSnap.docs) {
    const r = d.data();
    sumClean += r.cleanliness;
    sumHealth += r.health;
    sumQuality += r.quality;
    count += 1;

    if (currentUser !== null && d.id === currentUser.uid) {
      // show my old rating in the form
      setStarPicker("pick-clean", r.cleanliness);
      setStarPicker("pick-health", r.health);
      setStarPicker("pick-quality", r.quality);
    }
  }

  if (count > 0) {
    const avgClean = sumClean / count;
    const avgHealth = sumHealth / count;
    const avgQuality = sumQuality / count;
    const avgOverall = (avgClean + avgHealth + avgQuality) / 3;

    document.getElementById("avg-overall").textContent = avgOverall.toFixed(1);
    document.getElementById("stars-overall").textContent = starString(avgOverall);
    if (count === 1) document.getElementById("overall-count").textContent = "1 verified rating";
    else document.getElementById("overall-count").textContent = count + " verified ratings";

    document.getElementById("avg-clean").textContent = avgClean.toFixed(1) + " / 5";
    document.getElementById("avg-health").textContent = avgHealth.toFixed(1) + " / 5";
    document.getElementById("avg-quality").textContent = avgQuality.toFixed(1) + " / 5";

    // bar length = rating out of 5, as a percentage
    document.getElementById("bar-clean").style.width = (avgClean / 5 * 100) + "%";
    document.getElementById("bar-health").style.width = (avgHealth / 5 * 100) + "%";
    document.getElementById("bar-quality").style.width = (avgQuality / 5 * 100) + "%";
  }

  // ---- 2. top 5 and needs-improvement 5 ----
  const itemsSnap = await getDocs(collection(db, "items"));
  const reviewsSnap = await getDocs(collection(db, "reviews"));

  const itemNames = {};   // itemId -> name, used below
  for (const d of itemsSnap.docs) itemNames[d.id] = d.data().name;

  const starSum = {};
  const starCount = {};
  for (const d of reviewsSnap.docs) {
    const r = d.data();
    if (starSum[r.itemId] === undefined) {
      starSum[r.itemId] = 0;
      starCount[r.itemId] = 0;
    }
    starSum[r.itemId] += r.stars;
    starCount[r.itemId] += 1;
  }

  const ranked = [];
  for (const d of itemsSnap.docs) {
    const n = starCount[d.id] || 0;
    if (n >= MIN_REVIEWS_FOR_RANKING) {
      ranked.push({
        id: d.id,
        name: d.data().name,
        meal: d.data().meal,
        avg: starSum[d.id] / n,
        count: n
      });
    }
  }

  // highest average first
  ranked.sort(function (a, b) { return b.avg - a.avg; });

  const top = [];
  for (let i = 0; i < ranked.length && top.length < 5; i++) {
    top.push(ranked[i]);
  }

  const worst = [];
  for (let i = ranked.length - 1; i >= 0 && worst.length < 5; i--) {
    if (top.includes(ranked[i])) continue;   // don't show one item in both lists
    worst.push(ranked[i]);
  }

  fillRankList("top-list", top, "rank-num");
  fillRankList("worst-list", worst, "rank-num worst-num");

  // ---- 3. recent feedback slider: the newest reviews that have a comment ----
  const withComments = [];
  for (const d of reviewsSnap.docs) {
    const r = d.data();
    if (r.comment === "") continue;
    if (itemNames[r.itemId] === undefined) continue;   // item was deleted
    withComments.push(d);
  }
  withComments.sort(function (a, b) { return b.data().time - a.data().time; });

  const track = document.getElementById("recent-list");
  track.innerHTML = "";
  track.scrollLeft = 0;
  if (withComments.length === 0) {
    track.innerHTML = '<p class="muted small">No comments yet. Be the first to leave feedback!</p>';
  }

  for (let i = 0; i < withComments.length && i < RECENT_FEEDBACK_COUNT; i++) {
    const d = withComments[i];
    const r = d.data();
    const card = document.createElement("a");
    card.className = "recent-card";
    card.href = "#item/" + r.itemId;
    card.draggable = false;   // so dragging with the mouse slides instead of dragging the link
    card.innerHTML =
      '<div class="recent-head">' +
        '<span class="item-pill">' + escapeHtml(itemNames[r.itemId]) + '</span>' +
        '<span class="stars">' + starString(r.stars) + '</span>' +
      '</div>' +
      '<p class="recent-comment">"' + escapeHtml(r.comment) + '"</p>' +
      '<div class="recent-foot">' +
        '<span class="reviewer-name">TIFRH member</span>' +
        '<span>' + dateText(r.time) + '</span>' +
      '</div>';
    track.appendChild(card);
    if (currentUser !== null) loadNameInto(d.id, card.querySelector(".reviewer-name"));
  }
}

function fillRankList(elementId, list, numberClass) {
  const box = document.getElementById(elementId);
  box.innerHTML = "";

  if (list.length === 0) {
    box.innerHTML = '<p class="muted small">Not enough ratings yet.</p>';
    return;
  }

  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const row = document.createElement("a");
    row.className = "rank-row";
    row.href = "#item/" + it.id;
    row.innerHTML =
      '<span class="' + numberClass + '">' + (i + 1) + '</span>' +
      '<div class="item-photo small-thumb"><span class="item-photo-name">🍽️</span><img alt=""></div>' +
      '<div><b>' + escapeHtml(it.name) + '</b>' +
      '<div class="small muted">' + MEAL_NAMES[it.meal] + ' · ' +
      '<span class="stars">' + starString(it.avg) + '</span> ' +
      it.avg.toFixed(1) + ' (' + it.count + ' reviews)</div></div>';
    box.appendChild(row);
    loadPhotoInto("itemPhotos", it.id, row.querySelector("img"));
  }
}

document.getElementById("canteen-rate-button").onclick = async function () {
  const clean = getStarPicker("pick-clean");
  const health = getStarPicker("pick-health");
  const quality = getStarPicker("pick-quality");
  const msg = document.getElementById("canteen-rate-message");

  if (currentUser === null) {
    showLoginBox("Sign in with your TIFRH email to rate the canteen.");
    return;
  }

  if (clean === 0 || health === 0 || quality === 0) {
    msg.textContent = "Please give stars for all three.";
    return;
  }

  try {
    await setDoc(doc(db, "canteenRatings", currentUser.uid), {
      cleanliness: clean,
      health: health,
      quality: quality,
      time: Date.now()
    });
    msg.textContent = "Thanks! Your rating is saved.";
    showHomePage();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};


// ---------------- announcements (home page) ----------------
// The yellow box only appears when there is at least one announcement.

async function showAnnouncements() {
  const section = document.getElementById("announcement-section");
  const list = document.getElementById("announcement-list");

  const snap = await getDocs(collection(db, "announcements"));
  if (snap.docs.length === 0) {
    section.style.display = "none";
    return;
  }

  // newest first
  const docs = snap.docs.slice();
  docs.sort(function (a, b) { return b.data().time - a.data().time; });

  list.innerHTML = "";
  for (const d of docs) {
    const a = d.data();
    const div = document.createElement("div");
    div.className = "announce-item";
    div.innerHTML =
      '<div class="announce-text">' + escapeHtml(a.text) + '</div>' +
      '<div class="announce-date">' + dateText(a.time) + '</div>';
    list.appendChild(div);
  }
  section.style.display = "block";
}


// ---------------- polls (home page) ----------------
// The poll box only appears when at least one poll is open.
// Anyone can see the results. Only signed-in TIFRH people can vote,
// one vote per person per poll (voting again changes the vote).

async function showPolls() {
  const section = document.getElementById("poll-section");
  const list = document.getElementById("poll-list");

  const pollsSnap = await getDocs(collection(db, "polls"));
  const openPolls = [];
  for (const d of pollsSnap.docs) {
    if (d.data().active === true) openPolls.push(d);
  }
  if (openPolls.length === 0) {
    section.style.display = "none";
    return;
  }
  openPolls.sort(function (a, b) { return b.data().time - a.data().time; });

  // count the votes: voteCount["pollId_2"] = how many chose option 2 in that poll
  const votesSnap = await getDocs(collection(db, "votes"));
  const voteCount = {};
  const totalVotes = {};
  const myChoice = {};
  for (const v of votesSnap.docs) {
    const vote = v.data();
    const key = vote.pollId + "_" + vote.choice;
    if (voteCount[key] === undefined) voteCount[key] = 0;
    voteCount[key] += 1;
    if (totalVotes[vote.pollId] === undefined) totalVotes[vote.pollId] = 0;
    totalVotes[vote.pollId] += 1;
    if (currentUser !== null && vote.uid === currentUser.uid) myChoice[vote.pollId] = vote.choice;
  }

  list.innerHTML = "";
  for (const d of openPolls) {
    const poll = d.data();
    const pollId = d.id;
    const total = totalVotes[pollId] || 0;

    const box = document.createElement("div");
    box.className = "poll";
    box.innerHTML = '<p class="poll-question">' + escapeHtml(poll.question) + '</p>';

    for (let i = 0; i < poll.options.length; i++) {
      const n = voteCount[pollId + "_" + i] || 0;
      let percent = 0;
      if (total > 0) percent = Math.round(n / total * 100);

      let tick = "";
      if (myChoice[pollId] === i) tick = " ✓";

      const button = document.createElement("button");
      button.className = "poll-option";
      if (myChoice[pollId] === i) button.className = "poll-option my-vote";
      button.innerHTML =
        '<span class="poll-fill" style="width: ' + percent + '%;"></span>' +
        '<span class="poll-label"><b>' + escapeHtml(poll.options[i]) + tick + '</b>' +
        '<span>' + percent + '% (' + n + ')</span></span>';
      button.onclick = function () { castVote(pollId, i); };
      box.appendChild(button);
    }

    const foot = document.createElement("p");
    foot.className = "muted small";
    let footText = total + " votes";
    if (total === 1) footText = "1 vote";
    if (myChoice[pollId] === undefined) footText += " · tap an option to vote";
    else footText += " · tap another option to change your vote";
    foot.textContent = footText;
    box.appendChild(foot);

    list.appendChild(box);
  }
  section.style.display = "block";
}

async function castVote(pollId, choice) {
  if (currentUser === null) {
    showLoginBox("Sign in with your TIFRH email to vote.");
    return;
  }
  try {
    await setDoc(doc(db, "votes", pollId + "_" + currentUser.uid), {
      pollId: pollId,
      uid: currentUser.uid,
      choice: choice,
      time: Date.now()
    });
    showPolls();
  } catch (error) {
    alert("Could not save your vote: " + error.message);
  }
}


// ---------------- recent feedback slider ----------------
// Moves one card every SLIDE_EVERY_MS. When someone touches, drags or
// hovers over it, it waits a few seconds before moving again.

let sliderPausedUntil = 0;

function slideRecent(direction) {
  const track = document.getElementById("recent-list");
  const firstCard = track.querySelector(".recent-card");
  if (firstCard === null) return;

  const step = firstCard.offsetWidth + 16;   // card width + gap
  const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 5;
  const atStart = track.scrollLeft <= 5;

  if (direction > 0 && atEnd) track.scrollTo({ left: 0, behavior: "smooth" });           // wrap to first
  else if (direction < 0 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: "smooth" });  // wrap to last
  else track.scrollBy({ left: direction * step, behavior: "smooth" });
}

function pauseSlider(milliseconds) {
  sliderPausedUntil = Date.now() + milliseconds;
}

setInterval(function () {
  if (Date.now() < sliderPausedUntil) return;
  if (document.getElementById("home-view").style.display === "none") return;
  if (document.hidden) return;
  slideRecent(1);
}, SLIDE_EVERY_MS);

document.getElementById("recent-next").onclick = function () {
  pauseSlider(5000);
  slideRecent(1);
};
document.getElementById("recent-prev").onclick = function () {
  pauseSlider(5000);
  slideRecent(-1);
};

// Phones: swiping already works (the box scrolls sideways). Just pause while touching.
const sliderTrack = document.getElementById("recent-list");
sliderTrack.addEventListener("touchstart", function () { pauseSlider(6000); }, { passive: true });
sliderTrack.addEventListener("mousemove", function () { pauseSlider(3000); });

// Computers: hold the mouse button and drag to slide.
let dragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartScroll = 0;

sliderTrack.addEventListener("mousedown", function (e) {
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartScroll = sliderTrack.scrollLeft;
  sliderTrack.classList.add("dragging");   // turns snapping off while dragging
  pauseSlider(6000);
  e.preventDefault();
});

window.addEventListener("mousemove", function (e) {
  if (!dragging) return;
  const moved = e.clientX - dragStartX;
  if (Math.abs(moved) > 5) dragMoved = true;
  sliderTrack.scrollLeft = dragStartScroll - moved;
  pauseSlider(6000);
});

window.addEventListener("mouseup", function () {
  if (!dragging) return;
  dragging = false;
  sliderTrack.classList.remove("dragging");   // snapping back on: lands neatly on a card
});

// After a drag, don't treat letting go of the mouse as a click on a card
sliderTrack.addEventListener("click", function (e) {
  if (dragMoved) {
    e.preventDefault();
    dragMoved = false;
  }
}, true);


// ============================================================
// MEAL PAGE
// ============================================================

async function showMealPage(meal) {
  document.getElementById("meal-view").style.display = "block";

  let title = meal;
  if (MEAL_NAMES[meal] !== undefined) title = MEAL_NAMES[meal] + " Menu";
  document.getElementById("meal-title").textContent = title;

  const box = document.getElementById("meal-items");
  box.innerHTML = '<p class="muted">Loading...</p>';

  const itemsSnap = await getDocs(query(collection(db, "items"), where("meal", "==", meal)));
  const reviewsSnap = await getDocs(query(collection(db, "reviews"), where("meal", "==", meal)));

  const starSum = {};
  const starCount = {};
  const commentCount = {};
  for (const d of reviewsSnap.docs) {
    const r = d.data();
    if (starSum[r.itemId] === undefined) {
      starSum[r.itemId] = 0;
      starCount[r.itemId] = 0;
      commentCount[r.itemId] = 0;
    }
    starSum[r.itemId] += r.stars;
    starCount[r.itemId] += 1;
    if (r.comment !== "") commentCount[r.itemId] += 1;
  }

  // order by the first day each item is served (Mon first ... Sun last),
  // and alphabetically for items that start on the same day
  const docs = itemsSnap.docs.slice();
  docs.sort(function (a, b) {
    let firstA = 7;
    let firstB = 7;
    for (let i = 0; i < DAY_NAMES.length; i++) {
      if (firstA === 7 && a.data().days.includes(DAY_NAMES[i])) firstA = i;
      if (firstB === 7 && b.data().days.includes(DAY_NAMES[i])) firstB = i;
    }
    if (firstA !== firstB) return firstA - firstB;
    return a.data().name.localeCompare(b.data().name);
  });

  box.innerHTML = "";
  if (docs.length === 0) {
    box.innerHTML = '<p class="muted">No items added yet.</p>';
    return;
  }

  const today = todayName();

  for (const d of docs) {
    const item = d.data();
    const n = starCount[d.id] || 0;
    const c = commentCount[d.id] || 0;

    let parts = item.parts;
    if (parts === undefined) parts = [];

    let ratingPill = '<span class="rating-pill">No ratings yet</span>';
    if (n > 0) {
      const avg = starSum[d.id] / n;
      ratingPill =
        '<span class="rating-pill"><span class="star-icon">★</span> ' + avg.toFixed(1) +
        ' <span class="pill-count">(' + n + ')</span></span>';
    }

    let todayPill = "";
    if (item.days.includes(today)) todayPill = '<span class="today-pill">Available today</span>';

    let partsLine = "";
    if (parts.length > 0) partsLine = '<p class="small">Includes: ' + escapeHtml(parts.join(", ")) + '</p>';

    const card = document.createElement("a");
    card.className = "item-card";
    card.href = "#item/" + d.id;
    card.innerHTML =
      '<div class="item-photo">' +
        '<span class="item-photo-name">' + escapeHtml(item.name) + '</span>' +
        '<img alt="">' +
        todayPill +
        ratingPill +
      '</div>' +
      '<div class="item-body">' +
        '<div class="day-chips">' + dayChipsHtml(item.days) + '</div>' +
        '<div class="item-title-row"><h3>' + escapeHtml(item.name) + '</h3>' +
        '<span class="mrp">MRP ₹' + item.mrp + '</span></div>' +
        partsLine +
        '<p class="muted small">' + c + ' student/staff comments &amp; improvement tips</p>' +
        '<div class="item-divider"></div>' +
        '<span class="btn btn-dark btn-full">💬 View Reviews &amp; Rate</span>' +
      '</div>';
    box.appendChild(card);
    loadPhotoInto("itemPhotos", d.id, card.querySelector("img"));
  }
}


// ============================================================
// ITEM PAGE
// ============================================================

async function showItemPage(itemId) {
  document.getElementById("item-view").style.display = "block";

  // reset the review form
  setStarPicker("pick-review", 0);
  document.getElementById("review-comment").value = "";
  document.getElementById("review-photo").value = "";
  document.getElementById("review-message").textContent = "";
  document.getElementById("review-delete").style.display = "none";
  document.getElementById("review-list").innerHTML = '<p class="muted small">Loading...</p>';
  document.getElementById("parts-section").style.display = "none";
  const bigPhoto = document.getElementById("item-photo");
  bigPhoto.style.display = "none";

  const itemSnap = await getDoc(doc(db, "items", itemId));
  if (!itemSnap.exists()) {
    document.getElementById("item-name").textContent = "Item not found";
    document.getElementById("review-list").innerHTML = "";
    return;
  }

  const item = itemSnap.data();
  currentItemId = itemId;
  currentItemMeal = item.meal;
  myExistingReview = null;

  document.getElementById("item-back").href = "#meal/" + item.meal;
  document.getElementById("item-back").textContent = "← Back to " + MEAL_NAMES[item.meal];
  document.getElementById("item-photo-name").textContent = item.name;
  document.getElementById("item-name").textContent = item.name;
  document.getElementById("item-price").textContent = "MRP ₹" + item.mrp;
  document.getElementById("item-days").innerHTML = dayChipsHtml(item.days);
  loadPhotoInto("itemPhotos", itemId, bigPhoto);

  // the parts of a thali (if the admin listed any)
  let parts = item.parts;
  if (parts === undefined) parts = [];
  if (parts.length > 0) {
    document.getElementById("review-card-title").textContent = "Overall rating for the whole " + item.name;
    showParts(itemId, parts);
  } else {
    document.getElementById("review-card-title").textContent = "Rate & comment";
  }

  const reviewsSnap = await getDocs(query(collection(db, "reviews"), where("itemId", "==", itemId)));

  // newest first
  const docs = reviewsSnap.docs.slice();
  docs.sort(function (a, b) { return b.data().time - a.data().time; });

  let sum = 0;
  for (const d of docs) sum += d.data().stars;
  if (docs.length > 0) {
    const avg = sum / docs.length;
    document.getElementById("item-rating-number").textContent = avg.toFixed(1);
    document.getElementById("item-rating-stars").textContent = starString(avg);
    document.getElementById("item-rating-count").textContent = docs.length + " ratings";
  } else {
    document.getElementById("item-rating-number").textContent = "";
    document.getElementById("item-rating-stars").textContent = "";
    document.getElementById("item-rating-count").textContent = "No ratings yet. Be the first!";
  }

  const list = document.getElementById("review-list");
  list.innerHTML = "";
  if (docs.length === 0) list.innerHTML = '<p class="muted small">No reviews yet.</p>';

  for (const d of docs) {
    const r = d.data();

    if (currentUser !== null && r.uid === currentUser.uid) {
      myExistingReview = r;
      setStarPicker("pick-review", r.stars);
      document.getElementById("review-comment").value = r.comment;
      document.getElementById("review-delete").style.display = "inline-flex";
    }

    let commentHtml = "";
    if (r.comment !== "") commentHtml = '<p class="recent-comment">"' + escapeHtml(r.comment) + '"</p>';
    else commentHtml = '<p class="muted small">(rating only, no comment)</p>';

    const div = document.createElement("div");
    div.className = "review";
    div.innerHTML =
      '<div class="review-head"><span class="stars">' + starString(r.stars) + '</span></div>' +
      commentHtml;

    if (r.hasPhoto) {
      const img = document.createElement("img");
      img.className = "review-photo";
      img.onclick = function () { img.classList.toggle("zoomed"); };
      div.appendChild(img);
      loadPhotoInto("photos", d.id, img);
    }

    const foot = document.createElement("div");
    foot.className = "recent-foot";
    foot.innerHTML =
      '<span class="reviewer-name">TIFRH member</span>' +
      '<span>' + dateText(r.time) + '</span>';
    div.appendChild(foot);

    // names are only readable by signed-in TIFRH people; everyone else sees "TIFRH member"
    if (currentUser !== null) loadNameInto(d.id, foot.querySelector(".reviewer-name"));

    if (isAdmin()) {
      const del = document.createElement("button");
      del.className = "btn btn-outline btn-small";
      del.style.marginTop = "10px";
      del.textContent = "Delete (admin)";
      del.onclick = function () { deleteReview(d.id, r.hasPhoto); };
      div.appendChild(del);
    }

    list.appendChild(div);
  }
}

document.getElementById("review-submit").onclick = async function () {
  const stars = getStarPicker("pick-review");
  const comment = document.getElementById("review-comment").value.trim();
  const fileInput = document.getElementById("review-photo");
  const msg = document.getElementById("review-message");
  const button = document.getElementById("review-submit");

  if (currentUser === null) {
    showLoginBox("Sign in with your TIFRH email to post your review.");
    return;
  }

  if (stars === 0) {
    msg.textContent = "Please choose 1 to 5 stars.";
    return;
  }

  const reviewId = currentItemId + "_" + currentUser.uid;

  let hasPhoto = false;
  if (myExistingReview !== null) hasPhoto = myExistingReview.hasPhoto;

  button.disabled = true;
  msg.textContent = "Posting...";
  try {
    if (fileInput.files.length > 0) {
      const image = await compressImage(fileInput.files[0], 800);
      await setDoc(doc(db, "photos", reviewId), {
        uid: currentUser.uid,
        itemId: currentItemId,
        image: image
      });
      hasPhoto = true;
    }

    // the name goes in its own document, which only TIFRH people can read
    await setDoc(doc(db, "reviewNames", reviewId), {
      uid: currentUser.uid,
      itemId: currentItemId,
      name: currentUser.email.split("@")[0]
    });

    await setDoc(doc(db, "reviews", reviewId), {
      itemId: currentItemId,
      meal: currentItemMeal,
      uid: currentUser.uid,
      stars: stars,
      comment: comment,
      hasPhoto: hasPhoto,
      time: Date.now()
    });

    msg.textContent = "Posted. Thank you!";
    showItemPage(currentItemId);
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
  button.disabled = false;
};

document.getElementById("review-delete").onclick = function () {
  if (myExistingReview === null) return;
  deleteReview(currentItemId + "_" + currentUser.uid, myExistingReview.hasPhoto);
};

async function deleteReview(reviewId, hasPhoto) {
  if (!window.confirm("Delete this review?")) return;
  try {
    await deleteDoc(doc(db, "reviews", reviewId));
    if (hasPhoto) await deleteDoc(doc(db, "photos", reviewId));
    await deleteDoc(doc(db, "reviewNames", reviewId));
    showItemPage(currentItemId);
  } catch (error) {
    alert("Error: " + error.message);
  }
}


// ---------------- parts of a thali (item page) ----------------
// Each part (Roti, Dal, ...) is a row that opens to show:
// stars + comment box + Post button, and what others said about that part.

async function showParts(itemId, parts) {
  const section = document.getElementById("parts-section");
  const list = document.getElementById("parts-list");

  const snap = await getDocs(query(collection(db, "partReviews"), where("itemId", "==", itemId)));

  // newest first
  const allPartReviews = snap.docs.slice();
  allPartReviews.sort(function (a, b) { return b.data().time - a.data().time; });

  list.innerHTML = "";
  for (let i = 0; i < parts.length; i++) {
    const partName = parts[i];
    const key = partKey(partName);

    // the reviews for this one part
    const reviewsForPart = [];
    for (const d of allPartReviews) {
      if (d.data().part === key) reviewsForPart.push(d);
    }

    let sum = 0;
    for (const d of reviewsForPart) sum += d.data().stars;
    let ratingText = '<span class="muted">No ratings yet</span>';
    if (reviewsForPart.length > 0) {
      const avg = sum / reviewsForPart.length;
      ratingText = '<span class="stars">' + starString(avg) + '</span> ' + avg.toFixed(1) +
        ' <span class="muted">(' + reviewsForPart.length + ')</span>';
    }

    const row = document.createElement("details");
    row.className = "part-row";
    row.innerHTML =
      '<summary>' +
        '<span class="part-name">' + escapeHtml(partName) + '</span>' +
        '<span class="part-rating">' + ratingText + '</span>' +
        '<span class="part-open">Rate / comment ▾</span>' +
      '</summary>' +
      '<div class="part-body">' +
        '<div class="star-picker" id="pick-part-' + i + '"></div>' +
        '<textarea id="part-comment-' + i + '" maxlength="500" placeholder="How was the ' + escapeHtml(partName) + '?"></textarea>' +
        '<button class="btn btn-dark" id="part-submit-' + i + '">Post</button> ' +
        '<span class="small" id="part-message-' + i + '"></span>' +
        '<div class="part-comments" id="part-comments-' + i + '"></div>' +
      '</div>';
    list.appendChild(row);
    setupStarPicker("pick-part-" + i);

    // comments for this part, and fill in my old rating if I gave one
    const commentsBox = document.getElementById("part-comments-" + i);
    for (const d of reviewsForPart) {
      const r = d.data();

      if (currentUser !== null && r.uid === currentUser.uid) {
        setStarPicker("pick-part-" + i, r.stars);
        document.getElementById("part-comment-" + i).value = r.comment;
      }

      if (r.comment === "") continue;

      const div = document.createElement("div");
      div.className = "review";
      div.innerHTML =
        '<span class="stars">' + starString(r.stars) + '</span>' +
        '<p class="recent-comment">"' + escapeHtml(r.comment) + '"</p>' +
        '<div class="recent-foot"><span class="reviewer-name">TIFRH member</span><span>' + dateText(r.time) + '</span></div>';
      if (currentUser !== null) loadNameInto(d.id, div.querySelector(".reviewer-name"));

      if (isAdmin()) {
        const del = document.createElement("button");
        del.className = "btn btn-outline btn-small";
        del.style.marginTop = "8px";
        del.textContent = "Delete (admin)";
        del.onclick = function () { deletePartReview(d.id); };
        div.appendChild(del);
      }
      commentsBox.appendChild(div);
    }

    document.getElementById("part-submit-" + i).onclick = function () {
      postPartReview(i, partName, key);
    };
  }

  section.style.display = "block";
}

async function postPartReview(i, partName, key) {
  const msg = document.getElementById("part-message-" + i);

  if (currentUser === null) {
    showLoginBox("Sign in with your TIFRH email to rate the " + partName + ".");
    return;
  }

  const stars = getStarPicker("pick-part-" + i);
  const comment = document.getElementById("part-comment-" + i).value.trim();
  if (stars === 0) {
    msg.textContent = "Please choose 1 to 5 stars.";
    return;
  }

  const reviewId = currentItemId + "_" + key + "_" + currentUser.uid;

  msg.textContent = "Posting...";
  try {
    await setDoc(doc(db, "reviewNames", reviewId), {
      uid: currentUser.uid,
      itemId: currentItemId,
      part: key,
      name: currentUser.email.split("@")[0]
    });
    await setDoc(doc(db, "partReviews", reviewId), {
      itemId: currentItemId,
      part: key,
      partName: partName,
      uid: currentUser.uid,
      stars: stars,
      comment: comment,
      time: Date.now()
    });
    msg.textContent = "Posted. Thank you!";
    showItemPage(currentItemId);
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
}

async function deletePartReview(reviewId) {
  if (!window.confirm("Delete this comment?")) return;
  try {
    await deleteDoc(doc(db, "partReviews", reviewId));
    await deleteDoc(doc(db, "reviewNames", reviewId));
    showItemPage(currentItemId);
  } catch (error) {
    alert("Error: " + error.message);
  }
}


// ============================================================
// COMMITTEE PAGE
// ============================================================

async function showCommitteePage() {
  document.getElementById("committee-view").style.display = "block";

  if (isAdmin()) document.getElementById("committee-admin").style.display = "block";
  else document.getElementById("committee-admin").style.display = "none";

  const list = document.getElementById("committee-list");
  list.innerHTML = '<p class="muted">Loading...</p>';

  const snap = await getDocs(collection(db, "committee"));
  const docs = snap.docs.slice();
  // by the "order" number first, then by name
  docs.sort(function (a, b) {
    if (a.data().order !== b.data().order) return a.data().order - b.data().order;
    return a.data().name.localeCompare(b.data().name);
  });

  list.innerHTML = "";
  if (docs.length === 0) {
    list.innerHTML = '<p class="muted">Committee members will be listed here soon.</p>';
    return;
  }

  for (const d of docs) {
    const m = d.data();

    // photo, or the first letter of the name if there is no photo
    let photoHtml = escapeHtml(m.name.charAt(0).toUpperCase());
    if (m.image) photoHtml = '<img alt="">';

    const card = document.createElement("div");
    card.className = "member-card";
    card.innerHTML =
      '<div class="member-photo">' + photoHtml + '</div>' +
      '<p class="member-name">' + escapeHtml(m.name) + '</p>' +
      '<span class="member-position">' + escapeHtml(m.position) + '</span>';
    if (m.image) card.querySelector("img").src = m.image;

    if (isAdmin()) {
      const buttons = document.createElement("div");
      buttons.className = "member-admin";

      const editButton = document.createElement("button");
      editButton.className = "btn btn-green btn-small";
      editButton.textContent = "Edit";
      editButton.onclick = function () { fillCommitteeForm(d.id, m); };
      buttons.appendChild(editButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-outline btn-small";
      deleteButton.textContent = "Delete";
      deleteButton.onclick = function () { deleteMember(d.id, m.name); };
      buttons.appendChild(deleteButton);

      card.appendChild(buttons);
    }

    list.appendChild(card);
  }
}

function clearCommitteeForm() {
  editingMemberId = null;
  document.getElementById("committee-form-title").textContent = "Add a committee member";
  document.getElementById("committee-name").value = "";
  document.getElementById("committee-position").value = "";
  document.getElementById("committee-order").value = "";
  document.getElementById("committee-photo").value = "";
}

function fillCommitteeForm(memberId, m) {
  editingMemberId = memberId;
  document.getElementById("committee-form-title").textContent = "Edit: " + m.name;
  document.getElementById("committee-name").value = m.name;
  document.getElementById("committee-position").value = m.position;
  document.getElementById("committee-order").value = m.order;
  document.getElementById("committee-photo").value = "";
  document.getElementById("committee-admin").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("committee-clear").onclick = clearCommitteeForm;

document.getElementById("committee-save").onclick = async function () {
  const msg = document.getElementById("committee-message");
  const name = document.getElementById("committee-name").value.trim();
  const position = document.getElementById("committee-position").value.trim();
  let order = parseInt(document.getElementById("committee-order").value);
  if (isNaN(order)) order = 99;   // no number given: put at the end
  const fileInput = document.getElementById("committee-photo");

  if (name === "" || position === "") {
    msg.textContent = "Please fill name and position.";
    return;
  }

  let memberId = editingMemberId;
  let image = "";

  msg.textContent = "Saving...";
  try {
    if (memberId === null) {
      memberId = doc(collection(db, "committee")).id;   // new random id
    } else {
      // editing: keep the old photo unless a new one was chosen
      const old = await getDoc(doc(db, "committee", memberId));
      if (old.exists() && old.data().image) image = old.data().image;
    }

    if (fileInput.files.length > 0) image = await compressImage(fileInput.files[0], 400);

    await setDoc(doc(db, "committee", memberId), {
      name: name,
      position: position,
      order: order,
      image: image
    });

    msg.textContent = "Saved " + name + ".";
    clearCommitteeForm();
    showCommitteePage();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};

async function deleteMember(memberId, name) {
  if (!window.confirm("Remove " + name + " from the committee page?")) return;
  try {
    await deleteDoc(doc(db, "committee", memberId));
    showCommitteePage();
  } catch (error) {
    alert("Error: " + error.message);
  }
}


// ============================================================
// GALLERY PAGE
// ============================================================

async function showGalleryPage() {
  document.getElementById("gallery-view").style.display = "block";

  if (isAdmin()) document.getElementById("gallery-admin").style.display = "block";
  else document.getElementById("gallery-admin").style.display = "none";

  const list = document.getElementById("gallery-list");
  list.innerHTML = '<p class="muted">Loading...</p>';

  const snap = await getDocs(collection(db, "gallery"));
  const docs = snap.docs.slice();
  docs.sort(function (a, b) { return b.data().time - a.data().time; });   // newest first

  list.innerHTML = "";
  if (docs.length === 0) {
    list.innerHTML = '<p class="muted">No photos yet.</p>';
    return;
  }

  for (const d of docs) {
    const g = d.data();
    const tile = document.createElement("div");
    tile.className = "gallery-tile";

    const img = document.createElement("img");
    img.src = g.image;
    img.alt = g.caption;
    img.onclick = function () { openLightbox(g.image, g.caption); };
    tile.appendChild(img);

    const caption = document.createElement("div");
    caption.className = "gallery-caption";
    let captionHtml = "";
    if (g.caption !== "") captionHtml = escapeHtml(g.caption) + "<br>";
    caption.innerHTML = captionHtml + '<span class="muted">' + dateText(g.time) + '</span>';
    tile.appendChild(caption);

    if (isAdmin()) {
      const del = document.createElement("button");
      del.className = "btn btn-outline btn-small";
      del.textContent = "Delete";
      del.onclick = function () { deleteGalleryPhoto(d.id); };
      tile.appendChild(del);
    }

    list.appendChild(tile);
  }
}

function openLightbox(image, caption) {
  document.getElementById("lightbox-img").src = image;
  document.getElementById("lightbox-caption").textContent = caption;
  document.getElementById("lightbox").classList.add("open");
}

document.getElementById("lightbox").onclick = function () {
  document.getElementById("lightbox").classList.remove("open");
};

document.getElementById("gallery-upload").onclick = async function () {
  const msg = document.getElementById("gallery-message");
  const caption = document.getElementById("gallery-caption").value.trim();
  const files = document.getElementById("gallery-photos").files;

  if (files.length === 0) {
    msg.textContent = "Please choose at least one photo.";
    return;
  }

  try {
    for (let i = 0; i < files.length; i++) {
      msg.textContent = "Uploading " + (i + 1) + " of " + files.length + "...";
      const image = await compressImage(files[i], 1200);
      const newId = doc(collection(db, "gallery")).id;
      await setDoc(doc(db, "gallery", newId), {
        image: image,
        caption: caption,
        time: Date.now()
      });
    }
    msg.textContent = "Uploaded " + files.length + " photo(s).";
    document.getElementById("gallery-caption").value = "";
    document.getElementById("gallery-photos").value = "";
    showGalleryPage();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};

async function deleteGalleryPhoto(photoId) {
  if (!window.confirm("Delete this photo from the gallery?")) return;
  try {
    await deleteDoc(doc(db, "gallery", photoId));
    showGalleryPage();
  } catch (error) {
    alert("Error: " + error.message);
  }
}


// ============================================================
// ADMIN PAGE
// ============================================================

async function showAdminPage() {
  if (!isAdmin()) {
    window.location.hash = "";
    return;
  }
  document.getElementById("admin-view").style.display = "block";

  showAdminAnnouncements();
  showAdminPolls();

  const list = document.getElementById("admin-list");
  list.innerHTML = '<p class="muted small">Loading...</p>';

  const snap = await getDocs(collection(db, "items"));
  const docs = snap.docs.slice();
  docs.sort(function (a, b) {
    const ma = MEAL_ORDER.indexOf(a.data().meal);
    const mb = MEAL_ORDER.indexOf(b.data().meal);
    if (ma !== mb) return ma - mb;
    return a.data().name.localeCompare(b.data().name);
  });

  list.innerHTML = "";
  if (docs.length === 0) list.innerHTML = '<p class="muted small">No items yet. Add one above, or add the starter menu.</p>';

  let lastMeal = "";
  for (const d of docs) {
    const item = d.data();

    // a small heading each time the category changes
    if (item.meal !== lastMeal) {
      const heading = document.createElement("h3");
      heading.className = "admin-group";
      heading.textContent = MEAL_NAMES[item.meal] || item.meal;
      list.appendChild(heading);
      lastMeal = item.meal;
    }

    let partsText = "";
    if (item.parts !== undefined && item.parts.length > 0) partsText = " · " + item.parts.length + " parts";

    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<div class="item-photo small-thumb"><span class="item-photo-name">🍽️</span><img alt=""></div>' +
      '<div class="grow"><b>' + escapeHtml(item.name) + '</b>' +
      '<div class="small muted">₹' + item.mrp + ' · ' + item.days.join(", ") + partsText + '</div></div>';

    const editButton = document.createElement("button");
    editButton.className = "btn btn-green btn-small";
    editButton.textContent = "Edit";
    editButton.onclick = function () { fillAdminForm(d.id, item); };
    row.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn btn-outline btn-small";
    deleteButton.textContent = "Delete";
    deleteButton.onclick = function () { deleteItem(d.id, item.name); };
    row.appendChild(deleteButton);

    list.appendChild(row);
    loadPhotoInto("itemPhotos", d.id, row.querySelector("img"));
  }
}


// ---------------- admin: announcements ----------------

async function showAdminAnnouncements() {
  const list = document.getElementById("admin-announce-list");
  const snap = await getDocs(collection(db, "announcements"));
  const docs = snap.docs.slice();
  docs.sort(function (a, b) { return b.data().time - a.data().time; });

  list.innerHTML = "";
  for (const d of docs) {
    const a = d.data();
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<div class="grow"><div class="announce-text">' + escapeHtml(a.text) + '</div>' +
      '<div class="small muted">' + dateText(a.time) + '</div></div>';

    const del = document.createElement("button");
    del.className = "btn btn-outline btn-small";
    del.textContent = "Delete";
    del.onclick = async function () {
      if (!window.confirm("Delete this announcement?")) return;
      await deleteDoc(doc(db, "announcements", d.id));
      showAdminAnnouncements();
    };
    row.appendChild(del);
    list.appendChild(row);
  }
}

document.getElementById("announce-post").onclick = async function () {
  const msg = document.getElementById("announce-message");
  const text = document.getElementById("announce-text").value.trim();
  if (text === "") {
    msg.textContent = "Please write the announcement first.";
    return;
  }
  try {
    const newId = doc(collection(db, "announcements")).id;
    await setDoc(doc(db, "announcements", newId), { text: text, time: Date.now() });
    document.getElementById("announce-text").value = "";
    msg.textContent = "Posted. It now shows on the home page.";
    showAdminAnnouncements();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};


// ---------------- admin: polls ----------------

async function showAdminPolls() {
  const list = document.getElementById("admin-poll-list");
  const pollsSnap = await getDocs(collection(db, "polls"));
  const votesSnap = await getDocs(collection(db, "votes"));

  const totalVotes = {};
  for (const v of votesSnap.docs) {
    const pollId = v.data().pollId;
    if (totalVotes[pollId] === undefined) totalVotes[pollId] = 0;
    totalVotes[pollId] += 1;
  }

  const docs = pollsSnap.docs.slice();
  docs.sort(function (a, b) { return b.data().time - a.data().time; });

  list.innerHTML = "";
  for (const d of docs) {
    const poll = d.data();

    let status = '<span class="status-closed">Closed</span>';
    if (poll.active) status = '<span class="status-open">Open</span>';

    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<div class="grow"><b>' + escapeHtml(poll.question) + '</b>' +
      '<div class="small muted">' + status + ' · ' + (totalVotes[d.id] || 0) + ' votes · ' +
      escapeHtml(poll.options.join(" / ")) + '</div></div>';

    const toggle = document.createElement("button");
    toggle.className = "btn btn-green btn-small";
    if (poll.active) toggle.textContent = "Close";
    else toggle.textContent = "Reopen";
    toggle.onclick = async function () {
      await setDoc(doc(db, "polls", d.id), {
        question: poll.question,
        options: poll.options,
        active: !poll.active,
        time: poll.time
      });
      showAdminPolls();
    };
    row.appendChild(toggle);

    const del = document.createElement("button");
    del.className = "btn btn-outline btn-small";
    del.textContent = "Delete";
    del.onclick = function () { deletePoll(d.id); };
    row.appendChild(del);

    list.appendChild(row);
  }
}

document.getElementById("poll-create").onclick = async function () {
  const msg = document.getElementById("poll-message");
  const question = document.getElementById("poll-question").value.trim();
  const lines = document.getElementById("poll-options").value.split("\n");

  const options = [];
  for (let i = 0; i < lines.length; i++) {
    const option = lines[i].trim();
    if (option !== "") options.push(option);
  }

  if (question === "") {
    msg.textContent = "Please write the question.";
    return;
  }
  if (options.length < 2 || options.length > 6) {
    msg.textContent = "Please give 2 to 6 options, one per line.";
    return;
  }

  try {
    const newId = doc(collection(db, "polls")).id;
    await setDoc(doc(db, "polls", newId), {
      question: question,
      options: options,
      active: true,
      time: Date.now()
    });
    document.getElementById("poll-question").value = "";
    document.getElementById("poll-options").value = "";
    msg.textContent = "Poll created. It now shows on the home page.";
    showAdminPolls();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};

async function deletePoll(pollId) {
  if (!window.confirm("Delete this poll and all its votes?")) return;
  try {
    const votesSnap = await getDocs(query(collection(db, "votes"), where("pollId", "==", pollId)));
    for (const v of votesSnap.docs) {
      await deleteDoc(doc(db, "votes", v.id));
    }
    await deleteDoc(doc(db, "polls", pollId));
    showAdminPolls();
  } catch (error) {
    alert("Error: " + error.message);
  }
}


// ---------------- admin: food items ----------------

function clearAdminForm() {
  editingItemId = null;
  document.getElementById("admin-form-title").textContent = "Add a food item";
  document.getElementById("admin-name").value = "";
  document.getElementById("admin-meal").value = "breakfast";
  document.getElementById("admin-mrp").value = "";
  document.getElementById("admin-parts").value = "";
  document.getElementById("admin-photo").value = "";
  const boxes = document.querySelectorAll("#admin-days input");
  for (let i = 0; i < boxes.length; i++) boxes[i].checked = false;
}

function fillAdminForm(itemId, item) {
  editingItemId = itemId;
  document.getElementById("admin-form-title").textContent = "Edit: " + item.name;
  document.getElementById("admin-name").value = item.name;
  document.getElementById("admin-meal").value = item.meal;
  document.getElementById("admin-mrp").value = item.mrp;
  document.getElementById("admin-photo").value = "";

  let parts = item.parts;
  if (parts === undefined) parts = [];
  document.getElementById("admin-parts").value = parts.join("\n");

  const boxes = document.querySelectorAll("#admin-days input");
  for (let i = 0; i < boxes.length; i++) {
    boxes[i].checked = item.days.includes(boxes[i].value);
  }
  document.getElementById("admin-form-title").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("admin-clear").onclick = clearAdminForm;

document.getElementById("admin-save").onclick = async function () {
  const msg = document.getElementById("admin-message");
  const name = document.getElementById("admin-name").value.trim();
  const meal = document.getElementById("admin-meal").value;
  const mrp = parseFloat(document.getElementById("admin-mrp").value);
  const fileInput = document.getElementById("admin-photo");

  const days = [];
  const boxes = document.querySelectorAll("#admin-days input");
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) days.push(boxes[i].value);
  }

  // one part per line, empty lines ignored
  const parts = [];
  const partLines = document.getElementById("admin-parts").value.split("\n");
  for (let i = 0; i < partLines.length; i++) {
    const part = partLines[i].trim();
    if (part !== "") parts.push(part);
  }

  if (name === "" || isNaN(mrp) || days.length === 0) {
    msg.textContent = "Please fill name, MRP and at least one day.";
    return;
  }

  let itemId = editingItemId;
  if (itemId === null) itemId = doc(collection(db, "items")).id;   // new random id

  msg.textContent = "Saving...";
  try {
    await setDoc(doc(db, "items", itemId), { name: name, meal: meal, mrp: mrp, days: days, parts: parts });

    if (fileInput.files.length > 0) {
      const image = await compressImage(fileInput.files[0], 600);
      await setDoc(doc(db, "itemPhotos", itemId), { image: image });
    }

    msg.textContent = "Saved " + name + ".";
    clearAdminForm();
    showAdminPage();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};

async function deleteItem(itemId, name) {
  if (!window.confirm("Delete " + name + "? Its reviews will no longer be shown.")) return;
  try {
    await deleteDoc(doc(db, "items", itemId));
    await deleteDoc(doc(db, "itemPhotos", itemId));
    showAdminPage();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// "Add starter menu" button: copies every item from starter-menu.js into the database,
// skipping ones that already exist with the same name in the same category.
document.getElementById("admin-seed").onclick = async function () {
  const msg = document.getElementById("admin-seed-message");
  const question =
    "Add the starter menu (" + STARTER_MENU.length + " items)?\n" +
    "Items that already exist with the same name in the same category are skipped.";
  if (!window.confirm(question)) return;

  msg.textContent = "Checking existing items...";
  try {
    const snap = await getDocs(collection(db, "items"));
    const existing = [];
    for (const d of snap.docs) {
      existing.push(d.data().meal + "|" + d.data().name.toLowerCase());
    }

    let added = 0;
    let skipped = 0;
    for (let i = 0; i < STARTER_MENU.length; i++) {
      const s = STARTER_MENU[i];
      const key = s.meal + "|" + s.name.toLowerCase();
      if (existing.includes(key)) {
        skipped += 1;
        continue;
      }
      let parts = [];
      if (s.parts !== undefined) parts = s.parts;
      const newId = doc(collection(db, "items")).id;
      await setDoc(doc(db, "items", newId), { name: s.name, meal: s.meal, mrp: s.mrp, days: s.days, parts: parts });
      added += 1;
      msg.textContent = "Added " + added + " items...";
    }

    msg.textContent = "Done. Added " + added + " items, skipped " + skipped + " that already existed.";
    showAdminPage();
  } catch (error) {
    msg.textContent = "Error: " + error.message;
  }
};
