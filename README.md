# TrackPack 🧳
**Airport Baggage Tracking System**

TrackPack uses computer vision to automatically detect a traveler's suitcase on the baggage carousel and send an instant email notification — no RFID, no barcodes. The traveler simply registers their bag with two photos (front and back), and the system monitors the carousel and notifies them the moment their bag appears.

---

## Problem

- 26M+ bags lost or delayed annually worldwide *(Based on industry reports — SITA)*
- Travelers wait 20–30 minutes on average at the carousel with no notification
- No real-time alert system when a specific bag appears
- Identical-looking bags cause mix-ups

---

## Solution

1. Traveler opens the web app and enters their email
2. Receives OTP verification
3. Takes a photo of their bag (front + back)
4. AI extracts a digital fingerprint and stores it
5. Camera monitors the carousel automatically
6. Traveler tracks their bag status in real-time via the app timeline
7. When the bag appears on the carousel (front **or** back view), an instant email is sent
8. Traveler collects their bag without waiting

---

## System Architecture

Frontend (React + Vercel) ↔ Backend (FastAPI on RunPod GPU) ↔ Database (Supabase) ↔ AI Models ↔ Email (Gmail SMTP)

---

## AI Pipeline

### Registration
User Photo → YOLO (detect bag) → SAM (segment bag) → Crop + Rotate (4×) → DINOv2 (global embedding 768D + spatial grid 4×4) → HSV Color Histogram → Store fingerprint in Supabase

### Monitoring
Camera Frame → Same pipeline → Compare vs all fingerprints → Hard Veto Rules → Fusion Score → Score ≥ 0.74 → MATCH → Email + Status Update + Log

### Models

| Model | Role | Why |
|-------|------|-----|
| YOLOv8x | Detect suitcase in frame | Most accurate in family; stable for production |
| SAM (Meta) | Segment bag from background | Pixel-perfect mask using YOLO bbox as prompt |
| DINOv2 ViT-B/14 (Meta) | Extract bag fingerprint | Self-supervised; rich shape + texture features |
| HSV Histogram | Color signature | Less affected by lighting changes than RGB |

### Fusion Weights
- **Global (DINOv2) = 0.45** — most reliable metric
- **Color (HSV) = 0.35** — strong discriminator
- **Spatial (Grid) = 0.20** — sensitive to angle; lower weight

### Hard Veto Rules

| Rule | Threshold |
|------|-----------|
| Global similarity | < 0.68 → NO MATCH |
| Spatial similarity | < 0.60 → NO MATCH |
| Color similarity | < 0.32 → NO MATCH |
| Global + Color combined | < 0.75 and < 0.52 → NO MATCH |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite → Vercel |
| Backend | FastAPI (Python) → RunPod GPU |
| Tunnel | ngrok |
| Database | Supabase (PostgreSQL) |
| Detection | YOLOv8x |
| Segmentation | SAM — Segment Anything Model |
| Embedding | DINOv2 ViT-B/14 |
| Color | HSV Color Histogram |
| Email | Gmail SMTP |

---

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | Unique identifier |
| created_at | TIMESTAMP | Registration time |

### bag_fingerprints
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | References users |
| embeddings | TEXT | DINOv2 fingerprint (hex) |
| color_hist | TEXT | HSV histogram (hex) |
| status | TEXT | registered → on-carousel |
| front_image | TEXT | Base64 photo |
| back_image | TEXT | Base64 photo |

### match_results
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | References users |
| final_score | FLOAT | Fusion score |
| global_score | FLOAT | DINOv2 similarity |
| spatial_score | FLOAT | Grid similarity |
| color_score | FLOAT | HSV similarity |
| best_view | TEXT | front or back |
| frame_image | TEXT | Camera frame (base64) |
| crop_image | TEXT | Detected crop (base64) |
| crop_masked_image | TEXT | Segmented crop (base64) |

### notifications
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | Recipient |
| type | TEXT | otp / bag_detected / status_update |
| sent_at | TIMESTAMP | Send time |

### status_history
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | Passenger |
| status | TEXT | Status value |
| changed_at | TIMESTAMP | Change time |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/send-otp | Send OTP to email |
| POST | /auth/verify-otp | Verify OTP |
| POST | /fingerprint/save | Register bag fingerprint |
| POST | /monitor/frame | Run AI pipeline on camera frame |
| GET | /bag/status | Get current bag status |
| GET | /admin/bags | List all passengers (admin) |
| GET | /admin/match-results | Get match results (admin) |
| POST | /admin/update-status | Update bag status (admin) |
| GET | /health | Backend + SAM health check |

---

## Bag Status Flow

registered → check-in → loaded → in-flight → arrived → on-carousel

Email notification sent at every status change + when bag is detected on carousel.

---

## Limitations

1. **Lighting** — Poor or uneven lighting may affect color score accuracy
2. **Identical Bags** — Same model and color increases false positive risk
3. **Camera Angle** — Unusual angles or partial occlusion may affect detection
4. **Suitcases Only** — Currently optimized for suitcases only

---

## Future Work

- Improve model performance and expand coverage to all luggage types
- Support live camera streaming directly from airport cameras
- Native mobile app on iOS and Android

---

## Team

- Faisal Alsulami
- Saad Alshahrani
- Abdulmajeed Alshehri
- Banan Alnemri

---

## Models & Credits

- [YOLOv8](https://github.com/ultralytics/ultralytics) by Ultralytics
- [Segment Anything (SAM)](https://github.com/facebookresearch/segment-anything) by Meta AI
- [DINOv2](https://github.com/facebookresearch/dinov2) by Meta AI
- [Supabase](https://supabase.com) — Database
- [Vercel](https://vercel.com) — Frontend
- [RunPod](https://runpod.io) — GPU Backend
