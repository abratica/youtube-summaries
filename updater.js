/* Update button shared by PS Tube and PS Pods.
   Tapping it asks GitHub to run the app's update job, waits for it to finish and for
   GitHub Pages to publish the new data, then hands the fresh data back to the app.
   Needs a GitHub fine-grained token (Actions: read and write on this repo only), pasted
   once and kept in this browser's storage. Both apps share it (same site).
   PSUpdate.run() starts other jobs with the same token (PS Tube's Copy transcript). */
(() => {
  const REPO = "abratica/youtube-summaries";
  const API = "https://api.github.com/repos/" + REPO + "/actions/workflows/";
  const KEY = "ps:ghtoken";
  const getTok = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
  const setTok = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const css = document.createElement("style");
  css.textContent = `
    .upd-btn svg { transition: transform .2s; }
    .upd-btn.busy svg { animation: upd-spin 1s linear infinite; }
    .upd-btn.ok { color: var(--accent); border-color: var(--accent); }
    @keyframes upd-spin { to { transform: rotate(360deg); } }
    .top-actions { display: flex; gap: 8px; align-items: center; }
    .upd-card label { display: block; font-size: 13px; color: var(--muted); margin: 14px 0 6px; }
    .upd-card input { width: 100%; font: 15px Inter, system-ui, sans-serif; padding: 11px 12px; border-radius: 10px;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .upd-card a { color: var(--accent); }
    .upd-err { color: #e5484d; font-size: 13.5px; margin: 10px 0 0; }
    .upd-row { display: flex; gap: 8px; margin-top: 16px; }
    .upd-row button { flex: 1; margin: 0; }
    .upd-row .upd-cancel { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  `;
  document.head.appendChild(css);

  function askToken(message) {
    return new Promise((resolve) => {
      const sh = document.createElement("div");
      sh.className = "install-sheet";
      sh.innerHTML = `<div class="install-card upd-card" role="dialog" aria-label="Connect to GitHub">
        <h2>Connect to GitHub</h2>
        <ol>
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub's new token page</a> (signed in as abratica).</li>
          <li>Name it <b>PS update</b>, pick an expiration (up to a year), and under <b>Repository access</b> choose <b>Only select repositories</b> → <b>youtube-summaries</b>.</li>
          <li>Under <b>Permissions</b>, add <b>Actions</b> and set it to <b>Read and write</b>. Nothing else.</li>
          <li>Tap <b>Generate token</b>, copy it, and paste it below.</li>
        </ol>
        <label for="upd-tok">Token (stays on this device only)</label>
        <input id="upd-tok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…">
        ${message ? `<p class="upd-err">${message}</p>` : ""}
        <div class="upd-row">
          <button type="button" class="install-done upd-cancel">Cancel</button>
          <button type="button" class="install-done upd-save">Save &amp; continue</button>
        </div></div>`;
      const done = (v) => { sh.remove(); resolve(v); };
      sh.addEventListener("click", (e) => {
        if (e.target === sh || e.target.closest(".upd-cancel")) done("");
        if (e.target.closest(".upd-save")) {
          const v = sh.querySelector("#upd-tok").value.trim();
          if (v) { setTok(v); done(v); }
        }
      });
      document.body.appendChild(sh);
      setTimeout(() => sh.querySelector("#upd-tok").focus(), 50);
    });
  }

  async function gh(path, token, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store",
    });
    if (r.status === 401 || r.status === 403 || r.status === 404) { const e = new Error("auth"); e.auth = true; throw e; }
    if (!r.ok) throw new Error("GitHub said " + r.status);
    return r.status === 204 ? null : r.json();
  }

  const runIds = async (wf, token) =>
    ((await gh(`${wf}/runs?event=workflow_dispatch&per_page=10`, token)).workflow_runs || []);

  // Start a workflow and wait for it to finish. match(run) picks our run out of the list
  // when several can be going at once (e.g. transcripts for different videos).
  async function dispatchWait(workflow, inputs, token, say, match) {
    const before = new Set((await runIds(workflow, token)).map((r) => r.id));
    await gh(`${workflow}/dispatches`, token, { method: "POST", body: JSON.stringify({ ref: "main", ...(inputs ? { inputs } : {}) }) });
    say && say("Checking for new…");
    let run = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 6 * 60e3) {
      await sleep(run ? 5000 : 3000);
      const runs = await runIds(workflow, token);
      run = runs.find((r) => !before.has(r.id) && (!match || match(r))) || run;
      if (run && run.status === "completed") break;
    }
    if (!run || run.status !== "completed") throw new Error("GitHub is taking too long. Try again in a few minutes.");
    return run;
  }

  const BAD_TOKEN = "That token didn't work. It may have expired or be missing Actions: Read and write on youtube-summaries.";

  // Runs fn(token), asking for a token first if needed and once more if GitHub rejects it.
  // Returns null if the person cancels the token dialog.
  async function withToken(fn) {
    let token = getTok() || (await askToken());
    if (!token) return null;
    for (let attempt = 0; ; attempt++) {
      try { return await fn(token); }
      catch (e) {
        if (!e.auth || attempt) throw e;
        setTok("");
        token = await askToken(BAD_TOKEN);
        if (!token) return null;
      }
    }
  }

  window.PSUpdate = {
    /* run({ workflow, inputs, match(run) }) -> the finished run, or null if cancelled.
       Throws Error("auth") or a readable message. */
    run: (o) => withToken((token) => dispatchWait(o.workflow, o.inputs, token, null, o.match)),

    /* attach({ button, workflow, inputs, dataUrl, status(text), onData(data) }) */
    attach(o) {
      let busy = false;
      const say = (t) => o.status && o.status(t);
      o.button.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        o.button.classList.add("busy");
        o.button.setAttribute("aria-busy", "true");
        try {
          await withToken(async (token) => {
            const run = await dispatchWait(o.workflow, o.inputs, token, say);
            if (run.conclusion !== "success") throw new Error("The update job failed on GitHub.");
            // wait for GitHub Pages to publish the new data
            say("Publishing…");
            const since = new Date(run.created_at).getTime() - 5000;
            for (let i = 0; i < 30; i++) {
              const data = await fetch(o.dataUrl, { cache: "no-store" }).then((r) => r.json());
              if (new Date(data.updated).getTime() >= since) {
                await o.onData(data);
                o.button.classList.add("ok");
                setTimeout(() => o.button.classList.remove("ok"), 2500);
                say("");
                return;
              }
              await sleep(5000);
            }
            throw new Error("Updated, but GitHub Pages hasn't published it yet. Tap Update again in a minute.");
          });
        } catch (e) {
          say(e.message && e.message !== "auth" ? e.message : "Couldn't reach GitHub. Check your connection.");
          setTimeout(() => say(""), 8000);
        } finally {
          busy = false;
          o.button.classList.remove("busy");
          o.button.removeAttribute("aria-busy");
        }
      });
    },
  };
})();
