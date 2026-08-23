"""
Eayadati (عيادتي) - Dental Clinic Management Backend
Multi-tenant SaaS: doctors register as tenant owners and manage assistants.
"""
import os
import uuid
import logging
import secrets
import hashlib
import colorsys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Literal, Annotated

import jwt
import bcrypt
import boto3
import smtplib
from email.message import EmailMessage
from io import BytesIO
from PIL import Image, ImageOps
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'eayadati-dev-secret-change-in-prod-64chars-XXXXXXXXXXXXXXXXXXXXXXX')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_HOURS = 24 * 7  # 7 days

# Object Storage — S3-compatible via boto3, with local-filesystem fallback.
APP_NAME = "eayadati"
S3_ENDPOINT_URL = (os.environ.get("S3_ENDPOINT_URL") or "").strip() or None
S3_REGION = os.environ.get("S3_REGION", "us-east-1")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID") or os.environ.get("AWS_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY")
S3_BUCKET = os.environ.get("S3_BUCKET")
LOCAL_STORAGE_DIR = os.environ.get("LOCAL_STORAGE_DIR", str(ROOT_DIR / "uploads"))
_s3_client = None

# Email — standard SMTP (smtplib).
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM = os.environ.get("SMTP_FROM") or SMTP_USER
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "عيادتي")
FRONTEND_URL = (os.environ.get("FRONTEND_URL") or "").rstrip("/")
SUPERADMIN_EMAIL = (os.environ.get("SUPERADMIN_EMAIL") or "").lower()
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD") or ""

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Eayadati API")
api_router = APIRouter(prefix="/api")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

Role = Literal["doctor", "assistant", "super_admin"]

# ------------------------ Models ------------------------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    full_name: str
    clinic_name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AssistantIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    full_name: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    tenant_id: str
    role: Role
    clinic_name: Optional[str] = None
    show_financials_to_assistants: bool = False

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class SettingsUpdate(BaseModel):
    show_financials_to_assistants: Optional[bool] = None
    clinic_name: Optional[str] = None
    clinic_address: Optional[str] = None
    clinic_phone: Optional[str] = None
    clinic_location: Optional[dict] = None  # {lat, lng}
    working_hours: Optional[str] = None

class PatientIn(BaseModel):
    full_name: str
    phone: str = ""
    email: str = ""
    date_of_birth: str = ""  # ISO
    gender: str = ""
    address: str = ""
    medical_history: str = ""
    allergies: str = ""
    medications: str = ""
    notes: str = ""
    doctor_notes: str = ""

class PatientOut(PatientIn):
    id: str
    tenant_id: str
    created_at: str

class ToothStateIn(BaseModel):
    tooth: int  # FDI number 11-48
    condition: str  # healthy/caries/filling/crown/extracted/missing/rct/implant
    note: str = ""

class AppointmentIn(BaseModel):
    patient_id: str
    patient_name: str = ""
    date: str  # ISO datetime
    duration_minutes: int = 30
    reason: str = ""
    status: str = "scheduled"  # scheduled/confirmed/completed/cancelled/no_show

class InvoiceItem(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float = 0

class InvoiceIn(BaseModel):
    kind: str  # patient/purchase/expense/salary
    patient_id: str = ""
    party_name: str = ""  # patient/supplier/employee name
    items: List[InvoiceItem] = []
    total: float = 0
    paid: float = 0
    currency: str = "SYP"  # SYP or USD
    date: str = ""  # ISO
    note: str = ""

class InventoryItemIn(BaseModel):
    name: str
    unit: str = "قطعة"
    quantity: float = 0
    min_quantity: float = 5
    unit_price: float = 0
    category: str = "عام"

class LabOrderIn(BaseModel):
    patient_id: str = ""
    patient_name: str = ""
    lab_name: str = ""
    description: str = ""
    sent_at: str = ""
    expected_at: str = ""
    status: str = "sent"  # sent/received/delivered
    cost: float = 0
    paid: float = 0

# ------------------------ Auth helpers ------------------------

def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > 72:
        raise HTTPException(400, "كلمة المرور طويلة جداً")
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def make_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["_id"]),
        "tenant_id": user["tenant_id"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(hours=ACCESS_TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def public_user(user: dict, tenant: Optional[dict] = None) -> UserOut:
    return UserOut(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user.get("full_name", ""),
        tenant_id=user["tenant_id"],
        role=user["role"],
        clinic_name=(tenant or {}).get("clinic_name"),
        show_financials_to_assistants=(tenant or {}).get("show_financials_to_assistants", False),
    )

async def get_current_user(token: Optional[str] = Depends(oauth2)) -> dict:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="غير مصرح",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise unauthorized
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = ObjectId(payload["sub"])
    except Exception:
        raise unauthorized
    user = await db.users.find_one({"_id": user_id})
    if not user or user.get("disabled", False):
        raise unauthorized
    return user

async def get_tenant(tenant_id: str) -> dict:
    t = await db.tenants.find_one({"tenant_id": tenant_id})
    return t or {}

def require_role(*roles: Role):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "صلاحيات غير كافية")
        return user
    return dep

async def can_view_financials(user: dict) -> bool:
    if user["role"] == "doctor":
        return True
    tenant = await get_tenant(user["tenant_id"])
    return bool(tenant.get("show_financials_to_assistants", False))

# ------------------------ Object Storage ------------------------

def _use_s3() -> bool:
    return bool(S3_BUCKET)

def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT_URL,
            region_name=S3_REGION,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
        )
    return _s3_client

def _local_path(path: str) -> str:
    safe = path.replace("..", "_")
    full = os.path.join(LOCAL_STORAGE_DIR, safe)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    return full

def _put_object(path: str, data: bytes, content_type: str) -> dict:
    if _use_s3():
        _get_s3().put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    else:
        with open(_local_path(path), "wb") as f:
            f.write(data)
        with open(_local_path(path) + ".ct", "w") as f:
            f.write(content_type)
    return {"path": path, "size": len(data)}

def _compress_image(data: bytes, max_dim: int = 1600, quality: int = 60) -> Optional[bytes]:
    """Downscale (longest side <= max_dim) and JPEG-encode to reduce storage size
    while preserving diagnostic detail. Returns None if not a decodable image."""
    try:
        img = Image.open(BytesIO(data))
        img = ImageOps.exif_transpose(img)  # honor orientation
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        longest = max(w, h)
        if longest > max_dim:
            scale = max_dim / float(longest)
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        out = BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception:
        return None

def _get_object(path: str):
    if _use_s3():
        obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=path)
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")
    full = _local_path(path)
    if not os.path.exists(full):
        raise FileNotFoundError(path)
    with open(full, "rb") as f:
        data = f.read()
    ct = "application/octet-stream"
    if os.path.exists(full + ".ct"):
        with open(full + ".ct") as f:
            ct = f.read().strip() or ct
    return data, ct

