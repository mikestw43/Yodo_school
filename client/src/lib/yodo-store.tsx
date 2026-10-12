import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { differenceInYears, isValid, parseISO } from "date-fns";
import { toast } from "sonner";
import { ApiError, api, errorText, getMe } from "@/lib/api";
import { L, prefixed, setLang } from "@/lib/i18n";

export const PREFIXES = ["ด.ญ.", "ด.ช.", "นาย", "นางสาว", "นาง"] as const;
export const TEACHER_PREFIXES = ["นาย", "นาง", "นางสาว"] as const;
export const NATIONALITIES = ["ไทย", "Singaporean", "Other"] as const;
export const RELIGIONS = ["พุทธ", "คริสต์", "อิสลาม", "Other"] as const;
export const ETHNICITIES = ["ไทย", "จีน", "Other"] as const;
export const DANCE_TYPES = ["Ballet", "Jazz", "Contemporary", "Kpop", "HipHop", "Acting", "Singing"] as const;
export const SOURCES = ["Facebook", "Instagram", "TikTok", "Friends", "Other"] as const;

export type Status = "Active" | "Disabled";

export interface Student {
  id: string;
  code: string;
  prefix: string;
  firstName: string;
  lastName: string;
  nickname: string;
  dob: string;
  nationality: string;
  nationalityOther: string;
  religion: string;
  religionOther: string;
  ethnicity: string;
  ethnicityOther: string;
  address: string;
  phone: string;
  email: string;
  lineId: string;
  emergencyName: string;
  emergencyPhone: string;
  relationship: string;
  image: string;
  interested: string[];
  hasExperience: boolean;
  experienceDetail: string;
  source: string;
  sourceOther: string;
  status: Status;
  createdAt: string;
  signature: string;
  signedAt: string;
}
/** A signature drawn in the student form, saved right after the student (owner 12/10/2026). */
export type Sign = { signature: string; signedAt: string };
export type StudentInput = Omit<Student, "id" | "code" | "status" | "createdAt" | "signature" | "signedAt">;

export interface Teacher {
  id: string;
  image: string;
  prefix: string;
  firstName: string;
  lastName: string;
  nickname: string;
  phone: string;
  email: string;
  lineId: string;
  specializations: string[];
  status: Status;
}
export type TeacherInput = Omit<Teacher, "id" | "status">;

export interface DanceClass {
  id: string;
  name: string;
  teacherId: string;
  description: string;
  image: string;
  status: "Active" | "Inactive";
  disabled: boolean;
  /** Baht for the whole course (owner 12/10/2026). */
  price: number | null;
  /** Course length in months; the expiry date follows from it. */
  months: number;
}
export type ClassInput = Omit<DanceClass, "id" | "disabled">;

export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  joinedAt: string;
  purchaseDate: string; // yyyy-MM-dd
  startDate: string;
  expiryDate: string;
  remark: string;
  receiptImage: string;
}
export type EnrollmentInput = Omit<Enrollment, "id" | "studentId" | "joinedAt">;
/** Money taken for a class purchase; the server makes the receipt from it (owner 12/10/2026). */
export interface PaymentInput { date: string; price: number; discount: number; method: "cash" | "transfer" | "card"; slip: string; payer: string; remark: string }
export interface Receipt {
  id: string; no: string; date: string; studentId: string; enrollmentId: string; classId: string; item: string; months: number;
  startDate: string; expiryDate: string; price: number; discount: number; amount: number; method: "cash" | "transfer" | "card";
  slip: string; payer: string; remark: string; receivedByName: string; cancelled: boolean; cancelledAt: string; cancelReason: string;
  cancelledBy: string; createdAt: string;
}
export interface Schedule {
  id: string;
  classId: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string;
}
export interface ScheduleStudent {
  scheduleId: string;
  studentId: string;
}
export interface Position {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  /** superadmin (hidden) | owner | partner | admin | "" = a role the Owner added */
  kind?: string;
}
export interface SystemUser {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  positionId: string;
  image: string;
  status: Status;
  createdAt: string;
  superadmin?: boolean;
}
export type SystemUserInput = Omit<SystemUser, "id" | "status" | "createdAt">;

