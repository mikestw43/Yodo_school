import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Children, isValidElement, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Ellipsis, ImagePlus, Minus, Pencil, Plus, Search, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import defaultAvatar from "@/assets/default-avatar.webp";
import { L, opt } from "@/lib/i18n";

/** รูปภาพแบบโหลดเมื่อเลื่อนถึง (lazy) + มี placeholder กันจอกระตุก */
export function LazyImg({ src, alt, className }: { src: string; alt: string; className?: string | undefined }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn("bg-accent/60 transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0", className)}
    />
  );
}

/** ตัวช่วยแบ่งหน้า: คืนรายการของหน้าปัจจุบัน */
export function usePagination<T>(items: T[], perPage: number, resetKey: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * perPage;
  return {
    pageItems: items.slice(start, start + perPage),
    page: current,
    setPage,
    totalPages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, items.length),
  };
}

export function Pagination({ page, totalPages, onChange, from, to, total, unit }: {
  page: number; totalPages: number; onChange: (p: number) => void; from: number; to: number; total: number; unit?: string;
}) {
  if (total === 0) return null;
  const pages: (number | "gap")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
      <p className="text-xs text-muted-foreground">{L(`แสดง ${from}–${to} จาก ${total} ${unit ?? "รายการ"}`, `Showing ${from}–${to} of ${total} ${unit ?? "items"}`)}</p>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={L("หน้าก่อนหน้า", "Previous page")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                "h-9 min-w-9 rounded-full px-3 text-sm font-medium transition-colors",
                p === page ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {p}
            </button>
          ),
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={L("หน้าถัดไป", "Next page")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}


/** Back button for pages opened from the account menu (owner 12/10/2026): back where you came from, else the dashboard. */
export function BackButton() {
  const router = useRouter();
  const canBack = useCanGoBack();
  const navigate = useNavigate();
  return (
    <Button variant="outline" onClick={() => (canBack ? router.history.back() : navigate({ to: "/" }))} className="mb-3 gap-2 rounded-full">
      <ArrowLeft className="h-4 w-4" /> {L("ย้อนกลับ", "Back")}
    </Button>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: ReactNode; back?: boolean }) {
  return (
    <>
    {back && <BackButton />}
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
    </>
  );
}

export function Field({ label, error, required, children, className }: { label: string; error?: string | undefined; required?: boolean; children: ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-foreground/80">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function NativeSelect({ className, children, value, onValueChange }: {
  className?: string;
  children: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const options = Children.toArray(children).filter(isValidElement<{ value?: string; disabled?: boolean; children: ReactNode }>);
  const placeholder = options.find((o) => o.props.value === "")?.props.children;
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("h-10 min-w-0 rounded-lg border-border bg-background px-4 text-foreground shadow-xs focus:ring-2 focus:ring-ring/40 [&>svg]:mr-1 [&>svg]:text-muted-foreground [&>svg]:opacity-100", className)}>
        <SelectValue placeholder={placeholder || L("เลือก", "Select")} />
      </SelectTrigger>
      <SelectContent className="rounded-lg border-border bg-popover p-1 shadow-soft">
        {options.filter((o) => o.props.value !== "").map((o) => (
          <SelectItem key={o.props.value ?? String(o.props.children)} value={o.props.value ?? String(o.props.children)} disabled={o.props.disabled ?? false} className="my-0.5 cursor-pointer rounded-md px-3 py-2 pr-8 text-foreground focus:bg-accent focus:text-accent-foreground">
            {o.props.children}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Avatar({ src, name, className }: { src?: string | undefined; name: string; className?: string | undefined }) {
  return (
    <img
      src={src || defaultAvatar}
      alt={name}
      loading="lazy"
      decoding="async"
      className={cn("h-10 w-10 shrink-0 rounded-full bg-accent/60 object-cover", className)}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === "Active";
  const disabled = status === "Disabled";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        active && "bg-success/15 text-success",
        disabled && "bg-destructive/10 text-destructive",
        !active && !disabled && "bg-muted text-muted-foreground",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {opt(status)}
    </span>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <svg viewBox="0 0 120 40" className="mb-4 h-10 w-28 text-primary/40" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 30 C 30 -5, 50 45, 70 15 S 110 10, 118 25" strokeLinecap="round" />
      </svg>
      <p className="font-display text-xl font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Keep the class crop, form thumbnail and displayed class cover at the same 12:5 ratio.
const FRAME = { circle: { w: 240, h: 240 }, wide: { w: 288, h: 120 } } as const;

function ImageEditor({ src, shape, onUse, onCancel }: { src: string; shape: "circle" | "wide"; onUse: (v: string) => void; onCancel: () => void }) {
  const frame = FRAME[shape];
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const cover = imgSize ? Math.max(frame.w / imgSize.w, frame.h / imgSize.h) : 1;
  const scale = cover * zoom;
  const dispW = imgSize ? imgSize.w * scale : 0;
  const dispH = imgSize ? imgSize.h * scale : 0;
  const clamp = (o: { x: number; y: number }, dw = dispW, dh = dispH) => ({
    x: Math.min(Math.max(o.x, -(dw - frame.w) / 2), (dw - frame.w) / 2),
    y: Math.min(Math.max(o.y, -(dh - frame.h) / 2), (dh - frame.h) / 2),
  });
  const changeZoom = (z: number) => {
    const nz = Math.min(3, Math.max(1, z));
    setZoom(nz);
    if (imgSize) {
      const s = cover * nz;
      setOffset((o) => clamp(o, imgSize.w * s, imgSize.h * s));
    }
  };

  const confirm = () => {
    if (!imgSize) return;
    const out = document.createElement("canvas");
    out.width = frame.w * 2;
    out.height = frame.h * 2;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const left = frame.w / 2 - dispW / 2 + offset.x;
      const top = frame.h / 2 - dispH / 2 + offset.y;
      ctx.drawImage(img, -left / scale, -top / scale, frame.w / scale, frame.h / scale, 0, 0, out.width, out.height);
      onUse(out.toDataURL("image/jpeg", 0.85));
    };
    img.src = src;
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{L("ปรับแต่งรูป", "Adjust picture")}</DialogTitle>
          <DialogDescription>{L("ลากรูปเพื่อขยับตำแหน่ง และซูมเข้า–ออกให้พอดีกรอบ", "Drag the picture to move it, and zoom in or out to fit the frame.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5 py-2">
          <div
            className={cn("relative touch-none select-none overflow-hidden border border-border bg-accent/40", shape === "circle" ? "rounded-full" : "rounded-2xl")}
            style={{ width: frame.w, height: frame.h, cursor: "grab" }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }; }}
            onPointerMove={(e) => { if (drag.current) setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.px, y: drag.current.oy + e.clientY - drag.current.py })); }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                setImgSize({ w: el.naturalWidth, h: el.naturalHeight });
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{ width: dispW || "auto", height: dispH || "auto", transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
            />
          </div>
          <div className="flex w-full items-center gap-3 px-2">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => changeZoom(zoom - 0.1)} aria-label={L("ซูมออก", "Zoom out")}><Minus className="h-4 w-4" /></Button>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="w-full accent-primary" aria-label={L("ระดับการซูม", "Zoom level")} />
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => changeZoom(zoom + 0.1)} aria-label={L("ซูมเข้า", "Zoom in")}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{L("ยกเลิก", "Cancel")}</Button>
          <Button onClick={confirm} disabled={!imgSize}>{L("ใช้รูปนี้", "Use this picture")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImageUpload({ value, onChange, shape = "circle" }: { value: string; onChange: (v: string) => void; shape?: "circle" | "wide" }) {
  const [editing, setEditing] = useState<string | null>(null);
  const onFile = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error(L("กรุณาเลือกไฟล์รูปภาพ", "Please choose a picture file")); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error(L("ไฟล์ต้องมีขนาดไม่เกิน 2MB", "The file must be 2 MB or smaller")); return; }
    const r = new FileReader();
    r.onload = () => setEditing(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <div className="flex items-center gap-4">
      <label
        className={cn(
          "relative flex cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-primary/30 bg-accent/50 text-primary hover:bg-accent",
           shape === "circle" ? "h-20 w-20 rounded-full" : "aspect-[12/5] w-40 rounded-2xl",
        )}
      >
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : shape === "circle" ? (
          <>
            <img src={defaultAvatar} alt="" className="h-full w-full object-cover opacity-80" />
            <span className="absolute inset-0 flex items-center justify-center bg-primary/25"><ImagePlus className="h-6 w-6 text-white drop-shadow" /></span>
          </>
        ) : (
          <ImagePlus className="h-6 w-6" />
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <div className="text-xs text-muted-foreground">
        <p>{L("JPG / PNG ไม่เกิน 2MB", "JPG / PNG up to 2 MB")}</p>
        <div className="mt-1 flex flex-col gap-1">
          {value && (
            <button type="button" onClick={() => setEditing(value)} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Pencil className="h-3 w-3" /> {L("ปรับแต่งรูป", "Adjust picture")}
            </button>
          )}
          {value && (
            <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 text-destructive hover:underline">
              <X className="h-3 w-3" /> {L("ลบรูป", "Remove picture")}
            </button>
          )}
        </div>
      </div>
      {editing && <ImageEditor src={editing} shape={shape} onUse={(v) => { onChange(v); setEditing(null); }} onCancel={() => setEditing(null)} />}
    </div>
  );
}

export function ChipSelect({ options, value, onChange, label = (o) => o }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; label?: (o: string) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50",
            )}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, text, confirmLabel, onConfirm, destructive }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; text: string; confirmLabel?: string; onConfirm: () => void; destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("ยกเลิก", "Cancel")}</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={() => { onConfirm(); onOpenChange(false); }}>{confirmLabel ?? L("ยืนยัน", "Confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="col-span-full mt-2 border-b border-border pb-2 font-display text-lg font-semibold text-primary">{children}</h3>;
}

export const onlyDigits10 = (v: string) => v.replace(/\D/g, "").slice(0, 10);

export function ClassCover({ src, name, color }: { src?: string | undefined; name: string; color: string }) {
  return src ? (
    <LazyImg src={src} alt={name} className="h-full w-full object-cover" />

  ) : (
    <div className="relative h-full w-full overflow-hidden" style={{ background: `color-mix(in oklab, ${color} 22%, var(--card))` }}>
      <svg viewBox="0 0 200 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6">
        <path d="M-10 70 C 40 10, 80 110, 120 50 S 190 20, 210 60" />
        <path d="M-10 85 C 50 30, 90 120, 140 65 S 190 40, 210 80" opacity="0.5" />
      </svg>
      <span className="absolute bottom-2 left-3 font-display text-2xl font-semibold" style={{ color }}>{name.charAt(0)}</span>
    </div>
  );
}

/** ช่องเลือกวันที่ แสดง dd/MM/yyyy ค่าเป็น yyyy-MM-dd */
export function DateField({ value, onChange, min, max, placeholder }: { value: string; onChange: (v: string) => void; min?: string | undefined; max?: string | undefined; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const sel = value ? parseISO(value) : undefined;
  const minD = min ? parseISO(min) : undefined;
  const maxD = max ? parseISO(max) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("h-10 w-full justify-start gap-2 rounded-xl font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="h-4 w-4" />
          {sel ? format(sel, "dd/MM/yyyy") : placeholder ?? L("วว/ดด/ปปปป", "dd/mm/yyyy")}
          {value && <span role="button" aria-label={L("ล้างวันที่", "Clear date")} className="ml-auto" onClick={(e) => { e.stopPropagation(); onChange(""); }}><X className="h-3.5 w-3.5" /></span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={sel}
          defaultMonth={sel ?? maxD ?? new Date()}
          captionLayout="dropdown"
          startMonth={new Date(1940, 0)}
          endMonth={new Date(new Date().getFullYear() + 10, 11)}
          disabled={[...(minD ? [{ before: minD }] : []), ...(maxD ? [{ after: maxD }] : [])]}
          onSelect={(d) => { onChange(d ? format(d, "yyyy-MM-dd") : ""); setOpen(false); }}
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}

/** แนบรูปใบเสร็จ (สี่เหลี่ยม ไม่ครอป) + กดดูรูปใหญ่ */
export function ReceiptUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState(false);
  const onFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(L("กรุณาเลือกไฟล์รูปภาพ", "Please choose a picture file")); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error(L("ไฟล์ต้องมีขนาดไม่เกิน 2MB", "The file must be 2 MB or smaller")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        onChange(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {value ? (
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => setViewing(true)} title={L("ดูใบเสร็จ", "View receipt")} className="overflow-hidden rounded-xl border border-border bg-muted/40">
            <img src={value} alt={L("ใบเสร็จ", "Receipt")} className="h-40 w-32 object-contain" />
          </button>
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setViewing(true)}>{L("ดูรูปใหญ่", "View large")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>{L("เปลี่ยนรูป", "Change picture")}</Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onChange("")}>{L("ลบ", "Remove")}</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/60">
          <ImagePlus className="h-6 w-6 text-primary" />
          <span className="font-medium text-foreground">{L("แนบใบเสร็จ", "Attach receipt")}</span>
          <span className="text-xs">{L("JPG / PNG ไม่เกิน 2MB", "JPG / PNG up to 2 MB")}</span>
        </button>
      )}
      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{L("ใบเสร็จ", "Receipt")}</DialogTitle><DialogDescription>{L("รูปสลิป/ใบเสร็จที่แนบไว้", "The attached slip or receipt")}</DialogDescription></DialogHeader>
          <img src={value} alt={L("ใบเสร็จ", "Receipt")} className="max-h-[75vh] w-full rounded-xl object-contain" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Finger/mouse signature canvas; exports a transparent PNG data URL. */
export function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
  }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDirty(false); };
  return (
    <div className="space-y-3">
      <canvas ref={ref} className="h-48 w-full touch-none rounded-2xl border border-dashed border-border bg-background"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const ctx = e.currentTarget.getContext("2d")!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); setDirty(true); }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); }}
        onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={clear}>{L("ล้าง", "Clear")}</Button>
        <Button variant="outline" onClick={onCancel}>{L("ยกเลิก", "Cancel")}</Button>
        <Button disabled={!dirty} onClick={() => onSave(ref.current!.toDataURL("image/png"))}>{L("บันทึกลายเซ็น", "Save signature")}</Button>
      </div>
    </div>
  );
}

