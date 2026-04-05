/* ── API 설정 ── */
const API_BASE = "https://conu-2-backend.up.railway.app/api/todos";

/* ── 유틸 ── */
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

/* ── 상태 ── */
const todayStr   = toDateStr(new Date());
let todos        = [];
let filter       = "all";
let selectedDate = todayStr;
let viewYear     = new Date().getFullYear();
let viewMonth    = new Date().getMonth();
let toastTimer   = null;
let isLoading    = false;

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

/* ── 초기화 ── */
const now = new Date();
todayChip.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일`;
injectKeyframe();
renderCalendar();   // 백엔드 응답 전에도 캘린더 먼저 표시
renderTodos();
fetchTodos();

/* ── 이벤트 ── */
addBtn.addEventListener("click", addTodo);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") addTodo(); });
clearBtn.addEventListener("click", clearDone);

prevMonthBtn.addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderTodos();
  });
});

/* ─────────────────────────────
   API 호출
───────────────────────────────── */
async function fetchTodos() {
  try {
    setLoading(true);
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
    todos = await res.json();
    renderCalendar();
    renderTodos();
    renderStats();
  } catch (err) {
    showToast("서버에 연결할 수 없어요 — 백엔드를 확인해주세요", "error");
    console.error("[fetchTodos 오류]", err);
    /* 실패해도 캘린더·목록 유지 (빈 상태로) */
    renderCalendar();
    renderTodos();
    renderStats();
  } finally {
    setLoading(false);
  }
}

async function addTodo() {
  const title = input.value.trim();
  if (!title) {
    shake(input.closest(".input-wrapper"));
    input.focus();
    return;
  }

  try {
    setAddLoading(true);
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) throw new Error("추가 실패");

    input.value = "";
    input.focus();
    await fetchTodos();
    showToast("할일이 추가됐어요 ✓");
  } catch (err) {
    showToast("할일 추가에 실패했어요", "error");
    console.error(err);
  } finally {
    setAddLoading(false);
  }
}

async function toggleTodo(id, isCompleted) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !isCompleted }),
    });
    if (!res.ok) throw new Error("수정 실패");
    await fetchTodos();
  } catch (err) {
    showToast("수정에 실패했어요", "error");
    console.error(err);
  }
}

async function deleteTodo(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("삭제 실패");
    await fetchTodos();
    showToast("삭제됐어요");
  } catch (err) {
    showToast("삭제에 실패했어요", "error");
    console.error(err);
  }
}

async function clearDone() {
  const doneTodos = todos.filter((t) => {
    const dateStr = t.createdAt ? toDateStr(new Date(t.createdAt)) : null;
    return t.isCompleted && dateStr === selectedDate;
  });

  if (doneTodos.length === 0) { showToast("완료된 항목이 없어요"); return; }

  try {
    await Promise.all(
      doneTodos.map((t) =>
        fetch(`${API_BASE}/${t._id}`, { method: "DELETE" })
      )
    );
    await fetchTodos();
    showToast(`완료 ${doneTodos.length}개를 삭제했어요`);
  } catch (err) {
    showToast("삭제에 실패했어요", "error");
    console.error(err);
  }
}

function selectDate(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  renderTodos();
  renderStats();
}

/* ─────────────────────────────
   캘린더 렌더
   (todos의 createdAt 기준으로 날짜별 도트 표시)
───────────────────────────────── */
function renderCalendar() {
  calTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays    = new Date(viewYear, viewMonth, 0).getDate();

  /* createdAt 기준 날짜별 집계 */
  const byDate = {};
  todos.forEach((t) => {
    if (!t.createdAt) return;
    const dateStr = toDateStr(new Date(t.createdAt));
    byDate[dateStr] ??= { total: 0, done: 0 };
    byDate[dateStr].total++;
    if (t.isCompleted) byDate[dateStr].done++;
  });

  calGrid.innerHTML = "";

  /* 이전 달 채우기 */
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell other-month";
    cell.innerHTML = `<span class="cal-day">${prevDays - firstDay + 1 + i}</span>`;
    calGrid.appendChild(cell);
  }

  /* 이번 달 */
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr    = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday    = dateStr === todayStr;
    const isSelected = dateStr === selectedDate;
    const info       = byDate[dateStr];

    const cell = document.createElement("div");
    cell.className = ["cal-cell", isToday ? "today" : "", isSelected ? "selected" : ""]
      .filter(Boolean).join(" ");
    cell.dataset.date = dateStr;
    cell.innerHTML = `
      <span class="cal-day">${d}</span>
      ${info ? `<div class="cal-dots">${buildDots(info)}</div>` : ""}
    `;
    cell.addEventListener("click", () => selectDate(dateStr));
    calGrid.appendChild(cell);
  }

  /* 다음 달 채우기 */
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
  let html = "";
  for (let i = 0; i < Math.min(undone, 3); i++) html += `<span class="dot dot-active"></span>`;
  for (let i = 0; i < Math.min(done, 3 - Math.min(undone, 3)); i++) html += `<span class="dot dot-done"></span>`;
  return html;
}

/* ─────────────────────────────
   할일 목록 렌더
───────────────────────────────── */
function renderTodos() {
  dateLabel.textContent = formatDisplayDate(selectedDate);

  /* selectedDate의 createdAt 기준 필터 */
  const dateTodos = todos.filter((t) => {
    if (!t.createdAt) return false;
    return toDateStr(new Date(t.createdAt)) === selectedDate;
  });

  const filtered = dateTodos.filter((t) => {
    if (filter === "active") return !t.isCompleted;
    if (filter === "done")   return t.isCompleted;
    return true;
  });

  dateBadge.textContent = `${dateTodos.length}개`;
  listEl.innerHTML = "";
  filtered.forEach((todo) => listEl.appendChild(createTodoEl(todo)));
  emptyState.classList.toggle("visible", filtered.length === 0);
}

function createTodoEl(todo) {
  const li = document.createElement("li");
  li.className = `todo-item${todo.isCompleted ? " done" : ""}`;
  li.dataset.id = todo._id;

  li.innerHTML = `
    <button class="check-btn ${todo.isCompleted ? "checked" : ""}" aria-label="완료 토글">
      <svg class="check-icon" width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <span class="todo-text">${escapeHtml(todo.title)}</span>
    <div class="todo-actions">
      <button class="action-btn delete-btn" aria-label="삭제">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;

  li.querySelector(".check-btn").addEventListener("click",
    () => toggleTodo(todo._id, todo.isCompleted));
  li.querySelector(".delete-btn").addEventListener("click",
    () => deleteTodo(todo._id));

  return li;
}

