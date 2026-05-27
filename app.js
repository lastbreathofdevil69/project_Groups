/* THEME */
const saved = localStorage.getItem("gfs-theme") || "light";
applyTheme(saved);
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("gfs-theme", t);
  const icon = document.getElementById("themeIcon");
  const lbl  = document.getElementById("themeLabel");
  if (!icon) return;
  if (t === "dark") { icon.className = "ti ti-sun";  lbl.textContent = "Light"; }
  else              { icon.className = "ti ti-moon"; lbl.textContent = "Dark"; }
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

/* MANUAL REFRESH */
async function manualRefresh() {
  const btn = event?.target?.closest('button');
  if (btn) {
    const icon = btn.querySelector('i');
    icon.style.animation = 'spin 0.5s linear';
    setTimeout(() => icon.style.animation = '', 500);
  }
  await fetchDataFromSheets();
  showToast("Data refreshed successfully", "success", 2000);
}

/* SCROLL TO TOP */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show/hide scroll to top button
window.addEventListener('scroll', () => {
  const scrollBtn = document.getElementById('scrollTopBtn');
  if (window.scrollY > 300) {
    scrollBtn.classList.add('visible');
  } else {
    scrollBtn.classList.remove('visible');
  }
});

/* TOAST NOTIFICATIONS */
function showToast(message, type = "info", duration = 5000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icons = {
    success: "ti-circle-check",
    error: "ti-alert-circle",
    warning: "ti-alert-triangle",
    info: "ti-info-circle"
  };
  
  toast.innerHTML = `
    <i class="ti ${icons[type]} toast-icon"></i>
    <div class="toast-content">${message}</div>
    <i class="ti ti-x toast-close" onclick="this.parentElement.remove()"></i>
  `;
  
  container.appendChild(toast);
  
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add("removing");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

/* DATA */
const API_URL = "https://script.google.com/macros/s/AKfycbx4FUGsZwSUAI_VRkoJX5UYdHCT3UmWvDfRgUhYoVvnTRzOeT_f5h8ZKmkzM2-iFBKDKA/exec";
let students = [], groups = [], assignedStudents = new Set(), editingGroupIndex = -1;
const selects = Array.from(document.querySelectorAll(".memberSelect"));
let lastDataHash = ""; // Track data changes
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 10000; // Check every 10 seconds

function setLoading(on) { document.getElementById("loader").classList.toggle("hidden", !on); }

// Simple hash function to detect data changes
function hashData(data) {
  return JSON.stringify({
    studentCount: data.students?.length || 0,
    groupCount: data.groups?.length || 0,
    students: (data.students || []).map(s => `${s.Name}:${s.Assigned}`).join(','),
    groups: (data.groups || []).map(g => `${g.GroupNumber}:${g.Member1}:${g.Member2}:${g.Member3}:${g.Member4}`).join(',')
  });
}

// Check for updates without showing loader (silent refresh)
async function checkForUpdates() {
  try {
    const data = await fetch(API_URL + "?_t=" + Date.now()).then(r => r.json());
    if (!data.success) return;
    
    const newHash = hashData(data);
    
    // If data changed and user is not actively editing
    if (newHash !== lastDataHash && editingGroupIndex === -1) {
      lastDataHash = newHash;
      
      // Update data silently
      students = (data.students || []).map(s => ({
        name: s.Name||s.name||"", 
        category: s.Category||s.category||"",
        assigned: s.Assigned === true || s.Assigned === "TRUE" || String(s.Assigned||"false").toLowerCase() === "true"
      }));
      groups = (data.groups || []).map((g, i) => {
        const members = (g.members || [g.Member1||g["Member 1"]||"",g.Member2||g["Member 2"]||"",g.Member3||g["Member 3"]||"",g.Member4||g["Member 4"]||""]).filter(Boolean);
        const aCount = parseInt(g.ACount||g["A Count"]||g.aCount||0,10);
        const bCount = parseInt(g.BCount||g["B Count"]||g.bCount||0,10);
        const status = g.Status||g.status||(members.length===4&&aCount===2&&bCount===2?"Complete":"Incomplete");
        return { groupNumber: parseInt(g.GroupNumber||g["Group Number"]||g.groupNumber||(i+1),10), members, aCount, bCount, status };
      });
      assignedStudents.clear();
      students.forEach(s => { if (s.assigned) assignedStudents.add(s.name); });
      groups.forEach(g => g.members.forEach(m => assignedStudents.add(m)));
      
      // Update UI
      populateDropdowns(); 
      renderGroups(); 
      updateStats();
      
      // Show subtle notification
      showToast("Data updated - changes detected from another user", "info", 3000);
    }
  } catch (err) {
    console.error("Auto-refresh failed:", err);
    // Don't show error toast for background checks
  }
}

// Start auto-refresh
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(checkForUpdates, REFRESH_INTERVAL);
  // Update indicator
  const indicator = document.getElementById("refreshIndicator");
  if (indicator) {
    indicator.className = "refresh-indicator active";
    indicator.querySelector("span").textContent = "Auto-sync active";
  }
}

