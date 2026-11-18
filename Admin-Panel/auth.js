// =====================================================================
//  auth.js  -  shared by login.html, register.html and index.html
// =====================================================================

// ---- SUPABASE SETTINGS: paste your own values here ------------------
// (Supabase Dashboard > Project Settings > API)
const SUPABASE_URL = "https://wsciimnfzzlesgtyymep.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzY2lpbW5menpsZXNndHl5bWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MzYzODcsImV4cCI6MjExMDQxMjM4N30.zcY0tDkwQeFi6FqWljuzUBlRVcZEApQtF7uynkfGQOU";
// ---------------------------------------------------------------------

const USE_SUPABASE = !SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
    !SUPABASE_ANON_KEY.includes("YOUR-ANON");

const USERS_KEY = "csm_users";        // local fallback only
const SESSION_KEY = "csm_session";
let currentUser = null;               // { id?, name, course }

// ---------- Supabase REST helper ----------
async function sb(path, options = {}) {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
        method: options.method || "GET",
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: "Bearer " + SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            Prefer: options.prefer || "return=representation"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
        const text = await res.text();
        const error = new Error(text || res.statusText);
        error.status = res.status;
        throw error;
    }

    return res.status === 204 ? null : res.json();
}

function normalizeName(name) {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------- Session ----------
function getSessionKey() {
    try { return localStorage.getItem(SESSION_KEY); }
    catch (e) { return null; }
}

function setSession(user) {
    try { localStorage.setItem(SESSION_KEY, normalizeName(user.name)); }
    catch (e) { console.error(e); }
}

function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); }
    catch (e) { console.error(e); }
}

// ---------- Local fallback storage ----------
function getLocalUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch (e) { return []; }
}

function saveLocalUsers(users) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
    catch (e) { console.error(e); }
}

// ---------- Find / create account ----------
async function findUser(name) {
    const key = normalizeName(name);

    if (USE_SUPABASE) {
        const rows = await sb("students?name_key=eq." + encodeURIComponent(key) + "&select=*");
        return rows[0] || null;
    }

    return getLocalUsers().find(u => normalizeName(u.name) === key) || null;
}

async function createUser(name, course) {
    if (USE_SUPABASE) {
        const rows = await sb("students", { method: "POST", body: { name, course } });
        return rows[0];
    }

    const users = getLocalUsers();
    users.push({ name, course });
    saveLocalUsers(users);
    return { name, course };
}

// ---------- Subjects: load / save ----------
function localSubjectsKey(user) {
    return "csm_subjects_" + normalizeName(user.name);
}

async function loadSubjects(user) {
    if (USE_SUPABASE) {
        const rows = await sb("subjects?student_id=eq." + user.id + "&select=*&order=position.asc");
        return rows.map(r => ({
            id: Date.now() + Math.random(),
            code: r.code,
            name: r.name,
            professor: r.professor || "",
            room: r.room || "",
            start: r.start_time,
            end: r.end_time,
            days: r.days || [],
            color: r.color
        }));
    }

    try {
        return JSON.parse(localStorage.getItem(localSubjectsKey(user))) || [];
    } catch (e) {
        return [];
    }
}

let syncChain = Promise.resolve();

function setSyncStatus(text) {
    const el = document.getElementById("syncStatus");
    if (el) el.textContent = text;
}

// called by index.html after every add / import / delete
function persistSubjects() {
    if (!currentUser) return;

    const snapshot = subjects.map(s => ({ ...s, days: [...s.days] }));
    const user = currentUser;

    if (!USE_SUPABASE) {
        try {
            localStorage.setItem(localSubjectsKey(user), JSON.stringify(snapshot));
        } catch (e) { console.error(e); }
        return;
    }

    setSyncStatus("☁ Saving...");

    // run saves one after another so they never overlap
    syncChain = syncChain.then(async () => {
        await sb("subjects?student_id=eq." + user.id, {
            method: "DELETE",
            prefer: "return=minimal"
        });

        if (snapshot.length) {
            await sb("subjects", {
                method: "POST",
                prefer: "return=minimal",
                body: snapshot.map((s, index) => ({
                    student_id: user.id,
                    position: index,
                    code: s.code,
                    name: s.name,
                    professor: s.professor,
                    room: s.room,
                    start_time: s.start,
                    end_time: s.end,
                    days: s.days,
                    color: s.color
                }))
            });
        }

        setSyncStatus("☁ Saved");
    }).catch(error => {
        console.error(error);
        setSyncStatus("⚠ Not saved (check connection)");
    });
}


// =====================================================================
//  SweetAlert2 helpers (fall back to plain alert/confirm if not loaded)
// =====================================================================
const SWAL_COLOR = "#315bea";

function notify(text, icon = "warning", title) {
    const titles = { error: "Oops!", warning: "Please check", success: "Success", info: "Notice" };

    if (!window.Swal) {
        alert(text);
        return Promise.resolve();
    }

    return Swal.fire({
        icon,
        title: title || titles[icon] || "Notice",
        text,
        confirmButtonColor: SWAL_COLOR,
        confirmButtonText: "OK"
    });
}

function toast(text, icon = "success") {
    if (!window.Swal) return;

    Swal.fire({
        toast: true,
        position: "top-end",
        icon,
        title: text,
        showConfirmButton: false,
        timer: 2400,
        timerProgressBar: true
    });
}

async function confirmDialog(title, text, confirmText = "Yes", icon = "warning") {
    if (!window.Swal) return confirm(text || title);

    const result = await Swal.fire({
        icon,
        title,
        text,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: "Cancel",
        confirmButtonColor: "#dc3545",
        cancelButtonColor: "#8992a9",
        reverseButtons: true
    });

    return result.isConfirmed;
}