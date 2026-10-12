# ติดตั้ง YODO บน NAS (Synology DS925+)

ทำครั้งเดียว ใช้เวลาประมาณ 15 นาที วิธีเหมือนตอนติดตั้ง FinHR แต่ใช้โฟลเดอร์ `yodo` และพอร์ต **8092**
(FinHR ใช้ 8090 อยู่แล้ว สองแอปรันพร้อมกันได้ ไม่ชนกัน)

หลังติดตั้งเสร็จ NAS จะดึงเวอร์ชันใหม่จาก GitHub (สาขา `main`) เองทุก 5 นาที

## 0. เตรียม
1. **File Station** → โฟลเดอร์ `docker` (อยู่ที่ `/volume2`) → สร้างโฟลเดอร์ใหม่ชื่อ `yodo`
2. Container Manager กับ Git Server มีอยู่แล้วจากตอนติดตั้ง FinHR

## 1. เอาไฟล์ติดตั้งขึ้น NAS
1. เปิด GitHub ของโปรเจกต์ `Yodo_school` → ไฟล์ `deploy/nas/setup.sh` → กดปุ่ม **Download raw file**
2. **File Station** → `docker/yodo` → **Upload** ไฟล์ `setup.sh`

## 2. รันไฟล์ติดตั้ง
เปิด Terminal (Mac) หรือ PowerShell (Windows):
```
ssh ชื่อผู้ใช้@192.168.x.x
sudo -i
bash /volume2/docker/yodo/setup.sh
```
สคริปต์จะ **พิมพ์กุญแจ 1 บรรทัด** ขึ้นต้นด้วย `ssh-ed25519` แล้วหยุดรอ → ทำข้อ 3 แล้วค่อยกลับมากด Enter

## 3. ใส่กุญแจใน GitHub (ให้ NAS ดึงโค้ดได้อย่างเดียว)
กุญแจของ FinHR ใช้กับโปรเจกต์นี้ไม่ได้ (GitHub ให้ 1 กุญแจต่อ 1 โปรเจกต์) จึงต้องใส่กุญแจใหม่
1. GitHub → repo `Yodo_school` → **Settings** → **Deploy keys** → **Add deploy key**
2. Title: `NAS` · Key: วางบรรทัด `ssh-ed25519 ...` ทั้งบรรทัด
3. **ไม่ต้องติ๊ก** Allow write access → **Add key**
4. กลับไปหน้าต่าง SSH → กด **Enter**

กุญแจนี้ไม่ใช่ความลับ (เป็นกุญแจฝั่งสาธารณะ)

จบแล้วจะขึ้น:
```
Open    : http://192.168.x.x:8092
Version : abc1234 2026-10-12 18:30
```

## 4. ตั้งให้อัปเดตเองทุก 5 นาที
**Control Panel** → **Task Scheduler** → **Create** → **Scheduled Task** → **User-defined script**
- General: Task = `YODO update` · User = **root**
- Schedule: **Daily** · **Every 5 minutes** · First run 00:00 · Last run 23:55
- Task Settings → Run command:
  ```
  bash /volume2/docker/yodo/app/deploy/update.sh
  ```
- OK → คลิกขวาที่ task → **Run** หนึ่งครั้ง

## 5. สร้างบัญชีแรก (SuperAdmin)
1. เปิด `http://192.168.x.x:8092` จะเจอหน้า **ตั้งค่าครั้งแรก**
2. **File Station** → `docker/yodo/data` → เปิดไฟล์ `setup-code.txt` (ตัวเลข 8 หลัก)
3. กรอกรหัสนั้น + ชื่อ + Username + รหัสผ่าน → **สร้างบัญชี**
4. ไฟล์ `setup-code.txt` จะหายไปเอง

## 6. ย้ายนักเรียนจาก Lovable
1. ใน Lovable: **Cloud** → **Database** → ตาราง **students** → **Export** เป็น CSV
2. ในแอป YODO: กดรูปโปรไฟล์ → **นำเข้านักเรียน** → เลือกไฟล์ → **ตรวจไฟล์** → **นำเข้า**
3. ทำซ้ำได้ นักเรียนที่มีรหัสอยู่แล้วจะถูกข้าม ไม่เกิดซ้ำ

## 7. ที่อยู่ https สำหรับมือถือ (แจ้งเตือน, ติดตั้งเป็นแอป)
ใช้ Tailscale Funnel ตัวเดียวกับ FinHR แต่พอร์ต **8443** (FinHR ใช้ 443)
แก้ task `tailscale-funnel` ใน Task Scheduler ให้คำสั่งเป็น:
```
tailscale serve reset; tailscale funnel --bg 8090; tailscale funnel --bg --https=8443 8092; tailscale funnel status > /volume2/docker/funnel.txt
```
แล้วกด Run หนึ่งครั้ง → YODO จะอยู่ที่ `https://mikenas.tail4afc1d.ts.net:8443`
(เปิด `funnel.txt` ใน File Station ต้องเห็นทั้ง 443 และ 8443)

## ดูว่าทำงานอยู่ไหม
- เวอร์ชันที่รันอยู่: กดรูปโปรไฟล์ในแอป (บรรทัดล่างสุด) หรือ `http://<IP>:8092/version.txt`
- บันทึก: `docker/yodo/app/deploy/update.log`
  - `OK: now serving abc1234` = อัปเดตสำเร็จ
  - `ERROR: build failed` = เวอร์ชันใหม่มีปัญหา **เว็บยังรันเวอร์ชันเก่าอยู่** ระบบจะลองใหม่ทุก 5 นาที

## สำรองข้อมูล
- สำรองเองก่อนทุกการอัปเดต และทุกวันตี 3 ที่ `docker/yodo/data/backups` (เก็บ 30 ไฟล์ล่าสุด)
- รูปทั้งหมดอยู่ที่ `docker/yodo/data/uploads`
- **ห้ามลบ** `docker/yodo/data/secrets.json` และ `push.json`

## ถ้าเจอปัญหา
| อาการ | ทำอะไร |
|---|---|
| `GitHub still refuses the key` | กุญแจวางไม่ครบบรรทัด ลบแล้วเพิ่มใหม่ แล้วรัน setup.sh อีกรอบ |
| `port is already allocated` | แก้ `PORT=` ใน `docker/yodo/app/.env` เป็นเลขอื่น แล้วรัน `bash /volume2/docker/yodo/app/deploy/update.sh --force` |
