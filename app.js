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
    channel: store.get("channel", "All"),
    q: "",
    shown: PAGE,
  };
  let videos = [];
  let areas = [];
  let channelArea = {};
  let filtered = [];

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

  function itemHTML(v) {
    const tags = v.topics.filter((t) => t !== "Other").map((t) => `<span class="tag">${esc(leaf(t))}</span>`).join("");
    const chan = ` · ${esc(v.channel)}`;
    return `<li class="item"><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
      <div class="thumb"><img loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg"><span class="dur">${fmtDur(v.seconds)}</span></div>
      <div class="meta"><p class="title">${titleHTML(v.title)}</p>
      <p class="info">${fmtDate(v.published)}${chan}</p>
      <div class="tags">${tags}</div></div></a></li>`;
  }

  function renderList() {
    filtered = videos.filter((v) => matches(v));
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
    renderList();
  }

  const save = () => { for (const k of ["area", "topic", "sub", "length", "channel"]) store.set(k, state[k]); };

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
  $("#lengths").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.length = b.dataset.l;
    save(); render();
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
    if (state.area !== "all" && !areas.some((a) => a.id === state.area)) state.area = "all";
    if (!LENGTHS.some((l) => l.id === state.length)) state.length = "any";
    render();
    $("#foot").textContent = "Updated " + new Date(data.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }).catch(() => {
    $("#count").textContent = "Couldn't load the library. Check your connection.";
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
