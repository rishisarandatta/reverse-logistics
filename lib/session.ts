import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless session token: base64url(JSON payload) + "." + HMAC-SHA256
// signature. The cookie is httpOnly, so page scripts cannot read it, and
// any tampering with the payload (e.g. changing the role) breaks the
// signature. This module has no Next.js imports so proxy.ts can use it.

export const SESSION_COOKIE = "rl_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type Role = "Admin" | "Staff" | "Customer";

export interface Session {
  userId: number;
  username: string;
  role: Role;
  customerId: number | null;
  exp: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(data: Omit<Session, "exp">): string {
  const session: Session = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}
