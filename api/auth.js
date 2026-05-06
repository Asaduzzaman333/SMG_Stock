import { clearSessionCookie, createSessionCookie, getSession } from "../lib/auth.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET,POST,DELETE");
  res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = getSession(req);
      res.status(session ? 200 : 401).json({ user: session ? { email: session.email } : null });
      return;
    }

    if (req.method === "POST") {
      const { email, password } = await readBody(req);
      const expectedEmail = process.env.ADMIN_EMAIL;
      const expectedPassword = process.env.ADMIN_PASSWORD;

      if (!expectedEmail || !expectedPassword) {
        res.status(500).json({ error: "Admin credentials are not configured." });
        return;
      }

      if (email !== expectedEmail || password !== expectedPassword) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      res.setHeader("Set-Cookie", createSessionCookie(email));
      res.status(200).json({ user: { email } });
      return;
    }

    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearSessionCookie());
      res.status(200).json({ ok: true });
      return;
    }

    sendMethodNotAllowed(res);
  } catch (error) {
    res.status(500).json({ error: error.message || "Authentication request failed." });
  }
}