export type RowAction = { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean; testId?: string };

/** One "more" button that opens the row's actions (owner 13/10/2026, mockup Hfv2W8caQnfymebnMUxPa7 option A: one
 *  button instead of a row of icons, on every list). Taps never reach the card/row under it. Nothing to do = nothing shown. */
export function RowActions({ name, items, className }: { name: string; items: (RowAction | false | null | undefined)[]; className?: string }) {
  const list = items.filter(Boolean) as RowAction[];
  if (!list.length) return null;
  const safe = list.filter((x) => !x.danger), danger = list.filter((x) => x.danger);
  return (
    <div className={cn("shrink-0", className)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-full text-muted-foreground data-[state=open]:border-primary data-[state=open]:bg-accent/40 data-[state=open]:text-primary"
            aria-label={L(`จัดการ ${name}`, `Actions for ${name}`)} title={L("จัดการ", "Actions")} data-testid="row-actions">
            <Ellipsis className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48 rounded-2xl p-1.5">
          {safe.map((x) => <DropdownMenuItem key={x.label} className="gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold [&_svg]:size-4" data-testid={x.testId} onSelect={x.onSelect}>{x.icon}{x.label}</DropdownMenuItem>)}
          {safe.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
          {danger.map((x) => <DropdownMenuItem key={x.label} className="gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive focus:text-destructive [&_svg]:size-4" data-testid={x.testId} onSelect={x.onSelect}>{x.icon}{x.label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export type FilterChip = { value: string; label: string; count?: number; tone?: "warn" };

/** Search + filter bar of the list pages (owner 25/10/2026, mockup VeE7DE1eWKPHXRhqPhGvDg v3): a low search box on its
 *  own line (with `extra`, e.g. the view icons, at its end), then the filter chips on ONE line that slides sideways when
 *  the screen is too narrow. Computers: everything on one row. */
export function SearchFilters({ q, onQ, placeholder, chips, value, onValue, extra, testPrefix = "filter" }: {
  q: string; onQ: (v: string) => void; placeholder: string;
  chips: FilterChip[]; value: string; onValue: (v: string) => void; extra?: ReactNode; testPrefix?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <div className="flex min-w-0 items-center gap-2 md:w-80 md:shrink-0">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} data-testid="list-search"
            className="h-9 w-full min-w-0 rounded-full border border-border bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" />
        </div>
        {extra}
      </div>
      <div className="-mx-1 flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={L("แสดง", "Show")}>
        {chips.map((c) => {
          const on = value === c.value;
          return (
            <button key={c.value} type="button" aria-pressed={on} onClick={() => onValue(c.value)} data-testid={`${testPrefix}-${c.value}`}
              className={cn("inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors",
                on ? (c.tone === "warn" ? "bg-orange-700 text-white" : "bg-primary text-primary-foreground") : "border border-border bg-background hover:bg-muted")}>
              {c.label}{c.count !== undefined && <span className={cn("font-semibold", on ? "opacity-85" : "text-muted-foreground")}>{c.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Icon-only view switch (cards / table) for the end of the search line. */
export function ViewIcons<T extends string>({ value, onChange, options, testPrefix }: { value: T; onChange: (v: T) => void; options: [T, ReactNode, string][]; testPrefix: string }) {
  return (
    <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-full border border-border bg-background" role="group" aria-label={L("มุมมอง", "View")}>
      {options.map(([v, icon, label]) => (
        <button key={v} type="button" aria-pressed={value === v} aria-label={label} title={label} onClick={() => onChange(v)} data-testid={`${testPrefix}-${v}`}
          className={cn("inline-flex w-9 items-center justify-center transition-colors [&_svg]:size-4", value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{icon}</button>
      ))}
    </div>
  );
}
