# 📬 Notification Polling Architecture - Panduan Implementasi Backend

**Author:** Zoo - Samling AI Team  
**Date:** 2026-07-16  
**Architecture:** Polling-based (Bot pulls data from Backend)

---

## 📋 Daftar Isi

1. [Konsep Arsitektur](#konsep-arsitektur)
2. [Kelebihan Arsitektur Polling](#kelebihan-arsitektur-polling)
3. [Endpoint API yang Diperlukan](#endpoint-api-yang-diperlukan)
4. [Implementasi Backend FastAPI](#implementasi-backend-fastapi)
5. [Konfigurasi Bot WhatsApp](#konfigurasi-bot-whatsapp)
6. [Flow Diagram](#flow-diagram)
7. [Testing & Troubleshooting](#testing--troubleshooting)

---

## 🏗️ Konsep Arsitektur

### Polling-Based Architecture

Bot WhatsApp menggunakan **polling mechanism** untuk menarik (pull) data notifikasi dari backend FastAPI secara berkala.

```
┌─────────────────┐                    ┌──────────────────┐
│                 │  Polling Request   │                  │
│  WhatsApp Bot   │ ──────────────────>│  Backend FastAPI │
│   (Baileys)     │                    │   (Your API)     │
│                 │<──────────────────  │                  │
│                 │  Pending Notifs    │                  │
└─────────────────┘                    └──────────────────┘
         │                                      ▲
         │ Kirim WA                             │
         ▼                                      │
┌─────────────────┐                             │
│                 │  Mark as Sent               │
│   WhatsApp      │ ────────────────────────────┘
│     User        │
└─────────────────┘
```

### Cara Kerja

1. **Bot melakukan HTTP GET** ke endpoint `/api/v1/notifications/pending` setiap X detik (default: 30 detik)
2. **Backend merespon** dengan daftar notifikasi yang perlu dikirim (status: pending)
3. **Bot memproses** setiap notifikasi dan mengirimnya via WhatsApp
4. **Bot memberitahu backend** via HTTP POST ke `/api/v1/notifications/{id}/mark-sent` bahwa notifikasi sudah terkirim
5. **Backend mengupdate status** notifikasi menjadi "sent" atau "failed"

---

## ✅ Kelebihan Arsitektur Polling

1. **Tidak perlu membuka port di sisi bot** - Bot hanya melakukan outbound request
2. **Tidak perlu setup CORS** di sisi bot - Bot tidak menerima request
3. **Lebih sederhana** - Tidak perlu Express server di dalam bot
4. **Stateless** - Bot bisa restart kapan saja tanpa kehilangan notifikasi
5. **Scalable** - Backend bisa buffer notifikasi dan bot akan menariknya nanti
6. **Fault tolerant** - Jika bot offline, notifikasi akan tetap di-queue di backend

---

## 🔌 Endpoint API yang Diperlukan

### 1. GET `/api/v1/notifications/pending`

**Fungsi:** Bot menarik daftar notifikasi yang belum terkirim

**Headers:**
```http
X-API-Key: your_secret_key_here (opsional, untuk autentikasi)
Content-Type: application/json
```

**Response Success (200):**
```json
{
  "success": true,
  "notifications": [
    {
      "id": 1,
      "whatsapp_number": "628123456789",
      "message": "Terima kasih atas laporan Anda! Kami akan segera menindaklanjuti.",
      "created_at": "2026-07-16T10:00:00Z",
      "priority": "normal"
    },
    {
      "id": 2,
      "phone_number": "08567891234",
      "message": "Status laporan Anda telah berubah menjadi: DIPROSES",
      "created_at": "2026-07-16T10:05:00Z",
      "priority": "high"
    }
  ],
  "count": 2
}
```

**Response Jika Tidak Ada Notifikasi (200):**
```json
{
  "success": true,
  "notifications": [],
  "count": 0
}
```

**Notes:**
- Field `whatsapp_number` atau `phone_number` wajib ada (salah satu)
- Format nomor bisa dengan atau tanpa kode negara (bot akan format otomatis)
- Field `message` wajib ada (string)
- Field lain seperti `priority`, `created_at` opsional

---

### 2. POST `/api/v1/notifications/{id}/mark-sent`

**Fungsi:** Bot memberitahu backend bahwa notifikasi sudah berhasil terkirim

**URL Param:**
- `id` (integer/string): ID notifikasi yang terkirim

**Headers:**
```http
X-API-Key: your_secret_key_here (opsional)
Content-Type: application/json
```

**Request Body:**
```json
{
  "sent_at": "2026-07-16T10:10:30Z",
  "status": "sent"
}
```

**Response Success (200):**
```json
{
  "success": true,
  "message": "Notification marked as sent",
  "notification_id": 1
}
```

---

### 3. POST `/api/v1/notifications/{id}/mark-failed`

**Fungsi:** Bot memberitahu backend bahwa notifikasi gagal dikirim

**URL Param:**
- `id` (integer/string): ID notifikasi yang gagal

**Headers:**
```http
X-API-Key: your_secret_key_here (opsional)
Content-Type: application/json
```

**Request Body:**
```json
{
  "failed_at": "2026-07-16T10:10:30Z",
  "status": "failed",
  "error_message": "Failed to send WhatsApp message: User not found"
}
```

**Response Success (200):**
```json
{
  "success": true,
  "message": "Notification marked as failed",
  "notification_id": 1
}
```

---

## 💻 Implementasi Backend FastAPI

### Database Model (SQLAlchemy)

```python
from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class NotificationStatus(enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    whatsapp_number = Column(String(20), nullable=False)
    message = Column(String(1000), nullable=False)
    status = Column(Enum(NotificationStatus), default=NotificationStatus.PENDING)
    priority = Column(String(20), default="normal")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)
    error_message = Column(String(500), nullable=True)
    
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
```

### FastAPI Endpoints

```python
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])

# --- Pydantic Schemas ---

class NotificationResponse(BaseModel):
    id: int
    whatsapp_number: str
    message: str
    created_at: datetime
    priority: str = "normal"
    
    class Config:
        from_attributes = True

class PendingNotificationsResponse(BaseModel):
    success: bool = True
    notifications: List[NotificationResponse]
    count: int

class MarkSentRequest(BaseModel):
    sent_at: datetime
    status: str = "sent"

class MarkFailedRequest(BaseModel):
    failed_at: datetime
    status: str = "failed"
    error_message: str

# --- Dependency untuk API Key Validation (Opsional) ---

def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Validasi API Key jika diperlukan"""
    expected_key = "your_secret_key_here"  # Dari environment
    
    if expected_key and x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    return True

# --- Endpoints ---

@router.get("/pending", response_model=PendingNotificationsResponse)
async def get_pending_notifications(
    db: Session = Depends(get_db),
    _: bool = Depends(verify_api_key)
):
    """
    Endpoint untuk bot menarik notifikasi yang pending
    """
    notifications = db.query(Notification).filter(
        Notification.status == NotificationStatus.PENDING
    ).order_by(
        Notification.created_at.asc()
    ).limit(50).all()  # Ambil max 50 notifikasi per request
    
    return PendingNotificationsResponse(
        success=True,
        notifications=notifications,
        count=len(notifications)
    )

@router.post("/{notification_id}/mark-sent")
async def mark_notification_sent(
    notification_id: int,
    request: MarkSentRequest,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_api_key)
):
    """
    Endpoint untuk bot memberitahu bahwa notifikasi sudah terkirim
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Update status
    notification.status = NotificationStatus.SENT
    notification.sent_at = request.sent_at
    
    db.commit()
    
    return {
        "success": True,
        "message": "Notification marked as sent",
        "notification_id": notification_id
    }

@router.post("/{notification_id}/mark-failed")
async def mark_notification_failed(
    notification_id: int,
    request: MarkFailedRequest,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_api_key)
):
    """
    Endpoint untuk bot memberitahu bahwa notifikasi gagal dikirim
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Increment retry count
    notification.retry_count += 1
    
    # Cek apakah sudah melebihi max retries
    if notification.retry_count >= notification.max_retries:
        notification.status = NotificationStatus.FAILED
        notification.failed_at = request.failed_at
        notification.error_message = request.error_message
    else:
        # Masih ada retry, kembalikan ke pending
        notification.status = NotificationStatus.PENDING
    
    db.commit()
    
    return {
        "success": True,
        "message": "Notification marked as failed",
        "notification_id": notification_id,
        "will_retry": notification.retry_count < notification.max_retries
    }
```

### Cara Membuat Notifikasi Baru

```python
@router.post("/create")
async def create_notification(
    whatsapp_number: str,
    message: str,
    priority: str = "normal",
    db: Session = Depends(get_db)
):
    """
    Endpoint untuk membuat notifikasi baru
    Dipanggil oleh web admin atau sistem internal
    """
    notification = Notification(
        whatsapp_number=whatsapp_number,
        message=message,
        priority=priority,
        status=NotificationStatus.PENDING
    )
    
    db.add(notification)
    db.commit()
    db.refresh(notification)
    
    return {
        "success": True,
        "message": "Notification created",
        "notification_id": notification.id
    }
```

---

## ⚙️ Konfigurasi Bot WhatsApp

Edit file [`cb/.env`](cb/.env):

```bash
# ============================================
# NOTIFICATION POLLING CONFIGURATION
# ============================================

# Backend FastAPI URL (base URL tanpa trailing slash)
BACKEND_API_URL=http://localhost:8000

# Secret Key untuk autentikasi ke Backend API (jika diperlukan)
BACKEND_API_SECRET=your_secret_key_here

# Polling Interval dalam milidetik (default: 30000 = 30 detik)
# Sesuaikan dengan kebutuhan, misal 60000 untuk 1 menit
NOTIFICATION_POLLING_INTERVAL=30000

# Max retries untuk notifikasi yang gagal (default: 3)
NOTIFICATION_MAX_RETRIES=3
```

**Notes:**
- `BACKEND_API_URL`: URL backend FastAPI tanpa trailing slash
- `BACKEND_API_SECRET`: Secret key untuk autentikasi (opsional)
- `NOTIFICATION_POLLING_INTERVAL`: Interval polling dalam milidetik (30000 = 30 detik)

---

## 📊 Flow Diagram

### Flow Lengkap: Membuat dan Mengirim Notifikasi

```
1. Web Admin/System membuat notifikasi
   POST /api/v1/notifications/create
   └─> DB: Insert notification (status: PENDING)

2. Bot melakukan polling (setiap 30 detik)
   GET /api/v1/notifications/pending
   └─> Backend: Return list of pending notifications

3. Bot menerima response
   ├─> Jika ada notifikasi:
   │   ├─> Bot format nomor WhatsApp
   │   ├─> Bot kirim pesan via Baileys
   │   └─> Bot POST /api/v1/notifications/{id}/mark-sent
   │       └─> Backend: Update status ke SENT
   │
   └─> Jika tidak ada: tunggu polling berikutnya

4. Jika gagal kirim:
   └─> Bot POST /api/v1/notifications/{id}/mark-failed
       └─> Backend: 
           ├─> retry_count < max_retries? 
           │   └─> Yes: Set status ke PENDING (akan dicoba lagi)
           └─> No: Set status ke FAILED
```

---

## 🧪 Testing & Troubleshooting

### Test Manual dengan cURL

**1. Membuat notifikasi test:**
```bash
curl -X POST "http://localhost:8000/api/v1/notifications/create" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_number": "628123456789",
    "message": "Test notifikasi dari cURL",
    "priority": "normal"
  }'
```

**2. Cek pending notifications:**
```bash
curl -X GET "http://localhost:8000/api/v1/notifications/pending" \
  -H "X-API-Key: your_secret_key_here"
```

**3. Mark as sent (simulasi bot):**
```bash
curl -X POST "http://localhost:8000/api/v1/notifications/1/mark-sent" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key_here" \
  -d '{
    "sent_at": "2026-07-16T10:10:30Z",
    "status": "sent"
  }'
```

### Monitoring Bot Polling

Bot akan menampilkan log setiap kali melakukan polling:

```
[Notification Poller] Found 2 pending notification(s)
[Notification Poller] Sent notification 1 to 628123456789@s.whatsapp.net
[Notification Poller] Sent notification 2 to 628567891234@s.whatsapp.net
```

### Common Issues

**1. Backend tidak bisa diakses:**
- Pastikan `BACKEND_API_URL` benar di [`cb/.env`](cb/.env)
- Pastikan backend FastAPI sudah running
- Cek firewall/network

**2. Notifikasi tidak terkirim:**
- Cek log bot untuk melihat error message
- Pastikan format nomor WhatsApp benar
- Cek apakah bot terhubung ke WhatsApp

**3. Polling terlalu sering:**
- Naikkan `NOTIFICATION_POLLING_INTERVAL` di [`cb/.env`](cb/.env)
- Misal 60000 untuk polling setiap 1 menit

---

## 📝 Kesimpulan

Dengan arsitektur polling ini:

✅ **Bot lebih sederhana** - Tidak perlu Express server  
✅ **Tidak perlu konfigurasi CORS** - Bot hanya melakukan request keluar  
✅ **Tidak perlu buka port** - Bot hanya client, bukan server  
✅ **Lebih stabil** - Backend buffer notifikasi jika bot offline  
✅ **Mudah di-maintenance** - Pemisahan concern yang jelas  

Backend FastAPI bertanggung jawab untuk:
- Menyimpan notifikasi yang perlu dikirim
- Menyediakan endpoint untuk bot menarik notifikasi
- Tracking status pengiriman

Bot WhatsApp bertanggung jawab untuk:
- Polling ke backend secara berkala
- Mengirim notifikasi via WhatsApp
- Memberitahu backend tentang status pengiriman

---

**Happy Coding! 🚀**

Jika ada pertanyaan, silakan hubungi Zoo - Samling AI Team.
