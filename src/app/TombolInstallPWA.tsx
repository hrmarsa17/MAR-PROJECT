'use client';

import { useEffect, useState } from 'react';

export function TombolInstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [terpasang, setTerpasang] = useState(false);

  useEffect(() => {
    // Cek jika sudah berjalan dalam mode PWA/standalone
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    ) {
      setTerpasang(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setTerpasang(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) {
      alert('Untuk memasang aplikasi:\n\n• Android/Chrome: Buka menu titik tiga (⋮) -> Install App / Tambahkan ke Layar Utama.\n• iOS/Safari: Tekan Bagikan (Share) -> Tambahkan ke Layar Utama (Add to Home Screen).');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setTerpasang(true);
    }
  }

  if (terpasang) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#DC2626',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '6px',
        padding: '6px 12px',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        transition: 'background-color 0.2s',
      }}
      title="Install Aplikasi MAR KMB"
    >
      <span>📲</span> Install App
    </button>
  );
}