# ------------------------ Startup ------------------------

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index([("tenant_id", 1), ("role", 1)])
    await db.tenants.create_index("tenant_id", unique=True)
    await db.patients.create_index([("tenant_id", 1), ("full_name", 1)])
    await db.appointments.create_index([("tenant_id", 1), ("date", 1)])
    await db.invoices.create_index([("tenant_id", 1), ("date", -1)])
    await db.inventory.create_index([("tenant_id", 1), ("name", 1)])
    await db.lab_orders.create_index([("tenant_id", 1)])
    await db.reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    # Seed demo account
    if not await db.users.find_one({"email": "doctor@demo.com"}):
        await _seed_demo()
    # Seed / sync super admin owner account
    if SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD:
        existing = await db.users.find_one({"email": SUPERADMIN_EMAIL})
        if not existing:
            await db.users.insert_one({
                "email": SUPERADMIN_EMAIL,
                "password_hash": hash_password(SUPERADMIN_PASSWORD),
                "full_name": "المدير العام",
                "tenant_id": "__super__",
                "role": "super_admin",
                "disabled": False,
                "created_at": datetime.now(timezone.utc),
            })
            print(f"[SEED] Super admin created: {SUPERADMIN_EMAIL}")
        elif existing.get("role") != "super_admin":
            await db.users.update_one({"_id": existing["_id"]}, {"$set": {"role": "super_admin", "tenant_id": "__super__"}})

async def _seed_demo():
    tenant_id = str(uuid.uuid4())
    doctor_pw = hash_password("demo1234")
    doc = {
        "email": "doctor@demo.com",
        "password_hash": doctor_pw,
        "full_name": "د. أحمد الطبيب",
        "tenant_id": tenant_id,
        "role": "doctor",
        "disabled": False,
        "created_at": datetime.now(timezone.utc),
    }
    r = await db.users.insert_one(doc)
    await db.users.insert_one({
        "email": "assistant@demo.com",
        "password_hash": hash_password("demo1234"),
        "full_name": "سارة المساعدة",
        "tenant_id": tenant_id,
        "role": "assistant",
        "disabled": False,
        "created_at": datetime.now(timezone.utc),
    })
    await db.tenants.insert_one({
        "tenant_id": tenant_id,
        "owner_user_id": r.inserted_id,
        "clinic_name": "عيادة الابتسامة",
        "clinic_address": "شارع الاستقلال - عمّان",
        "clinic_phone": "+962790000000",
        "clinic_location": {"lat": 31.9539, "lng": 35.9106},
        "show_financials_to_assistants": False,
        "created_at": datetime.now(timezone.utc),
    })
    # Seed patients
    patients = [
        {"full_name": "محمد علي", "phone": "+962791111111", "date_of_birth": "1985-03-12", "gender": "ذكر", "medical_history": "لا يوجد", "allergies": "بنسلين", "medications": ""},
        {"full_name": "فاطمة الزهراء", "phone": "+962792222222", "date_of_birth": "1992-07-24", "gender": "أنثى", "medical_history": "سكري", "allergies": "", "medications": "ميتفورمين"},
        {"full_name": "خالد الحسن", "phone": "+962793333333", "date_of_birth": "1978-11-05", "gender": "ذكر", "medical_history": "ضغط دم", "allergies": "", "medications": ""},
    ]
    p_ids = []
    for p in patients:
        pid = str(uuid.uuid4())
        p_ids.append(pid)
        await db.patients.insert_one({
            "id": pid, "tenant_id": tenant_id, "created_at": datetime.now(timezone.utc).isoformat(),
            "email": "", "address": "", "notes": "",
            **p,
        })
    # Appointments
    today = datetime.now()
    for i, pid in enumerate(p_ids):
        await db.appointments.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "patient_id": pid,
            "patient_name": patients[i]["full_name"],
            "date": (today + timedelta(days=i, hours=9+i)).isoformat(),
            "duration_minutes": 30,
            "reason": ["فحص دوري", "تنظيف جير", "حشوة"][i],
            "status": "scheduled",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    # Invoices
    invoice_seeds = [
        {"kind": "patient", "party_name": "محمد علي", "patient_id": p_ids[0], "items": [{"description": "فحص + أشعة", "quantity": 1, "unit_price": 50}], "total": 50, "paid": 50},
        {"kind": "patient", "party_name": "فاطمة الزهراء", "patient_id": p_ids[1], "items": [{"description": "حشوة ضوئية", "quantity": 2, "unit_price": 40}], "total": 80, "paid": 80},
        {"kind": "purchase", "party_name": "شركة الأدوات الطبية", "items": [{"description": "مواد حشو", "quantity": 10, "unit_price": 15}], "total": 150, "paid": 150},
        {"kind": "salary", "party_name": "سارة المساعدة", "items": [{"description": "راتب شهري", "quantity": 1, "unit_price": 500}], "total": 500, "paid": 500},
        {"kind": "expense", "party_name": "كهرباء", "items": [{"description": "فاتورة كهرباء", "quantity": 1, "unit_price": 80}], "total": 80, "paid": 80},
    ]
    for inv in invoice_seeds:
        await db.invoices.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "date": datetime.now(timezone.utc).isoformat(),
            "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
            **inv,
        })
    # Inventory
    inv_seeds = [
        {"name": "قفازات طبية", "unit": "علبة", "quantity": 20, "min_quantity": 5, "unit_price": 5, "category": "مستلزمات"},
        {"name": "مادة حشو ضوئي", "unit": "أنبوب", "quantity": 3, "min_quantity": 5, "unit_price": 25, "category": "مواد"},
        {"name": "إبر تخدير", "unit": "علبة", "quantity": 8, "min_quantity": 3, "unit_price": 12, "category": "مستلزمات"},
    ]
    for it in inv_seeds:
        await db.inventory.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            **it,
        })
    # Lab
    await db.lab_orders.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "patient_id": p_ids[2],
        "patient_name": "خالد الحسن",
        "lab_name": "مخبر الابتسامة",
        "description": "تاج زركون للسن 26",
        "sent_at": today.isoformat(),
        "expected_at": (today + timedelta(days=5)).isoformat(),
        "status": "sent",
        "cost": 80,
        "paid": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    print(f"[SEED] Demo tenant seeded: {tenant_id}")

# ------------------------ Auth endpoints ------------------------

@api_router.post("/auth/register", response_model=TokenOut)
async def register(data: RegisterIn):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "البريد الإلكتروني مسجل مسبقاً")
    tenant_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    user_doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "tenant_id": tenant_id,
        "role": "doctor",
        "disabled": False,
        "created_at": now,
        # New signups start on a free trial automatically, with no expiry until the
        # super admin manually converts them to a paid subscription.
        "sub_status": "trial",
        "sub_plan": "",
        "sub_start": now.isoformat(),
        "sub_end": None,
        "sub_history": [{
            "status": "trial", "plan": "", "start": now.isoformat(), "end": None,
            "at": now.isoformat(), "by": "تسجيل تلقائي", "auto": True,
        }],
    }
    r = await db.users.insert_one(user_doc)
    user_doc["_id"] = r.inserted_id
    tenant_doc = {
        "tenant_id": tenant_id,
        "owner_user_id": r.inserted_id,
        "clinic_name": data.clinic_name,
        "show_financials_to_assistants": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.tenants.insert_one(tenant_doc)
    return {"access_token": make_token(user_doc), "token_type": "bearer", "user": public_user(user_doc, tenant_doc)}

@api_router.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "بريد أو كلمة مرور غير صحيحة")
    if user.get("role") == "doctor":
        user = await _apply_subscription(user)
    if user.get("disabled"):
        raise HTTPException(403, "تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة.")
    tenant = await get_tenant(user["tenant_id"])
    return {"access_token": make_token(user), "token_type": "bearer", "user": public_user(user, tenant)}

