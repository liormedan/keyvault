// Color theme: dark by default, light on toggle. The choice is stored on this machine.
// Loaded in <head> so a light screen never flashes before the right colors apply.
(() => {
  const KEY = "kv-theme";
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; } };

  function apply(theme) {
    if (theme === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
    for (const b of document.querySelectorAll(".theme-toggle")) b.textContent = theme === "light" ? "מצב כהה" : "מצב בהיר";
    window.__TAURI__?.window.getCurrentWindow().setTheme(theme).catch(() => {}); // Windows title bar
  }

  apply(read());
  document.addEventListener("DOMContentLoaded", () => {
    apply(read());
    for (const b of document.querySelectorAll(".theme-toggle")) {
      b.addEventListener("click", () => {
        const next = read() === "light" ? "dark" : "light";
        try { localStorage.setItem(KEY, next); } catch {}
        apply(next);
      });
    }
  });
})();
