const PEOPLE = [
  { id: "lea", name: "Lea", age: 27, city: "Berlin", distance: 3, job: "Architektin", bio: "Sammelt Orte, an denen man die Zeit vergisst. Sonntags am liebsten auf dem Flohmarkt.", interests: ["Architektur", "Kaffee", "Reisen", "Kunst"], image: "photo-1534528741775-53994a69daeb" },
  { id: "jonas", name: "Jonas", age: 29, city: "Berlin", distance: 5, job: "Musikproduzent", bio: "Immer auf der Suche nach dem perfekten kleinen Konzert und richtig guten Dumplings.", interests: ["Musik", "Kochen", "Reisen", "Kino"], image: "photo-1500648767791-00dcc994a43e" },
  { id: "amina", name: "Amina", age: 26, city: "Kreuzberg", distance: 2, job: "Ärztin", bio: "Lange Spaziergänge, kurze Nächte und die beste Pasta der Stadt. Überzeug mich vom Gegenteil.", interests: ["Laufen", "Kochen", "Kunst", "Natur"], image: "photo-1531123897727-8f129e1688ce" },
  { id: "felix", name: "Felix", age: 30, city: "Neukölln", distance: 7, job: "Fotograf", bio: "Analoge Kameras, spontane Zugtickets und ein Hund namens Miso.", interests: ["Fotografie", "Kaffee", "Natur", "Musik"], image: "photo-1506794778202-cad84cf45f1d" },
  { id: "sophie", name: "Sophie", age: 28, city: "Berlin", distance: 4, job: "Journalistin", bio: "Fragt gern nach. Schreibt selten über das Wetter. Hat immer einen Buchtipp dabei.", interests: ["Bücher", "Kino", "Kunst", "Reisen"], image: "photo-1524504388940-b1c1722653e1" },
  { id: "marco", name: "Marco", age: 31, city: "Friedrichshain", distance: 6, job: "Koch", bio: "Liebe geht durch den Magen. Ich fange schon mal mit selbstgemachter Pasta an.", interests: ["Kochen", "Kaffee", "Musik", "Laufen"], image: "photo-1504593811423-6dd665756598" },
  { id: "nina", name: "Nina", age: 25, city: "Berlin", distance: 8, job: "Illustratorin", bio: "Malt auf allem, was stillhält. Am liebsten in Cafés mit viel zu großen Fenstern.", interests: ["Kunst", "Bücher", "Natur", "Kino"], image: "photo-1529139574466-a303027c1d8b" },
  { id: "david", name: "David", age: 32, city: "Prenzlauer Berg", distance: 9, job: "Lehrer", bio: "Lernt gerade Gitarre. Die Nachbarschaft ist erstaunlich geduldig.", interests: ["Musik", "Reisen", "Laufen", "Architektur"], image: "photo-1517841905240-472988babdf9" }
];

const DEFAULT_PROFILE = { name: "Alex", age: 28, city: "Berlin", bio: "Am liebsten draußen, mit gutem Kaffee und noch besseren Gesprächen.", interests: ["Kaffee", "Reisen", "Kunst"], minAge: 24, maxAge: 34, maxDistance: 25 };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open("nah-dating", 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("users", { keyPath: "id" });
    request.result.createObjectStore("chats", { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let account = null;
let cryptoKey = null;
let page = "discover";
let selectedPerson = null;
let activeCallStream = null;
let callStartedAt = 0;
let callClock = null;
let filters = { minAge: 18, maxAge: 45, interest: "" };

function dbRequest(store, mode, action) {
  return dbPromise.then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
const dbGet = (store, key) => dbRequest(store, "readonly", (objectStore) => objectStore.get(key));
const dbPut = (store, value) => dbRequest(store, "readwrite", (objectStore) => objectStore.put(value));
const dbAll = (store) => dbRequest(store, "readonly", (objectStore) => objectStore.getAll());

function bytesToBase64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }

async function deriveCredentials(password, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, 512));
  const hash = bytesToBase64(bits.slice(0, 32));
  const key = await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { hash, key };
}

async function encryptMessage(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoder.encode(text));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decryptMessage(message) {
  try {
    const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(message.iv) }, cryptoKey, base64ToBytes(message.ciphertext));
    return decoder.decode(result);
  } catch { return "Diese Nachricht kann nicht entschlüsselt werden."; }
}