// Stop auto-refresh (e.g., when page is hidden)
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  // Update indicator
  const indicator = document.getElementById("refreshIndicator");
  if (indicator) {
    indicator.className = "refresh-indicator paused";
    indicator.querySelector("span").textContent = "Auto-sync paused";
  }
}

// Pause auto-refresh when page is hidden, resume when visible
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else {
    startAutoRefresh();
    checkForUpdates(); // Check immediately when page becomes visible
  }
});

// Stop auto-refresh when user starts editing (to avoid conflicts)
function editGroup(index) {
  stopAutoRefresh(); // Pause during edit
  const group = groups[index];
  editingGroupIndex = index;
  document.getElementById("formTitle").textContent = "Edit group #" + group.groupNumber;
  document.getElementById("saveBtnLabel").textContent = "Update group";
  document.getElementById("saveBtn").className = "btn btn-save-edit";
  document.getElementById("cancelBtn").classList.remove("hidden");
  populateDropdowns(group.members);
  selects.forEach((s, i) => s.value = group.members[i] || "");
  validateSelection();
  document.querySelector(".form-card").scrollIntoView({ behavior:"smooth", block:"start" });
}

function cancelEdit() {
  editingGroupIndex = -1;
  document.getElementById("formTitle").textContent = "Create group";
  document.getElementById("saveBtnLabel").textContent = "Save group";
  document.getElementById("saveBtn").className = "btn btn-primary";
  document.getElementById("cancelBtn").classList.add("hidden");
  selects.forEach(s => s.value = "");
  populateDropdowns(); 
  validateSelection();
  startAutoRefresh(); // Resume auto-refresh after edit
}

function populateDropdowns(editingMembers = []) {
  selects.forEach(sel => {
    const cv = sel.value;
    sel.innerHTML = '<option value="">— select —</option>';
    students.forEach(s => {
      if (!assignedStudents.has(s.name) || s.name === cv || editingMembers.includes(s.name)) {
        const o = document.createElement("option");
        o.value = s.name;
        o.textContent = `${s.name} (${s.category})`;
        sel.appendChild(o);
      }
    });
    sel.value = cv;
  });
  validateSelection(); renderAvailableStudents();
}

function validateSelection() {
  const sel = selects.map(s => s.value).filter(Boolean);
  const box = document.getElementById("vbar");
  if (sel.filter((x, i) => sel.indexOf(x) !== i).length) {
    box.className = "vbar bad";
    box.innerHTML = `<i class="ti ti-alert-circle"></i> Duplicate students selected`;
    return false;
  }
  let a = 0, b = 0;
  sel.forEach(n => { const s = students.find(x => x.name === n); if (s?.category === "A") a++; else if (s?.category === "B") b++; });
  if (a > 2 || b > 2) {
    box.className = "vbar bad";
    box.innerHTML = `<i class="ti ti-alert-circle"></i> Max 2 per  &nbsp;·&nbsp; A: ${a}/2 &nbsp; B: ${b}/2`;
    return false;
  }
  if (sel.length < 2) {
    box.className = "vbar waiting";
    box.innerHTML = `<i class="ti ti-info-circle"></i> Need at least 2 members &nbsp;·&nbsp; A: ${a} &nbsp; B: ${b}`;
    return false;
  }
  if (sel.length === 4 && a === 2 && b === 2) {
    box.className = "vbar good";
    box.innerHTML = `<i class="ti ti-circle-check"></i> Complete — 2A + 2B ready to save`;
    return true;
  }
  box.className = "vbar ok";
  box.innerHTML = `<i class="ti ti-check"></i> ${sel.length}/4 members &nbsp;·&nbsp; A: ${a} &nbsp; B: ${b} — needs 2A + 2B for complete`;
  return true;
}
selects.forEach(s => s.addEventListener("change", validateSelection));

