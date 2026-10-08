(() => {
  const STATUSES = ['todo', 'in_progress', 'done'];
  const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem('token'),
    user: null,
    tasks: [],
    mode: 'login', // or 'register'
    editingId: null,
    ws: null,
    wsRetry: 0,
  };

  // ---------- API helper ----------
  async function api(path, options = {}) {
    const res = await fetch('/api' + path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && state.token && !path.startsWith('/auth/login')) {
      logout();
      throw new Error(data.error || 'Please log in again');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- Auth ----------
  function setMode(mode) {
    state.mode = mode;
    const register = mode === 'register';
    $('name-field').hidden = !register;
    $('auth-sub').textContent = register ? 'Create an account to start tracking tasks.' : 'Log in to see your tasks.';
    $('auth-submit').textContent = register ? 'Create account' : 'Log in';
    $('switch-text').textContent = register ? 'Already have an account?' : 'New here?';
    $('switch-mode').textContent = register ? 'Log in' : 'Create an account';
    $('auth-error').textContent = '';
    document.querySelector('#auth-form [name=password]').autocomplete = register ? 'new-password' : 'current-password';
  }

  $('switch-mode').addEventListener('click', () => setMode(state.mode === 'login' ? 'register' : 'login'));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const body = { email: form.get('email'), password: form.get('password') };
    if (state.mode === 'register') body.name = form.get('name');
    $('auth-error').textContent = '';
    $('auth-submit').disabled = true;
    try {
      const data = await api(state.mode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      e.target.reset();
      await showApp();
    } catch (err) {
      $('auth-error').textContent = err.message;
    } finally {
      $('auth-submit').disabled = false;
    }
  });

  function logout() {
    localStorage.removeItem('token');
    state.token = null;
    state.user = null;
    state.tasks = [];
    if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
    $('app-view').hidden = true;
    $('auth-view').hidden = false;
    setMode('login');
  }
  $('logout').addEventListener('click', logout);

  // ---------- Views ----------
  async function showApp() {
    $('auth-view').hidden = true;
    $('app-view').hidden = false;
    $('user-name').textContent = state.user.name;
    await loadTasks();
    connectWS();
  }

  async function loadTasks() {
    const params = new URLSearchParams();
    const q = $('search').value.trim();
    const priority = $('filter-priority').value;
    if (q) params.set('q', q);
    if (priority) params.set('priority', priority);
    try {
      const data = await api('/tasks?' + params);
      state.tasks = data.tasks;
      render();
    } catch (err) {
      toast(err.message);
    }
  }

  // ---------- Rendering (DOM APIs only, so user text is never parsed as HTML) ----------
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    children.forEach((c) => c && node.append(c));
    return node;
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function isOverdue(task) {
    if (!task.due_date || task.status === 'done') return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return task.due_date < todayStr;
  }

  function taskCard(task) {
    const idx = STATUSES.indexOf(task.status);
    const actions = el('div', { class: 'card-actions' });

    if (idx > 0) {
      actions.append(el('button', { text: '← ' + STATUS_LABEL[STATUSES[idx - 1]], onclick: () => move(task, STATUSES[idx - 1]) }));
    }
    if (idx < STATUSES.length - 1) {
      actions.append(el('button', { text: STATUS_LABEL[STATUSES[idx + 1]] + ' →', onclick: () => move(task, STATUSES[idx + 1]) }));
    }
    actions.append(
      el('button', { text: 'Edit', onclick: () => openDialog(task) }),
      el('button', { class: 'danger', text: 'Delete', onclick: () => remove(task) })
    );

    const meta = el('div', { class: 'meta' }, el('span', { class: 'badge ' + task.priority, text: task.priority }));
    if (task.due_date) {
      meta.append(el('span', { class: isOverdue(task) ? 'overdue' : '', text: (isOverdue(task) ? 'Overdue: ' : 'Due ') + formatDate(task.due_date) }));
    }

    return el(
      'article', { class: 'card' },
      el('h3', { text: task.title }),
      task.description ? el('p', { text: task.description }) : null,
      meta,
      actions
    );
  }

  function render() {
    for (const status of STATUSES) {
      const list = $('list-' + status);
      const tasks = state.tasks.filter((t) => t.status === status);
      list.replaceChildren();
      $('count-' + status).textContent = tasks.length;
      if (tasks.length === 0) {
        list.append(el('p', { class: 'empty', text: status === 'todo' ? 'Nothing here yet. Add a task to get started.' : 'No tasks.' }));
      } else {
        tasks.forEach((t) => list.append(taskCard(t)));
      }
    }
  }

  // ---------- Task actions ----------
  async function move(task, status) {
    try {
      await api('/tasks/' + task.id, { method: 'PUT', body: { status } });
      toast('Moved to ' + STATUS_LABEL[status]);
    } catch (err) { toast(err.message); }
  }

  async function remove(task) {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    try {
      await api('/tasks/' + task.id, { method: 'DELETE' });
      toast('Task deleted');
    } catch (err) { toast(err.message); }
  }

  // ---------- Dialog ----------
  const dialog = $('task-dialog');
  const taskForm = $('task-form');

  function openDialog(task = null) {
    state.editingId = task ? task.id : null;
    $('dialog-title').textContent = task ? 'Edit task' : 'Add task';
    taskForm.reset();
    $('task-error').textContent = '';
    if (task) {
      taskForm.title.value = task.title;
      taskForm.description.value = task.description;
      taskForm.status.value = task.status;
      taskForm.priority.value = task.priority;
      taskForm.due_date.value = task.due_date || '';
    }
    dialog.showModal();
    taskForm.title.focus();
  }

  $('new-task').addEventListener('click', () => openDialog());
  $('cancel-task').addEventListener('click', () => dialog.close());

  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: taskForm.title.value,
      description: taskForm.description.value,
      status: taskForm.status.value,
      priority: taskForm.priority.value,
      due_date: taskForm.due_date.value || null,
    };
    $('save-task').disabled = true;
    try {
      if (state.editingId) await api('/tasks/' + state.editingId, { method: 'PUT', body });
      else await api('/tasks', { method: 'POST', body });
      dialog.close();
      toast(state.editingId ? 'Task updated' : 'Task added');
    } catch (err) {
      $('task-error').textContent = err.message;
    } finally {
      $('save-task').disabled = false;
    }
  });

  // ---------- Filters ----------
  let searchTimer;
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadTasks, 250); });
  $('filter-priority').addEventListener('change', loadTasks);

  // ---------- Real-time (WebSocket) ----------
  function matchesFilters(task) {
    const q = $('search').value.trim().toLowerCase();
    const priority = $('filter-priority').value;
    if (priority && task.priority !== priority) return false;
    if (q && !(task.title + ' ' + task.description).toLowerCase().includes(q)) return false;
    return true;
  }

  function sortTasks() {
    const rank = { high: 0, medium: 1, low: 2 };
    state.tasks.sort((a, b) =>
      rank[a.priority] - rank[b.priority] ||
      (a.due_date ? 0 : 1) - (b.due_date ? 0 : 1) ||
      (a.due_date || '').localeCompare(b.due_date || '') ||
      b.created_at.localeCompare(a.created_at) ||
      b.id - a.id
    );
  }

  function handleEvent(event) {
    if (event.type === 'task:deleted') {
      state.tasks = state.tasks.filter((t) => t.id !== event.id);
    } else if (event.task) {
      state.tasks = state.tasks.filter((t) => t.id !== event.task.id);
      if (matchesFilters(event.task)) state.tasks.push(event.task);
      sortTasks();
    }
    render();
  }

  function setLive(on) {
    $('live').classList.toggle('on', on);
    $('live-text').textContent = on ? 'Live' : 'Reconnecting';
  }

  function connectWS() {
    if (!state.token) return;
    if (state.ws) { state.ws.onclose = null; state.ws.close(); }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(state.token)}`);
    state.ws = ws;

    ws.onopen = () => { state.wsRetry = 0; setLive(true); };
    ws.onmessage = (msg) => { try { handleEvent(JSON.parse(msg.data)); } catch {} };
    ws.onclose = () => {
      setLive(false);
      if (!state.token) return;
      const delay = Math.min(1000 * 2 ** state.wsRetry++, 15000);
      setTimeout(() => { if (state.token) { loadTasks(); connectWS(); } }, delay);
    };
  }

  // ---------- Init ----------
  async function init() {
    setMode('login');
    if (!state.token) { $('auth-view').hidden = false; return; }
    try {
      const data = await api('/auth/me');
      state.user = data.user;
      await showApp();
    } catch {
      logout();
    }
  }
  init();
})();