/* ─────────────────────────────
   통계 (선택 날짜 기준)
───────────────────────────────── */
function renderStats() {
  const dateTodos = todos.filter((t) => {
    if (!t.createdAt) return false;
    return toDateStr(new Date(t.createdAt)) === selectedDate;
  });
  const done = dateTodos.filter((t) => t.isCompleted).length;

  totalEl.textContent  = dateTodos.length;
  doneEl.textContent   = done;
  remainEl.textContent = dateTodos.length - done;
}

/* ─────────────────────────────
   UI 헬퍼
───────────────────────────────── */
function setLoading(on) {
  isLoading = on;
  listEl.style.opacity = on ? "0.5" : "1";
}

function setAddLoading(on) {
  addBtn.disabled = on;
  addBtn.style.opacity = on ? "0.6" : "1";
}

function showToast(msg, type = "default") {
  toastEl.textContent = msg;
  toastEl.style.borderLeftColor = type === "error" ? "var(--ds-danger)" : "var(--ds-bg-brand-bold)";
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function shake(el) {
  el.style.animation = "none";
  el.offsetHeight;
  el.style.animation = "shake .3s ease";
  el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
}

function injectKeyframe() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-5px); }
      40%      { transform: translateX(5px); }
      60%      { transform: translateX(-3px); }
      80%      { transform: translateX(3px); }
    }
  `;
  document.head.appendChild(style);
}
