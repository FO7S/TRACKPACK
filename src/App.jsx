import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import './App.css';
import bagIcon from './assets/bag.svg';

// ================================================================
// API
// ================================================================
const API = "http://localhost:8000";

async function sendOTP(email) {
  const form = new FormData();
  form.append("email", email);
  const res = await fetch(`${API}/auth/send-otp`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to send OTP");
}

async function verifyOTP(email, code) {
  const form = new FormData();
  form.append("email", email);
  form.append("code", code);
  const res = await fetch(`${API}/auth/verify-otp`, { method: "POST", body: form });
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
  const res = await fetch(`${API}/fingerprint/save`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to save fingerprint");
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

  const handleChange = (e) => {
    setEmail(e.target.value.trim());
    if (error) setError('');
  };

  const validate = () => {
    if (!email) return 'يرجى إدخال البريد الإلكتروني';
    if (!emailRegex.test(email)) return 'صيغة البريد الإلكتروني غير صحيحة';
    return '';
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      await sendOTP(email);
      onSubmit(email);
    } catch (e) {
      setError('فشل إرسال الرمز، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };
  const isValid = emailRegex.test(email);

  return (
    <div className="screen">
      <div className="card">
        <div className="brand-container">
          <div className="brand-icon">
            <img src={bagIcon} alt="Suitcase" style={{ width: '100px', height: '100px' }} />
          </div>
        </div>

        <h1>فحص الأمتعة</h1>
        <p className="subtitle">أدخل بريدك الإلكتروني للمتابعة</p>

        <div className={`input-group ${error ? 'has-error' : email.length > 0 ? 'has-value' : ''}`}>
          <label>البريد الإلكتروني</label>
          <input
            ref={inputRef}
            type="email"
            placeholder="example@domain.com"
            value={email}
            onChange={handleChange}
            onKeyDown={handleKey}
            dir="ltr"
          />
        </div>

        {error && (
          <div className="error-msg" role="alert">
            <span>⚠️</span> {error}
          </div>
        )}

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
const RESEND_DELAY = 30;

function OtpScreen({ email, onVerify, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_DELAY);
  const [canResend, setCanResend] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => { inputRefs[0].current?.focus(); }, []);

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (idx, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    setError('');
    if (digit && idx < 5) inputRefs[idx + 1].current?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputRefs[idx - 1].current?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    inputRefs[Math.min(pasted.length, 5)].current?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('أدخل الرمز المكون من 6 أرقام'); return; }
    setLoading(true);
    try {
      await verifyOTP(email, code);
      onVerify();
    } catch (e) {
      setError('رمز التحقق غير صحيح أو منتهي الصلاحية');
      setShaking(true);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => { setShaking(false); inputRefs[0].current?.focus(); }, 600);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    try {
      await sendOTP(email);
      setCountdown(RESEND_DELAY);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      setError('');
      inputRefs[0].current?.focus();
    } catch {
      setError('فشل إعادة الإرسال');
    }
  };

  const filled = otp.every(d => d !== '');

  return (
    <div className="screen">
      <div className="card">
        <button className="back-btn" onClick={onBack}>← رجوع</button>

        <div className="brand-icon">🔐</div>
        <h1>رمز التحقق</h1>
        <p className="subtitle">
          أُرسل رمز إلى<br />
          <strong dir="ltr">{email}</strong>
        </p>

        <div className={`otp-row ${shaking ? 'shake' : ''}`} onPaste={handlePaste}>
          {otp.map((val, idx) => (
            <input
              key={idx}
              ref={inputRefs[idx]}
              className={`otp-box ${val ? 'filled' : ''} ${error ? 'box-error' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={val}
              onChange={e => handleChange(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              dir="ltr"
            />
          ))}
        </div>

        {error && (
          <div className="error-msg" role="alert">
            <span>⚠️</span> {error}
          </div>
        )}

        <button className="btn-primary" onClick={handleVerify} disabled={!filled || loading}>
          {loading ? 'جاري التحقق...' : 'تحقق والمتابعة'}
        </button>

        <div className="resend-row">
          {canResend ? (
            <button className="resend-btn" onClick={handleResend}>إعادة إرسال الرمز</button>
          ) : (
            <span className="resend-timer">إعادة الإرسال بعد <strong>{countdown}s</strong></span>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// CAMERA SCREEN
// ================================================================
function CameraScreen({ onDone }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(document.createElement('canvas'));
  const [model, setModel]           = useState(null);
  const [message, setMessage]       = useState('جاري تهيئة النظام...');
  const [isDetected, setIsDetected] = useState(false);
  const [isLightGood, setIsLightGood] = useState(true);
  const [captureStep, setCaptureStep] = useState('front');
  const [images, setImages]         = useState({ front: null, back: null });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => videoRef.current.play();
      }
    } catch { setMessage('❌ خطأ في الكاميرا'); }
  }, []);

  const stopCamera = useCallback(() => {
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    tf.ready().then(() => tf.setBackend('webgl')).then(() =>
      cocossd.load({ base: 'mobilenet_v2' })
    ).then(setModel);
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const checkLighting = useCallback((video) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = 40; canvas.height = 40;
    ctx.drawImage(video, 0, 0, 40, 40);
    const { data } = ctx.getImageData(0, 0, 40, 40);
    let brightness = 0;
    for (let i = 0; i < data.length; i += 4)
      brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return brightness / 1600 > 45;
  }, []);

  useEffect(() => {
    let rafId;
    let lastTime = 0;
    const loop = async (time) => {
      if (model && videoRef.current?.readyState === 4) {
        if (time - lastTime > 800) {
          lastTime = time;
          const lightOk = checkLighting(videoRef.current);
          setIsLightGood(lightOk);
          if (lightOk) {
            const preds = await model.detect(videoRef.current);
            const bag = preds.find(p => ['suitcase', 'bag', 'backpack', 'handbag'].includes(p.class));
            if (bag) {
              const [,,w] = bag.bbox;
              const vw = videoRef.current.videoWidth;
              if (bag.score < 0.45)    { setMessage('🔄 حرك الكاميرا ببطء'); setIsDetected(false); }
              else if (w < vw * 0.3)   { setMessage('🔍 اقترب من الحقيبة'); setIsDetected(false); }
              else                      { setMessage('✅ وضعية مثالية! التقط الصورة'); setIsDetected(true); }
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
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (captureStep === 'front') {
      setImages(prev => ({ ...prev, front: dataUrl }));
      setCaptureStep('back');
      setMessage('الآن صور الجهة الخلفية');
      setIsDetected(false);
    } else {
      const finalImages = { ...images, back: dataUrl };
      stopCamera();
      onDone(finalImages);
    }
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
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
        </div>
        {captureStep === 'back' && images.front && (
          <div className="preview-thumb">
            <span>الأمام ✓</span>
            <img src={images.front} alt="front preview" />
          </div>
        )}
      </div>

      <div className="camera-footer">
        <button className="btn-capture" disabled={!isDetected || !isLightGood} onClick={captureImage}>
          <span className="capture-icon" />
          {captureStep === 'front' ? 'تصوير الأمام' : 'تصوير الخلف'}
        </button>
      </div>
    </div>
  );
}

// ================================================================
// DONE SCREEN
// ================================================================
function DoneScreen({ images, email }) {
  return (
    <div className="screen">
      <div className="card">
        <div className="success-icon">✅</div>
        <h1>تم بنجاح!</h1>
        <p className="subtitle">
          تم تسجيل بصمة شنطتك<br/>
          سنرسل لك إشعاراً على <strong dir="ltr">{email}</strong> عند وصولها
        </p>
        <div className="final-grid">
          <div className="final-img-wrap">
            <img src={images.front} alt="Front" />
            <span>الأمام</span>
          </div>
          <div className="final-img-wrap">
            <img src={images.back} alt="Back" />
            <span>الخلف</span>
          </div>
        </div>
        <button className="btn-primary" onClick={() => window.location.reload()}>إغلاق</button>
      </div>
    </div>
  );
}

// ================================================================
// ROOT APP
// ================================================================
export default function App() {
  const [step, setStep]     = useState('login');
  const [email, setEmail]   = useState('');
  const [images, setImages] = useState(null);

  return (
    <>
      {step === 'login' && (
        <LoginScreen onSubmit={e => { setEmail(e); setStep('otp'); }} />
      )}
      {step === 'otp' && (
        <OtpScreen
          email={email}
          onVerify={() => setStep('camera')}
          onBack={() => setStep('login')}
        />
      )}
      {step === 'camera' && (
        <CameraScreen onDone={async imgs => {
          setImages(imgs);
          setStep('done');
          try {
            await saveFingerprint(email, imgs);
            console.log('✅ Fingerprint saved');
          } catch (e) {
            console.error('❌ Save failed:', e);
          }
        }} />
      )}
      {step === 'done' && (
        <DoneScreen images={images} email={email} />
      )}
    </>
  );
}