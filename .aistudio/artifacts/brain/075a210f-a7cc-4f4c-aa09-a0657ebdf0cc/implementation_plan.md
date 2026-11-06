# แผนแก้ไขปัญหา Port 3000 ค้างบน Windows และสคริปต์ผูก GitHub อัตโนมัติในคลิกเดียว

แผนการพัฒนานี้แก้ไขต้นตอของปัญหาที่หน้าเว็บแสดง UI ใหม่แล้วแต่เมื่อกดปุ่มอัปเดตกลับขึ้น `API route not found: POST /api/system/self-update` พร้อมสร้างสคริปต์และระบบป้องกัน Port 3000 ค้างบน Windows แบบถาวร

### User Review & Critical Decisions

> [!IMPORTANT]
> สาเหตุที่ขึ้น `API route not found` ทั้งที่วางไฟล์และรันคำสั่งใน CMD แล้ว เกิดจาก **บน Windows มีโปรเซส `node.exe` ตัวเก่าค้างทับ Port 3000 อยู่** ทำให้เมื่อสั่ง `pm2 restart` เซิร์ฟเวอร์ตัวใหม่เข้ายึด Port 3000 ไม่ได้ (ส่วนหน้าเว็บที่เปลี่ยนเป็นหน้าใหม่เพราะตัวเก่าไปอ่านไฟล์หน้าเว็บ `dist/index.html` ตัวใหม่จากฮาร์ดดิสก์มาแสดง) กรุณากด **Proceed** เพื่อให้ระบบเพิ่มโค้ดเคลียร์ Port 3000 อัตโนมัติและอัปเดตสคริปต์คลิกเดียวครับ

- **Confirmed Decision 1 (ระบบเคลียร์โปรเซสเก่าที่ค้างบน Port 3000 อัตโนมัติใน `server.ts`)**: เพิ่มระบบตรวจสอบและสั่งปิดโปรเซส `node.exe` ตัวเก่าที่ค้างอยู่บน Port 3000 อัตโนมัติทันทีที่เซิร์ฟเวอร์เริ่มทำงาน (Auto Port-3000 Conflict Resolver) เพื่อให้เซิร์ฟเวอร์ตัวใหม่เข้าทำงานแทนตัวเก่าได้ 100% ทุกครั้ง
- **Confirmed Decision 2 (สคริปต์คลิกเดียว `update-windows.bat` เคลียร์ Port 3000 + ผูก GitHub `suphol4726/eboard-monitor`)**: อัปเกรดสคริปต์ให้สั่งล้างโปรเซสที่ค้างบน Port 3000, ผูก GitHub Repository `https://github.com/suphol4726/eboard-monitor.git` ให้อัตโนมัติ, สำรองข้อมูลเดิม (`devices.json`, `settings.json`, `logs.json`), สั่ง Build ใหม่ และรีเซ็ต PM2 ให้สะอาดในคลิกเดียว

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **แก้ปัญหาโปรเซสเก่าค้างทับ Port 3000 บน Windows**: เมื่อเซิร์ฟเวอร์เริ่มรัน หากพบว่ามี `node.exe` ตัวเก่าถือครอง Port 3000 อยู่ ระบบจะสั่งเคลียร์โปรเซสเก่าออกโดยอัตโนมัติก่อนเปิดรับการเชื่อมต่อ ทำให้ API ใหม่ทั้งหมด (`/api/system/self-update`, `/api/scan-subnet` โหมด MAC) ทำงานได้ทันที
  2. **ผูก GitHub `https://github.com/suphol4726/eboard-monitor.git` อัตโนมัติ**: ตั้งค่าเริ่มต้นให้ชี้ไปยัง Repository ของผู้ดูแลระบบโดยตรง พร้อมรองรับการเรียกใช้ `git.exe` จากพาธติดตั้งมาตรฐานของ Windows (`C:\Program Files\Git\cmd\git.exe`) แม้ยังไม่รีบูตเครื่อง
