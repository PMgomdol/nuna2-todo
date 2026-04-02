import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  remove,
  update,
  onValue,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

/* ── Firebase 초기화 ── */
const firebaseConfig = {
  apiKey: "AIzaSyA18v_cbblh4vNrvN1MLOy74wbyhuVAl4U",
  authDomain: "nuna2-todo-back.firebaseapp.com",
  databaseURL: "https://nuna2-todo-back-default-rtdb.firebaseio.com",
  projectId: "nuna2-todo-back",
  storageBucket: "nuna2-todo-back.firebasestorage.app",
  messagingSenderId: "907077265302",
  appId: "1:907077265302:web:156914433d2968585bdfb7",
  measurementId: "G-2HM76Q7BFP",
};

const app      = initializeApp(firebaseConfig);
const db       = getDatabase(app);
const todosRef = ref(db, "todos");

/* ── Utils ── */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const suffix = dateStr === todayStr ? " · 오늘" : "";
  return `${m}월 ${d}일 (${days[date.getDay()]})${suffix}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── State ── */
const todayStr   = toDateStr(new Date());
let todos        = [];
let filter       = "all";
let selectedDate = todayStr;
let viewYear     = new Date().getFullYear();
let viewMonth    = new Date().getMonth();
let toastTimer   = null;

/* ── DOM ── */
const input        = document.getElementById("todo-input");
const addBtn       = document.getElementById("add-btn");
const listEl       = document.getElementById("todo-list");
const emptyState   = document.getElementById("empty-state");
const totalEl      = document.getElementById("total-count");
const doneEl       = document.getElementById("done-count");
const remainEl     = document.getElementById("remain-count");
const clearBtn     = document.getElementById("clear-done-btn");
const toastEl      = document.getElementById("toast");
const filterBtns   = document.querySelectorAll(".filter-btn");
const todayChip    = document.getElementById("today-chip");
const calGrid      = document.getElementById("cal-grid");
const calTitle     = document.getElementById("cal-title");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");
const dateLabel    = document.getElementById("selected-date-label");
const dateBadge    = document.getElementById("date-todo-count");

/* ── Init ── */
const now = new Date();
todayChip.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일`;

/* ── Firebase 실시간 구독 ── */
onValue(todosRef, (snapshot) => {
  const data = snapshot.val();
  todos = data
    ? Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => b.createdAt - a.createdAt)
    : [];
  renderCalendar();
  renderTodos();
  renderStats();
});

/* ── Events ── */
addBtn.addEventListener("click", addTodo);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") addTodo(); });
clearBtn.addEventListener("click", clearDone);
prevMonthBtn.addEventListener("click", () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
nextMonthBtn.addEventListener("click", () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderTodos();
  });
});

/* ── Core ── */
async function addTodo() {
  const text = input.value.trim();
  if (!text) {
    shake(input.closest(".input-wrapper"));
    input.focus();
    return;
  }

  input.value = "";
  input.focus();

  await push(todosRef, { text, done: false, date: selectedDate, createdAt: Date.now() });
  showToast("할일이 추가됐어요 ✓");
}

async function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  await update(ref(db, `todos/${id}`), { done: !todo.done });
}

async function deleteTodo(id) {
  await remove(ref(db, `todos/${id}`));
  showToast("삭제됐어요");
}

async function saveEdit(id, newText) {
  const text = newText.trim();
  if (!text) { showToast("내용을 입력해주세요"); return false; }
  const todo = todos.find((t) => t.id === id);
  if (!todo || text === todo.text) return true;
  await update(ref(db, `todos/${id}`), { text });
  showToast("수정됐어요 ✓");
  return true;
}

async function clearDone() {
  const done = todos.filter((t) => t.done && t.date === selectedDate);
  if (done.length === 0) { showToast("완료된 항목이 없어요"); return; }
  await Promise.all(done.map((t) => remove(ref(db, `todos/${t.id}`))));
  showToast(`완료 ${done.length}개를 삭제했어요`);
}

function selectDate(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  renderTodos();
  renderStats();
}