async function saveGroup() {
  const members = selects.map(s => s.value).filter(Boolean);
  if (members.length < 2) { 
    showToast("Please select at least 2 members to create a group.", "warning");
    return; 
  }
  if (new Set(members).size !== members.length) { 
    showToast("You cannot add the same student multiple times. Please select different students.", "error");
    return; 
  }
  if (!validateSelection()) { 
    showToast("Invalid group composition. Please check the requirements.", "error");
    return; 
  }
  let a = 0, b = 0;
  members.forEach(n => { const s = students.find(x => x.name === n); if (s?.category === "A") a++; else b++; });
  const isComplete = members.length === 4 && a === 2 && b === 2;
  setLoading(true);
  
  if (editingGroupIndex >= 0) {
    const group = groups[editingGroupIndex];
    const oldMembers = [...group.members];
    try {
      const p = new URLSearchParams({ action:"editGroup", groupNumber: group.groupNumber.toString(), members: members.join(","), _t: Date.now() });
      const data = await fetch(API_URL + "?" + p).then(r => r.json());
      if (data.students && !data.message) { 
        showToast("Backend version mismatch. Please refresh the page.", "error");
        setLoading(false); 
        return; 
      }
      if (!data.success) { 
        showToast(data.message || "Failed to update group. Please try again.", "error");
        setLoading(false); 
        return; 
      }
      showToast(`Group #${group.groupNumber} updated successfully!`, "success");
    } catch (err) { 
      showToast("Network error. Please check your connection and try again.", "error");
      setLoading(false); 
      return; 
    }
    // Refresh data from server to ensure consistency
    await fetchDataFromSheets();
    cancelEdit();
  } else {
    try {
      const p = new URLSearchParams({ action:"createGroup", members: members.join(","), _t: Date.now() });
      const data = await fetch(API_URL + "?" + p).then(r => r.json());
      if (!data.success) { 
        showToast(data.message || "Failed to create group. Please try again.", "error");
        setLoading(false); 
        return; 
      }
      showToast(`Group #${data.groupNumber} created successfully!`, "success");
    } catch (err) { 
      showToast("Network error. Please check your connection and try again.", "error");
      setLoading(false); 
      return; 
    }
    // Refresh data from server to ensure consistency
    await fetchDataFromSheets();
    selects.forEach(s => s.value = ""); 
    validateSelection();
  }
  setLoading(false);
}

async function deleteGroup(index) {
  // Password protection - using hash verification
  const userInput = prompt(`Delete Group #${groups[index].groupNumber}?\n\nEnter password to confirm:`);
  
  if (userInput === null) return; // User cancelled
  
  // Simple hash check (obfuscated password verification)
  const hash = btoa(userInput).split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
  if (hash !== 193518) {
    showToast("Incorrect password. Delete operation cancelled.", "error");
    return;
  }
  
  setLoading(true);
  const group = groups[index];
  try {
    const p = new URLSearchParams({ action:"deleteGroup", groupNumber: group.groupNumber.toString(), _t: Date.now() });
    const data = await fetch(API_URL + "?" + p).then(r => r.json());
    if (data.students && !data.message) { 
      showToast("Backend version mismatch. Please refresh the page.", "error");
      setLoading(false); 
      return; 
    }
    if (!data.success) { 
      showToast(data.message || "Failed to delete group. Please try again.", "error");
      setLoading(false); 
      return; 
    }
    showToast(`Group #${group.groupNumber} deleted successfully.`, "success");
  } catch (err) { 
    showToast("Network error. Please check your connection and try again.", "error");
    setLoading(false); 
    return; 
  }
  // Refresh data from server to ensure consistency
  await fetchDataFromSheets();
  if (editingGroupIndex === index) cancelEdit();
  else if (editingGroupIndex > index) editingGroupIndex--;
  setLoading(false);
}

const gcCls = ["gc-0","gc-1","gc-2","gc-3","gc-4","gc-5"];

function filterGroups(searchTerm) {
  const rows = document.querySelectorAll("#groupsTable tr");
  const term = searchTerm.toLowerCase().trim();
  let visibleCount = 0;
  
  rows.forEach(row => {
    if (row.querySelector(".empty-state")) return; // Skip empty state row
    
    const text = row.textContent.toLowerCase();
    const isVisible = text.includes(term);
    row.style.display = isVisible ? "" : "none";
    if (isVisible) visibleCount++;
  });
  
  // Show "no results" if search has no matches
  if (visibleCount === 0 && groups.length > 0) {
    const tbody = document.getElementById("groupsTable");
    const existingEmpty = tbody.querySelector(".search-empty");
    if (!existingEmpty) {
      const tr = document.createElement("tr");
      tr.className = "search-empty";
      tr.innerHTML = `<td colspan="6"><div class="empty-state">
        <i class="ti ti-search-off" aria-hidden="true"></i>
        <p>No groups match "${searchTerm}"</p>
        <p class="empty-hint">Try a different search term</p>
      </div></td>`;
      tbody.appendChild(tr);
    }
  } else {
    const existingEmpty = document.querySelector(".search-empty");
    if (existingEmpty) existingEmpty.remove();
  }
}

