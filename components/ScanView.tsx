'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { cleanCode, validBarcode } from '@/lib/barcode';
import { isMealKey } from '@/lib/constants';
import { isDateString, todayLocal } from '@/lib/dates';

const READER_ID = 'barcode-reader';

export default function ScanView() {
  const router = useRouter();
  const params = useSearchParams();
  const meal = isMealKey(params.get('meal')) ? params.get('meal') : 'snacks';
  const dateParam = params.get('date');
  const date = isDateString(dateParam) ? dateParam : todayLocal();

  const [cameraOn, setCameraOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const doneRef = useRef(false);

  function go(raw: string) {
    const code = cleanCode(raw);
    if (!validBarcode(code)) {
      setMsg(`"${raw}" is not a valid barcode (check digit failed). Try again or type the digits under the bars.`);
      return false;
    }
    router.push(`/add?meal=${meal}&date=${date}&barcode=${code}`);
    return true;
  }

  async function stopCamera() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try { await s.stop(); } catch { /* already stopped */ }
      try { s.clear(); } catch { /* ignore */ }
    }
  }

  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    doneRef.current = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(READER_ID, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
          ],
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (text) => {
            if (doneRef.current) return;
            if (go(text)) { doneRef.current = true; stopCamera(); }
          },
          () => { /* no code in this frame */ }
        );
      } catch (e) {
        setCameraOn(false);
        setCamErr(
          `Could not start the camera (${(e as Error)?.message ?? e}). Allow camera access for this site, or type the number instead. ` +
          'Home-screen apps on iPhone sometimes cannot use the camera; if so, open the app in Safari for scanning.'
        );
      }
    })();
    return () => { cancelled = true; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Link href={`/add?meal=${meal}&date=${date}`} className="btn">Back</Link>
        <h1 className="text-lg font-semibold">Scan barcode</h1>
        <span className="w-16" />
      </header>

      {!cameraOn && (
        <button className="btn btn-primary w-full" onClick={() => { setCamErr(null); setMsg(null); setCameraOn(true); }}>Start camera</button>
      )}
      {cameraOn && (
        <>
          <div id={READER_ID} className="overflow-hidden rounded-2xl" />
          <button className="btn w-full" onClick={() => setCameraOn(false)}>Stop camera</button>
        </>
      )}
      {camErr && <p className="err">{camErr}</p>}

      <form className="card space-y-2" onSubmit={(e) => { e.preventDefault(); go(typed); }}>
        <label className="label" htmlFor="code">Or type the number under the bars</label>
        <input id="code" className="input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. 012345678905" />
        <button className="btn w-full" type="submit" disabled={!typed.trim()}>Look up</button>
      </form>
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
