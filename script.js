import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCT5pttHp1OL6qnI-tO223CkZDlCfO7HhQ",
    authDomain: "staff-directory-e55a2.firebaseapp.com",
    projectId: "staff-directory-e55a2",
    databaseURL: "https://staff-directory-e55a2-default-rtdb.firebaseio.com",
    storageBucket: "staff-directory-e55a2.firebasestorage.app",
    messagingSenderId: "254333195100",
    appId: "1:254333195100:web:ca1e5d4ef2ffd27fb3e799",
    measurementId: "G-J6J7XS67CR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const positions = ["Buffer Trust Staff", "Trust Staff", "Senior Trust Staff", "Branch Supervisor", "Area Head"];
const tenureBrackets = ["New Hire (<1y)", "Junior (1-3y)", "Senior (3-5y)", "Veteran (5y+)"];

// Global Auth Observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        const userStatusRef = ref(db, 'online_users/' + user.uid);
        set(userStatusRef, { email: user.email });
        onDisconnect(userStatusRef).remove();
        initDirectory();
        initOnlineTracker();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('main-content').classList.add('hidden');
    }
});

// Login Handler - Attached to Window for HTML accessibility
window.handleLogin = async () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (e) { alert("Login Error: " + e.message); }
};

document.getElementById('logoutBtn').onclick = () => signOut(auth);

function initOnlineTracker() {
    onValue(ref(db, 'online_users'), (snap) => {
        const list = document.getElementById('online-list');
        list.innerHTML = '';
        const data = snap.val();
        if (data) Object.values(data).forEach(u => {
            const name = u.email.split('@')[0];
            list.innerHTML += `<div class="online-user-item"><div class="status-dot"></div><span>${name}</span></div>`;
        });
    });
}

function initDirectory() {
    onValue(ref(db, 'staff'), (snap) => {
        const list = [];
        const data = snap.val();
        if (data) Object.keys(data).forEach(k => list.push({ id: k, ...data[k] }));
        renderUI(list);
    });
}

const fieldIds = ['branch', 'staffName', 'position', 'contact', 'dateHired', 'birthday', 'address'];
const validateFields = () => {
    const allFilled = fieldIds.every(id => document.getElementById(id).value.trim() !== "");
    document.getElementById('saveBtn').disabled = !allFilled;
};
fieldIds.forEach(id => document.getElementById(id).addEventListener('input', validateFields));

document.getElementById('saveBtn').onclick = async () => {
    const obj = {};
    fieldIds.forEach(id => obj[id] = document.getElementById(id).value.trim());
    await set(push(ref(db, 'staff')), obj);
    fieldIds.forEach(id => document.getElementById(id).value = '');
    validateFields();
};

function calculateAge(bday) {
    if(!bday) return 0;
    const diff = Date.now() - new Date(bday).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function getTenureData(hired) {
    if(!hired) return { str: "0y 0m", bracket: "New Hire (<1y)" };
    const d = new Date(hired);
    const now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    let m = now.getMonth() - d.getMonth();
    if (m < 0) { y--; m += 12; }
    
    let bracket = "Veteran (5y+)";
    if (y < 1) bracket = "New Hire (<1y)";
    else if (y < 3) bracket = "Junior (1-3y)";
    else if (y < 5) bracket = "Senior (3-5y)";
    
    return { str: `${y}y ${m}m`, bracket: bracket };
}

function renderUI(data) {
    const tbody = document.getElementById('staffTableBody');
    tbody.innerHTML = '';
    const branchMatrix = {};
    const tenureMatrix = {};
    tenureBrackets.forEach(b => tenureMatrix[b] = {});

    data.forEach(s => {
        if(!branchMatrix[s.branch]) branchMatrix[s.branch] = {};
        branchMatrix[s.branch][s.position] = (branchMatrix[s.branch][s.position] || 0) + 1;

        const tenureInfo = getTenureData(s.dateHired);
        tenureMatrix[tenureInfo.bracket][s.position] = (tenureMatrix[tenureInfo.bracket][s.position] || 0) + 1;

        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${s.branch}</td><td style="font-weight:bold">${s.staffName}</td><td>${s.position}</td>
            <td>${s.contact}</td><td class="address-cell" title="${s.address}">${s.address}</td>
            <td>${s.dateHired}</td><td>${calculateAge(s.birthday)}</td>
            <td style="color:var(--accent-blue); font-weight:bold">${tenureInfo.str}</td>
            <td><button style="color:var(--accent-red); background:none; font-size:10px" onclick="deleteRec('${s.id}')">REMOVE</button></td>
        `;
    });
    renderMatrix(branchMatrix, "branchPositionSummary", "Branch");
    renderMatrix(tenureMatrix, "tenurePositionSummary", "Tenure Bracket", tenureBrackets);
}

// Delete Handler - Attached to Window
window.deleteRec = (id) => { 
    if(confirm("Permanently delete this record?")) remove(ref(db, 'staff/' + id)); 
};

function renderMatrix(groupedData, elementId, firstColName, customKeys = null) {
    let html = `<table class="summary-table"><thead><tr><th>${firstColName}</th>`;
    positions.forEach(p => html += `<th>${p}</th>`);
    html += `<th>TOTAL</th></tr></thead><tbody>`;

    const columnTotals = new Array(positions.length).fill(0);
    const keys = customKeys || Object.keys(groupedData).sort();
    let grandTotalCount = 0;

    keys.forEach(key => {
        let rowTot = 0;
        html += `<tr><td>${key}</td>`;
        positions.forEach((p, i) => {
            let val = (groupedData[key] && groupedData[key][p]) ? groupedData[key][p] : 0;
            rowTot += val;
            columnTotals[i] += val;
            html += `<td>${val}</td>`;
        });
        grandTotalCount += rowTot;
        html += `<td style="font-weight:bold; color:var(--accent-blue)">${rowTot}</td></tr>`;
    });

    html += `<tr class="grand-total-row"><td>GRAND TOTAL</td>`;
    columnTotals.forEach(ct => html += `<td>${ct}</td>`);
    html += `<td>${grandTotalCount}</td></tr></tbody></table>`;

    document.getElementById(elementId).innerHTML = html;
}