export const MENU_KEYS = ["dashboard", "students", "classes", "teachers", "calendar", "users", "auditlog", "receipts", "company", "money"] as const;
export type MenuKey = (typeof MENU_KEYS)[number];
export type PermAction = "view" | "add" | "edit" | "delete";
export type MenuPerm = Record<PermAction, boolean>;
export type PositionPerms = Record<MenuKey, MenuPerm>;
export type PermissionMap = Record<string, PositionPerms>;
export function emptyPerms(): PositionPerms {
  return Object.fromEntries(MENU_KEYS.map((k) => [k, { view: false, add: false, edit: false, delete: false }])) as PositionPerms;
}

export interface YodoData {
  students: Student[];
  teachers: Teacher[];
  classes: DanceClass[];
  enrollments: Enrollment[];
  schedules: Schedule[];
  scheduleStudents: ScheduleStudent[];
  positions: Position[];
  systemUsers: SystemUser[];
  permissions: PermissionMap;
  /** The signed-in person is the Owner (or the hidden SuperAdmin): only they edit rights and roles. */
  owner?: boolean;
  /** Codes of soft-deleted students, kept so new codes never reuse them. */
  deletedStudentCodes: string[];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function calcAge(dob: string): number | null {
  if (!dob) return null;
  const d = parseISO(dob);
  if (!isValid(d)) return null;
  return differenceInYears(new Date(), d);
}

/** อายุจากวันเกิดเทียบวันนี้ เช่น "2 ปี 11 เดือน" */
export function ageText(dob: string): string {
  if (!dob) return "-";
  const b = parseISO(dob);
  const t = new Date();
  if (!isValid(b) || b > t) return "-";
  let y = t.getFullYear() - b.getFullYear();
  let m = t.getMonth() - b.getMonth();
  if (t.getDate() < b.getDate()) m--;
  if (m < 0) { y--; m += 12; }
  return y > 0 ? L(`${y} ปี ${m} เดือน`, `${y} y ${m} m`) : L(`${m} เดือน`, `${m} m`);
}

export function nextStudentCode(students: { code: string }[], deletedCodes: string[] = []) {
  const max = [...students, ...deletedCodes.map((code) => ({ code }))].reduce((m, s) => Math.max(m, parseInt(s.code.replace("YDO", ""), 10) || 0), 0);
  return "YDO" + String(max + 1).padStart(5, "0");
}

export const fullName = (p: { prefix: string; firstName: string; lastName: string }) =>
  `${prefixed(p.prefix, p.firstName)} ${p.lastName}`;

// ---------- Store ----------
// Same API the pages always used. Changes show at once (optimistic) and are sent to our server;
// if the server refuses, the error is shown and everything is reloaded from the server.
const newId = () => crypto.randomUUID();
const EMPTY: YodoData = { students: [], teachers: [], classes: [], enrollments: [], schedules: [], scheduleStudents: [], positions: [], systemUsers: [], permissions: {}, deletedStudentCodes: [] };

interface Ctx {
  data: YodoData;
  loading: boolean;
  reload: () => Promise<void>;
  clear: () => void;
  addStudent: (s: StudentInput, sign?: Sign) => Student;
  updateStudent: (id: string, s: StudentInput, sign?: Sign) => void;
  setStudentStatus: (id: string, status: Status) => void;
  signStudent: (id: string, signature: string, signedAt: string) => void;
  enroll: (studentId: string, input: EnrollmentInput, pay?: PaymentInput, onReceipt?: (r: Receipt) => void) => void;
  updateEnrollment: (id: string, input: EnrollmentInput, pay?: PaymentInput, onReceipt?: (r: Receipt) => void) => void;
  unenroll: (studentId: string, classId: string) => void;
  addTeacher: (t: TeacherInput) => void;
  updateTeacher: (id: string, t: TeacherInput) => void;
  setTeacherStatus: (id: string, status: Status) => void;
  deleteStudent: (id: string) => void;
  deleteTeacher: (id: string) => void;
  deleteSystemUser: (id: string) => void;
  addClass: (c: ClassInput) => void;
  updateClass: (id: string, c: ClassInput) => void;
  setClassDisabled: (id: string, disabled: boolean) => void;
  addSchedules: (s: Omit<Schedule, "id">[]) => void;
  deleteSchedule: (id: string) => void;
  addScheduleStudent: (scheduleId: string, studentId: string) => void;
  removeScheduleStudent: (scheduleId: string, studentId: string) => void;
  addPosition: (p: Omit<Position, "id">) => void;
  updatePosition: (id: string, p: Omit<Position, "id">) => void;
  deletePosition: (id: string) => void;
  setPositionPermissions: (positionId: string, perms: PositionPerms) => void;
  addSystemUser: (u: SystemUserInput) => void;
  updateSystemUser: (id: string, u: SystemUserInput) => void;
  setSystemUserStatus: (id: string, status: Status) => void;
  me: { id: string; positionId: string; superadmin: boolean } | null;
  can: (menu: MenuKey, action?: PermAction) => boolean;
}
// Keep a single context instance across hot reloads so Provider and consumers always match.
const g = globalThis as unknown as { __yodoCtx?: React.Context<Ctx | null> };
const YodoContext = g.__yodoCtx ?? (g.__yodoCtx = createContext<Ctx | null>(null));

export function YodoProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<YodoData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Ctx["me"]>(null);

