(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 40;
  const LENGTHS = [
    { id: "any", label: "Any", test: () => true },
    { id: "short", label: "<30m", test: (s) => s < 1800 },
    { id: "mid", label: "30–90m", test: (s) => s >= 1800 && s < 5400 },
    { id: "long", label: "90m+", test: (s) => s >= 5400 },
  ];

  const store = {
    get(k, d) { try { const v = localStorage.getItem("ys:" + k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ys:" + k, v); } catch {} },
  };

  // Areas are the big shelves (Health, Music...). Each has its own topics; a topic can
  // have sub-topics, stored on a video as "Parent/Sub" (e.g. "Mixing/EQ").
  const state = {
    area: store.get("area", "all"),
    topic: store.get("topic", "All"),
    sub: store.get("sub", "All"),
    length: store.get("length", "any"),
    sort: store.get("sort", "new"),
    channel: store.get("channel", "All"),
    status: store.get("status", "all"),
    q: "",
    shown: PAGE,
  };
  let videos = [];
  let byId = {};
  let areas = [];
  let channelArea = {};
  let filtered = [];

  /* ── Watch tracking (this device) ──
     watch[id] = { t: seconds watched, d: duration, w: 1 if watched, s: 1 if saved, at: last touched } */
  let watch = {};
  try { watch = JSON.parse(localStorage.getItem("ys:watch") || "{}") || {}; } catch { watch = {}; }
  let saveTimer;
  const persistWatch = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem("ys:watch", JSON.stringify(watch)); } catch {} }, 300);
  };
  const W = (id) => watch[id] || {};
  const setW = (id, patch) => {
    const next = { ...W(id), ...patch, at: Date.now() };
    if (!next.t && !next.w && !next.s) delete watch[id]; else watch[id] = next;
    persistWatch();
  };
  const inProgress = (id) => { const w = W(id); return !w.w && w.t > 20; };
  const STATUSES = [
    { id: "all", label: "All videos", test: () => true },
    { id: "progress", label: "Continue watching", test: (v) => inProgress(v.id) },
    { id: "saved", label: "Saved", test: (v) => !!W(v.id).s },
    { id: "unwatched", label: "Unwatched", test: (v) => !W(v.id).w },
    { id: "watched", label: "Watched", test: (v) => !!W(v.id).w },
  ];

  // Theme: follows the system until toggled, then remembers the choice.
  const theme = store.get("theme", "");
  if (theme) document.documentElement.dataset.theme = theme;
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  const fmtDur = (s) => {
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  };
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const leaf = (t) => t.slice(t.lastIndexOf("/") + 1);
  // Sub-topics like "US" or "Other" need their show name to make sense on a card.
  const GENERIC = new Set(["US", "UK", "Canada", "Other", "Australian", "International", "Celebrity", "Live Feeds"]);
  const tagLabel = (t) => {
    const i = t.lastIndexOf("/"), l = leaf(t);
    return i > 0 && GENERIC.has(l) ? `${t.slice(0, i)} ${l}` : l;
  };
  const inTopic = (tags, p) => tags.some((t) => t === p || t.startsWith(p + "/"));

  // "Title | Guest" -> title with the guest name set apart.
  const titleHTML = (t) => {
    const i = t.lastIndexOf(" | ");
    if (i < 0) return esc(t);
    const guest = t.slice(i + 3);
    if (/huberman lab/i.test(guest)) return esc(t.slice(0, i));
    return `${esc(t.slice(0, i))} <span class="guest">· ${esc(guest)}</span>`;
  };

  const areaOf = (v) => channelArea[v.channelId] || v.area || "other";
  const currentArea = () => areas.find((a) => a.id === state.area);
  const topicDef = (name) => (currentArea()?.topics || []).find((t) => t.name === name);

  function matches(v, skip) {
    if (skip !== "area" && state.area !== "all" && areaOf(v) !== state.area) return false;
    if (skip !== "topic" && state.area !== "all" && state.topic !== "All") {
      if (state.topic === "Untagged") { if (v.topics.length) return false; }
      else if (!inTopic(v.topics, state.topic)) return false;
      if (skip !== "sub" && state.sub !== "All" && !v.topics.includes(state.topic + "/" + state.sub)) return false;
    }
    if (skip !== "length" && !LENGTHS.find((l) => l.id === state.length).test(v.seconds)) return false;
    if (state.channel !== "All" && v.channel !== state.channel) return false;
    if (state.status !== "all" && !STATUSES.find((x) => x.id === state.status).test(v)) return false;
    if (state.q) {
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every((w) => v._hay.includes(w))) return false;
    }
    return true;
  }

  const chip = (label, value, selected, n, attr = "t") =>
    `<button class="chip" role="tab" aria-selected="${selected}" data-${attr}="${esc(value)}">${esc(label)}<span class="n">${n}</span></button>`;

  function renderAreas() {
    const counts = {};
    for (const v of videos) counts[areaOf(v)] = (counts[areaOf(v)] || 0) + 1;
    const tabs = [{ id: "all", short: "All" }, ...areas];
    // Areas with no channels yet stay visible but dimmed.
    $("#areas").innerHTML = tabs
      .map((a) => `<button class="tab${a.id !== "all" && !counts[a.id] ? " dim" : ""}" role="tab" aria-selected="${a.id === state.area}" data-a="${a.id}">${esc(a.short || a.name)}</button>`)
      .join("");
  }

  function renderTopics() {
    const area = currentArea();
    const base = videos.filter((v) => matches(v, "topic"));
    if (!area || !base.length && state.topic === "All") {
      $("#topics").hidden = true; $("#subs").hidden = true; return;
    }
    const n = (p) => base.filter((v) => inTopic(v.topics, p)).length;
    const other = base.filter((v) => v.topics.includes("Other")).length;
    const untagged = base.filter((v) => !v.topics.length).length;
    let html = chip("All", "All", state.topic === "All", base.length);
    for (const t of area.topics) {
      const c = n(t.name);
      if (c || t.name === state.topic) html += chip(t.name, t.name, t.name === state.topic, c);
    }
    if (other || state.topic === "Other") html += chip("Other", "Other", state.topic === "Other", other);
    if (untagged || state.topic === "Untagged") html += chip("Untagged", "Untagged", state.topic === "Untagged", untagged);
    $("#topics").hidden = false;
    $("#topics").innerHTML = html;

    const def = topicDef(state.topic);
    if (!def || !def.sub.length) { $("#subs").hidden = true; return; }
    const sbase = videos.filter((v) => matches(v, "sub"));
    let shtml = chip(`All ${def.name}`, "All", state.sub === "All", sbase.length, "s");
    for (const s of def.sub) {
      const c = sbase.filter((v) => v.topics.includes(def.name + "/" + s)).length;
      if (c || s === state.sub) shtml += chip(s, s, s === state.sub, c, "s");
    }
    $("#subs").hidden = false;
    $("#subs").innerHTML = shtml;
  }

  function renderLengths() {
    $("#lengths").innerHTML = LENGTHS
      .map((l) => `<button data-l="${l.id}" aria-pressed="${l.id === state.length}">${l.label}</button>`)
      .join("");
  }

  function renderChannels() {
    const names = [...new Set(videos.filter((v) => state.area === "all" || areaOf(v) === state.area).map((v) => v.channel))];
    if (state.channel !== "All" && !names.includes(state.channel)) state.channel = "All";
    const sel = $("#channel");
    sel.hidden = names.length < 2;
    sel.innerHTML = ["All", ...names]
      .map((n) => `<option value="${esc(n)}"${n === state.channel ? " selected" : ""}>${n === "All" ? "All channels" : esc(n)}</option>`)
      .join("");
  }

  const fmtLeft = (sec) => {
    const m = Math.max(1, Math.round(sec / 60));
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m left` : `${m}m left`;
  };

  function thumbHTML(v) {
    const w = W(v.id);
    const pct = !w.w && w.t > 20 ? Math.min(100, (w.t / (w.d || v.seconds || 1)) * 100) : 0;
    return `<div class="thumb"><img loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg">
      ${w.w ? '<span class="seen-badge">✓ Watched</span>' : ""}
      <span class="dur">${fmtDur(v.seconds)}</span>
      ${pct ? `<span class="prog"><i style="width:${pct.toFixed(1)}%"></i></span>` : ""}</div>`;
  }

  function itemHTML(v) {
    const w = W(v.id);
    const tags = (w.s ? '<span class="tag saved">★ Saved</span>' : "") +
      v.topics.filter((t) => t !== "Other").map((t) => `<span class="tag">${esc(tagLabel(t))}</span>`).join("");
    const chan = ` · ${esc(v.channel)}`;
    const left = inProgress(v.id) ? ` · <b class="left">${fmtLeft((w.d || v.seconds) - w.t)}</b>` : "";
    return `<li class="item${w.w ? " seen" : ""}"><a href="https://www.youtube.com/watch?v=${v.id}" data-id="${v.id}">
      ${thumbHTML(v)}
      <div class="meta"><p class="title">${titleHTML(v.title)}</p>
      <p class="info">${fmtDate(v.published)}${chan}${v.views ? " · " + fmtViews(v.views) : ""}${left}</p>
      <div class="tags">${tags}</div></div></a></li>`;
  }

  function renderShelf() {
    const items = state.q || state.status !== "all" ? [] : videos
      .filter((v) => inProgress(v.id) && (state.area === "all" || areaOf(v) === state.area))
      .sort((a, b) => W(b.id).at - W(a.id).at)
      .slice(0, 12);
    const el = $("#shelf");
    el.hidden = !items.length;
    if (!items.length) return;
    el.innerHTML = `<h2>Continue watching</h2><div class="shelf-row">${items.map((v) =>
      `<a class="shelf-card" href="https://www.youtube.com/watch?v=${v.id}" data-id="${v.id}">${thumbHTML(v)}
        <p class="title">${titleHTML(v.title)}</p><p class="info">${fmtLeft((W(v.id).d || v.seconds) - W(v.id).t)}</p></a>`).join("")}</div>`;
  }

  function renderStatus() {
    $("#status").innerHTML = STATUSES
      .map((x) => `<option value="${x.id}"${x.id === state.status ? " selected" : ""}>${x.label}</option>`)
      .join("");
  }

  const SORTS = [{ id: "new", label: "Newest" }, { id: "pop", label: "Popular" }];
  function renderSort() {
    $("#sort").innerHTML = SORTS
      .map((o) => `<button data-o="${o.id}" aria-pressed="${o.id === state.sort}">${o.label}</button>`)
      .join("");
  }
  const fmtViews = (n) =>
    n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M views`
    : n >= 1e3 ? `${Math.round(n / 1e3)}K views`
    : `${n} views`;

  function renderList() {
    filtered = videos.filter((v) => matches(v));
    if (state.sort === "pop") filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    $("#list").innerHTML = filtered.slice(0, state.shown).map(itemHTML).join("");
    const area = currentArea();
    const areaTotal = state.area === "all" ? videos.length : videos.filter((v) => areaOf(v) === state.area).length;
    $("#empty").hidden = filtered.length > 0;
    $("#empty").textContent = area && !areaTotal
      ? `No channels in ${area.name} yet.`
      : "No videos match those filters.";
    $("#count").textContent = filtered.length === areaTotal
      ? `${areaTotal} videos${area ? " in " + area.name : ""}`
      : `${filtered.length} of ${areaTotal} videos${area ? " in " + area.name : ""}`;
  }

  function render() {
    state.shown = PAGE;
    renderAreas();
    renderChannels();
    renderTopics();
    renderLengths();
    renderSort();
    renderStatus();
    renderShelf();
    renderList();
  }

  const save = () => { for (const k of ["area", "topic", "sub", "length", "channel", "status"]) store.set(k, state[k]); };

  $("#areas").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b || b.dataset.a === state.area) return;
    Object.assign(state, { area: b.dataset.a, topic: "All", sub: "All", channel: "All" });
    save(); render(); window.scrollTo({ top: 0 });
    b.scrollIntoView({ inline: "nearest", block: "nearest" });
  });
  $("#topics").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    Object.assign(state, { topic: b.dataset.t, sub: "All" });
    save(); render(); window.scrollTo({ top: 0 });
  });
  $("#subs").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.sub = b.dataset.s;
    save(); render(); window.scrollTo({ top: 0 });
  });
  $("#sort").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.o === state.sort) return;
    state.sort = b.dataset.o;
    store.set("sort", state.sort);
    render(); window.scrollTo({ top: 0 });
  });
  $("#lengths").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.length = b.dataset.l;
    save(); render();
  });
  $("#status").addEventListener("change", (e) => {
    state.status = e.target.value;
    save(); render(); window.scrollTo({ top: 0 });
  });
  $("#channel").addEventListener("change", (e) => {
    state.channel = e.target.value;
    save(); render();
  });
  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120);
  });

  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.shown < filtered.length) {
      const start = state.shown;
      state.shown += PAGE;
      $("#list").insertAdjacentHTML("beforeend", filtered.slice(start, state.shown).map(itemHTML).join(""));
    }
  }, { rootMargin: "800px" }).observe($("#more"));

  Promise.all([
    fetch("data/videos.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("topics.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("channels.json", { cache: "no-cache" }).then((r) => r.json()),
  ]).then(([data, tconf, chans]) => {
    areas = tconf.areas.map((a) => ({
      ...a,
      topics: a.topics.map((x) => (typeof x === "string" ? { name: x, sub: [] } : { name: x.name, sub: x.sub || [] })),
    }));
    channelArea = Object.fromEntries(chans.filter((c) => c.id).map((c) => [c.id, c.area]));
    videos = data.videos.map((v) => ({
      ...v,
      _hay: (v.title + " " + v.channel + " " + v.topics.map(leaf).join(" ")).toLowerCase(),
    }));
    byId = Object.fromEntries(videos.map((v) => [v.id, v]));
    if (!STATUSES.some((x) => x.id === state.status)) state.status = "all";
    if (state.area !== "all" && !areas.some((a) => a.id === state.area)) state.area = "all";
    if (!LENGTHS.some((l) => l.id === state.length)) state.length = "any";
    render();
    $("#foot").textContent = "Updated " + new Date(data.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }).catch(() => {
    $("#count").textContent = "Couldn't load the library. Check your connection.";
  });

  /* ── In-app player ──
     Tapping a video opens YouTube's official embedded player in a full-screen sheet,
     resuming where you left off. Android's back gesture closes the sheet. */
  let ytReady;
  const loadYT = () => ytReady || (ytReady = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const sc = document.createElement("script");
    sc.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(sc);
  }));
  let player = null, current = null, tick = null;

  const ytUrl = (id, t) => `https://www.youtube.com/watch?v=${id}${t > 5 ? `&t=${Math.floor(t)}s` : ""}`;

  function record() {
    if (!player || !current || typeof player.getCurrentTime !== "function") return;
    const t = player.getCurrentTime() || 0, d = player.getDuration() || current.seconds;
    if (!t) return;
    if (d && t / d >= 0.92) setW(current.id, { w: 1, t: 0, d });
    else setW(current.id, { t, d });
    renderActions();
  }

  function renderActions() {
    const el = document.querySelector(".sheet-actions");
    if (!el || !current) return;
    const w = W(current.id);
    el.innerHTML = `
      <button type="button" class="act" data-act="save" aria-pressed="${!!w.s}">${w.s ? "★ Saved" : "☆ Save"}</button>
      <button type="button" class="act" data-act="watched" aria-pressed="${!!w.w}">${w.w ? "✓ Watched" : "Mark watched"}</button>
      <a class="act primary" data-act="yt" href="${ytUrl(current.id, w.t)}" target="_blank" rel="noopener">Open in YouTube ↗</a>`;
  }

  function openPlayer(id) {
    const v = byId[id];
    if (!v) return;
    current = v;
    const w = W(id);
    const start = !w.w && w.t > 20 && w.t < (w.d || v.seconds) - 30 ? Math.floor(w.t) : 0;
    const tags = v.topics.filter((t) => t !== "Other").map((t) => `<span class="tag">${esc(tagLabel(t))}</span>`).join("");
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", v.title);
    sheet.innerHTML = `
      <div class="sheet-inner">
        <div class="sheet-top"><button type="button" class="sheet-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          ${start ? `<span class="resume">Resuming at ${fmtClock(start)}</span>` : ""}</div>
        <div class="player-wrap"><div id="yt-player"></div></div>
        <div class="sheet-body">
          <h2 class="sheet-title">${titleHTML(v.title)}</h2>
          <p class="info">${fmtDate(v.published)} · ${esc(v.channel)} · ${fmtDur(v.seconds)}${v.views ? " · " + fmtViews(v.views) : ""}</p>
          <div class="tags">${tags}</div>
          <div class="sheet-actions"></div>
        </div>
      </div>`;
    document.body.appendChild(sheet);
    document.body.classList.add("sheet-open");
    renderActions();
    history.pushState({ sheet: id }, "");

    sheet.querySelector(".sheet-close").addEventListener("click", () => history.back());
    sheet.querySelector(".sheet-actions").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const ww = W(current.id);
      if (b.dataset.act === "save") { setW(current.id, { s: ww.s ? 0 : 1 }); renderActions(); }
      if (b.dataset.act === "watched") { setW(current.id, ww.w ? { w: 0, t: 0 } : { w: 1, t: 0 }); renderActions(); }
      if (b.dataset.act === "yt") {
        // Hand off at the current spot; pause here so both don't play.
        if (player && player.getCurrentTime) {
          record();
          b.href = ytUrl(current.id, player.getCurrentTime());
          try { player.pauseVideo(); } catch {}
        }
      }
    });

    loadYT().then(() => {
      if (current !== v) return;
      player = new YT.Player("yt-player", {
        videoId: id,
        playerVars: { start, autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: (e) => { try { e.target.playVideo(); } catch {} },
          onStateChange: (e) => {
            clearInterval(tick);
            if (e.data === YT.PlayerState.PLAYING) tick = setInterval(record, 5000);
            if (e.data === YT.PlayerState.PAUSED) record();
            if (e.data === YT.PlayerState.ENDED) { setW(current.id, { w: 1, t: 0 }); renderActions(); }
          },
          onError: () => {
            const wrap = document.querySelector(".player-wrap");
            if (wrap) wrap.innerHTML = `<div class="player-msg"><p>This video can't play inside PS Tube.</p>
              <a class="act primary" href="${ytUrl(id, W(id).t)}" target="_blank" rel="noopener">Open in YouTube ↗</a></div>`;
          },
        },
      });
    });
  }

  function closePlayer() {
    record();
    clearInterval(tick);
    try { player && player.destroy(); } catch {}
    player = null; current = null;
    document.querySelector(".sheet")?.remove();
    document.body.classList.remove("sheet-open");
    // refresh progress bars without losing the scroll position
    renderShelf();
    const y = window.scrollY;
    filtered = videos.filter((v) => matches(v));
    if (state.sort === "pop") filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    $("#list").innerHTML = filtered.slice(0, state.shown).map(itemHTML).join("");
    window.scrollTo({ top: y });
  }

  const fmtClock = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = Math.floor(sec % 60);
    return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s2).padStart(2, "0")}`;
  };

  window.addEventListener("popstate", () => { if (document.querySelector(".sheet")) closePlayer(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) record(); });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-id]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    openPlayer(a.dataset.id);
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  /* ── Install bar (same pattern as PS Sports) ──
     Android/Chrome: Chrome fires "beforeinstallprompt" once the app is installable;
     the bar's button opens Chrome's real install prompt.
     iPhone/iPad: there is no install prompt, so the bar opens a short Add to Home Screen guide.
     Closing the bar hides it for this visit only. */
  const DISMISS_KEY = "pt-install-dismissed";
  const standalone = () =>
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const dismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;

  function installBar(label, onGo) {
    if (standalone() || dismissed() || document.querySelector(".install-bar")) return;
    const bar = document.createElement("div");
    bar.className = "install-bar";
    bar.innerHTML = `<img src="icons/icon-192.png" alt="" width="40" height="40">
      <span class="install-text"><b>Get the PS Tube app</b><span>Your video library on your home screen</span></span>
      <button type="button" class="install-go">${label}</button>
      <button type="button" class="install-x" aria-label="Not now">×</button>`;
    bar.querySelector(".install-go").addEventListener("click", onGo);
    bar.querySelector(".install-x").addEventListener("click", () => {
      try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
      bar.remove();
    });
    document.body.appendChild(bar);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    installBar("Install", async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      deferred = null;
      document.querySelector(".install-bar")?.remove();
    });
  });
  window.addEventListener("appinstalled", () => document.querySelector(".install-bar")?.remove());

  if (isIOS && !standalone()) {
    setTimeout(() => installBar("How", () => {
      const sheet = document.createElement("div");
      sheet.className = "install-sheet";
      // iOS 26 moved Safari's Share button behind the ••• menu next to the address bar.
      const ua = navigator.userAgent;
      const chrome = /CriOS/.test(ua);
      const safariVer = +((ua.match(/Version\/(\d+)/) || [])[1] || 0);
      const MORE = `<span class="install-chip" aria-label="three dots">•••</span>`;
      const SHARE = `<span class="install-chip"><svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true"><path d="M6.5 1v8.5M3.5 4l3-3 3 3M2.5 6.5H1.5v7.5h10V6.5h-1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      const steps = chrome
        ? [`Tap the <b>Share</b> button ${SHARE} in the address bar at the top`, `Tap <b>Add to Home Screen</b> (you may need to tap <b>More</b> first)`, `Tap <b>Add</b>. PS Tube shows up with your other apps`]
        : safariVer >= 26
        ? [`Tap the ${MORE} button next to the address bar`, `Tap <b>Share</b> ${SHARE}, then scroll down and tap <b>Add to Home Screen</b>`, `Keep <b>Open as Web App</b> switched on and tap <b>Add</b>`]
        : [`Tap the <b>Share</b> button ${SHARE} at the bottom of Safari`, `Scroll down and tap <b>Add to Home Screen</b>`, `Tap <b>Add</b>. PS Tube shows up with your other apps`];
      sheet.innerHTML = `<div class="install-card" role="dialog" aria-label="Add PS Tube to your Home Screen">
        <h2>Add PS Tube to your Home Screen</h2>
        <ol>${steps.map((x) => `<li>${x}</li>`).join("")}</ol>
        <p class="install-note">It takes about 10 seconds, and then PS Tube opens full screen like any other app.</p>
        <button type="button" class="install-done">Got it</button>
      </div>`;
      sheet.addEventListener("click", (ev) => {
        if (ev.target === sheet || ev.target.closest(".install-done")) sheet.remove();
      });
      document.body.appendChild(sheet);
    }), 1500);
  }
})();