@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    tenant = await get_tenant(user["tenant_id"])
    return public_user(user, tenant)

@api_router.post("/auth/assistants", response_model=UserOut)
async def create_assistant(data: AssistantIn, doctor: dict = Depends(require_role("doctor"))):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "البريد الإلكتروني مسجل مسبقاً")
    new_user = {
        "email": email, "password_hash": hash_password(data.password),
        "full_name": data.full_name, "tenant_id": doctor["tenant_id"], "role": "assistant",
        "disabled": False, "created_at": datetime.now(timezone.utc),
    }
    r = await db.users.insert_one(new_user)
    new_user["_id"] = r.inserted_id
    tenant = await get_tenant(doctor["tenant_id"])
    return public_user(new_user, tenant)

@api_router.get("/auth/assistants", response_model=List[UserOut])
async def list_assistants(doctor: dict = Depends(require_role("doctor"))):
    tenant = await get_tenant(doctor["tenant_id"])
    users = await db.users.find({"tenant_id": doctor["tenant_id"], "role": "assistant"}).to_list(200)
    return [public_user(u, tenant) for u in users]

@api_router.delete("/auth/assistants/{user_id}")
async def delete_assistant(user_id: str, doctor: dict = Depends(require_role("doctor"))):
    await db.users.delete_one({"_id": ObjectId(user_id), "tenant_id": doctor["tenant_id"], "role": "assistant"})
    return {"ok": True}

@api_router.patch("/settings")
async def update_settings(data: SettingsUpdate, doctor: dict = Depends(require_role("doctor"))):
    update = {k: v for k, v in data.dict().items() if v is not None}
    if update:
        await db.tenants.update_one({"tenant_id": doctor["tenant_id"]}, {"$set": update})
    tenant = await get_tenant(doctor["tenant_id"])
    tenant.pop("_id", None)
    tenant.pop("owner_user_id", None)
    return tenant

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    tenant = await get_tenant(user["tenant_id"])
    tenant.pop("_id", None)
    tenant.pop("owner_user_id", None)
    return tenant

# ------------------------ Patients ------------------------

def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc

@api_router.get("/patients")
async def list_patients(user: dict = Depends(get_current_user), q: str = ""):
    filt = {"tenant_id": user["tenant_id"]}
    if q:
        filt["full_name"] = {"$regex": q, "$options": "i"}
    items = await db.patients.find(filt).sort("created_at", -1).to_list(500)
    return [_clean(i) for i in items]

@api_router.post("/patients")
async def create_patient(data: PatientIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "tenant_id": user["tenant_id"],
           "portal_token": secrets.token_urlsafe(9),
           "created_at": datetime.now(timezone.utc).isoformat(), **data.dict()}
    await db.patients.insert_one(doc.copy())
    return _clean(doc)

@api_router.get("/patients/{pid}")
async def get_patient(pid: str, user: dict = Depends(get_current_user)):
    p = await db.patients.find_one({"id": pid, "tenant_id": user["tenant_id"]})
    if not p:
        raise HTTPException(404, "المريض غير موجود")
    return _clean(p)

@api_router.get("/patients/{pid}/portal")
async def get_patient_portal(pid: str, user: dict = Depends(get_current_user)):
    """Return (or lazily create) the public portal token + link for a patient."""
    p = await db.patients.find_one({"id": pid, "tenant_id": user["tenant_id"]})
    if not p:
        raise HTTPException(404, "المريض غير موجود")
    token = p.get("portal_token")
    if not token:
        token = secrets.token_urlsafe(9)
        await db.patients.update_one({"id": pid, "tenant_id": user["tenant_id"]}, {"$set": {"portal_token": token}})
    base = FRONTEND_URL or ""
    return {"token": token, "url": f"{base}/p/{token}"}

@api_router.patch("/patients/{pid}")
async def update_patient(pid: str, data: dict, user: dict = Depends(get_current_user)):
    allowed = {"full_name", "phone", "email", "date_of_birth", "gender", "address",
               "medical_history", "allergies", "medications", "notes", "doctor_notes"}
    update = {k: v for k, v in (data or {}).items() if k in allowed}
    if update:
        await db.patients.update_one({"id": pid, "tenant_id": user["tenant_id"]}, {"$set": update})
    p = await db.patients.find_one({"id": pid, "tenant_id": user["tenant_id"]})
    if not p:
        raise HTTPException(404)
    return _clean(p)

@api_router.delete("/patients/{pid}")
async def delete_patient(pid: str, user: dict = Depends(get_current_user)):
    scope = {"patient_id": pid, "tenant_id": user["tenant_id"]}
    await db.patients.delete_one({"id": pid, "tenant_id": user["tenant_id"]})
    await db.tooth_charts.delete_many(scope)
    await db.xrays.delete_many(scope)
    await db.invoices.delete_many(scope)
    await db.treatments.delete_many(scope)
    await db.appointments.delete_many(scope)
    return {"ok": True}

# ------------------------ Dental Chart ------------------------

@api_router.get("/patients/{pid}/chart")
async def get_chart(pid: str, user: dict = Depends(get_current_user)):
    docs = await db.tooth_charts.find({"patient_id": pid, "tenant_id": user["tenant_id"]}).to_list(200)
    return [_clean(d) for d in docs]

