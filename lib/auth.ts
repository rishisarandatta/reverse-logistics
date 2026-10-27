import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HttpError } from "./http";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
  type Role,
  type Session,
} from "./session";

export type { Role, Session };

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

// Passwords are stored as "scrypt$<salt>$<hash>" - salted, slow hashes.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

export async function startSession(data: Omit<Session, "exp">): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

// For route handlers: 401 when not logged in, 403 when the role is not allowed.
export async function requireApiSession(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Please log in.");
  if (roles.length > 0 && !roles.includes(session.role)) {
    throw new HttpError(403, "You do not have permission to do this.");
  }
  return session;
}

// For pages: redirect to the login page or home page instead of erroring.
export async function requirePageSession(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (roles.length > 0 && !roles.includes(session.role)) redirect("/");
  return session;
}

export const isStaff = (session: Session) =>
  session.role === "Admin" || session.role === "Staff";
