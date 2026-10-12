import { L } from "@/lib/i18n";

// Talks to our own server (../server). Every change carries the x-yodo header (blocks cross-site posts).
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

// Server error codes shown to staff in plain Thai.
const MESSAGES: Record<string, [string, string]> = {
  wrong_credentials: ["ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "Wrong username or password"],
  account_disabled: ["บัญชีนี้ถูกปิดใช้งาน", "This account is disabled"],
  too_many_attempts: ["ลองหลายครั้งเกินไป กรุณารอ 15 นาที", "Too many tries. Please wait 15 minutes"],
  wrong_password: ["รหัสผ่านปัจจุบันไม่ถูกต้อง", "The current password is wrong"],
  same_password: ["รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม", "The new password must differ from the old one"],
  username_taken: ["ชื่อผู้ใช้นี้ถูกใช้แล้ว", "This username is already taken"],
  username_format: ["ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (3-30 ตัว)", "Username: a-z 0-9 . _ - only (3-30 characters)"],
  email_format: ["อีเมลไม่ถูกต้อง", "Invalid email"],
  phone_format: ["เบอร์โทรต้องมี 10 หลัก", "Phone number must have 10 digits"],
  password_too_short: ["รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "Password must have at least 6 characters"],
  cannot_disable_self: ["ปิดใช้งานบัญชีตัวเองไม่ได้", "You cannot disable your own account"],
  cannot_delete_self: ["ลบบัญชีตัวเองไม่ได้", "You cannot delete your own account"],
  cannot_delete_superadmin: ["ลบบัญชี SuperAdmin ไม่ได้", "A SuperAdmin account cannot be deleted"],
  cannot_disable_superadmin: ["ปิดใช้งานบัญชี SuperAdmin ไม่ได้", "A SuperAdmin account cannot be disabled"],
  superadmin_position: ["SuperAdmin ต้องอยู่ในตำแหน่งระบบ", "A SuperAdmin must stay in the system position"],
  position_in_use: ["ยังมีผู้ใช้อยู่ในตำแหน่งนี้", "Some users still have this position"],
  system_position: ["แก้ไขตำแหน่งระบบไม่ได้", "The system position cannot be changed"],
  already_enrolled: ["นักเรียนลงทะเบียนคลาสนี้แล้ว", "The student is already in this class"],
  not_enrolled: ["นักเรียนยังไม่ได้ลงทะเบียนคลาสนี้", "The student is not enrolled in this class"],
  bad_image: ["ไฟล์รูปไม่ถูกต้อง", "Invalid picture file"],
  forbidden: ["ไม่มีสิทธิ์ทำรายการนี้", "You don't have permission for this"],
  not_found: ["ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)", "Not found (it may have been deleted)"],
  unauthenticated: ["หมดเวลาการเข้าระบบ กรุณาเข้าสู่ระบบใหม่", "Your session ended. Please sign in again"],
  wrong_setup_code: ["รหัสตั้งค่าไม่ถูกต้อง", "Wrong setup code"],
  bad_file: ["อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ CSV หรือ JSON", "Cannot read the file. It must be CSV or JSON"],
  empty_file: ["ไฟล์ว่าง", "The file is empty"],
  not_students: ["ไฟล์นี้ไม่ใช่ตารางนักเรียน (ต้องมีคอลัมน์ code และ first_name)", "This file is not the students table (needs code and first_name columns)"],
  invalid_input: ["ข้อมูลไม่ถูกต้อง", "Some data is not valid"],
  server_error: ["เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง", "Server error. Please try again"],
  network: ["เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "Cannot reach the server"],
  wrong_pin: ["PIN ไม่ถูกต้อง", "Wrong PIN"],
  pin_locked: ["ใส่ PIN ผิดหลายครั้ง PIN ถูกลบจากเครื่องนี้แล้ว กรุณาเข้าด้วยรหัสผ่าน", "Too many wrong PINs. The PIN was removed from this device. Please sign in with your password"],
  pin_off: ["เครื่องนี้ยังไม่ได้ตั้ง PIN", "No PIN on this device yet"],
  pin_format: ["PIN ต้องเป็นตัวเลข 4 หรือ 6 หลัก", "The PIN must be 4 or 6 digits"],
  google_not_set_up: ["ยังไม่ได้ตั้งค่าการเข้าด้วย Google", "Sign in with Google is not set up yet"],
  google_failed: ["เข้าด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง", "Google sign-in failed. Please try again"],
  google_no_account: ["ไม่พบบัญชี YODO ที่ใช้อีเมลนี้ ให้ใส่อีเมล Gmail ในหน้าตั้งค่าโปรไฟล์ก่อน", "No YODO account uses this email. Add your Gmail on the profile settings page first"],
  google_client_id_format: ["Client ID ต้องลงท้ายด้วย .apps.googleusercontent.com", "The Client ID must end with .apps.googleusercontent.com"],
  passkey_needs_https: ["Face ID ใช้ได้เมื่อเปิดผ่านที่อยู่ https เท่านั้น", "Face ID works only on the https address"],
  passkey_expired: ["หมดเวลา ลองใหม่อีกครั้ง", "Timed out. Please try again"],
  passkey_failed: ["ยืนยัน Face ID ไม่สำเร็จ", "Face ID check failed"],
  passkey_unknown: ["เครื่องนี้ยังไม่ได้เปิด Face ID สำหรับ YODO", "Face ID is not turned on for YODO on this device"],
  passkey_exists: ["เครื่องนี้เปิด Face ID ไว้แล้ว", "Face ID is already on for this device"],
};
export const errorText = (e: unknown) => {
  if (e instanceof ApiError) { const m = MESSAGES[e.code]; return m ? L(m[0], m[1]) : e.code; }
  return (e as Error)?.message ?? String(e);
};

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; raw?: BodyInit } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        "x-yodo": "1",
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.raw !== undefined ? { "content-type": "text/plain" } : {}),
      },
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : null),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data as { error?: string; issues?: { message?: string }[] }).error ?? "server_error";
    const issue = (data as { issues?: { message?: string }[] }).issues?.[0]?.message;
    throw new ApiError(res.status, code === "invalid_input" && issue && MESSAGES[issue] ? issue : code);
  }
  return data as T;
}

export interface Me {
  id: string; username: string; firstName: string; lastName: string; nickname: string; email: string; phone: string;
  image: string; positionId: string; positionName: string; role: string; superadmin: boolean; name: string; lang: "th" | "en";
}
export const getMe = () => api<Me>("/me");

// The signed-in check before every page used to ask the server on each click (owner 12/10/2026: slow over the NAS
// link). Now the last answer is used at once and refreshed in the background; a lost session still goes to sign-in.
let meCache: Me | null = null;
export const clearMeCache = () => { meCache = null; };
export async function getMeCached(): Promise<Me> {
  if (meCache) {
    getMe().then((m) => { meCache = m; }).catch((e) => {
      if (e instanceof ApiError && e.status === 401) { meCache = null; window.location.assign("/auth"); }
    });
    return meCache;
  }
  meCache = await getMe();
  return meCache;
}