async function saveAccount() { await dbPut("users", account); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function photo(person, size = "w=1000") { return `https://images.unsplash.com/${person.image}?auto=format&fit=crop&${size}&q=85`; }

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function icon(name) {
  const paths = {
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
    bookmark: '<path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 8.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function matchingScore(person) {
  const shared = person.interests.filter((interest) => account.profile.interests.includes(interest));
  return { shared, score: Math.min(99, 68 + shared.length * 7 + (person.city === account.profile.city ? 3 : 0)) };
}

function filteredPeople() {
  return PEOPLE.filter((person) => person.age >= Number(filters.minAge) && person.age <= Number(filters.maxAge) && person.age >= account.profile.minAge && person.age <= account.profile.maxAge && person.distance <= account.profile.maxDistance && (!filters.interest || person.interests.includes(filters.interest)) && !(filters.skipped || []).includes(person.id) && !account.likes.includes(person.id));
}

function renderPersonCard(person) {
  const { shared, score } = matchingScore(person);
  const saved = account.favorites.includes(person.id);
  return `<article class="person-card" data-person="${person.id}"><div class="person-image-wrap"><img class="person-image" src="${photo(person)}" alt="Porträt von ${person.name}"/><span class="match-score">${score}% Match</span><button class="icon-button save-person ${saved ? "is-saved" : ""}" data-action="favorite" data-id="${person.id}" aria-label="${saved ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}" title="Favorit">${icon("bookmark")}</button></div><div class="person-info"><div class="person-name-line"><h2>${person.name}, ${person.age}</h2><span class="online-dot" title="Kürzlich aktiv"></span></div><p class="person-meta">${person.job} <span>·</span> ${person.distance} km entfernt</p><p class="person-bio">${person.bio}</p><div class="tag-list">${shared.map((item) => `<span class="tag shared">${item}</span>`).join("")}${person.interests.filter((item) => !shared.includes(item)).slice(0, 2).map((item) => `<span class="tag">${item}</span>`).join("")}</div><div class="card-actions"><button class="skip-button" data-action="skip" data-id="${person.id}" aria-label="Überspringen" title="Überspringen">${icon("close")}</button><button class="pass-button" data-action="like" data-id="${person.id}">${icon("heart")}<span>Gefällt mir</span></button></div></div></article>`;
}

function renderDiscover() {
  const people = filteredPeople();
  $("#discover-content").innerHTML = people.length ? `<div class="discover-grid">${people.slice(0, 6).map(renderPersonCard).join("")}</div>` : `<div class="empty-state"><span class="empty-icon">${icon("spark")}</span><h2>Das war's für heute.</h2><p>Ändere deine Filter oder schau später wieder vorbei.</p><button class="text-button" data-action="reset-filters">Filter zurücksetzen</button></div>`;
  $("#discover-count").textContent = `${people.length} Menschen in deiner Nähe`;
}

function renderMatches() {
  const matches = PEOPLE.filter((person) => account.matches.includes(person.id));
  const favorites = PEOPLE.filter((person) => account.favorites.includes(person.id));
  $("#matches-content").innerHTML = `<div class="section-heading"><div><p class="eyebrow">EURE VERBINDUNG</p><h2>Deine Matches <span class="count-pill">${matches.length}</span></h2></div></div>${matches.length ? `<div class="people-grid">${matches.map((person) => `<button class="match-person" data-action="open-chat" data-id="${person.id}"><img src="${photo(person, "w=400")}" alt=""/><span><strong>${person.name}</strong><small>${matchingScore(person).shared.length} gemeinsame Interessen</small></span><span class="match-arrow">${icon("chat")}</span></button>`).join("")}</div>` : `<p class="muted-copy">Noch keine Matches. Ein Like auf beiden Seiten, und schon kann's losgehen.</p>`}<div class="section-heading favorites-heading"><div><p class="eyebrow">FÜR SPÄTER</p><h2>Favoriten <span class="count-pill">${favorites.length}</span></h2></div></div>${favorites.length ? `<div class="people-grid">${favorites.map((person) => `<button class="match-person" data-action="show-person" data-id="${person.id}"><img src="${photo(person, "w=400")}" alt=""/><span><strong>${person.name}</strong><small>${person.city} · ${person.distance} km</small></span><span class="match-arrow">${icon("heart")}</span></button>`).join("")}</div>` : `<p class="muted-copy">Hier erscheinen Profile, die du gespeichert hast.</p>`}`;
}

async function renderChat(personId = selectedPerson) {
  const chats = await dbGet("chats", account.id) || {};
  const available = PEOPLE.filter((person) => account.matches.includes(person.id));
  if (!personId || !available.some((person) => person.id === personId)) personId = available[0]?.id || null;
  selectedPerson = personId;
  const query = $("#chat-search").value.toLowerCase();
  const shown = available.filter((person) => person.name.toLowerCase().includes(query));
  $("#chat-list").innerHTML = shown.map((person) => `<button class="chat-contact ${person.id === personId ? "active" : ""}" data-action="select-chat" data-id="${person.id}"><img src="${photo(person, "w=160")}" alt=""/><span class="contact-copy"><strong>${person.name}</strong><small>${(chats[person.id] || []).length ? "Verschlüsselte Nachricht" : "Ihr habt euch gematcht"}</small></span>${(chats[person.id] || []).length ? "" : '<span class="new-dot"></span>'}</button>`).join("") || `<p class="muted-copy chat-empty">${available.length ? "Keine passenden Chats." : "Deine Matches warten auf der Entdecken-Seite."}</p>`;
  const person = PEOPLE.find((item) => item.id === personId);
  if (!person) {
    $("#chat-room").innerHTML = `<div class="empty-state"><span class="empty-icon">${icon("chat")}</span><h2>Ein gutes Gespräch fängt klein an.</h2><p>Entdecke Menschen, die zu dir passen.</p><button class="text-button" data-action="go-discover">Menschen entdecken</button></div>`;
    return;
  }
  const messages = chats[person.id] || [];
  const rendered = await Promise.all(messages.map(async (message) => `<div class="message ${message.from === "me" ? "mine" : "theirs"}"><p>${escapeHtml(await decryptMessage(message))}</p><time>${new Date(message.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time></div>`));
  $("#chat-room").innerHTML = `<header class="room-header"><img src="${photo(person, "w=160")}" alt=""/><div><strong>${person.name}</strong><span>${matchingScore(person).shared.length} gemeinsame Interessen</span></div><div class="room-actions"><button class="icon-button" data-action="call" data-mode="audio" data-id="${person.id}" title="Sprachanruf">${icon("phone")}</button><button class="icon-button" data-action="call" data-mode="video" data-id="${person.id}" title="Videoanruf">${icon("video")}</button></div></header><div class="chat-intro"><img src="${photo(person, "w=240")}" alt=""/><strong>Du und ${person.name}</strong><span>Ihr habt ${matchingScore(person).shared.length} gemeinsame Interessen. Ein guter Anfang.</span></div><div class="message-list" id="message-list">${rendered.join("")}</div><form class="message-form" id="message-form"><span class="message-lock">${icon("bookmark")}</span><input name="message" maxlength="1000" placeholder="Schreib ${person.name} eine Nachricht …" autocomplete="off" required/><button aria-label="Nachricht senden" title="Senden">${icon("send")}</button></form><p class="encryption-note">Nachrichten auf diesem Gerät verschlüsselt gespeichert</p>`;
  $("#message-list").scrollTop = $("#message-list").scrollHeight;
  $(".encryption-note").textContent = account.id === "demo" ? "Demo-Nachrichten lokal gespeichert" : "Auf diesem Gerät mit deinem Kontopasswort verschlüsselt";
  $("#message-form").addEventListener("submit", sendMessage);
}

async function sendMessage(event) {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const text = input.value.trim();
  if (!text || !selectedPerson) return;
  const chats = await dbGet("chats", account.id) || {};
  const messages = chats[selectedPerson] || [];
  messages.push({ ...await encryptMessage(text), from: "me", at: Date.now() });
  chats[selectedPerson] = messages;
  await dbPut("chats", { id: account.id, ...chats });
  await renderChat(selectedPerson);
}

function updateIdentity() {
  $("#sidebar-user-name").textContent = account.profile.name;
  $("#sidebar-user-avatar").textContent = account.profile.name.slice(0, 1).toUpperCase();
  $("#top-avatar").textContent = account.profile.name.slice(0, 1).toUpperCase();
  $("#profile-monogram").textContent = account.profile.name.slice(0, 1).toUpperCase();
  $("#match-nav-count").textContent = account.matches.length;
  $("#match-nav-count").classList.toggle("hidden", !account.matches.length);
  $("#favorite-nav-count").textContent = account.matches.length;
}

function renderProfile() {
  const profile = account.profile;
  $("#profile-name").textContent = profile.name;
  $("#profile-location").textContent = `${profile.age} Jahre · ${profile.city}`;
  $("#profile-bio").textContent = profile.bio;
  $("#profile-interests").innerHTML = profile.interests.map((interest) => `<span class="tag shared">${escapeHtml(interest)}</span>`).join("");
  $("#profile-editor").innerHTML = `<form id="profile-form" class="profile-form"><label>Vorname<input name="name" value="${escapeHtml(profile.name)}" maxlength="40" required/></label><div class="form-row"><label>Alter<input name="age" type="number" min="18" max="99" value="${profile.age}" required/></label><label>Stadt<input name="city" value="${escapeHtml(profile.city)}" maxlength="60" required/></label></div><label>Über mich<textarea name="bio" rows="3" maxlength="240">${escapeHtml(profile.bio)}</textarea></label><label>Interessen <span class="field-hint">Mit Komma trennen</span><input name="interests" value="${escapeHtml(profile.interests.join(", "))}" placeholder="Kaffee, Reisen, Kunst"/></label><p class="form-divider">Deine Präferenzen</p><div class="form-row"><label>Alter von<input name="minAge" type="number" min="18" max="99" value="${profile.minAge}" required/></label><label>Alter bis<input name="maxAge" type="number" min="18" max="99" value="${profile.maxAge}" required/></label></div><label>Maximale Entfernung <span class="distance-value">${profile.maxDistance} km</span><input name="maxDistance" type="range" min="5" max="100" step="5" value="${profile.maxDistance}"/></label><button class="primary-button save-profile" type="submit">Änderungen speichern</button></form>`;
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#profile-form [name=maxDistance]").addEventListener("input", (event) => { $(".distance-value").textContent = `${event.target.value} km`; });
}

async function saveProfile(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const minAge = Number(form.get("minAge"));
  const maxAge = Number(form.get("maxAge"));
  if (minAge > maxAge) return notify("Das Mindestalter muss kleiner als das Höchstalter sein.");
  account.profile = { name: form.get("name").trim(), age: Number(form.get("age")), city: form.get("city").trim(), bio: form.get("bio").trim(), interests: form.get("interests").split(",").map((value) => value.trim()).filter(Boolean), minAge, maxAge, maxDistance: Number(form.get("maxDistance")) };
  await saveAccount();
  updateIdentity();
  renderProfile();
  notify("Dein Profil wurde gespeichert.");
}

function showPage(name) {
  page = name;
  $$(".page-view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$("[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === name));
  const titles = { discover: ["Gute Begegnungen beginnen hier.", "Jemand, der zu dir passt, ist näher als du denkst."], matches: ["Es hat gefunkt.", "Alle Menschen, mit denen es sich lohnt weiterzureden."], chat: ["Zeit für ein gutes Gespräch.", "Eure Nachrichten bleiben auf deinem Gerät verschlüsselt."], profile: ["Zeig, wer du bist.", "Ein ehrliches Profil macht den Unterschied."] };
  $("#page-title").textContent = titles[name][0];
  $("#page-subtitle").textContent = name === "chat" && account.id === "demo" ? "Demo-Gespräche auf diesem Gerät." : titles[name][1];
  if (name === "discover") renderDiscover();
  if (name === "matches") renderMatches();
  if (name === "chat") renderChat();
  if (name === "profile") renderProfile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setAuthMode(mode) {
  $("#auth-form").dataset.mode = mode;
  $("#auth-title").textContent = mode === "register" ? "Dein Anfang beginnt hier." : "Schön, dass du wieder da bist.";
  $("#auth-copy").textContent = mode === "register" ? "Erstelle dein Konto und finde Menschen, die wirklich zu dir passen." : "Melde dich an und mach dort weiter, wo ihr aufgehört habt.";
  $("#auth-submit").textContent = mode === "register" ? "Konto erstellen" : "Anmelden";
  $("#auth-form [name=password]").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("#auth-form [name=password]").minLength = mode === "register" ? 8 : 1;
  $("#auth-switch-copy").textContent = mode === "register" ? "Du bist schon dabei?" : "Neu hier?";
  $("#auth-switch").textContent = mode === "register" ? "Anmelden" : "Konto erstellen";
}

async function chooseDemo() {
  const material = await crypto.subtle.importKey("raw", encoder.encode("nah-demo-local-key"), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode("nah-demo-local-salt"), iterations: 250000, hash: "SHA-256" }, material, 256);
  cryptoKey = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
  account = await dbGet("users", "demo");
  if (!account) {
    account = { id: "demo", email: "demo@nah.local", profile: { ...DEFAULT_PROFILE }, favorites: ["amina"], likes: [], matches: ["lea", "jonas", "amina"] };
    await saveAccount();
  }
  sessionStorage.setItem("nah-session", account.id);
  $("#auth-dialog").close();
  bootApp();
}

async function authenticate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = form.get("email").trim().toLowerCase();
  const password = form.get("password");
  const isRegister = $("#auth-form").dataset.mode === "register";
  const users = await dbAll("users");
  const existing = users.find((user) => user.email === email && user.id !== "demo");
  if (isRegister && existing) return notify("Für diese E-Mail gibt es bereits ein Konto.");
  if (!isRegister && !existing) return notify("Kein Konto gefunden. Registriere dich zuerst.");
  const salt = isRegister ? crypto.getRandomValues(new Uint8Array(16)) : base64ToBytes(existing.salt);
  const credentials = await deriveCredentials(password, salt);
  if (!isRegister && credentials.hash !== existing.passwordHash) return notify("Das Passwort stimmt nicht.");
  if (isRegister) {
    account = { id: crypto.randomUUID(), email, profile: { ...DEFAULT_PROFILE }, favorites: [], likes: [], matches: [], passwordHash: credentials.hash, salt: bytesToBase64(salt) };
    await saveAccount();
    notify("Dein Konto ist bereit. Vervollständige dein Profil.");
  } else account = existing;
  cryptoKey = credentials.key;
  sessionStorage.setItem("nah-session", account.id);
  $("#auth-dialog").close();
  bootApp();
}

async function bootApp() {
  updateIdentity();
  $("#app-shell").classList.remove("hidden");
  showPage("discover");
}

async function resumeSession() {
  const sessionId = sessionStorage.getItem("nah-session");
  if (sessionId === "demo") return chooseDemo();
  const user = sessionId && await dbGet("users", sessionId);
  if (user?.passwordHash) {
    account = user;
    $("#auth-dialog").showModal();
    setAuthMode("login");
    $("#auth-copy").textContent = "Gib dein Passwort ein, um deine verschlüsselten Nachrichten zu öffnen.";
    $("#auth-form [name=email]").value = account.email;
    return;
  }
  $("#auth-dialog").showModal();
}

async function handleAction(button) {
  const { action, id } = button.dataset;
  const person = PEOPLE.find((item) => item.id === id);
  if (action === "like" && person) {
    account.likes = [...new Set([...account.likes, id])];
    if (["lea", "amina", "sophie", "nina"].includes(id)) {
      account.matches = [...new Set([...account.matches, id])];
      notify(`Es hat gefunkt! Du und ${person.name} habt euch gematcht.`);
    } else notify(`Like an ${person.name} gesendet.`);
    await saveAccount(); updateIdentity(); renderDiscover();
  } else if (action === "favorite" && person) {
    account.favorites = account.favorites.includes(id) ? account.favorites.filter((item) => item !== id) : [...account.favorites, id];
    await saveAccount(); updateIdentity();
    if (page === "discover") renderDiscover(); else renderMatches();
    notify(account.favorites.includes(id) ? `${person.name} zu Favoriten hinzugefügt.` : `${person.name} aus Favoriten entfernt.`);
  } else if (action === "skip" && id) {
    const card = button.closest(".person-card");
    card.classList.add("leaving");
    setTimeout(() => {
      filters.skipped = [...(filters.skipped || []), id];
      renderDiscover();
    }, 180);
  } else if (action === "select-chat") { await renderChat(id); }
  else if (action === "open-chat") { selectedPerson = id; showPage("chat"); }
  else if (action === "show-person") { showPage("discover"); }
  else if (action === "go-discover") showPage("discover");
  else if (action === "toggle-filters") $("#filter-form").classList.toggle("hidden");
  else if (action === "reset-filters") { filters = { minAge: 18, maxAge: 45, interest: "" }; renderDiscover(); }
  else if (action === "logout") { sessionStorage.removeItem("nah-session"); location.reload(); }
  else if (action === "call") startCall(id, button.dataset.mode);
}

async function startCall(id, mode) {
  const person = PEOPLE.find((item) => item.id === id);
  $("#call-person-name").textContent = person?.name || "Dein Match";
  $("#call-mode-label").textContent = mode === "video" ? "Videoanruf" : "Sprachanruf";
  $("#call-notice").textContent = "Lokale Medienvorschau. Für Anrufe zwischen Geräten ist ein Anrufserver nötig.";
  $("#call-video").classList.toggle("audio-only", mode === "audio");
  $("#call-dialog").showModal();
  try {
    activeCallStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
    $("#call-video").srcObject = activeCallStream;
    $("#call-status").textContent = "Vorschau aktiv";
    callStartedAt = Date.now();
    callClock = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
      $("#call-timer").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
    }, 1000);
  } catch (error) {
    $("#call-status").textContent = error.name === "NotAllowedError" ? "Kein Zugriff auf Mikrofon oder Kamera." : "Kein Mikrofon oder keine Kamera gefunden.";
  }
}

