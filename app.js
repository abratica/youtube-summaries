(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 40;
  const LENGTHS = [
    { id: "any", label: "Any length", test: () => true },
    { id: "short", label: "< 30m", test: (s) => s < 1800 },
    { id: "mid", label: "30–90m", test: (s) => s >= 1800 && s < 5400 },
    { id: "long", label: "90m+", test: (s) => s >= 5400 },
  ];

  const store = {
    get(k, d) { try { const v = localStorage.getItem("ys:" + k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ys:" + k, v); } catch {} },
  };

  const state = {
    topic: store.get("topic", "All"),
    length: store.get("length", "any"),
    channel: store.get("channel", "All"),
    q: "",
    shown: PAGE,
  };
  let videos = [];
  let topics = [];
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
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // "Title | Guest" -> title with the guest name set apart.
  const titleHTML = (t) => {
    const i = t.lastIndexOf(" | ");
    if (i < 0) return esc(t);
    const guest = t.slice(i + 3);
    if (/huberman lab/i.test(guest)) return esc(t.slice(0, i));
    return `${esc(t.slice(0, i))} <span class="guest">· ${esc(guest)}</span>`;
  };

  function matches(v, skip) {
    if (skip !== "topic" && state.topic !== "All" && !v.topics.includes(state.topic)) return false;
    if (skip !== "length" && !LENGTHS.find((l) => l.id === state.length).test(v.seconds)) return false;
    if (state.channel !== "All" && v.channel !== state.channel) return false;
    if (state.q) {
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hay = v._hay;
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function renderTopics() {
    const base = videos.filter((v) => matches(v, "topic"));
    const counts = { All: base.length };
    for (const v of base) for (const t of v.topics) counts[t] = (counts[t] || 0) + 1;
    const names = ["All", ...topics, "Other"].filter((t) => t === "All" || counts[t] || t === state.topic);
    $("#topics").innerHTML = names
      .map((t) => `<button class="chip" role="tab" aria-selected="${t === state.topic}" data-t="${esc(t)}">${esc(t)}<span class="n">${counts[t] || 0}</span></button>`)
      .join("");
  }

  function renderLengths() {
    $("#lengths").innerHTML = LENGTHS
      .map((l) => `<button data-l="${l.id}" aria-pressed="${l.id === state.length}">${l.label}</button>`)
      .join("");
  }

  function renderChannels() {
    const names = [...new Set(videos.map((v) => v.channel))];
    const sel = $("#channel");
    sel.hidden = names.length < 2;
    sel.innerHTML = ["All", ...names]
      .map((n) => `<option value="${esc(n)}"${n === state.channel ? " selected" : ""}>${n === "All" ? "All channels" : esc(n)}</option>`)
      .join("");
  }

  function itemHTML(v) {
    const tags = v.topics.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const chan = new Set(videos.map((x) => x.channel)).size > 1 ? ` · ${esc(v.channel)}` : "";
    return `<li class="item"><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
      <div class="thumb"><img loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg"><span class="dur">${fmtDur(v.seconds)}</span></div>
      <div class="meta"><p class="title">${titleHTML(v.title)}</p>
      <p class="info">${fmtDate(v.published)}${chan}</p>
      <div class="tags">${tags}</div></div></a></li>`;
  }

  function renderList() {
    filtered = videos.filter((v) => matches(v));
    $("#list").innerHTML = filtered.slice(0, state.shown).map(itemHTML).join("");
    $("#empty").hidden = filtered.length > 0;
    const total = videos.length;
    $("#count").textContent = filtered.length === total
      ? `${total} videos`
      : `${filtered.length} of ${total} videos`;
  }

  function render() {
    state.shown = PAGE;
    renderTopics();
    renderLengths();
    renderList();
  }

  $("#topics").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.topic = b.dataset.t;
    store.set("topic", state.topic);
    render();
    window.scrollTo({ top: 0 });
  });
  $("#lengths").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.length = b.dataset.l;
    store.set("length", state.length);
    render();
  });
  $("#channel").addEventListener("change", (e) => {
    state.channel = e.target.value;
    store.set("channel", state.channel);
    render();
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
  ]).then(([data, tlist]) => {
    topics = tlist;
    videos = data.videos.map((v) => ({ ...v, _hay: (v.title + " " + v.channel).toLowerCase() }));
    if (!LENGTHS.some((l) => l.id === state.length)) state.length = "any";
    renderChannels();
    if (state.channel !== "All" && !videos.some((v) => v.channel === state.channel)) state.channel = "All";
    render();
    $("#foot").textContent = "Updated " + new Date(data.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }).catch(() => {
    $("#count").textContent = "Couldn't load the library. Check your connection.";
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
