// Basic configuration
// When frontend and backend are served from the same origin
// (for example, http://127.0.0.1:8000 via FastAPI), keep this empty:
const API_BASE = "";

const PAGES = {
  MAIN: "main",
  PRICE: "price",
  PORTFOLIO: "portfolio",
  ME: "me",
  RECORD_DATE: "record-date",
  RECORD_TIME: "record-time",
  RECORD_DATA: "record-data",
};

const SLOT_RANGES = [
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
];

const state = {
  currentPage: PAGES.MAIN,
  selectedDate: null,
  selectedTimeRange: null,
  calendarMonthOffset: 0,
  tgUserId: null,
};

const LS_KEYS = {
  LAST_PHONE: "salon_last_phone",
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function formatDateDisplay(date) {
  return date.toLocaleDateString("ru-RU");
}

function isoFromDate(date) {
  return date.toISOString().split("T")[0];
}

function getNextWorkday(fromDate) {
  // Backend allows only Mon-Fri; JS getDay(): 0=Sun, 6=Sat.
  const d = new Date(fromDate.getTime());
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  // Normalize to noon to avoid UTC date shifting in `isoFromDate()`.
  d.setHours(12, 0, 0, 0);
  return d;
}

function navigateTo(page) {
  state.currentPage = page;

  $all(".page").forEach((el) => {
    const isActive = el.dataset.page === page;
    el.classList.toggle("is-active", isActive);
  });

  $all(".tab-item").forEach((btn) => {
    const target = btn.dataset.nav;
    const isBookingFlow =
      page === PAGES.RECORD_DATE ||
      page === PAGES.RECORD_TIME ||
      page === PAGES.RECORD_DATA;
    const activeTarget = isBookingFlow ? PAGES.RECORD_DATE : page;
    btn.classList.toggle("is-active", target === activeTarget);
  });

  if (page === PAGES.RECORD_DATE) {
    renderCalendar();
  } else if (page === PAGES.RECORD_TIME && state.selectedDate) {
    loadTimeSlots(state.selectedDate);
  } else if (page === PAGES.ME) {
    loadMyRecords();
  }

  syncFlowUI();
}

function syncFlowUI() {
  const selectedRow = $("#selected-date-row");
  const selectedText = $("#selected-date-text");
  if (selectedRow && selectedText) {
    if (state.selectedDate) {
      selectedText.textContent = formatDateDisplay(state.selectedDate);
      selectedRow.hidden = false;
    } else {
      selectedRow.hidden = true;
    }
  }

  const appointmentDate = $("#appointment-date-text");
  if (appointmentDate) {
    appointmentDate.textContent = state.selectedDate
      ? formatDateDisplay(state.selectedDate)
      : "";
  }

  const summary = $("#summary-datetime");
  if (summary) {
    const datePart = state.selectedDate ? formatDateDisplay(state.selectedDate) : "";
    const timePart = state.selectedTimeRange || "";
    summary.textContent = datePart && timePart ? `${datePart} at ${timePart}` : "";
  }
}

async function fetchJson(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const data = JSON.parse(text);
      message = data.detail || JSON.stringify(data);
    } catch {
      // ignore
    }
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function renderCalendar() {
  const calendarEl = $("#calendar");
  if (!calendarEl) return;

  const today = new Date();
  const currentMonth = new Date(
    today.getFullYear(),
    today.getMonth() + state.calendarMonthOffset,
    1
  );
  const monthStart = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  );
  const monthEnd = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  );

  const container = document.createElement("div");

  const header = document.createElement("div");
  header.className = "calendar-header";
  const monthLabel = document.createElement("div");
  monthLabel.className = "calendar-month";
  monthLabel.textContent = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹";
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "›";

  prevBtn.onclick = () => {
    if (state.calendarMonthOffset > 0) {
      state.calendarMonthOffset -= 1;
      renderCalendar();
    }
  };
  nextBtn.onclick = () => {
    if (state.calendarMonthOffset < 1) {
      state.calendarMonthOffset += 1;
      renderCalendar();
    }
  };

  nav.append(prevBtn, nextBtn);
  header.append(monthLabel, nav);
  container.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  const dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  for (const name of dayNames) {
    const dn = document.createElement("div");
    dn.className = "calendar-day-name";
    dn.textContent = name;
    grid.appendChild(dn);
  }

  const startDayIndex = (monthStart.getDay() + 6) % 7;
  for (let i = 0; i < startDayIndex; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell empty";
    grid.appendChild(empty);
  }

  const monthDays = monthEnd.getDate();
  const cells = [];

  for (let day = 1; day <= monthDays; day++) {
    const cellDate = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day
    );
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-cell";
    cell.textContent = String(day);

    const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
    const diffMs = cellDate - today;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const withinMonth =
      diffDays >= 0 && diffDays <= 30 && !isWeekend;

    if (withinMonth) {
      cell.classList.add("available");
      cell.dataset.date = isoFromDate(cellDate);
      cell.onclick = () => {
        state.selectedDate = cellDate;
        syncFlowUI();
        navigateTo(PAGES.RECORD_TIME);
      };
    } else {
      cell.classList.add("disabled");
    }

    if (
      state.selectedDate &&
      isoFromDate(cellDate) === isoFromDate(state.selectedDate)
    ) {
      cell.classList.add("selected");
    }

    grid.appendChild(cell);
    cells.push({ cell, cellDate });
  }

  container.appendChild(grid);
  calendarEl.innerHTML = "";
  calendarEl.appendChild(container);

  markFullyBookedDays(cells);
  syncFlowUI();
}