function endCall() {
  activeCallStream?.getTracks().forEach((track) => track.stop());
  activeCallStream = null;
  clearInterval(callClock);
  $("#call-video").srcObject = null;
  $("#call-timer").textContent = "00:00";
  if ($("#call-dialog").open) $("#call-dialog").close();
}

document.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) await handleAction(actionButton);
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) showPage(pageButton.dataset.page);
});

$("#auth-form").addEventListener("submit", authenticate);
$("#auth-switch").addEventListener("click", () => setAuthMode($("#auth-form").dataset.mode === "register" ? "login" : "register"));
$("#demo-button").addEventListener("click", chooseDemo);
$("#call-end").addEventListener("click", endCall);
$("#call-dialog").addEventListener("close", endCall);
$("#auth-close").addEventListener("click", () => { $("#auth-dialog").close(); chooseDemo(); });
$("#auth-open").addEventListener("click", () => { sessionStorage.removeItem("nah-session"); location.reload(); });
$("#chat-search").addEventListener("input", () => renderChat(selectedPerson));
$("#call-mic").addEventListener("click", () => {
  const track = activeCallStream?.getAudioTracks()[0];
  if (!track) return notify("Mikrofon ist nicht aktiv.");
  track.enabled = !track.enabled;
  $("#call-mic").classList.toggle("muted-mic", !track.enabled);
  $("#call-mic").title = track.enabled ? "Mikrofon stummschalten" : "Mikrofon einschalten";
});
$("#filter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  filters = { ...filters, minAge: form.get("minAge"), maxAge: form.get("maxAge"), interest: form.get("interest") };
  renderDiscover();
});

setAuthMode("register");
resumeSession().catch(() => notify("Der lokale Datenbankspeicher ist nicht verfügbar. Öffne die App über localhost."));