import crypto from "node:crypto";

const cookieName = "smg_session";
const maxAgeSeconds = 60 * 60 * 24 * 7;

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }

  return secret;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function createSessionCookie(email) {
  const payload = base64url(
    JSON.stringify({
      email,
      expiresAt: Date.now() + maxAgeSeconds * 1000,
    }),
  );
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";

  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

export function getSession(req) {
  const token = parseCookies(req)[cookieName];

  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function requireSession(req, res) {
  const session = getSession(req);

  if (!session) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }

  return session;
}