async function markFullyBookedDays(cells) {
  for (const { cell, cellDate } of cells) {
    if (!cell.dataset.date) continue;
    try {
      const iso = isoFromDate(cellDate);
      const data = await fetchJson(`/api/slots?date=${iso}`);
      const allBooked = data.slots.every(
        (s) => s.status === "booked"
      );
      if (allBooked) {
        cell.classList.add("fully-booked");
      }
    } catch {
      // ignore errors on calendar
    }
  }
}

async function loadTimeSlots(dateObj) {
  const container = $("#time-slots");
  if (!container) return;

  container.innerHTML = "";
  const iso = isoFromDate(dateObj);

  let data;
  try {
    data = await fetchJson(`/api/slots?date=${iso}`);
  } catch (err) {
    container.innerHTML =
      '<p class="hint">Cannot load time slots. Please choose another date.</p>';
    return;
  }

  const booked = new Set(
    (data.slots || [])
      .filter((s) => s.status === "booked")
      .map((s) => s.time_range)
  );

  SLOT_RANGES.forEach((range) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-btn";
    btn.textContent = range;

    if (booked.has(range)) {
      btn.disabled = true;
      btn.classList.add("is-booked");
    } else {
      btn.onclick = () => {
        state.selectedTimeRange = range;
        syncFlowUI();
        navigateTo(PAGES.RECORD_DATA);
      };
    }

    container.appendChild(btn);
  });

  syncFlowUI();
}

async function handleRecordSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const errorEl = $("#record-error");
  if (errorEl) errorEl.textContent = "";

  if (!state.selectedDate || !state.selectedTimeRange) {
    if (errorEl) {
      errorEl.textContent = "Please choose date and time first.";
    }
    return;
  }

  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const phonePattern = /^\+7\d{10}$/;
  if (!phonePattern.test(phone)) {
    if (errorEl) {
      errorEl.textContent =
        "Phone must be in the format +79011111111.";
    }
    return;
  }

  try {
    const payload = {
      date: isoFromDate(state.selectedDate),
      time_range: state.selectedTimeRange,
      name,
      phone,
      tg_user_id: state.tgUserId,
    };
    await fetchJson("/api/book", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    localStorage.setItem(LS_KEYS.LAST_PHONE, phone);
    form.reset();
    state.selectedTimeRange = null;
    syncFlowUI();

    navigateTo(PAGES.MAIN);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent =
        err.message || "Failed to save record.";
    }
  }
}

async function loadMyRecords() {
  const container = $("#my-records");
  if (!container) return;

  container.innerHTML = "";
  const phone = localStorage.getItem(LS_KEYS.LAST_PHONE);
  if (!phone) {
    container.innerHTML =
      '<p class="hint">You have no records yet.</p>';
    return;
  }

  let records = [];
  try {
    records = await fetchJson(
      `/api/bookings?phone=${encodeURIComponent(phone)}`
    );
  } catch {
    container.innerHTML =
      '<p class="hint">Cannot load records now.</p>';
    return;
  }

  if (!records.length) {
    container.innerHTML =
      '<p class="hint">You have no records yet.</p>';
    return;
  }

  records.forEach((rec) => {
    const item = document.createElement("div");
    item.className = "record-item";

    const meta = document.createElement("div");
    meta.className = "record-meta";
    const dateSpan = document.createElement("span");
    const timeSpan = document.createElement("span");

    const d = new Date(rec.date);
    dateSpan.textContent = `Date: ${formatDateDisplay(d)}`;
    timeSpan.textContent = `Time: ${rec.time_range}`;

    meta.append(dateSpan, timeSpan);

    const actions = document.createElement("div");
    actions.className = "record-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "danger";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel the record";
    cancelBtn.onclick = async () => {
      try {
        await fetchJson(
          `/api/bookings/${rec.id}?phone=${encodeURIComponent(
            phone
          )}`,
          { method: "DELETE" }
        );
        loadMyRecords();
      } catch {
        // ignore
      }
    };

    actions.appendChild(cancelBtn);
    item.append(meta, actions);
    container.appendChild(item);
  });
}

function setupNavigation() {
  $all("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      if (target) {
        if (target === PAGES.RECORD_TIME && !state.selectedDate) {
          navigateTo(PAGES.RECORD_DATE);
          return;
        }
        if (target === PAGES.RECORD_DATA && (!state.selectedDate || !state.selectedTimeRange)) {
          navigateTo(PAGES.RECORD_DATE);
          return;
        }
        navigateTo(target);
      }
    });
  });

  $all("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.back;
      if (target) {
        navigateTo(target);
      }
    });
  });
}

function setupForms() {
  const recordForm = $("#record-form");
  if (recordForm) {
    recordForm.addEventListener("submit", handleRecordSubmit);
  }
}

function setupTelegram() {
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      const user = window.Telegram.WebApp.initDataUnsafe?.user;
      if (user && user.id) {
        state.tgUserId = user.id;
      }
    } catch {
      // ignore
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupForms();
  setupTelegram();
  const inTelegram = Boolean(window.Telegram && window.Telegram.WebApp);
  if (inTelegram) {
    state.selectedDate = getNextWorkday(new Date());
    navigateTo(PAGES.RECORD_TIME);
  } else {
    navigateTo(PAGES.MAIN);
  }
  syncFlowUI();
});

