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

/* ── State ── */
let todos = [];
let filter = "all";
let toastTimer = null;

/* ── DOM ── */
const input      = document.getElementById("todo-input");
const addBtn     = document.getElementById("add-btn");
const list       = document.getElementById("todo-list");
const emptyState = document.getElementById("empty-state");
const totalEl    = document.getElementById("total-count");
const doneEl     = document.getElementById("done-count");
const remainEl   = document.getElementById("remain-count");
const clearBtn   = document.getElementById("clear-done-btn");
const toastEl    = document.getElementById("toast");
const filterBtns = document.querySelectorAll(".filter-btn");
const dateEl     = document.getElementById("today-date");

/* ── Init ── */
dateEl.textContent = formatDate(new Date());
injectShakeKeyframe();

/* ── Realtime Database 실시간 구독 ── */
onValue(todosRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) {
    todos = [];
  } else {
    todos = Object.entries(data)
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  render();
});

/* ── Events ── */
addBtn.addEventListener("click", addTodo);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") addTodo(); });
clearBtn.addEventListener("click", clearDone);

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

/* ── Core (Realtime Database CRUD) ── */
async function addTodo() {
  const text = input.value.trim();
  if (!text) {
    input.focus();
    shake(input.closest(".input-wrapper"));
    return;
  }

  input.value = "";
  input.focus();

  await push(todosRef, { text, done: false, createdAt: Date.now() });
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

async function clearDone() {
  const doneTodos = todos.filter((t) => t.done);
  if (doneTodos.length === 0) { showToast("완료된 항목이 없어요"); return; }

  await Promise.all(doneTodos.map((t) => remove(ref(db, `todos/${t.id}`))));
  showToast(`완료 ${doneTodos.length}개를 삭제했어요`);
}

/* ── Render ── */
function render() {
  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done")   return t.done;
    return true;
  });

  list.innerHTML = "";

  filtered.forEach((todo) => {
    const li = document.createElement("li");
    li.className = `todo-item${todo.done ? " done" : ""}`;
    li.innerHTML = `
      <button class="check-btn ${todo.done ? "checked" : ""}" data-id="${todo.id}" aria-label="완료 토글">
        <svg class="check-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="todo-text">${escapeHtml(todo.text)}</span>
      <button class="delete-btn" data-id="${todo.id}" aria-label="삭제">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll(".check-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleTodo(btn.dataset.id));
  });
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteTodo(btn.dataset.id));
  });

  const total  = todos.length;
  const done   = todos.filter((t) => t.done).length;
  const remain = total - done;

  totalEl.textContent  = total;
  doneEl.textContent   = done;
  remainEl.textContent = remain;

  emptyState.classList.toggle("visible", filtered.length === 0);
}

/* ── Utils ── */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function shake(el) {
  el.style.animation = "none";
  el.offsetHeight;
  el.style.animation = "shake .3s ease";
  el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function injectShakeKeyframe() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-6px); }
      40%      { transform: translateX(6px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);
}
