// Which saved logins belong to the page the browser is on. The rule is deliberately strict: same site
// (registrable domain) and same scheme family. "accounts.google.com.evil.example" is evil.example, not google.com,
// and an http page never gets a login saved for https. No public-suffix download: a short list covers the
// two-label suffixes people actually meet; a missing one only makes matching stricter, never looser.

const TWO_LABEL_SUFFIXES = new Set(
  (
    "co.il org.il net.il ac.il gov.il muni.il k12.il idf.il " +
    "co.uk org.uk ac.uk gov.uk me.uk ltd.uk plc.uk " +
    "com.au net.au org.au edu.au gov.au co.nz org.nz co.za co.jp ne.jp or.jp ac.jp co.kr or.kr " +
    "com.br net.br org.br com.mx com.ar com.tr com.cn net.cn org.cn com.hk com.sg com.tw co.in net.in org.in " +
    "com.ua co.th com.my com.ph com.vn com.pl com.es com.co com.pe com.eg com.sa " +
    "github.io vercel.app netlify.app pages.dev web.app firebaseapp.com herokuapp.com azurewebsites.net " +
    "blogspot.com wordpress.com wixsite.com vusercontent.net cloudfront.net"
  ).split(" "),
);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The registrable domain of a host name: "mail.google.com" → "google.com", "a.b.co.il" → "b.co.il" */
export function siteOf(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (IPV4.test(h) || h.includes(":") || !h.includes(".")) return h; // IP addresses and "localhost" match exactly
  const labels = h.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const n = TWO_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-n).join(".");
}

const parse = (url: string): URL | null => {
  const raw = url.trim();
  if (!raw) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
};

/** Does a login saved for `loginUrl` belong on `pageUrl`? */
export function sameSite(loginUrl: string, pageUrl: string): boolean {
  const a = parse(loginUrl);
  const b = parse(pageUrl);
  if (!a || !b || !/^https?:$/.test(b.protocol) || !/^https?:$/.test(a.protocol)) return false;
  // A login saved on https is never offered to an http page
  if (a.protocol === "https:" && b.protocol === "http:") return false;
  if (!a.hostname || !b.hostname) return false;
  return siteOf(a.hostname) === siteOf(b.hostname);
}

export const hostOf = (url: string): string => parse(url)?.hostname ?? "";
