"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * These are local receipt-encryption phrases, NOT account passwords.
 * Chromium/Safari mistake multiple password inputs for login credentials and
 * may offer to save them. Where supported we use a CSS-masked text input,
 * avoiding the password-manager heuristic; other engines retain a real password
 * input as the security/accessibility fallback. The browser still owns its UI.
 */
export function ReceiptPassphraseInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [cssMask, setCssMask] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setCssMask(typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc"));
  }, []);

  const mask = cssMask && !visible;
  return (
    <div className="relative mt-2">
      <input
        id={id}
        type={visible || cssMask ? "text" : "password"}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-receipt-passphrase="true"
        value={value}
        onChange={event => onChange(event.target.value)}
        maxLength={256}
        placeholder={placeholder}
        style={mask ? { WebkitTextSecurity: "disc" } as React.CSSProperties : undefined}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-12 text-base text-slate-950"
      />
      <button
        type="button"
        aria-label={visible ? "암호 가리기" : "암호 보기"}
        aria-pressed={visible}
        onClick={() => setVisible(current => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