- **Target Audience / Persona**: ผู้ดูแลระบบ E-Board ที่รันเซิร์ฟเวอร์บน Windows ผ่าน PM2 และ Cloudflare Tunnel (`https://eboard.spsm-it.cc/`)
- **Key Value**: หมดปัญหาเซิร์ฟเวอร์จำโค้ดเก่าในแรมเมื่อสั่งรีสตาร์ต และสามารถกดอัปเดตผ่านหน้าเว็บได้จริง 100%

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **การเคลียร์โปรเซสเก่าและผูก GitHub ครั้งแรก**:
     - รันสคริปต์ `update-windows.bat` (หรือคัดลอกคำสั่งสั้นๆ ในหน้าตั้งค่าไปวางใน CMD 1 ครั้งเพื่อฆ่าโปรเซสเก่าที่ค้างอยู่)
     - เซิร์ฟเวอร์ตัวใหม่จะเข้ายึด Port 3000 แทนตัวเก่าทันที
  2. **การกดอัปเดตผ่านหน้าเว็บในครั้งถัดไป**:
     - เข้าหน้า **ตั้งค่าระบบ > การบำรุงรักษา** กดปุ่ม **"ดึงอัปเดตล่าสุด & รีสตาร์ตทันที"**
     - เซิร์ฟเวอร์จะดึงโค้ดจาก `https://github.com/suphol4726/eboard-monitor.git` สั่ง Build และเคลียร์ Port 3000 เพื่อรีสตาร์ตตัวเองเป็นเวอร์ชันใหม่อัตโนมัติ
- **Visual Identity & Theme**:
  - เพิ่มกล่องคัดลอกคำสั่งด่วนสำหรับเคลียร์ Port 3000 ในหน้าตั้งค่า (กรณีโปรเซสเก่าค้างจากก่อนอัปเดต) พร้อมแสดงเลขเวอร์ชันและสถานะการเชื่อมต่อ Git ที่ชัดเจน

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Auto Port-3000 Recovery ใน `server.ts`**
  - *Chosen Approach*: ก่อนที่ `app.listen(3000)` จะทำงาน (หรือเมื่อเกิด `EADDRINUSE`) บน Windows ระบบจะรันคำสั่งค้นหา PID ที่ถือครอง `:3000` (ยกเว้น PID ของตัวเอง) และสั่ง `taskkill /F /PID` อัตโนมัติแล้วเชื่อมต่อใหม่อีกครั้ง
  - *Why*: ป้องกันปัญหา `process.on('uncaughtException')` กลืน Error `EADDRINUSE` แล้วปล่อยให้โปรเซสเก่าค้างตอบสนอง API ตลอดไป
- **Decision 2: ล้างไฟล์ `dist/server.cjs` เดิมก่อน Build เสมอ**
  - *Chosen Approach*: ทั้งใน API `/api/system/self-update` และใน `update-windows.bat` จะลบไฟล์ `dist/server.cjs` ตัวเก่าก่อนรัน `npm run build` และสั่ง `pm2 reload/restart` พร้อมเคลียร์โปรเซสซ้ำซ้อน
  - *Why*: มั่นใจได้ว่าไฟล์หลังบ้านที่รันอยู่เป็นเวอร์ชันใหม่ล่าสุดเสมอ

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                Windows Server Port 3000 Guard & Updater                 │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 1. Pre-Listen Port 3000 Cleaner (server.ts & update-windows.bat)  │  │
│  │    - Detects any stale PID bound to :3000 (netstat -aon)          │  │
│  │    - Terminates stale node.exe PID before binding new server      │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 2. GitHub Auto-Sync Engine (/api/system/self-update)              │  │
│  │    - Auto-locates git.exe on Windows                              │  │
│  │    - Backs up devices.json, settings.json, logs.json              │  │
│  │    - Pulls https://github.com/suphol4726/eboard-monitor.git       │  │
│  │    - Rebuilds dist/server.cjs & restarts cleanly                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - ข้อมูล `devices.json`, `settings.json`, และ `logs.json` ถูกสำรองไว้ในหน่วยความจำและโฟลเดอร์ `.backup_data` ก่อนการอัปเดตทุกครั้ง
- **Interactive Component & State Mapping**:
  - ในหน้า **ตั้งค่าระบบ > การบำรุงรักษา** มีปุ่มคัดลอกคำสั่งบรรทัดเดียวสำหรับเคลียร์โปรเซสเก่าใน CMD (ใช้เฉพาะครั้งแรกที่โปรเซสเก่าค้าง) และปุ่มกดดึงอัปเดตจาก GitHub ในคลิกเดียวสำหรับครั้งต่อๆ ไป