@api_router.post("/patients/{pid}/chart")
async def set_tooth(pid: str, data: ToothStateIn, user: dict = Depends(get_current_user)):
    await db.tooth_charts.update_one(
        {"patient_id": pid, "tenant_id": user["tenant_id"], "tooth": data.tooth},
        {"$set": {"condition": data.condition, "note": data.note,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    doc = await db.tooth_charts.find_one({"patient_id": pid, "tenant_id": user["tenant_id"], "tooth": data.tooth})
    return _clean(doc)

# ------------------------ Treatment Types (custom, per-tenant) ------------------------

# Built-in tooth-condition colors (mirror of frontend theme.ts). Custom colors must
# stay clearly distinct from these AND from each other.
BUILTIN_TOOTH_COLORS = [
    "#FFFFFF", "#A84A42", "#4A7065", "#B58548",
    "#6B7876", "#B0C4BC", "#8B5CF6", "#334F46",
]

def _hex_to_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return "#{:02X}{:02X}{:02X}".format(int(r), int(g), int(b))

def _color_distance(c1, c2) -> float:
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5

def generate_distinct_color(used_hex: list) -> str:
    """Pick a vivid color whose distance to every used color is maximal.

    Sweeps the full hue circle at fixed saturation/lightness and returns the
    candidate that is furthest (in RGB space) from all previously used colors,
    guaranteeing no repeat or near-duplicate with existing treatment colors.
    """
    used_rgb = []
    for hx in used_hex:
        try:
            used_rgb.append(_hex_to_rgb(hx))
        except Exception:
            continue
    best_hex, best_score = None, -1.0
    for deg in range(0, 360, 3):
        r, g, b = colorsys.hls_to_rgb(deg / 360.0, 0.47, 0.62)
        cand_rgb = (round(r * 255), round(g * 255), round(b * 255))
        score = min((_color_distance(cand_rgb, u) for u in used_rgb), default=1e9)
        if score > best_score:
            best_score, best_hex = score, _rgb_to_hex(*cand_rgb)
    return best_hex or "#4A7065"

class TreatmentTypeIn(BaseModel):
    label: str

@api_router.get("/treatment-types")
async def list_treatment_types(user: dict = Depends(get_current_user)):
    tenant = await get_tenant(user["tenant_id"])
    return (tenant or {}).get("treatment_types", [])

@api_router.post("/treatment-types")
async def create_treatment_type(data: TreatmentTypeIn, doctor: dict = Depends(require_role("doctor"))):
    label = data.label.strip()
    if not label:
        raise HTTPException(400, "يرجى إدخال اسم نوع المعالجة")
    tenant = await get_tenant(doctor["tenant_id"])
    existing = (tenant or {}).get("treatment_types", [])
    if any((t.get("label", "").strip() == label) for t in existing):
        raise HTTPException(409, "نوع المعالجة موجود مسبقاً")
    used = BUILTIN_TOOTH_COLORS + [t.get("color") for t in existing if t.get("color")]
    new_type = {
        "key": f"ct_{uuid.uuid4().hex[:8]}",
        "label": label,
        "color": generate_distinct_color(used),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tenants.update_one(
        {"tenant_id": doctor["tenant_id"]},
        {"$push": {"treatment_types": new_type}},
    )
    return new_type

# ------------------------ Treatment sessions (clinical follow-ups) ------------------------

class TreatmentCreateIn(BaseModel):
    teeth: list[int]
    condition: str
    name: str = ""

class SessionIn(BaseModel):
    name: str
    note: str = ""

@api_router.get("/patients/{pid}/treatments")
async def list_treatments(pid: str, user: dict = Depends(get_current_user)):
    docs = await db.treatments.find({"patient_id": pid, "tenant_id": user["tenant_id"]}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]

@api_router.post("/patients/{pid}/treatments")
async def create_treatment(pid: str, data: TreatmentCreateIn, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_session = {"id": str(uuid.uuid4()), "date": now.isoformat(), "name": data.name or "الجلسة الأولى", "note": ""}
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": user["tenant_id"],
        "patient_id": pid,
        "teeth": data.teeth,
        "condition": data.condition,
        "name": data.name,
        "created_at": now.isoformat(),
        "sessions": [first_session],
    }
    await db.treatments.insert_one(doc)
    return _clean(doc)

@api_router.post("/patients/{pid}/treatments/{tid}/sessions")
async def add_treatment_session(pid: str, tid: str, data: SessionIn, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    session = {"id": str(uuid.uuid4()), "date": now.isoformat(), "name": data.name, "note": data.note}
    r = await db.treatments.update_one(
        {"id": tid, "patient_id": pid, "tenant_id": user["tenant_id"]},
        {"$push": {"sessions": session}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "المعالجة غير موجودة")
    doc = await db.treatments.find_one({"id": tid, "tenant_id": user["tenant_id"]})
    return _clean(doc)

@api_router.delete("/patients/{pid}/treatments/{tid}")
async def delete_treatment(pid: str, tid: str, user: dict = Depends(get_current_user)):
    r = await db.treatments.delete_one({"id": tid, "patient_id": pid, "tenant_id": user["tenant_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "المعالجة غير موجودة")
    return {"ok": True}

@api_router.delete("/patients/{pid}/treatments/{tid}/sessions/{sid}")
async def delete_treatment_session(pid: str, tid: str, sid: str, user: dict = Depends(get_current_user)):
    r = await db.treatments.update_one(
        {"id": tid, "patient_id": pid, "tenant_id": user["tenant_id"]},
        {"$pull": {"sessions": {"id": sid}}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "المعالجة غير موجودة")
    doc = await db.treatments.find_one({"id": tid, "tenant_id": user["tenant_id"]})
    return _clean(doc)

# ------------------------ X-Rays ------------------------

@api_router.post("/patients/{pid}/xrays")
async def upload_xray(pid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    p = await db.patients.find_one({"id": pid, "tenant_id": user["tenant_id"]})
    if not p:
        raise HTTPException(404, "المريض غير موجود")
    contents = await file.read()
    if not contents:
        raise HTTPException(400, "الملف فارغ")
    ct = file.content_type or "image/jpeg"
    original_size = len(contents)
    # Server-side compression safety-net: downscale + JPEG-encode to save storage.
    if ct.startswith("image/"):
        try:
            compressed = _compress_image(contents)
            if compressed and len(compressed) < original_size:
                contents = compressed
                ct = "image/jpeg"
        except Exception as e:
            logger.warning(f"image compress skipped: {e}")
    ext = "jpg" if ct == "image/jpeg" else ((file.filename or "img.jpg").rsplit(".", 1)[-1].lower() or "jpg")
    obj_path = f"{APP_NAME}/uploads/{user['tenant_id']}/{uuid.uuid4()}.{ext}"
    try:
        await run_in_threadpool(_put_object, obj_path, contents, ct)
    except Exception as e:
        raise HTTPException(500, f"فشل رفع الملف: {e}")
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": user["tenant_id"],
        "patient_id": pid,
        "storage_path": obj_path,
        "filename": file.filename or "xray.jpg",
        "content_type": ct,
        "size": len(contents),
        "original_size": original_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.xrays.insert_one(doc.copy())
    return _clean(doc)

@api_router.get("/patients/{pid}/xrays")
async def list_xrays(pid: str, user: dict = Depends(get_current_user)):
    docs = await db.xrays.find({"patient_id": pid, "tenant_id": user["tenant_id"]}).sort("uploaded_at", -1).to_list(200)
    return [_clean(d) for d in docs]

@api_router.get("/xrays/{xray_id}/file")
async def get_xray(xray_id: str, token: Optional[str] = None):
    # Allow token via query for web <img> tags
    user = None
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        except Exception:
            pass
    if not user:
        raise HTTPException(401, "غير مصرح")
    doc = await db.xrays.find_one({"id": xray_id, "tenant_id": user["tenant_id"]})
    if not doc:
        raise HTTPException(404, "الملف غير موجود")
    try:
        content, ct = await run_in_threadpool(_get_object, doc["storage_path"])
    except Exception as e:
        raise HTTPException(500, f"فشل جلب الملف: {e}")
    return Response(content=content, media_type=ct)

@api_router.delete("/xrays/{xray_id}")
async def delete_xray(xray_id: str, user: dict = Depends(get_current_user)):
    await db.xrays.delete_one({"id": xray_id, "tenant_id": user["tenant_id"]})
    return {"ok": True}

# ------------------------ Appointments ------------------------

@api_router.get("/appointments")
async def list_appointments(user: dict = Depends(get_current_user), date_from: str = "", date_to: str = ""):
    filt = {"tenant_id": user["tenant_id"]}
    if date_from or date_to:
        filt["date"] = {}
        if date_from:
            filt["date"]["$gte"] = date_from
        if date_to:
            filt["date"]["$lte"] = date_to
    items = await db.appointments.find(filt).sort("date", 1).to_list(500)
    return [_clean(i) for i in items]

@api_router.post("/appointments")
async def create_appointment(data: AppointmentIn, user: dict = Depends(get_current_user)):
    if not data.patient_name and data.patient_id:
        p = await db.patients.find_one({"id": data.patient_id, "tenant_id": user["tenant_id"]})
        if p:
            data.patient_name = p["full_name"]
    doc = {"id": str(uuid.uuid4()), "tenant_id": user["tenant_id"],
           "created_at": datetime.now(timezone.utc).isoformat(), **data.dict()}
    await db.appointments.insert_one(doc.copy())
    return _clean(doc)

@api_router.patch("/appointments/{aid}")
async def update_appointment(aid: str, data: AppointmentIn, user: dict = Depends(get_current_user)):
    await db.appointments.update_one({"id": aid, "tenant_id": user["tenant_id"]}, {"$set": data.dict()})
    a = await db.appointments.find_one({"id": aid, "tenant_id": user["tenant_id"]})
    if not a:
        raise HTTPException(404)
    return _clean(a)

@api_router.delete("/appointments/{aid}")
async def delete_appointment(aid: str, user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": aid, "tenant_id": user["tenant_id"]})
    return {"ok": True}

# ------------------------ Invoices ------------------------

@api_router.get("/invoices")
async def list_invoices(user: dict = Depends(get_current_user), kind: str = ""):
    if not await can_view_financials(user):
        raise HTTPException(403, "لا تملك صلاحية عرض الفواتير المالية")
    filt = {"tenant_id": user["tenant_id"]}
    if kind:
        filt["kind"] = kind
    items = await db.invoices.find(filt).sort("date", -1).to_list(500)
    return [_clean(i) for i in items]

@api_router.post("/invoices")
async def create_invoice(data: InvoiceIn, user: dict = Depends(get_current_user)):
    if not await can_view_financials(user):
        raise HTTPException(403, "لا تملك صلاحية إنشاء فواتير")
    if data.total == 0 and data.items:
        data.total = sum(i.quantity * i.unit_price for i in data.items)
    doc = {"id": str(uuid.uuid4()), "tenant_id": user["tenant_id"],
           "created_at": datetime.now(timezone.utc).isoformat(),
           "date": data.date or datetime.now(timezone.utc).isoformat(),
           **data.dict()}
    doc["date"] = data.date or datetime.now(timezone.utc).isoformat()
    await db.invoices.insert_one(doc.copy())
    return _clean(doc)

@api_router.get("/invoices/{iid}")
async def get_invoice(iid: str, user: dict = Depends(get_current_user)):
    if not await can_view_financials(user):
        raise HTTPException(403)
    inv = await db.invoices.find_one({"id": iid, "tenant_id": user["tenant_id"]})
    if not inv:
        raise HTTPException(404)
    return _clean(inv)

@api_router.patch("/invoices/{iid}")
async def update_invoice(iid: str, data: InvoiceIn, user: dict = Depends(get_current_user)):
    if not await can_view_financials(user):
        raise HTTPException(403, "لا تملك صلاحية تعديل الفواتير")
    if data.total == 0 and data.items:
        data.total = sum(i.quantity * i.unit_price for i in data.items)
    await db.invoices.update_one({"id": iid, "tenant_id": user["tenant_id"]}, {"$set": data.dict()})
    inv = await db.invoices.find_one({"id": iid, "tenant_id": user["tenant_id"]})
    if not inv:
        raise HTTPException(404)
    return _clean(inv)

@api_router.delete("/invoices/{iid}")
async def delete_invoice(iid: str, doctor: dict = Depends(require_role("doctor"))):
    await db.invoices.delete_one({"id": iid, "tenant_id": doctor["tenant_id"]})
    return {"ok": True}

# ------------------------ Public PDF hosting ------------------------

@api_router.post("/uploads/pdf")
async def upload_pdf(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Doctor uploads a generated invoice PDF; returns a PUBLIC download link."""
    contents = await file.read()
    file_id = str(uuid.uuid4())
    obj_path = f"{APP_NAME}/public/{user['tenant_id']}/{file_id}.pdf"
    try:
        await run_in_threadpool(_put_object, obj_path, contents, "application/pdf")
    except Exception as e:
        raise HTTPException(500, f"فشل رفع الملف: {e}")
    await db.public_files.insert_one({
        "id": file_id, "tenant_id": user["tenant_id"], "storage_path": obj_path,
        "content_type": "application/pdf", "filename": file.filename or "invoice.pdf",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    base = (os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")
    public_url = f"{base}/api/public/file/{file_id}" if base else f"/api/public/file/{file_id}"
    return {"file_id": file_id, "public_url": public_url, "path": f"/api/public/file/{file_id}"}

@api_router.get("/public/file/{file_id}")
async def get_public_file(file_id: str):
    doc = await db.public_files.find_one({"id": file_id})
    if not doc:
        raise HTTPException(404, "الملف غير موجود")
    try:
        content, ct = await run_in_threadpool(_get_object, doc["storage_path"])
    except Exception as e:
        raise HTTPException(500, f"فشل جلب الملف: {e}")
    return Response(content=content, media_type=ct,
                    headers={"Content-Disposition": f'inline; filename="{doc.get("filename", "invoice.pdf")}"'})

# ------------------------ Public booking portal ------------------------

WORK_START_HOUR = 8
WORK_END_HOUR = 23  # clinic closes 11 PM; last 30-min slot starts 22:30, ends 23:00
LAST_SLOT = "22:30"
SLOT_MINUTES = 30

@api_router.get("/public/patient/{token}")
async def public_patient_portal(token: str):
    """Auto-updating read-only patient portal: medical report, dental chart, invoices/payments."""
    p = await db.patients.find_one({"portal_token": token})
    if not p:
        raise HTTPException(404, "الرابط غير صالح")
    tenant = await db.tenants.find_one({"tenant_id": p["tenant_id"]}) or {}
    charts = await db.tooth_charts.find({"patient_id": p["id"], "tenant_id": p["tenant_id"]}).to_list(200)
    invoices = await db.invoices.find({"patient_id": p["id"], "tenant_id": p["tenant_id"], "kind": "patient"}).sort("date", -1).to_list(500)
    total_billed = sum(i.get("total", 0) for i in invoices)
    total_paid = sum(i.get("paid", 0) for i in invoices)
    return {
        "clinic": {
            "name": tenant.get("clinic_name", "العيادة"),
            "phone": tenant.get("clinic_phone", ""),
            "address": tenant.get("clinic_address", ""),
        },
        "patient": {
            "full_name": p.get("full_name", ""),
            "medical_history": p.get("medical_history", ""),
            "allergies": p.get("allergies", ""),
            "medications": p.get("medications", ""),
            "doctor_notes": p.get("doctor_notes", ""),
        },
        "chart": [{"tooth": c["tooth"], "condition": c["condition"], "note": c.get("note", "")} for c in charts],
        "treatment_types": tenant.get("treatment_types", []),
        "invoices": [{
            "id": i["id"], "date": i.get("date", ""), "items": i.get("items", []),
            "total": i.get("total", 0), "paid": i.get("paid", 0),
            "currency": i.get("currency", "SYP"),
        } for i in invoices],
        "financials": {
            "total_billed": total_billed,
            "total_paid": total_paid,
            "remaining": total_billed - total_paid,
        },
    }

@api_router.get("/public/clinic/{tenant_id}")
async def public_clinic(tenant_id: str):
    t = await db.tenants.find_one({"tenant_id": tenant_id})
    if not t:
        raise HTTPException(404, "العيادة غير موجودة")
    return {
        "tenant_id": tenant_id,
        "clinic_name": t.get("clinic_name", "العيادة"),
        "clinic_address": t.get("clinic_address", ""),
        "clinic_phone": t.get("clinic_phone", ""),
        "clinic_location": t.get("clinic_location"),
        "working_hours": t.get("working_hours", ""),
    }

def _valid_slots() -> set:
    s = set()
    for h in range(WORK_START_HOUR, WORK_END_HOUR + 1):
        for m in (0, SLOT_MINUTES):
            hhmm = f"{h:02d}:{m:02d}"
            if hhmm > LAST_SLOT:
                continue
            s.add(hhmm)
    return s

@api_router.get("/public/clinic/{tenant_id}/slots")
async def public_slots(tenant_id: str, date: str):
    """date = YYYY-MM-DD. Returns available HH:MM slots (08:00-22:30, 30-min) minus booked."""
    t = await db.tenants.find_one({"tenant_id": tenant_id})
    if not t:
        raise HTTPException(404, "العيادة غير موجودة")
    booked = await db.appointments.find({
        "tenant_id": tenant_id,
        "date": {"$gte": f"{date}T00:00", "$lte": f"{date}T23:59"},
        "status": {"$ne": "cancelled"},
    }).to_list(200)
    taken = {a["date"][11:16] for a in booked}
    slots = [{"time": hhmm, "available": hhmm not in taken} for hhmm in sorted(_valid_slots())]
    return {"date": date, "slots": slots}

class PublicBookingIn(BaseModel):
    full_name: str
    phone: str
    date: str      # YYYY-MM-DD
    time: str      # HH:MM
    reason: str = ""

@api_router.post("/public/clinic/{tenant_id}/book")
async def public_book(tenant_id: str, data: PublicBookingIn):
    t = await db.tenants.find_one({"tenant_id": tenant_id})
    if not t:
        raise HTTPException(404, "العيادة غير موجودة")
    if data.time not in _valid_slots():
        raise HTTPException(400, "الوقت المختار غير متاح ضمن ساعات العمل")
    iso = f"{data.date}T{data.time}:00"
    # prevent double booking
    clash = await db.appointments.find_one({
        "tenant_id": tenant_id, "date": {"$regex": f"^{data.date}T{data.time}"},
        "status": {"$ne": "cancelled"},
    })
    if clash:
        raise HTTPException(409, "هذا الموعد محجوز، اختر وقتاً آخر")
    # find or create patient by phone
    patient = None
    if data.phone:
        patient = await db.patients.find_one({"tenant_id": tenant_id, "phone": data.phone})
    if not patient:
        pid = str(uuid.uuid4())
        patient = {
            "id": pid, "tenant_id": tenant_id, "full_name": data.full_name, "phone": data.phone,
            "email": "", "date_of_birth": "", "gender": "", "address": "",
            "medical_history": "", "allergies": "", "medications": "", "notes": "طلب حجز عبر الموقع",
            "doctor_notes": "", "portal_token": secrets.token_urlsafe(9),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.patients.insert_one(patient.copy())
    appt = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "patient_id": patient["id"], "patient_name": data.full_name,
        "date": iso, "duration_minutes": SLOT_MINUTES, "reason": data.reason or "حجز عبر الموقع",
        "status": "pending", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointments.insert_one(appt.copy())
    return {"ok": True, "message": "تم استلام طلب الحجز بنجاح"}

# ------------------------ Inventory ------------------------

@api_router.get("/inventory")
async def list_inventory(user: dict = Depends(get_current_user)):
    items = await db.inventory.find({"tenant_id": user["tenant_id"]}).sort("name", 1).to_list(500)
    return [_clean(i) for i in items]

@api_router.post("/inventory")
async def create_inventory(data: InventoryItemIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "tenant_id": user["tenant_id"],
           "created_at": datetime.now(timezone.utc).isoformat(), **data.dict()}
    await db.inventory.insert_one(doc.copy())
    return _clean(doc)

@api_router.patch("/inventory/{iid}")
async def update_inventory(iid: str, data: InventoryItemIn, user: dict = Depends(get_current_user)):
    await db.inventory.update_one({"id": iid, "tenant_id": user["tenant_id"]}, {"$set": data.dict()})
    i = await db.inventory.find_one({"id": iid, "tenant_id": user["tenant_id"]})
    return _clean(i) if i else {}

@api_router.delete("/inventory/{iid}")
async def delete_inventory(iid: str, user: dict = Depends(get_current_user)):
    await db.inventory.delete_one({"id": iid, "tenant_id": user["tenant_id"]})
    return {"ok": True}

# ------------------------ Lab Orders ------------------------

@api_router.get("/lab-orders")
async def list_lab(user: dict = Depends(get_current_user)):
    items = await db.lab_orders.find({"tenant_id": user["tenant_id"]}).sort("sent_at", -1).to_list(500)
    return [_clean(i) for i in items]

@api_router.post("/lab-orders")
async def create_lab(data: LabOrderIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "tenant_id": user["tenant_id"],
           "created_at": datetime.now(timezone.utc).isoformat(), **data.dict()}
    await db.lab_orders.insert_one(doc.copy())
    return _clean(doc)

@api_router.patch("/lab-orders/{lid}")
async def update_lab(lid: str, data: LabOrderIn, user: dict = Depends(get_current_user)):
    await db.lab_orders.update_one({"id": lid, "tenant_id": user["tenant_id"]}, {"$set": data.dict()})
    d = await db.lab_orders.find_one({"id": lid, "tenant_id": user["tenant_id"]})
    return _clean(d) if d else {}

@api_router.delete("/lab-orders/{lid}")
async def delete_lab(lid: str, user: dict = Depends(get_current_user)):
    await db.lab_orders.delete_one({"id": lid, "tenant_id": user["tenant_id"]})
    return {"ok": True}

# ------------------------ Reports / Dashboard ------------------------

@api_router.get("/reports/summary")
async def summary(currency: Optional[str] = None, user: dict = Depends(get_current_user)):
    tenant_id = user["tenant_id"]
    financials_visible = await can_view_financials(user)

    total_patients = await db.patients.count_documents({"tenant_id": tenant_id})
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = datetime.now().replace(hour=23, minute=59, second=59).isoformat()
    today_appointments = await db.appointments.count_documents({
        "tenant_id": tenant_id, "date": {"$gte": today_start, "$lte": today_end}
    })
    today_date = datetime.now().strftime("%Y-%m-%d")
    new_bookings = await db.appointments.count_documents({
        "tenant_id": tenant_id, "status": "pending"
    })

    result = {
        "total_patients": total_patients,
        "today_appointments": today_appointments,
        "new_bookings": new_bookings,
        "financials_visible": financials_visible,
    }

    if user.get("role") == "doctor":
        d_left = _sub_days_left(user) if user.get("sub_status") == "subscribed" else None
        result["subscription"] = {
            "status": user.get("sub_status", "trial"),
            "plan": user.get("sub_plan", ""),
            "end": user.get("sub_end"),
            "days_left": d_left,
            "expiring_soon": (d_left is not None and 0 <= d_left <= SUB_ALERT_DAYS),
        }

    if financials_visible:
        invoices = await db.invoices.find({"tenant_id": tenant_id}).to_list(5000)

        # Distinct currencies actually present in this account's records (SYP, USD first).
        currencies = sorted({(i.get("currency") or "SYP") for i in invoices},
                            key=lambda c: (c != "SYP", c != "USD", c))
        if not currencies:
            currencies = ["SYP"]
        # Selected currency: requested one if valid, else the first available.
        cur = currency if (currency in currencies) else currencies[0]
        result["currencies"] = currencies
        result["currency"] = cur

        # Only aggregate records that belong to the selected currency — never mix currencies.
        cinv = [i for i in invoices if (i.get("currency") or "SYP") == cur]
        revenue = sum(i.get("paid", 0) for i in cinv if i.get("kind") == "patient")
        purchases = sum(i.get("total", 0) for i in cinv if i.get("kind") == "purchase")
        salaries = sum(i.get("total", 0) for i in cinv if i.get("kind") == "salary")
        expenses = sum(i.get("total", 0) for i in cinv if i.get("kind") == "expense")
        today_income = sum(
            i.get("paid", 0) for i in cinv
            if i.get("kind") == "patient" and str(i.get("date", "")).startswith(today_date)
        )
        result["today_income"] = today_income
        result.update({
            "revenue": revenue,
            "purchases": purchases,
            "salaries": salaries,
            "expenses": expenses,
            "net_profit": revenue - purchases - salaries - expenses,
        })

        # Monthly breakdown (last 6 months) — selected currency only
        now = datetime.now(timezone.utc)
        months = []
        for i in range(5, -1, -1):
            month_dt = (now.replace(day=1) - timedelta(days=30 * i))
            months.append({"label": month_dt.strftime("%Y-%m"), "revenue": 0, "expenses": 0})
        for inv in cinv:
            try:
                d = inv.get("date", "")
                label = d[:7]
                m = next((mm for mm in months if mm["label"] == label), None)
                if m:
                    if inv.get("kind") == "patient":
                        m["revenue"] += inv.get("paid", 0)
                    else:
                        m["expenses"] += inv.get("total", 0)
            except Exception:
                pass
        result["monthly"] = months

    low_stock = await db.inventory.count_documents({
        "tenant_id": tenant_id,
        "$expr": {"$lte": ["$quantity", "$min_quantity"]}
    })
    result["low_stock_count"] = low_stock
    return result

@api_router.get("/reports/profit")
async def profit_report(period: str = "monthly", year: int = 0, user: dict = Depends(get_current_user)):
    """Profit report for a period: daily / weekly / monthly / yearly.
    Groups revenue, expenses and net profit per currency to avoid mixing currencies.
    For 'yearly', an explicit `year` (>= 2026) selects the calendar year.
    """
    if not await can_view_financials(user):
        return {"financials_visible": False}

    now = datetime.now()
    cur_year = now.year
    if period == "daily":
        prefix = now.strftime("%Y-%m-%d")
        label = "اليوم"
        in_range = lambda d: d[:10] == prefix
    elif period == "weekly":
        start = (now - timedelta(days=6)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        label = "آخر 7 أيام"
        in_range = lambda d: start <= d[:10] <= end
    elif period == "yearly":
        y = year if year and year >= 2026 else cur_year
        prefix = str(y)
        label = f"سنة {y}"
        in_range = lambda d: d[:4] == prefix
    else:  # monthly (default)
        prefix = now.strftime("%Y-%m")
        label = "هذا الشهر"
        in_range = lambda d: d[:7] == prefix

    invoices = await db.invoices.find({"tenant_id": user["tenant_id"]}).to_list(5000)
    groups: dict = {}
    for inv in invoices:
        d = str(inv.get("date", ""))
        if not d or not in_range(d):
            continue
        cur = inv.get("currency", "SYP") or "SYP"
        g = groups.setdefault(cur, {"currency": cur, "revenue": 0, "expenses": 0})
        if inv.get("kind") == "patient":
            g["revenue"] += inv.get("total", 0)
        else:
            g["expenses"] += inv.get("total", 0)
    by_currency = []
    for g in groups.values():
        g["net"] = g["revenue"] - g["expenses"]
        by_currency.append(g)
    by_currency.sort(key=lambda g: g["currency"] != "SYP")  # SYP first
    return {
        "financials_visible": True,
        "period": period,
        "year": year if period == "yearly" else None,
        "label": label,
        "by_currency": by_currency,
    }


# ------------------------ Email (standard SMTP) ------------------------

def _send_email_sync(to: str, subject: str, html: str) -> None:
    if not (SMTP_HOST and SMTP_FROM):
        raise RuntimeError("SMTP not configured")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{EMAIL_FROM_NAME} <{SMTP_FROM}>"
    msg["To"] = to
    msg.set_content("يتطلب عارض بريد يدعم HTML.")
    msg.add_alternative(html, subtype="html")
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as s:
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD or "")
            s.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
            if SMTP_USE_TLS:
                s.starttls()
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD or "")
            s.send_message(msg)

async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    if not (SMTP_HOST and SMTP_FROM):
        logger.warning("SMTP not configured; skipping email send")
        return None
    try:
        await run_in_threadpool(_send_email_sync, to, subject, html)
        return "sent"
    except Exception as e:
        logger.error(f"email send error: {e}")
        raise HTTPException(502, "تعذّر إرسال البريد")

def _reset_email_html(name: str, link: str) -> str:
    safe_name = (name or "").replace("<", "").replace(">", "")
    return (
        f'<div dir="rtl" style="font-family:Arial,sans-serif;background:#F4F6F5;padding:24px">'
        f'<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">'
        f'<tr><td style="background:#4A7065;padding:20px 24px"><span style="color:#fff;font-size:22px;font-weight:bold">عيادتي</span></td></tr>'
        f'<tr><td style="padding:24px">'
        f'<p style="color:#1A211E;font-size:16px">مرحباً {safe_name},</p>'
        f'<p style="color:#384541;line-height:1.7">وصلنا طلب لإعادة تعيين كلمة مرور حسابك في نظام عيادتي. اضغط الزر أدناه لتعيين كلمة مرور جديدة. الرابط صالح لمدة ساعة واحدة.</p>'
        f'<p style="text-align:center;margin:28px 0"><a href="{link}" style="background:#4A7065;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block">إعادة تعيين كلمة المرور</a></p>'
        f'<p style="color:#6B7876;font-size:13px">إذا لم تطلب ذلك، تجاهل هذه الرسالة بأمان.</p>'
        f'<p style="color:#6B7876;font-size:12px;border-top:1px solid #E1E8E6;padding-top:12px;margin-top:20px">أُرسلت من نظام عيادتي. لا نطلب منك كلمة المرور أو أي بيانات بنكية عبر البريد.</p>'
        f'</td></tr></table></div>'
    )

# ------------------------ Password reset ------------------------

class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=72)

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotIn):
    user = await db.users.find_one({"email": data.email.lower()})
    # Always return ok to avoid email enumeration
    if user:
        raw = secrets.token_urlsafe(32)
        await db.reset_tokens.insert_one({
            "user_id": user["_id"],
            "token_hash": _hash_token(raw),
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "used": False,
        })
        link = f"{FRONTEND_URL}/reset-password?token={raw}"
        try:
            await send_email(
                to=user["email"],
                subject="إعادة تعيين كلمة المرور — عيادتي",
                html=_reset_email_html(user.get("full_name", ""), link),
            )
        except Exception as e:
            logger.error(f"reset email failed: {e}")
    return {"ok": True, "message": "إذا كان البريد مسجلاً، ستصلك رسالة بها رابط إعادة التعيين."}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetIn):
    rec = await db.reset_tokens.find_one({"token_hash": _hash_token(data.token), "used": False})
    if not rec:
        raise HTTPException(400, "الرابط غير صالح أو مستخدم مسبقاً")
    exp = rec["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "انتهت صلاحية الرابط، اطلب رابطاً جديداً")
    await db.users.update_one({"_id": rec["user_id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    await db.reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"ok": True, "message": "تم تعيين كلمة المرور الجديدة بنجاح"}

# ------------------------ Super Admin ------------------------

class AdminResetIn(BaseModel):
    new_password: str = Field(min_length=6, max_length=72)

class SubscriptionIn(BaseModel):
    status: Literal["trial", "subscribed", "disabled"]
    plan: Optional[Literal["monthly", "quarterly", "semiannual", "annual"]] = None

PLAN_DAYS = {"monthly": 30, "quarterly": 91, "semiannual": 182, "annual": 365}
SUB_ALERT_DAYS = 14  # notify doctor + admin two weeks before expiry

def _sub_days_left(u: dict):
    end = u.get("sub_end")
    if not end:
        return None
    try:
        end_dt = datetime.fromisoformat(end)
    except Exception:
        return None
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=timezone.utc)
    return (end_dt - datetime.now(timezone.utc)).days

async def _apply_subscription(u: dict) -> dict:
    """Lazily auto-disable a paid subscription that has passed its end date.
    Runs on login and whenever the admin lists doctors, so no scheduler is needed."""
    if u.get("sub_status") == "subscribed" and u.get("sub_end"):
        try:
            end_dt = datetime.fromisoformat(u["sub_end"])
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
        except Exception:
            return u
        if end_dt < datetime.now(timezone.utc):
            now_iso = datetime.now(timezone.utc).isoformat()
            entry = {"status": "disabled", "plan": u.get("sub_plan", ""), "start": u.get("sub_start"),
                     "end": u.get("sub_end"), "at": now_iso, "by": "النظام", "auto": True,
                     "note": "تعطيل تلقائي عند انتهاء الاشتراك"}
            await db.users.update_one({"_id": u["_id"]}, {
                "$set": {"sub_status": "disabled", "disabled": True, "auto_disabled_at": now_iso},
                "$push": {"sub_history": entry},
            })
            u["sub_status"] = "disabled"; u["disabled"] = True; u["auto_disabled_at"] = now_iso
    return u

@api_router.get("/admin/doctors")
async def admin_list_doctors(admin: dict = Depends(require_role("super_admin"))):
    users = await db.users.find({"role": {"$in": ["doctor", "assistant"]}}).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        if u.get("role") == "doctor":
            u = await _apply_subscription(u)
        tenant = await get_tenant(u["tenant_id"])
        patients = await db.patients.count_documents({"tenant_id": u["tenant_id"]})
        sub_status = u.get("sub_status", "trial") if u.get("role") == "doctor" else None
        days_left = _sub_days_left(u) if sub_status == "subscribed" else None
        out.append({
            "id": str(u["_id"]),
            "email": u["email"],
            "full_name": u.get("full_name", ""),
            "role": u["role"],
            "tenant_id": u["tenant_id"],
            "clinic_name": tenant.get("clinic_name", ""),
            "clinic_phone": tenant.get("clinic_phone", ""),
            "disabled": u.get("disabled", False),
            "patients_count": patients,
            "created_at": u["created_at"].isoformat() if isinstance(u.get("created_at"), datetime) else u.get("created_at"),
            "sub_status": sub_status,
            "sub_plan": u.get("sub_plan", "") if u.get("role") == "doctor" else "",
            "sub_start": u.get("sub_start") if u.get("role") == "doctor" else None,
            "sub_end": u.get("sub_end") if u.get("role") == "doctor" else None,
            "days_left": days_left,
            "expiring_soon": (days_left is not None and 0 <= days_left <= SUB_ALERT_DAYS),
            "auto_disabled": bool(u.get("auto_disabled_at")) if u.get("role") == "doctor" else False,
            "sub_history": list(reversed(u.get("sub_history", []))) if u.get("role") == "doctor" else [],
        })
    return out

@api_router.post("/admin/users/{user_id}/subscription")
async def admin_set_subscription(user_id: str, data: SubscriptionIn, admin: dict = Depends(require_role("super_admin"))):
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target or target.get("role") != "doctor":
        raise HTTPException(404, "الطبيب غير موجود")
    now = datetime.now(timezone.utc)
    update: dict = {"sub_status": data.status, "auto_disabled_at": None}
    if data.status == "subscribed":
        if not data.plan:
            raise HTTPException(400, "يرجى تحديد نوع الاشتراك")
        update["sub_plan"] = data.plan
        update["sub_start"] = now.isoformat()
        update["sub_end"] = (now + timedelta(days=PLAN_DAYS[data.plan])).isoformat()
        update["disabled"] = False
    elif data.status == "trial":
        update["sub_plan"] = ""
        update["sub_start"] = now.isoformat()
        update["sub_end"] = None
        update["disabled"] = False
    else:  # disabled (manual)
        update["disabled"] = True
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    entry = {
        "status": data.status, "plan": update.get("sub_plan", ""),
        "start": update.get("sub_start"), "end": update.get("sub_end"),
        "at": now.isoformat(), "by": admin.get("full_name") or admin.get("email") or "المدير العام",
        "auto": False,
    }
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$push": {"sub_history": entry}})
    return {"ok": True, "sub_status": data.status, "sub_end": update.get("sub_end")}

@api_router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, data: AdminResetIn, admin: dict = Depends(require_role("super_admin"))):
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target or target.get("role") == "super_admin":
        raise HTTPException(404, "المستخدم غير موجود")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"ok": True, "message": "تمت إعادة تعيين كلمة المرور"}

@api_router.post("/admin/users/{user_id}/toggle-disabled")
async def admin_toggle_disabled(user_id: str, admin: dict = Depends(require_role("super_admin"))):
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target or target.get("role") == "super_admin":
        raise HTTPException(404, "المستخدم غير موجود")
    new_val = not target.get("disabled", False)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"disabled": new_val}})
    return {"ok": True, "disabled": new_val}

@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_role("super_admin"))):
    doctors = await db.users.count_documents({"role": "doctor"})
    assistants = await db.users.count_documents({"role": "assistant"})
    clinics = await db.tenants.count_documents({})
    patients = await db.patients.count_documents({})
    subscribed = await db.users.count_documents({"role": "doctor", "sub_status": "subscribed"})
    disabled = await db.users.count_documents({"role": "doctor", "sub_status": "disabled"})
    trial = doctors - subscribed - disabled
    return {"doctors": doctors, "assistants": assistants, "clinics": clinics, "patients": patients,
            "trial": max(0, trial), "subscribed": subscribed, "disabled": disabled}

# ------------------------ App wiring ------------------------

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
