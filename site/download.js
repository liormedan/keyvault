// The download button points at the installer for this visitor's system, from the newest release.
// Without JavaScript, or if GitHub's API doesn't answer, both buttons stay on the release page.
(async () => {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? "windows" : /Linux|X11/.test(ua) && !/Android/.test(ua) ? "linux" : /Mac/.test(ua) ? "mac" : "";
  const primary = document.getElementById("dl-primary");
  const note = document.getElementById("dl-note");
  if (os === "mac") {
    primary.textContent = "Command line for macOS";
    primary.href = "#developers";
    note.textContent = "The desktop app is for Windows and Linux for now; on macOS, use the command line.";
    return;
  }
  try {
    const res = await fetch("https://api.github.com/repos/liormedan/kv-vault/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return;
    const release = await res.json();
    const asset = (re) => release.assets.find((a) => re.test(a.name));
    const pick = os === "linux" ? asset(/_amd64\.AppImage$/) : os === "windows" ? asset(/_x64-setup\.exe$/) : null;
    if (!pick) return;
    primary.href = pick.browser_download_url;
    primary.textContent = `Download for ${os === "linux" ? "Linux (AppImage)" : "Windows"}`;
    const mb = Math.round(pick.size / 1048576);
    note.textContent = `Version ${release.tag_name.replace(/^v/, "")} · ${mb} MB · free, MIT licensed.${os === "linux" ? " chmod +x the file, then run it; a .deb is in All downloads." : ""}`;
  } catch {
    // offline or rate-limited: the release page still works
  }
})();