  const reload = useCallback(async () => {
    try {
      const [m, all] = await Promise.all([getMe(), api<YodoData>("/data")]);
      setMe({ id: m.id, positionId: m.positionId, superadmin: m.superadmin });
      setLang(m.lang); // the account remembers the language
      setData(all);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setData(EMPTY); setMe(null); }
      else toast.error(L("โหลดข้อมูลไม่สำเร็จ: ", "Could not load data: ") + errorText(e));
    }
    setLoading(false);
  }, []);
  const clear = useCallback(() => { setData(EMPTY); setMe(null); }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Send a change; on failure show the error and resync from the server.
  const run = <T,>(p: Promise<T>, then?: (r: T) => void) => {
    p.then((r) => then?.(r)).catch((e) => { toast.error(L("บันทึกไม่สำเร็จ: ", "Could not save: ") + errorText(e)); void reload(); });
  };
  const runReload = (p: Promise<unknown>) => run(p.then(() => reload()));

  const can = (menu: MenuKey, action: PermAction = "view") => {
    if (!me) return false;
    if (me.superadmin || data.positions.find((p) => p.id === me.positionId)?.isSystem) return true;
    return data.permissions[me.positionId]?.[menu]?.[action] === true;
  };
  const patchStudent = (s: Student) => setData((d) => ({ ...d, students: d.students.map((x) => (x.id === s.id ? s : x)) }));
  const ctx: Ctx = {
    me, can,
    data,
    loading,
    reload,
    clear,
    addStudent: (input, sign) => {
      const s: Student = { ...input, id: newId(), code: nextStudentCode(data.students, data.deletedStudentCodes), status: "Active", createdAt: new Date().toISOString(), signature: sign?.signature ?? "", signedAt: sign?.signedAt ?? "" };
      setData((d) => ({ ...d, students: [...d.students, s] }));
      run(api<Student>("/students", { body: { id: s.id, ...input, ...sign } }), patchStudent);
      return s;
    },
    updateStudent: (id, input, sign) => {
      setData((d) => ({ ...d, students: d.students.map((s) => (s.id === id ? { ...s, ...input, ...sign } : s)) }));
      const saved = api<Student>(`/students/${id}`, { method: "PUT", body: input });
      run(sign ? saved.then(() => api<Student>(`/students/${id}/sign`, { body: sign })) : saved, patchStudent);
    },
    signStudent: (id, signature, signedAt) => {
      setData((d) => ({ ...d, students: d.students.map((s) => (s.id === id ? { ...s, signature, signedAt } : s)) }));
      run(api<Student>(`/students/${id}/sign`, { body: { signature, signedAt } }), patchStudent);
    },
    setStudentStatus: (id, status) => {
      setData((d) => ({ ...d, students: d.students.map((s) => (s.id === id ? { ...s, status } : s)) }));
      run(api(`/students/${id}/status`, { body: { status } }));
    },
    enroll: (studentId, input, pay, onReceipt) => {
      if (data.enrollments.some((e) => e.studentId === studentId && e.classId === input.classId)) return;
      const e: Enrollment = { ...input, id: newId(), studentId, joinedAt: new Date().toISOString() };
      setData((d) => ({ ...d, enrollments: [...d.enrollments, e] }));
      const saved = api<Enrollment>("/enrollments", { body: { id: e.id, studentId, ...input } }).then((r) => {
        setData((d) => ({ ...d, enrollments: d.enrollments.map((x) => (x.id === r.id ? r : x)) }));
        return r;
      });
      // The receipt is made only once the enrollment is saved (its number comes from the server).
      run(pay ? saved.then((r) => api<Receipt>("/receipts", { body: { ...pay, enrollmentId: r.id } })).then((rc) => { onReceipt?.(rc); }) : saved.then(() => undefined));
    },
    updateEnrollment: (id, input, pay, onReceipt) => {
      setData((d) => ({ ...d, enrollments: d.enrollments.map((e) => (e.id === id ? { ...e, ...input } : e)) }));
      const saved = api<Enrollment>(`/enrollments/${id}`, { method: "PUT", body: input }).then((r) => {
        setData((d) => ({ ...d, enrollments: d.enrollments.map((x) => (x.id === r.id ? r : x)) }));
        return r;
      });
      run(pay ? saved.then(() => api<Receipt>("/receipts", { body: { ...pay, enrollmentId: id } })).then((rc) => { onReceipt?.(rc); }) : saved.then(() => undefined));
    },
    unenroll: (studentId, classId) => {
      const scheduleIds = data.schedules.filter((s) => s.classId === classId).map((s) => s.id);
      setData((d) => ({
        ...d,
        enrollments: d.enrollments.filter((e) => !(e.studentId === studentId && e.classId === classId)),
        scheduleStudents: d.scheduleStudents.filter((x) => x.studentId !== studentId || !scheduleIds.includes(x.scheduleId)),
      }));
      run(api("/enrollments/remove", { body: { studentId, classId } }));
    },
    addTeacher: (t) => {
      const id = newId();
      setData((d) => ({ ...d, teachers: [...d.teachers, { ...t, id, status: "Active" }] }));
      run(api<Teacher>("/teachers", { body: { id, ...t } }), (r) => setData((d) => ({ ...d, teachers: d.teachers.map((x) => (x.id === r.id ? r : x)) })));
    },
    updateTeacher: (id, t) => {
      setData((d) => ({ ...d, teachers: d.teachers.map((x) => (x.id === id ? { ...x, ...t } : x)) }));
      run(api<Teacher>(`/teachers/${id}`, { method: "PUT", body: t }), (r) => setData((d) => ({ ...d, teachers: d.teachers.map((x) => (x.id === r.id ? r : x)) })));
    },
    deleteStudent: (id) => {
      setData((d) => ({
        ...d,
        students: d.students.filter((x) => x.id !== id),
        deletedStudentCodes: [...d.deletedStudentCodes, ...d.students.filter((x) => x.id === id).map((x) => x.code)],
        enrollments: d.enrollments.filter((e) => e.studentId !== id),
        scheduleStudents: d.scheduleStudents.filter((e) => e.studentId !== id),
      }));
      run(api(`/students/${id}`, { method: "DELETE" }));
    },
    deleteTeacher: (id) => {
      setData((d) => ({ ...d, teachers: d.teachers.filter((x) => x.id !== id) }));
      run(api(`/teachers/${id}`, { method: "DELETE" }));
    },
    deleteSystemUser: (id) => {
      setData((d) => ({ ...d, systemUsers: d.systemUsers.filter((x) => x.id !== id) }));
      runReload(api(`/users/${id}`, { method: "DELETE" }));
    },
    setTeacherStatus: (id, status) => {
      setData((d) => ({ ...d, teachers: d.teachers.map((x) => (x.id === id ? { ...x, status } : x)) }));
      run(api(`/teachers/${id}/status`, { body: { status } }));
    },
    addClass: (c) => {
      const id = newId();
      setData((d) => ({ ...d, classes: [...d.classes, { ...c, id, disabled: false }] }));
      run(api<DanceClass>("/classes", { body: { id, ...c } }), (r) => setData((d) => ({ ...d, classes: d.classes.map((x) => (x.id === r.id ? r : x)) })));
    },
    updateClass: (id, c) => {
      setData((d) => ({ ...d, classes: d.classes.map((x) => (x.id === id ? { ...x, ...c } : x)) }));
      run(api<DanceClass>(`/classes/${id}`, { method: "PUT", body: c }), (r) => setData((d) => ({ ...d, classes: d.classes.map((x) => (x.id === r.id ? r : x)) })));
    },
    setClassDisabled: (id, disabled) => {
      setData((d) => ({ ...d, classes: d.classes.map((x) => (x.id === id ? { ...x, disabled } : x)) }));
      run(api(`/classes/${id}/disabled`, { body: { disabled } }));
    },
    addSchedules: (list) => {
      const rows = list.map((s) => ({ ...s, id: newId() }));
      setData((d) => ({ ...d, schedules: [...d.schedules, ...rows] }));
      run(api("/schedules", { body: { items: rows } }));
    },
    deleteSchedule: (id) => {
      setData((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== id), scheduleStudents: d.scheduleStudents.filter((x) => x.scheduleId !== id) }));
      run(api(`/schedules/${id}`, { method: "DELETE" }));
    },
    addScheduleStudent: (scheduleId, studentId) => {
      const schedule = data.schedules.find((s) => s.id === scheduleId);
      if (!schedule || !data.enrollments.some((e) => e.classId === schedule.classId && e.studentId === studentId) ||
        !data.students.some((s) => s.id === studentId && s.status === "Active") ||
        data.scheduleStudents.some((x) => x.scheduleId === scheduleId && x.studentId === studentId)) return;
      setData((d) => ({ ...d, scheduleStudents: [...d.scheduleStudents, { scheduleId, studentId }] }));
      run(api(`/schedules/${scheduleId}/students`, { body: { studentId } }));
    },
    removeScheduleStudent: (scheduleId, studentId) => {
      setData((d) => ({ ...d, scheduleStudents: d.scheduleStudents.filter((x) => x.scheduleId !== scheduleId || x.studentId !== studentId) }));
      run(api(`/schedules/${scheduleId}/students/${studentId}`, { method: "DELETE" }));
    },
    addPosition: (p) => {
      const id = newId();
      setData((d) => ({ ...d, positions: [...d.positions, { ...p, id }], permissions: { ...d.permissions, [id]: emptyPerms() } }));
      runReload(api("/positions", { body: { id, name: p.name, description: p.description } }));
    },
    updatePosition: (id, p) => {
      if (data.positions.find((x) => x.id === id)?.isSystem) return;
      setData((d) => ({ ...d, positions: d.positions.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
      run(api(`/positions/${id}`, { method: "PUT", body: { name: p.name, description: p.description } }));
    },
    deletePosition: (id) => {
      if (data.positions.find((x) => x.id === id)?.isSystem) return;
      if (data.systemUsers.some((u) => u.positionId === id)) return;
      setData((d) => ({ ...d, positions: d.positions.filter((x) => x.id !== id), permissions: Object.fromEntries(Object.entries(d.permissions).filter(([k]) => k !== id)) }));
      run(api(`/positions/${id}`, { method: "DELETE" }));
    },
    setPositionPermissions: (positionId, perms) => {
      if (data.positions.find((x) => x.id === positionId)?.isSystem) return;
      setData((d) => ({ ...d, permissions: { ...d.permissions, [positionId]: perms } }));
      runReload(api(`/positions/${positionId}/permissions`, { method: "PUT", body: perms }));
    },
    addSystemUser: (u) => { runReload(api("/users", { body: u })); },
    updateSystemUser: (id, u) => {
      setData((d) => ({ ...d, systemUsers: d.systemUsers.map((x) => (x.id === id ? { ...x, ...u, password: "" } : x)) }));
      runReload(api(`/users/${id}`, { method: "PUT", body: u }).then(() => { window.dispatchEvent(new Event("yodo:me-updated")); }));
    },
    setSystemUserStatus: (id, status) => {
      setData((d) => ({ ...d, systemUsers: d.systemUsers.map((x) => (x.id === id ? { ...x, status } : x)) }));
      runReload(api(`/users/${id}/status`, { body: { status } }));
    },
  };
  return <YodoContext.Provider value={ctx}>{children}</YodoContext.Provider>;
}

export function useYodo() {
  const c = useContext(YodoContext);
  if (!c) throw new Error("useYodo must be used inside YodoProvider");
  return c;
}

export function classColor(classes: DanceClass[], classId: string) {
  const i = Math.max(0, classes.findIndex((c) => c.id === classId));
  return `var(--chart-${(i % 5) + 1})`;
}
