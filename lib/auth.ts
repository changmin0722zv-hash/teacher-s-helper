import { cookies } from "next/headers";
import { seal, unseal } from "./security";

export const SESSION_COOKIE = "teacher_session";
export const STATE_COOKIE = "teacher_oauth_state";
export const isDemo = () =>
  process.env.NODE_ENV !== "production" && process.env.LOCAL_DEMO === "true";
export function missingConfig(): string[] {
  const required = [
    "APP_URL",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_ALLOWED_USER_ID",
    "SESSION_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32)
    missing.push("SESSION_SECRET (32자 이상)");
  if (
    process.env.GITHUB_ALLOWED_USER_ID &&
    !/^\d+$/.test(process.env.GITHUB_ALLOWED_USER_ID)
  )
    missing.push("GITHUB_ALLOWED_USER_ID (숫자 ID)");
  try {
    const url = new URL(process.env.APP_URL || "");
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      missing.push("APP_URL (HTTPS)");
  } catch {
    if (!missing.includes("APP_URL")) missing.push("APP_URL (올바른 주소)");
  }
  return missing;
}
export function appUrl() {
  return isDemo()
    ? "http://127.0.0.1:3000"
    : new URL(process.env.APP_URL!).origin;
}
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
export type Session = {
  userId: string;
  login: string;
  token: string;
  expires: number;
};
export async function getSession(): Promise<Session | null> {
  if (isDemo())
    return {
      userId: "demo",
      login: "로컬 데모",
      token: "",
      expires: Date.now() + 60000,
    };
  if (missingConfig().length) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = value
    ? unseal<Session>(value, process.env.SESSION_SECRET!)
    : null;
  if (
    !session ||
    typeof session.expires !== "number" ||
    session.expires <= Date.now() ||
    session.userId !== process.env.GITHUB_ALLOWED_USER_ID ||
    typeof session.token !== "string" ||
    !session.token
  )
    return null;
  return session;
}
export async function setSession(session: Session) {
  (await cookies()).set(
    SESSION_COOKIE,
    seal(session, process.env.SESSION_SECRET!),
    cookieOptions(8 * 3600),
  );
}