function renderGroups() {
  const tbody = document.getElementById("groupsTable");
  document.getElementById("groupsBadge").textContent = groups.length;
  tbody.innerHTML = "";
  if (!groups.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <i class="ti ti-users-group" aria-hidden="true"></i>
      <p>No groups created yet</p>
      <p class="empty-hint">Create your first group using the form above</p>
    </div></td></tr>`;
    return;
  }
  groups.forEach((group, index) => {
    const tr = document.createElement("tr");
    const gc = gcCls[group.groupNumber % 6];
    const badge = group.status === "Complete"
      ? `<span class="badge complete"><i class="ti ti-circle-check"></i>Complete</span>`
      : `<span class="badge incomplete"><i class="ti ti-clock"></i>Incomplete</span>`;
    const tags = group.members.map(n => {
      const s = students.find(x => x.name === n);
      return `<span class="mtag ${s?.category === "A" ? "mtag-a" : "mtag-b"}">${n}</span>`;
    }).join("");
    tr.innerHTML = `
      <td><span class="gnum ${gc}">${group.groupNumber}</span></td>
      <td><div class="mtag-wrap">${tags}</div></td>
      <td><span class="mtag mtag-a">${group.aCount}</span></td>
      <td><span class="mtag mtag-b">${group.bCount}</span></td>
      <td>${badge}</td>
      <td><div class="action-row">
        <button class="btn btn-edit" onclick="editGroup(${index})"><i class="ti ti-edit"></i>Edit</button>
        <button class="btn btn-delete" onclick="deleteGroup(${index})"><i class="ti ti-trash"></i>Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

function updateStats() {
  const complete = groups.filter(g => g.status === "Complete").length;
  document.getElementById("totalGroups").textContent = groups.length;
  document.getElementById("validGroups").textContent = complete;
  document.getElementById("invalidGroups").textContent = groups.length - complete;
  document.getElementById("assignedStudents").textContent = assignedStudents.size;
}

function renderAvailableStudents() {
  const lA = document.getElementById("availableA"), lB = document.getElementById("availableB");
  lA.innerHTML = ""; lB.innerHTML = "";
  let cA = 0, cB = 0;
  students.forEach(s => {
    if (assignedStudents.has(s.name)) return;
    const pill = document.createElement("span");
    pill.className = "pill " + s.category.toLowerCase();
    pill.textContent = s.name;
    if (s.category === "A") { lA.appendChild(pill); cA++; } else { lB.appendChild(pill); cB++; }
  });
  if (!cA) lA.innerHTML = `<span class="empty-note">All assigned</span>`;
  if (!cB) lB.innerHTML = `<span class="empty-note">All assigned</span>`;
  document.getElementById("countA").textContent = cA;
  document.getElementById("countB").textContent = cB;
}

async function fetchDataFromSheets() {
  setLoading(true);
  try {
    const data = await fetch(API_URL + "?_t=" + Date.now()).then(r => r.json());
    if (!data.success) { 
      console.error("API Error:", data.message); 
      showToast("Failed to load data from server. Please refresh the page.", "error");
      setLoading(false); 
      return; 
    }
    
    // Update hash for change detection
    lastDataHash = hashData(data);
    
    students = (data.students || []).map(s => ({
      name: s.Name||s.name||"", 
      category: s.Category||s.category||"",
      assigned: s.Assigned === true || s.Assigned === "TRUE" || String(s.Assigned||"false").toLowerCase() === "true"
    }));
    groups = (data.groups || []).map((g, i) => {
      const members = (g.members || [g.Member1||g["Member 1"]||"",g.Member2||g["Member 2"]||"",g.Member3||g["Member 3"]||"",g.Member4||g["Member 4"]||""]).filter(Boolean);
      const aCount = parseInt(g.ACount||g["A Count"]||g.aCount||0,10);
      const bCount = parseInt(g.BCount||g["B Count"]||g.bCount||0,10);
      const status = g.Status||g.status||(members.length===4&&aCount===2&&bCount===2?"Complete":"Incomplete");
      return { groupNumber: parseInt(g.GroupNumber||g["Group Number"]||g.groupNumber||(i+1),10), members, aCount, bCount, status };
    });
    assignedStudents.clear();
    students.forEach(s => { if (s.assigned) assignedStudents.add(s.name); });
    groups.forEach(g => g.members.forEach(m => assignedStudents.add(m)));
    populateDropdowns(); renderGroups(); updateStats();
  } catch (err) { 
    console.error("Fetch failed:", err); 
    showToast("Network error. Please check your connection.", "error");
  }
  setLoading(false);
}

// Initial load and start auto-refresh
fetchDataFromSheets().then(() => {
  startAutoRefresh();
});
