// Talks to our own server (../server). Every change carries the x-yodo header (blocks cross-site posts).
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

// Server error codes shown to staff in plain Thai.
const MESSAGES: Record<string, string> = {
  wrong_credentials: "Username หรือรหัสผ่านไม่ถูกต้อง",
  account_disabled: "บัญชีนี้ถูกปิดใช้งาน",
  too_many_attempts: "ลองหลายครั้งเกินไป กรุณารอ 15 นาที",
  wrong_password: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  same_password: "รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม",
  username_taken: "Username นี้ถูกใช้แล้ว",
  username_format: "Username ใช้ได้เฉพาะ a-z 0-9 . _ - (3-30 ตัว)",
  email_format: "อีเมลไม่ถูกต้อง",
  phone_format: "เบอร์โทรต้องมี 10 หลัก",
  password_too_short: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
  cannot_disable_self: "ปิดใช้งานบัญชีตัวเองไม่ได้",
  cannot_delete_self: "ลบบัญชีตัวเองไม่ได้",
  cannot_delete_superadmin: "ลบบัญชี SuperAdmin ไม่ได้",
  cannot_disable_superadmin: "ปิดใช้งานบัญชี SuperAdmin ไม่ได้",
  superadmin_position: "SuperAdmin ต้องอยู่ในตำแหน่งระบบ",
  position_in_use: "ยังมีผู้ใช้อยู่ในตำแหน่งนี้",
  system_position: "แก้ไขตำแหน่งระบบไม่ได้",
  already_enrolled: "นักเรียนลงทะเบียนคลาสนี้แล้ว",
  not_enrolled: "นักเรียนยังไม่ได้ลงทะเบียนคลาสนี้",
  bad_image: "ไฟล์รูปไม่ถูกต้อง",
  forbidden: "ไม่มีสิทธิ์ทำรายการนี้",
  not_found: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)",
  unauthenticated: "หมดเวลาการเข้าระบบ กรุณาเข้าสู่ระบบใหม่",
  wrong_setup_code: "รหัสตั้งค่าไม่ถูกต้อง",
  bad_file: "อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ CSV หรือ JSON",
  empty_file: "ไฟล์ว่าง",
  not_students: "ไฟล์นี้ไม่ใช่ตารางนักเรียน (ต้องมีคอลัมน์ code และ first_name)",
  invalid_input: "ข้อมูลไม่ถูกต้อง",
  server_error: "เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง",
  network: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
};
export const errorText = (e: unknown) => {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? e.code;
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
  image: string; positionId: string; positionName: string; role: string; superadmin: boolean; name: string;
}
export const getMe = () => api<Me>("/me");
