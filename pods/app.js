(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 40;
  const LENGTHS = [
    { id: "any", label: "Any", test: () => true },
    { id: "tiny", label: "<15m", test: (s) => s < 900 },
    { id: "short", label: "<30m", test: (s) => s < 1800 },
    { id: "mid", label: "30–90m", test: (s) => s >= 1800 && s < 5400 },
    { id: "long", label: "90m+", test: (s) => s >= 5400 },
  ];
  const SORTS = [{ id: "new", label: "Newest" }, { id: "old", label: "Oldest" }];

  const store = {
    get(k, d) { try { const v = localStorage.getItem("pp:" + k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("pp:" + k, v); } catch {} },
  };

  const state = {
    topic: store.get("topic", "All"),
    sub: store.get("sub", "All"),
    length: store.get("length", "any"),
    sort: store.get("sort", "new"),
    status: store.get("status", "all"),
    feed: store.get("feed", "All"),
    q: "",
    shown: PAGE,
  };
  let episodes = [], byId = {}, shows = {}, topics = [], filtered = [];

  /* ── Listening progress (this device) ──
     prog[id] = { t: seconds in, d: length, w: 1 played, s: 1 saved, x: 1 hidden from Continue, at } */
  let prog = {};
  try { prog = JSON.parse(localStorage.getItem("pp:prog") || "{}") || {}; } catch { prog = {}; }
  let saveTimer;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem("pp:prog", JSON.stringify(prog)); } catch {} }, 300);
  };
  const P = (id) => prog[id] || {};
  const setP = (id, patch) => {
    const next = { ...P(id), ...patch, at: Date.now() };
    if (!next.t && !next.w && !next.s) delete prog[id]; else prog[id] = next;
    persist();
  };
  const inProgress = (id) => { const p = P(id); return !p.w && !p.x && p.t > 20; };
  const STATUSES = [
    { id: "all", label: "All episodes", test: () => true },
    { id: "progress", label: "Continue listening", test: (e) => inProgress(e.id) },
    { id: "saved", label: "Saved", test: (e) => !!P(e.id).s },
    { id: "unplayed", label: "Unplayed", test: (e) => !P(e.id).w },
    { id: "played", label: "Played", test: (e) => !!P(e.id).w },
  ];

  // Theme: dark by default, light remembered.
  $("#theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtDur = (s) => {
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${Math.max(1, m)}m`;
  };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtClock = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
    return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s2).padStart(2, "0")}`;
  };
  const fmtLeft = (sec) => {
    const m = Math.max(1, Math.round(sec / 60));
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m left` : `${m}m left`;
  };
  const leaf = (t) => t.slice(t.lastIndexOf("/") + 1);
  const GENERIC = new Set(["US", "UK", "Canada", "Other", "Australian", "International", "Celebrity", "Live Feeds"]);
  const tagLabel = (t) => {
    const i = t.lastIndexOf("/"), l = leaf(t);
    return i > 0 && GENERIC.has(l) ? `${t.slice(0, i)} ${l}` : l;
  };
  const inTopic = (tags, p) => tags.some((t) => t === p || t.startsWith(p + "/"));
  const showName = (e) => (shows[e.show] || {}).name || "";
  const art = (e) => (shows[e.show] || {}).art || "icons/icon-192.png";
  const lengthOf = (e) => P(e.id).d || e.seconds || 0;

  function matches(e, skip) {
    if (skip !== "topic" && state.topic !== "All") {
      if (!inTopic(e.topics, state.topic)) return false;
      if (skip !== "sub" && state.sub !== "All" && !e.topics.includes(state.topic + "/" + state.sub)) return false;
    }
    if (skip !== "length" && !LENGTHS.find((l) => l.id === state.length).test(e.seconds)) return false;
    if (state.feed !== "All" && e.show !== state.feed) return false;
    if (state.status !== "all" && !STATUSES.find((x) => x.id === state.status).test(e)) return false;
    if (state.q) {
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every((w) => e._hay.includes(w))) return false;
    }
    return true;
  }

  const chip = (label, value, selected, n, attr = "t") =>
    `<button class="chip" role="tab" aria-selected="${selected}" data-${attr}="${esc(value)}">${esc(label)}<span class="n">${n}</span></button>`;

  function renderTopics() {
    const base = episodes.filter((e) => matches(e, "topic"));
    let html = chip("All", "All", state.topic === "All", base.length);
    for (const t of topics) {
      const c = base.filter((e) => inTopic(e.topics, t.name)).length;
      if (c || t.name === state.topic) html += chip(t.name, t.name, t.name === state.topic, c);
    }
    $("#topics").innerHTML = html;
    const def = topics.find((t) => t.name === state.topic);
    if (!def || !def.sub.length) { $("#subs").hidden = true; return; }
    const sbase = episodes.filter((e) => matches(e, "sub"));
    let shtml = chip(`All ${def.name}`, "All", state.sub === "All", sbase.length, "s");
    for (const s of def.sub) {
      const c = sbase.filter((e) => e.topics.includes(def.name + "/" + s)).length;
      if (c || s === state.sub) shtml += chip(s, s, s === state.sub, c, "s");
    }
    $("#subs").hidden = false;
    $("#subs").innerHTML = shtml;
  }

  const seg = (el, items, cur, attr) => {
    el.innerHTML = items.map((x) => `<button data-${attr}="${x.id}" aria-pressed="${x.id === cur}">${x.label}</button>`).join("");
  };
  const pick = (el, items, cur) => {
    el.innerHTML = items.map((x) => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.label)}</option>`).join("");
  };

  function thumbHTML(e) {
    const p = P(e.id);
    const pct = !p.w && p.t > 20 ? Math.min(100, (p.t / (lengthOf(e) || 1)) * 100) : 0;
    const now = current && current.id === e.id;
    return `<div class="art"><img loading="lazy" decoding="async" alt="" src="${esc(art(e))}">
      ${p.w ? '<span class="played-badge" aria-label="Played">✓</span>' : ""}
      ${now ? `<span class="eq${audio.paused ? " paused" : ""}" aria-label="Now playing"><i></i><i></i><i></i></span>` : ""}
      ${pct ? `<span class="prog"><i style="width:${pct.toFixed(1)}%"></i></span>` : ""}</div>`;
  }

  function itemHTML(e) {
    const p = P(e.id);
    const tags = (p.s ? '<span class="tag saved">★ Saved</span>' : "") +
      e.topics.map((t) => `<span class="tag">${esc(tagLabel(t))}</span>`).join("");
    const left = inProgress(e.id) ? ` · <b class="left">${fmtLeft(lengthOf(e) - p.t)}</b>` : "";
    return `<li class="item${p.w ? " played" : ""}${current && current.id === e.id ? " now" : ""}"><a href="${esc(e.audio)}" data-id="${e.id}">
      ${thumbHTML(e)}
      <div class="meta"><p class="title">${esc(e.title)}</p>
      <p class="info">${fmtDate(e.published)} · ${esc(showName(e))} · ${fmtDur(e.seconds)}${left}</p>
      <div class="tags">${tags}</div></div></a></li>`;
  }

  function renderShelf() {
    const items = state.q || state.status !== "all" ? [] : episodes
      .filter((e) => inProgress(e.id)).sort((a, b) => P(b.id).at - P(a.id).at).slice(0, 12);
    const el = $("#shelf");
    el.hidden = !items.length;
    if (!items.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<h2>Continue listening</h2><div class="shelf-row">${items.map((e) =>
      `<a class="shelf-card" href="${esc(e.audio)}" data-id="${e.id}">${thumbHTML(e)}
        <button type="button" class="unshelf" data-unshelf="${e.id}" aria-label="Remove from Continue listening">×</button>
        <p class="title">${esc(e.title)}</p><p class="info">${fmtLeft(lengthOf(e) - P(e.id).t)}</p></a>`).join("")}</div>`;
  }

  function computeList() {
    filtered = episodes.filter((e) => matches(e));
    if (state.sort === "old") filtered.reverse();
  }

  function renderList(keepScroll) {
    const y = window.scrollY;
    computeList();
    $("#list").innerHTML = filtered.slice(0, state.shown).map(itemHTML).join("");
    $("#empty").hidden = filtered.length > 0;
    $("#count").textContent = filtered.length === episodes.length
      ? `${episodes.length.toLocaleString()} episodes`
      : `${filtered.length.toLocaleString()} of ${episodes.length.toLocaleString()} episodes`;
    if (keepScroll) window.scrollTo({ top: y });
  }

  function render() {
    state.shown = PAGE;
    renderTopics();
    seg($("#lengths"), LENGTHS, state.length, "l");
    seg($("#sort"), SORTS, state.sort, "o");
    pick($("#status"), STATUSES, state.status);
    pick($("#feed"), [{ id: "All", label: "All podcasts" }, ...Object.entries(shows)
      .filter(([id]) => episodes.some((e) => e.show === id))
      .map(([id, s]) => ({ id, label: s.name }))], state.feed);
    renderShelf();
    renderList();
  }
  const refresh = () => { renderShelf(); renderList(true); };

  const save = () => { for (const k of ["topic", "sub", "length", "sort", "status", "feed"]) store.set(k, state[k]); };
  const on = (sel, ev, fn) => $(sel).addEventListener(ev, fn);
  on("#topics", "click", (e) => { const b = e.target.closest(".chip"); if (!b) return; Object.assign(state, { topic: b.dataset.t, sub: "All" }); save(); render(); window.scrollTo({ top: 0 }); });
  on("#subs", "click", (e) => { const b = e.target.closest(".chip"); if (!b) return; state.sub = b.dataset.s; save(); render(); window.scrollTo({ top: 0 }); });
  on("#lengths", "click", (e) => { const b = e.target.closest("button"); if (!b) return; state.length = b.dataset.l; save(); render(); });
  on("#sort", "click", (e) => { const b = e.target.closest("button"); if (!b) return; state.sort = b.dataset.o; save(); render(); window.scrollTo({ top: 0 }); });
  on("#status", "change", (e) => { state.status = e.target.value; save(); render(); window.scrollTo({ top: 0 }); });
  on("#feed", "change", (e) => { state.feed = e.target.value; save(); render(); window.scrollTo({ top: 0 }); });
  let qt;
  on("#q", "input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120); });

  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.shown < filtered.length) {
      const start = state.shown;
      state.shown += PAGE;
      $("#list").insertAdjacentHTML("beforeend", filtered.slice(start, state.shown).map(itemHTML).join(""));
    }
  }, { rootMargin: "800px" }).observe($("#more"));

  /* ── Audio player ──
     One <audio> element for the whole app, so listening carries on while you browse,
     with the screen off, or in another app. Lock-screen and earbud controls via Media Session. */
  const audio = new Audio();
  audio.preload = "metadata";
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
  let speed = parseFloat(store.get("speed", "1")) || 1;
  let current = null, pendingSeek = 0, recT = null;

  function record() {
    if (!current || !audio.currentTime) return;
    const t = audio.currentTime, d = audio.duration || current.seconds;
    if (d && t / d >= 0.95) setP(current.id, { w: 1, t: 0, d, x: 0 });
    else setP(current.id, { t, d, x: 0 });
  }

  function setMediaSession() {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title, artist: showName(current), album: "PS Pods",
      artwork: [{ src: art(current), sizes: "600x600", type: "image/jpeg" }],
    });
    const h = {
      play: () => audio.play(), pause: () => audio.pause(),
      seekbackward: (d) => skip(-(d.seekOffset || 15)), seekforward: (d) => skip(d.seekOffset || 30),
      seekto: (d) => { audio.currentTime = d.seekTime; },
    };
    for (const [k, fn] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(k, fn); } catch {} }
  }
  function positionState() {
    try {
      if ("mediaSession" in navigator && audio.duration && isFinite(audio.duration))
        navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) });
    } catch {}
  }
  const skip = (s) => { audio.currentTime = Math.max(0, Math.min((audio.duration || 1e9) - 1, audio.currentTime + s)); };

  function load(e, autoplay) {
    if (current && current.id !== e.id) record();
    current = e;
    store.set("current", e.id);
    const p = P(e.id);
    pendingSeek = !p.w && p.t > 20 && p.t < lengthOf(e) - 30 ? p.t : 0;
    audio.src = e.audio;
    audio.playbackRate = speed;
    setMediaSession();
    renderMini();
    if (autoplay) audio.play().catch(() => renderMini());
  }

  function play(id, open = true) {
    const e = byId[id];
    if (!e) return;
    if (current && current.id === id) { if (audio.paused) audio.play().catch(() => {}); }
    else load(e, true);
    if (open) openSheet();
    refreshNow();
  }

  audio.addEventListener("loadedmetadata", () => {
    if (pendingSeek) { audio.currentTime = pendingSeek; pendingSeek = 0; }
    audio.playbackRate = speed;
    sync();
  });
  audio.addEventListener("play", () => { clearInterval(recT); recT = setInterval(record, 5000); sync(); refreshNow(); });
  audio.addEventListener("pause", () => { clearInterval(recT); record(); sync(); refreshNow(); });
  audio.addEventListener("timeupdate", () => { sync(); });
  audio.addEventListener("ended", () => {
    clearInterval(recT);
    if (current) setP(current.id, { w: 1, t: 0, x: 0 });
    sync(); refresh();
  });
  audio.addEventListener("error", () => { if (current && audio.src) toast("Couldn't load this episode. Check your connection and try again."); });
  audio.addEventListener("waiting", () => document.body.classList.add("buffering"));
  audio.addEventListener("playing", () => document.body.classList.remove("buffering"));
  document.addEventListener("visibilitychange", () => { if (document.hidden) record(); });
  window.addEventListener("pagehide", record);

  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="16.5" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="Inter,sans-serif">15</text></svg>',
    fwd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="16.5" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="Inter,sans-serif">30</text></svg>',
    down: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* Mini player: docked at the bottom whenever an episode is loaded. */
  function renderMini() {
    const el = $("#mini");
    if (!current) { el.hidden = true; document.body.classList.remove("has-mini"); return; }
    el.hidden = false;
    document.body.classList.add("has-mini");
    el.innerHTML = `
      <div class="mini-bar"><i></i></div>
      <button type="button" class="mini-open" aria-label="Open player">
        <img src="${esc(art(current))}" alt="">
        <span class="mini-text"><b>${esc(current.title)}</b><span>${esc(showName(current))}</span></span>
      </button>
      <button type="button" class="mini-btn" data-mini="back" aria-label="Back 15 seconds">${ICON.back}</button>
      <button type="button" class="mini-btn mini-play" data-mini="play" aria-label="Play">${ICON.play}</button>`;
    sync();
  }
  $("#mini").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mini]");
    if (b) {
      if (b.dataset.mini === "play") audio.paused ? audio.play().catch(() => {}) : audio.pause();
      if (b.dataset.mini === "back") skip(-15);
      return;
    }
    if (e.target.closest(".mini-open")) openSheet();
  });

  /* Full player sheet */
  let seeking = false;
  function openSheet() {
    if (!current || document.querySelector(".sheet")) { if (document.querySelector(".sheet")) renderSheet(); return; }
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    document.body.appendChild(sheet);
    document.body.classList.add("sheet-open");
    history.pushState({ sheet: 1 }, "");
    renderSheet();
  }
  function renderSheet() {
    const sheet = document.querySelector(".sheet");
    if (!sheet || !current) return;
    const e = current, p = P(e.id);
    sheet.setAttribute("aria-label", e.title);
    sheet.innerHTML = `
      <div class="sheet-inner">
        <div class="sheet-top"><button type="button" class="sheet-close" aria-label="Close">${ICON.down}</button>
          <span class="sheet-from">${esc(showName(e))}</span></div>
        <div class="cover"><img src="${esc(art(e))}" alt=""></div>
        <h2 class="sheet-title">${esc(e.title)}</h2>
        <p class="info">${fmtDate(e.published)} · ${fmtDur(e.seconds)}</p>
        <div class="scrub">
          <input class="seek" type="range" min="0" max="${Math.floor(lengthOf(e))}" value="0" step="1" aria-label="Seek">
          <div class="times"><span class="t-now">0:00</span><span class="t-left">-${fmtClock(lengthOf(e))}</span></div>
        </div>
        <div class="transport">
          <button type="button" class="pc-chip" data-pc="speed" aria-label="Playback speed">${speed}×</button>
          <button type="button" class="tp" data-pc="back" aria-label="Back 15 seconds">${ICON.back}</button>
          <button type="button" class="tp tp-play" data-pc="play" aria-label="Play">${ICON.play}</button>
          <button type="button" class="tp" data-pc="fwd" aria-label="Forward 30 seconds">${ICON.fwd}</button>
          <span class="pc-chip ghost" aria-hidden="true"></span>
        </div>
        <div class="sheet-actions">
          <button type="button" class="act" data-act="save" aria-pressed="${!!p.s}">${p.s ? "★ Saved" : "☆ Save"}</button>
          <button type="button" class="act" data-act="played" aria-pressed="${!!p.w}">${p.w ? "✓ Played" : "Mark played"}</button>
        </div>
        <div class="tags">${e.topics.map((t) => `<span class="tag">${esc(tagLabel(t))}</span>`).join("")}</div>
        ${e.desc ? `<p class="desc">${esc(e.desc)}</p>` : ""}
      </div>`;
    sheet.querySelector(".sheet-close").addEventListener("click", () => history.back());
    sheet.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-pc],[data-act]");
      if (!b) return;
      const a = b.dataset.pc || b.dataset.act;
      if (a === "play") audio.paused ? audio.play().catch(() => {}) : audio.pause();
      if (a === "back") skip(-15);
      if (a === "fwd") skip(30);
      if (a === "speed") {
        speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
        audio.playbackRate = speed; store.set("speed", String(speed)); b.textContent = `${speed}×`; positionState();
      }
      if (a === "save") { setP(e.id, { s: P(e.id).s ? 0 : 1 }); renderSheet(); }
      if (a === "played") {
        if (P(e.id).w) setP(e.id, { w: 0, t: 0 });
        else { setP(e.id, { w: 1, t: 0 }); if (current && current.id === e.id) audio.pause(); }
        renderSheet();
      }
    });
    const seek = sheet.querySelector(".seek");
    seek.addEventListener("input", () => { seeking = true; sheet.querySelector(".t-now").textContent = fmtClock(+seek.value); });
    seek.addEventListener("change", () => { seeking = false; audio.currentTime = +seek.value; });
    sync();
  }
  function closeSheet() {
    document.querySelector(".sheet")?.remove();
    document.body.classList.remove("sheet-open");
    refresh();
  }
  window.addEventListener("popstate", () => { if (document.querySelector(".sheet")) closeSheet(); });

  function sync() {
    const t = audio.currentTime || pendingSeek || 0;
    const d = (isFinite(audio.duration) && audio.duration) || (current && lengthOf(current)) || 0;
    const playing = !audio.paused;
    const pct = d ? `${(Math.min(t, d) / d) * 100}%` : "0%";
    const mini = $("#mini");
    if (!mini.hidden) {
      mini.querySelector(".mini-bar i")?.style.setProperty("width", pct);
      const mp = mini.querySelector(".mini-play");
      if (mp) { mp.innerHTML = playing ? ICON.pause : ICON.play; mp.setAttribute("aria-label", playing ? "Pause" : "Play"); }
    }
    const sheet = document.querySelector(".sheet");
    if (sheet) {
      const seek = sheet.querySelector(".seek");
      if (seek && !seeking) { seek.max = Math.floor(d); seek.value = Math.floor(t); sheet.querySelector(".t-now").textContent = fmtClock(t); }
      if (seek) seek.style.setProperty("--pct", pct);
      const tl = sheet.querySelector(".t-left"); if (tl) tl.textContent = "-" + fmtClock(Math.max(0, d - t));
      const tp = sheet.querySelector(".tp-play");
      if (tp) { tp.innerHTML = playing ? ICON.pause : ICON.play; tp.setAttribute("aria-label", playing ? "Pause" : "Play"); }
    }
    positionState();
  }
  function refreshNow() {
    // update the "now playing" marker on visible cards without a full re-render
    document.querySelectorAll(".item.now").forEach((li) => li.classList.remove("now"));
    document.querySelectorAll(".eq").forEach((x) => x.remove());
    if (!current) return;
    document.querySelectorAll(`a[data-id="${current.id}"] .art`).forEach((a) => {
      a.insertAdjacentHTML("beforeend", `<span class="eq${audio.paused ? " paused" : ""}" aria-label="Now playing"><i></i><i></i><i></i></span>`);
      a.closest(".item")?.classList.add("now");
    });
  }

  let toastT;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // Taps on cards play; × on a Continue card hides it (keeps your place).
  document.addEventListener("click", (e) => {
    const x = e.target.closest("[data-unshelf]");
    if (x) {
      e.preventDefault(); e.stopPropagation();
      setP(x.dataset.unshelf, { x: 1 });
      x.closest(".shelf-card").classList.add("leaving");
      setTimeout(() => { renderShelf(); if (state.status === "progress") renderList(true); }, 180);
      return;
    }
    const a = e.target.closest("a[data-id]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    play(a.dataset.id);
  });

  Promise.all([
    fetch("data/episodes.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("topics.json", { cache: "no-cache" }).then((r) => r.json()),
  ]).then(([data, tconf]) => {
    shows = data.shows || {};
    topics = tconf.areas[0].topics.map((x) => (typeof x === "string" ? { name: x, sub: [] } : { name: x.name, sub: x.sub || [] }));
    episodes = data.episodes.map((e) => ({ ...e, _hay: (e.title + " " + showName({ show: e.show }) + " " + e.topics.map(leaf).join(" ")).toLowerCase() }));
    byId = Object.fromEntries(episodes.map((e) => [e.id, e]));
    if (state.topic !== "All" && !topics.some((t) => t.name === state.topic)) Object.assign(state, { topic: "All", sub: "All" });
    if (state.feed !== "All" && !shows[state.feed]) state.feed = "All";
    if (!STATUSES.some((x) => x.id === state.status)) state.status = "all";
    // bring back the last episode, paused, ready to continue
    const last = byId[store.get("current", "")];
    if (last && !P(last.id).w) load(last, false);
    render();
    $("#foot").textContent = "Updated " + new Date(data.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }).catch(() => {
    $("#count").textContent = "Couldn't load episodes. Check your connection.";
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});

  /* ── Install bar (same pattern as PS Sports / PS Tube) ── */
  const DISMISS_KEY = "pp-install-dismissed";
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const dismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  function installBar(label, onGo) {
    if (standalone() || dismissed() || document.querySelector(".install-bar")) return;
    const bar = document.createElement("div");
    bar.className = "install-bar";
    bar.innerHTML = `<img src="icons/icon-192.png" alt="" width="40" height="40">
      <span class="install-text"><b>Get the PS Pods app</b><span>Listen with your screen off</span></span>
      <button type="button" class="install-go">${label}</button>
      <button type="button" class="install-x" aria-label="Not now">×</button>`;
    bar.querySelector(".install-go").addEventListener("click", onGo);
    bar.querySelector(".install-x").addEventListener("click", () => { try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {} bar.remove(); });
    document.body.appendChild(bar);
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    installBar("Install", async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      deferred = null; document.querySelector(".install-bar")?.remove();
    });
  });
  window.addEventListener("appinstalled", () => document.querySelector(".install-bar")?.remove());
  if (isIOS && !standalone()) {
    setTimeout(() => installBar("How", () => {
      const sh = document.createElement("div");
      sh.className = "install-sheet";
      sh.innerHTML = `<div class="install-card" role="dialog" aria-label="Add PS Pods to your Home Screen">
        <h2>Add PS Pods to your Home Screen</h2>
        <ol><li>Tap the <b>Share</b> button in Safari (behind the ••• menu on iOS 26)</li>
        <li>Scroll down and tap <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>
        <button type="button" class="install-done">Got it</button></div>`;
      sh.addEventListener("click", (ev) => { if (ev.target === sh || ev.target.closest(".install-done")) sh.remove(); });
      document.body.appendChild(sh);
    }), 1500);
  }
})();