/* ── Calendar Render ── */
function renderCalendar() {
  calTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays    = new Date(viewYear, viewMonth, 0).getDate();

  /* Build date → {total, done} map */
  const byDate = {};
  todos.forEach((t) => {
    if (!t.date) return;
    byDate[t.date] ??= { total: 0, done: 0 };
    byDate[t.date].total++;
    if (t.done) byDate[t.date].done++;
  });

  calGrid.innerHTML = "";

  /* Prev month filler */
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell other-month";
    cell.innerHTML = `<span class="cal-day">${prevDays - firstDay + 1 + i}</span>`;
    calGrid.appendChild(cell);
  }

  /* Current month */
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday    = dateStr === todayStr;
    const isSelected = dateStr === selectedDate;
    const info       = byDate[dateStr];

    const cell = document.createElement("div");
    cell.className = [
      "cal-cell",
      isToday    ? "today"    : "",
      isSelected ? "selected" : "",
    ].filter(Boolean).join(" ");

    cell.dataset.date = dateStr;
    cell.innerHTML = `
      <span class="cal-day">${d}</span>
      ${info ? `<div class="cal-dots">${buildDots(info)}</div>` : ""}
    `;
    cell.addEventListener("click", () => selectDate(dateStr));
    calGrid.appendChild(cell);
  }

  /* Next month filler */
  const filled   = firstDay + daysInMonth;
  const leftover = (7 - (filled % 7)) % 7;
  for (let i = 1; i <= leftover; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell other-month";
    cell.innerHTML = `<span class="cal-day">${i}</span>`;
    calGrid.appendChild(cell);
  }
}

function buildDots({ total, done }) {
  const undone = total - done;
  const max = 3;
  let html = "";
  for (let i = 0; i < Math.min(undone, max); i++)
    html += `<span class="dot dot-active"></span>`;
  for (let i = 0; i < Math.min(done, max - Math.min(undone, max)); i++)
    html += `<span class="dot dot-done"></span>`;
  return html;
}

/* ── Todo Render ── */
function renderTodos() {
  dateLabel.textContent = formatDisplayDate(selectedDate);

  const dateTodos = todos.filter((t) => t.date === selectedDate);
  const filtered  = dateTodos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done")   return t.done;
    return true;
  });

  dateBadge.textContent = `${dateTodos.length}개`;

  listEl.innerHTML = "";
  filtered.forEach((todo) => listEl.appendChild(createTodoEl(todo)));
  emptyState.classList.toggle("visible", filtered.length === 0);
}

function createTodoEl(todo) {
  const li = document.createElement("li");
  li.className = `todo-item${todo.done ? " done" : ""}`;
  li.dataset.id = todo.id;

  li.innerHTML = `
    <button class="check-btn ${todo.done ? "checked" : ""}" aria-label="완료 토글">
      <svg class="check-icon" width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <span class="todo-text">${escapeHtml(todo.text)}</span>
    <input class="todo-edit-input" value="${escapeHtml(todo.text)}" maxlength="80" />
    <div class="todo-actions">
      <button class="action-btn edit-btn" aria-label="수정">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="action-btn delete-btn" aria-label="삭제">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;

  const checkBtn  = li.querySelector(".check-btn");
  const editBtn   = li.querySelector(".edit-btn");
  const deleteBtn = li.querySelector(".delete-btn");
  const editInput = li.querySelector(".todo-edit-input");

  checkBtn.addEventListener("click",  () => toggleTodo(todo.id));
  deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

  editBtn.addEventListener("click", () => startEdit(li, editInput));

  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); editInput.blur(); }
    if (e.key === "Escape") { cancelEdit(li, editInput, todo.text); editInput.blur(); }
  });

  editInput.addEventListener("blur", async () => {
    if (!li.classList.contains("editing")) return;
    const ok = await saveEdit(todo.id, editInput.value);
    if (!ok) { cancelEdit(li, editInput, todo.text); }
    else     { li.classList.remove("editing"); }
  });

  return li;
}

function startEdit(li, input) {
  li.classList.add("editing");
  input.focus();
  input.select();
}

function cancelEdit(li, input, originalText) {
  li.classList.remove("editing");
  input.value = originalText;
}

/* ── Stats (selected date) ── */
function renderStats() {
  const dateTodos = todos.filter((t) => t.date === selectedDate);
  const done      = dateTodos.filter((t) => t.done).length;
  totalEl.textContent  = dateTodos.length;
  doneEl.textContent   = done;
  remainEl.textContent = dateTodos.length - done;
}

/* ── Toast ── */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

/* ── Shake ── */
function shake(el) {
  el.style.animation = "none";
  el.offsetHeight;
  el.style.animation = "shake .3s ease";
  el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
}
