import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import './App.css';
import bagIcon from './assets/bag.svg';

// ================================================================
// API
// ================================================================
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const ADMIN_PASSWORD = "trackpack2024";
const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

const STATUSES = [
  { key: 'check-in',    label: 'Check-in',    icon: '🏷️', color: '#6366f1' },
  { key: 'loaded',      label: 'Loaded',      icon: '📦', color: '#f59e0b' },
  { key: 'in-flight',   label: 'In Flight',   icon: '✈️', color: '#3b82f6' },
  { key: 'arrived',     label: 'Arrived',     icon: '🛬', color: '#8b5cf6' },
  { key: 'on-carousel', label: 'On Carousel', icon: '🎠', color: '#22c55e' },
];

async function sendOTP(email) {
  const form = new FormData();
  form.append("email", email);
  const res = await fetch(`${API}/auth/send-otp`, { method: "POST", body: form, headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Failed to send OTP");
}

async function verifyOTP(email, code) {
  const form = new FormData();
  form.append("email", email);
  form.append("code", code);
  const res = await fetch(`${API}/auth/verify-otp`, { method: "POST", body: form, headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Invalid OTP");
}

async function saveFingerprint(email, images) {
  const toBlob = (dataUrl) => {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
  };
  const form = new FormData();
  form.append("email", email);
  form.append("front_img", toBlob(images.front), "front.jpg");
  form.append("back_img",  toBlob(images.back),  "back.jpg");
  const res = await fetch(`${API}/fingerprint/save`, { method: "POST", body: form, headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Failed to save fingerprint");
  return res.json();
}

async function getBagStatus(email) {
  const res = await fetch(`${API}/bag/status?email=${encodeURIComponent(email)}`, { headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

async function getAllBags() {
  const res = await fetch(`${API}/admin/bags`, { headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function getMatchResults(email) {
  const res = await fetch(`${API}/admin/match-results?email=${encodeURIComponent(email)}`, { headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function updateBagStatus(email, status) {
  const form = new FormData();
  form.append("email", email);
  form.append("status", status);
  const res = await fetch(`${API}/admin/update-status`, { method: "POST", body: form, headers: NGROK_HEADERS });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

// ================================================================
// LOGIN SCREEN
// ================================================================
function LoginScreen({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  useEffect(() => { inputRef.current?.focus(); }, []);
  const handleChange = (e) => { setEmail(e.target.value.trim()); if (error) setError(''); };
  const handleSubmit = async () => {
    if (!emailRegex.test(email)) { setError('صيغة البريد الإلكتروني غير صحيحة'); return; }
    setLoading(true);
    try { await sendOTP(email); onSubmit(email); }
    catch { setError('فشل إرسال الرمز، حاول مجدداً'); }
    finally { setLoading(false); }
  };
  const isValid = emailRegex.test(email);
  return (
    <div className="screen">
      <div className="card">
        <div className="brand-container">
          <div className="brand-icon">
            <img src={bagIcon} alt="Suitcase" style={{ width: '100px', height: '100px' }} />
          </div>
        </div>
        <h1>TrackPack</h1>
        <p className="subtitle">أدخل بريدك الإلكتروني للمتابعة</p>
        <div className={`input-group ${error ? 'has-error' : email.length > 0 ? 'has-value' : ''}`}>
          <label>البريد الإلكتروني</label>
          <input ref={inputRef} type="email" placeholder="example@domain.com"
            value={email} onChange={handleChange} onKeyDown={e => e.key==='Enter'&&handleSubmit()} dir="ltr" />
        </div>
        {error && <div className="error-msg"><span>⚠️</span> {error}</div>}
        <button className="btn-primary" onClick={handleSubmit} disabled={!isValid || loading}>
          {loading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'}
        </button>
        <p className="legal-note">سيتم إرسال رمز مكون من 6 أرقام إلى بريدك الإلكتروني</p>
      </div>
    </div>
  );
}

// ================================================================
// OTP SCREEN
// ================================================================
function OtpScreen({ email, onVerify, onBack }) {
  const [otp, setOtp] = useState(['','','','','','']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [shaking, setShaking] = useState(false);
  const refs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  useEffect(() => { refs[0].current?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c-1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (idx, val) => {
    const d = val.replace(/\D/g,'').slice(-1);
    const next = [...otp]; next[idx] = d; setOtp(next); setError('');
    if (d && idx < 5) refs[idx+1].current?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('أدخل الرمز المكون من 6 أرقام'); return; }
    setLoading(true);
    try { await verifyOTP(email, code); onVerify(); }
    catch {
      setError('رمز التحقق غير صحيح');
      setShaking(true);
      setOtp(['','','','','','']);
      setTimeout(() => { setShaking(false); refs[0].current?.focus(); }, 600);
    } finally { setLoading(false); }
  };

  return (
    <div className="screen">
      <div className="card">
        <button className="back-btn" onClick={onBack}>← رجوع</button>
        <div className="brand-icon">🔐</div>
        <h1>رمز التحقق</h1>
        <p className="subtitle">أُرسل رمز إلى<br/><strong dir="ltr">{email}</strong></p>
        <div className={`otp-row ${shaking ? 'shake' : ''}`}>
          {otp.map((val, idx) => (
            <input key={idx} ref={refs[idx]}
              className={`otp-box ${val ? 'filled' : ''} ${error ? 'box-error' : ''}`}
              type="text" inputMode="numeric" maxLength={1} value={val}
              onChange={e => handleChange(idx, e.target.value)}
              onKeyDown={e => e.key==='Backspace' && !otp[idx] && idx>0 && refs[idx-1].current?.focus()}
              dir="ltr" />
          ))}
        </div>
        {error && <div className="error-msg"><span>⚠️</span> {error}</div>}
        <button className="btn-primary" onClick={handleVerify} disabled={!otp.every(d=>d) || loading}>
          {loading ? 'جاري التحقق...' : 'تحقق والمتابعة'}
        </button>
        <div className="resend-row">
          {canResend
            ? <button className="resend-btn" onClick={async () => { await sendOTP(email); setCountdown(30); setCanResend(false); setOtp(['','','','','','']); }}>إعادة إرسال</button>
            : <span className="resend-timer">إعادة الإرسال بعد <strong>{countdown}s</strong></span>}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// CHOICE SCREEN
// ================================================================
function ChoiceScreen({ email, onRegister, onTrack }) {
  return (
    <div className="screen">
      <div className="card choice-card">
        <div className="brand-icon">🧳</div>
        <h1>مرحباً!</h1>
        <p className="subtitle" dir="ltr">{email}</p>
        <div className="choice-grid">
          <button className="choice-btn choice-register" onClick={onRegister}>
            <div className="choice-icon">📸</div>
            <div className="choice-title">تسجيل شنطة</div>
            <div className="choice-desc">صوّر شنطتك وسجّل بصمتها</div>
          </button>
          <button className="choice-btn choice-track" onClick={onTrack}>
            <div className="choice-icon">📡</div>
            <div className="choice-title">تتبع شنطتي</div>
            <div className="choice-desc">اعرف أين شنطتك الآن</div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// TRACKING SCREEN
// ================================================================
function TrackingScreen({ email, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    try { const res = await getBagStatus(email); setData(res); setError(''); }
    catch { setError('لم يتم العثور على بصمة شنطة لهذا البريد. يرجى تسجيل شنطتك أولاً.'); }
    finally { setLoading(false); }
  }, [email]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const currentIdx = data ? STATUSES.findIndex(s => s.key === data.status) : -1;

  if (loading) return <div className="screen"><div className="card"><div className="loading-spinner">⏳</div><p className="subtitle">جاري البحث عن شنطتك...</p></div></div>;
  if (error) return <div className="screen"><div className="card"><div className="brand-icon">😕</div><h1>غير موجود</h1><p className="subtitle">{error}</p><button className="btn-primary" onClick={onBack}>رجوع</button></div></div>;

  const current = STATUSES[currentIdx];
  return (
    <div className="screen tracking-screen">
      <div className="tracking-card">
        <button className="back-btn" style={{marginBottom:'16px'}} onClick={onBack}>← رجوع</button>
        <div className="tracking-header">
          <div className="tracking-status-icon" style={{background: current?.color + '22', border: `2px solid ${current?.color}`}}>
            <span>{current?.icon || '🧳'}</span>
          </div>
          <h1 className="tracking-title">{current?.label || 'Unknown'}</h1>
          <p className="tracking-email" dir="ltr">{email}</p>
        </div>
        <div className="timeline">
          {STATUSES.map((s, idx) => {
            const done = idx < currentIdx; const active = idx === currentIdx;
            return (
              <div key={s.key} className={`timeline-item ${done ? 'done' : active ? 'active' : 'pending'}`}>
                <div className="timeline-left">
                  <div className="timeline-dot" style={active ? {background: s.color, boxShadow: `0 0 0 4px ${s.color}33`} : done ? {background: s.color} : {}}>
                    {done ? '✓' : active ? s.icon : ''}
                  </div>
                  {idx < STATUSES.length - 1 && <div className="timeline-line" style={done ? {background: s.color} : {}} />}
                </div>
                <div className="timeline-content">
                  <div className="timeline-label" style={active ? {color: s.color, fontWeight: 700} : {}}>{s.label}</div>
                  {active && <div className="timeline-badge" style={{background: s.color}}>الحالة الحالية</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="tracking-footer">
          <p className="tracking-updated">آخر تحديث: {data?.status_updated_at ? new Date(data.status_updated_at).toLocaleTimeString('ar') : 'الآن'}</p>
          <button className="btn-refresh" onClick={fetchStatus}>🔄 تحديث</button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// CAMERA SCREEN
// ================================================================
function CameraScreen({ onDone }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const [model, setModel]             = useState(null);
  const [message, setMessage]         = useState('جاري تهيئة النظام...');
  const [isDetected, setIsDetected]   = useState(false);
  const [isLightGood, setIsLightGood] = useState(true);
  const [captureStep, setCaptureStep] = useState('front');
  const [images, setImages]           = useState({ front: null, back: null });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => videoRef.current.play(); }
    } catch { setMessage('❌ خطأ في الكاميرا'); }
  }, []);
  const stopCamera = useCallback(() => { videoRef.current?.srcObject?.getTracks().forEach(t => t.stop()); }, []);

  useEffect(() => { tf.ready().then(() => tf.setBackend('webgl')).then(() => cocossd.load({ base: 'mobilenet_v2' })).then(setModel); }, []);
  useEffect(() => { startCamera(); return stopCamera; }, [startCamera, stopCamera]);

  const checkLighting = useCallback((video) => {
    const canvas = canvasRef.current; const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = 40; canvas.height = 40; ctx.drawImage(video, 0, 0, 40, 40);
    const { data } = ctx.getImageData(0, 0, 40, 40); let brightness = 0;
    for (let i = 0; i < data.length; i += 4) brightness += (data[i] + data[i+1] + data[i+2]) / 3;
    return brightness / 1600 > 45;
  }, []);

  useEffect(() => {
    let rafId, lastTime = 0;
    const loop = async (time) => {
      if (model && videoRef.current?.readyState === 4) {
        if (time - lastTime > 800) {
          lastTime = time;
          const lightOk = checkLighting(videoRef.current); setIsLightGood(lightOk);
          if (lightOk) {
            const preds = await model.detect(videoRef.current);
            const bag = preds.find(p => ['suitcase','bag','backpack','handbag'].includes(p.class));
            if (bag) {
              const [,,w] = bag.bbox; const vw = videoRef.current.videoWidth;
              if (bag.score < 0.45) { setMessage('🔄 حرك الكاميرا ببطء'); setIsDetected(false); }
              else if (w < vw * 0.3) { setMessage('🔍 اقترب من الحقيبة'); setIsDetected(false); }
              else { setMessage('✅ وضعية مثالية! التقط الصورة'); setIsDetected(true); }
            } else { setMessage('🔎 ابحث عن الحقيبة داخل الإطار'); setIsDetected(false); }
          } else { setMessage('⚠️ الإضاءة ضعيفة جداً'); setIsDetected(false); }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [model, checkLighting]);

  const captureImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    if (captureStep === 'front') { setImages(prev => ({ ...prev, front: dataUrl })); setCaptureStep('back'); setMessage('الآن صور الجهة الخلفية'); setIsDetected(false); }
    else { stopCamera(); onDone({ ...images, back: dataUrl }); }
  };

  return (
    <div className="app-camera">
      <div className="camera-header">
        <div className="step-pill">خطوة {captureStep === 'front' ? '1' : '2'} من 2</div>
        <p className="camera-msg">{message}</p>
        {!isLightGood && <p className="light-warn">⚠️ الإضاءة ضعيفة جداً</p>}
      </div>
      <div className="camera-wrap">
        <video ref={videoRef} autoPlay playsInline muted />
        <div className={`scan-frame ${isDetected && isLightGood ? 'detected' : ''}`}>
          <span className="corner tl"/><span className="corner tr"/>
          <span className="corner bl"/><span className="corner br"/>
        </div>
        {captureStep === 'back' && images.front && (
          <div className="preview-thumb"><span>الأمام ✓</span><img src={images.front} alt="front preview" /></div>
        )}
      </div>
      <div className="camera-footer">
        <button className="btn-capture" disabled={!isDetected || !isLightGood} onClick={captureImage}>
          <span className="capture-icon" />{captureStep === 'front' ? 'تصوير الأمام' : 'تصوير الخلف'}
        </button>
      </div>
    </div>
  );
}

// ================================================================
// DONE SCREEN
// ================================================================
function DoneScreen({ images, email, onTrack }) {
  return (
    <div className="screen">
      <div className="card">
        <div className="success-icon">✅</div>
        <h1>تم بنجاح!</h1>
        <p className="subtitle">تم تسجيل بصمة شنطتك<br/>سنرسل لك إشعاراً على <strong dir="ltr">{email}</strong> عند وصولها</p>
        <div className="final-grid">
          <div className="final-img-wrap"><img src={images.front} alt="Front"/><span>الأمام</span></div>
          <div className="final-img-wrap"><img src={images.back}  alt="Back" /><span>الخلف</span></div>
        </div>
        <button className="btn-primary" onClick={onTrack} style={{marginBottom:'12px'}}>📡 تتبع شنطتي</button>
        <button className="btn-secondary" onClick={() => window.location.reload()}>إغلاق</button>
      </div>
    </div>
  );
}

// ================================================================
// MATCH RESULTS PANEL
// ================================================================
function MatchResultsPanel({ email, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMatchResults(email).then(data => { setResults(data); setLoading(false); }).catch(() => setLoading(false));
  }, [email]);

  const ScoreBar = ({ label, value, color }) => (
    <div style={{marginBottom: '10px'}}>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:'4px'}}>
        <span style={{fontSize:'12px', color:'#94a3b8', fontWeight:600}}>{label}</span>
        <span style={{fontSize:'13px', color, fontWeight:700}}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{background:'#1e293b', borderRadius:'99px', height:'8px', overflow:'hidden'}}>
        <div style={{width:`${value*100}%`, background:color, height:'100%', borderRadius:'99px', transition:'width 0.8s ease'}}/>
      </div>
    </div>
  );

  return (
    <div className="match-panel">
      <div className="match-panel-header">
        <div>
          <div style={{fontSize:'13px', color:'#64748b', marginBottom:'4px'}}>نتايج المودل</div>
          <div style={{fontSize:'14px', color:'#94a3b8', direction:'ltr'}}>{email}</div>
        </div>
        <button className="match-close-btn" onClick={onClose}>✕</button>
      </div>

      {loading ? (
        <div style={{textAlign:'center', padding:'40px', color:'#475569'}}>⏳ جاري التحميل...</div>
      ) : results.length === 0 ? (
        <div style={{textAlign:'center', padding:'40px', color:'#475569'}}>
          <div style={{fontSize:'32px', marginBottom:'12px'}}>📭</div>
          <div>لا يوجد ماتش بعد</div>
          <div style={{fontSize:'12px', color:'#334155', marginTop:'8px'}}>شغّل الفيديو عشان يظهر هنا</div>
        </div>
      ) : results.map((r, i) => (
        <div key={i} className="match-result-card">
          {/* Header */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}>
            <div style={{fontSize:'12px', color:'#475569'}}>
              {new Date(r.matched_at).toLocaleString('ar')}
            </div>
            <div style={{
              background: r.final_score >= 0.74 ? '#22c55e22' : '#ef444422',
              color: r.final_score >= 0.74 ? '#22c55e' : '#ef4444',
              padding:'4px 12px', borderRadius:'99px', fontSize:'12px', fontWeight:700
            }}>
              {r.final_score >= 0.74 ? '✓ MATCH' : '✗ NO MATCH'} — {(r.final_score*100).toFixed(1)}%
            </div>
          </div>

          {/* Scores */}
          <div style={{marginBottom:'16px'}}>
            <ScoreBar label="Final Score"   value={r.final_score}   color="#22c55e" />
            <ScoreBar label="Global (DINOv2)" value={r.global_score}  color="#3b82f6" />
            <ScoreBar label="Spatial Grid"  value={r.spatial_score} color="#8b5cf6" />
            <ScoreBar label="Color (HSV)"   value={r.color_score}   color="#f59e0b" />
          </div>

          {/* Images */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'8px'}}>
            {r.ref_front_image && (
              <div style={{textAlign:'center'}}>
                <img src={r.ref_front_image} alt="ref front" style={{width:'100%', borderRadius:'8px', border:'1px solid #334155'}}/>
                <div style={{fontSize:'10px', color:'#475569', marginTop:'4px'}}>Ref Front</div>
              </div>
            )}
            {r.crop_image && (
              <div style={{textAlign:'center'}}>
                <img src={r.crop_image} alt="crop" style={{width:'100%', borderRadius:'8px', border:'1px solid #334155'}}/>
                <div style={{fontSize:'10px', color:'#475569', marginTop:'4px'}}>Detected</div>
              </div>
            )}
            {r.crop_masked_image && (
              <div style={{textAlign:'center'}}>
                <img src={r.crop_masked_image} alt="crop masked" style={{width:'100%', borderRadius:'8px', border:'1px solid #334155'}}/>
                <div style={{fontSize:'10px', color:'#475569', marginTop:'4px'}}>Segmented</div>
              </div>
            )}
          </div>

          {/* Thresholds */}
          <div style={{background:'#0f172a', borderRadius:'8px', padding:'10px', fontSize:'11px', color:'#475569', fontFamily:'monospace'}}>
            <div>Match threshold: <span style={{color:'#22c55e'}}>≥ 0.74</span></div>
            <div>Veto global: <span style={{color:'#3b82f6'}}>≥ 0.68</span> | spatial: <span style={{color:'#8b5cf6'}}>≥ 0.60</span> | color: <span style={{color:'#f59e0b'}}>≥ 0.32</span></div>
            <div>Best view: <span style={{color:'#94a3b8'}}>{r.best_view || '-'}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ================================================================
// ADMIN
// ================================================================
function AdminLogin({ onLogin }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const handleLogin = () => { if (pw === ADMIN_PASSWORD) onLogin(); else setError('كلمة المرور غير صحيحة'); };
  return (
    <div className="screen admin-login">
      <div className="card">
        <div className="brand-icon">🔒</div>
        <h1>داشبورد الموظف</h1>
        <p className="subtitle">أدخل كلمة المرور للوصول</p>
        <div className={`input-group ${error ? 'has-error' : ''}`}>
          <label>كلمة المرور</label>
          <input type="password" value={pw} onChange={e => { setPw(e.target.value); setError(''); }}
            onKeyDown={e => e.key==='Enter' && handleLogin()} placeholder="••••••••" dir="ltr" />
        </div>
        {error && <div className="error-msg"><span>⚠️</span> {error}</div>}
        <button className="btn-primary" onClick={handleLogin} disabled={!pw}>دخول</button>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [bags, setBags]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [updating, setUpdating] = useState(null);
  const [search, setSearch]     = useState('');
  const [openResults, setOpenResults] = useState(null); // email اللي فتحنا نتايجه

  const fetchBags = useCallback(async () => {
    try { const data = await getAllBags(); setBags(data); }
    catch { setBags([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBags(); const iv = setInterval(fetchBags, 15000); return () => clearInterval(iv); }, [fetchBags]);

  const handleUpdate = async (email, status) => {
    setUpdating(email);
    try { await updateBagStatus(email, status); await fetchBags(); }
    finally { setUpdating(null); }
  };

  const filtered = bags.filter(b => b.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="admin-dash">
      <div className="admin-header">
        <div className="admin-logo">🎛️ TrackPack Admin</div>
        <div className="stat-pill">{bags.length} مسافر</div>
      </div>
      <div className="admin-search">
        <input type="text" placeholder="ابحث بالإيميل..." value={search}
          onChange={e => setSearch(e.target.value)} dir="ltr" className="admin-search-input" />
      </div>

      {loading ? <div className="admin-loading">⏳ جاري التحميل...</div>
      : filtered.length === 0 ? <div className="admin-empty">لا يوجد مسافرون مسجّلون</div>
      : (
        <div className="admin-table">
          {filtered.map(bag => {
            const currentStatus = STATUSES.find(s => s.key === bag.status) || STATUSES[0];
            const isOpen = openResults === bag.email;
            return (
              <div key={bag.email} className="admin-row">
                <div className="admin-row-top">
                  <div className="admin-email" dir="ltr">{bag.email}</div>
                  <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <div className="admin-current-status" style={{color: currentStatus.color}}>
                      {currentStatus.icon} {currentStatus.label}
                    </div>
                    <button
                      className="results-btn"
                      onClick={() => setOpenResults(isOpen ? null : bag.email)}
                      style={{background: isOpen ? '#1B6FEB' : '#1e293b', color: isOpen ? 'white' : '#64748b'}}
                    >
                      {isOpen ? '▲ إخفاء النتايج' : '📊 النتايج'}
                    </button>
                  </div>
                </div>

                <div className="admin-status-btns">
                  {STATUSES.map(s => (
                    <button key={s.key}
                      className={`status-btn ${bag.status === s.key ? 'active' : ''}`}
                      style={bag.status === s.key ? {background: s.color, borderColor: s.color} : {}}
                      onClick={() => handleUpdate(bag.email, s.key)}
                      disabled={updating === bag.email}>
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>

                <div className="admin-row-time">
                  آخر تحديث: {bag.status_updated_at ? new Date(bag.status_updated_at).toLocaleString('ar') : '-'}
                </div>

                {isOpen && (
                  <div style={{marginTop:'16px', borderTop:'1px solid #1e293b', paddingTop:'16px'}}>
                    <MatchResultsPanel email={bag.email} onClose={() => setOpenResults(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminScreen() {
  const [loggedIn, setLoggedIn] = useState(false);
  if (!loggedIn) return <AdminLogin onLogin={() => setLoggedIn(true)} />;
  return <AdminDashboard />;
}

// ================================================================
// ROOT APP
// ================================================================
export default function App() {
  const [step, setStep]     = useState('login');
  const [email, setEmail]   = useState('');
  const [images, setImages] = useState(null);

  if (window.location.pathname === '/admin') return <AdminScreen />;

  return (
    <>
      {step === 'login'  && <LoginScreen onSubmit={e => { setEmail(e); setStep('otp'); }} />}
      {step === 'otp'    && <OtpScreen email={email} onVerify={() => setStep('choice')} onBack={() => setStep('login')} />}
      {step === 'choice' && <ChoiceScreen email={email} onRegister={() => setStep('camera')} onTrack={() => setStep('track')} />}
      {step === 'track'  && <TrackingScreen email={email} onBack={() => setStep('choice')} />}
      {step === 'camera' && (
        <CameraScreen onDone={async imgs => {
          setImages(imgs); setStep('done');
          try { await saveFingerprint(email, imgs); } catch(e) { console.error(e); }
        }} />
      )}
      {step === 'done' && <DoneScreen images={images} email={email} onTrack={() => setStep('track')} />}
    </>
  );
}