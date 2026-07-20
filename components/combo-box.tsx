"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Type-ahead input that SUGGESTS but never restricts.
//
// Built for an MR standing in a chamber on a phone: three characters should be
// enough to land a canonical value, but a genuinely new specialty or a chamber
// this list has never seen must still go in without a fight. So: no forced
// selection, no "invalid option" — whatever is typed is the value.
//
// Native <datalist> was the cheaper option and was rejected: it can't show
// "searching…", can't merge async results, and renders inconsistently on
// Android browsers, which is the only platform that matters here.
// ─────────────────────────────────────────────────────────────────────────────

export type ComboBoxProps = {
  value: string;
  onChange: (v: string) => void;
  /** Synchronous local suggestions, already ranked. */
  suggestions: string[];
  placeholder?: string;
  /** Optional async lookup (e.g. map search) merged below local matches. */
  onSearch?: (q: string) => Promise<string[]>;
  /** Shown under the field — e.g. the source of remote results. */
  hint?: string;
  inputClassName?: string;
};

export function ComboBox({
  value,
  onChange,
  suggestions,
  placeholder,
  onSearch,
  hint,
  inputClassName,
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Guards against a slow early request overwriting a newer one's results.
  const reqId = useRef(0);

  // Close when focus leaves the whole control (not merely the input, or
  // tapping a suggestion would dismiss the list before the tap registers).
  useEffect(() => {
    function onDocDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
    };
  }, []);

  // Debounced remote lookup. Three characters is the floor — fewer returns
  // noise and burns the free geocoder's rate limit.
  useEffect(() => {
    if (!onSearch) return;
    const q = value.trim();
    if (q.length < 3) {
      setRemote([]);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await onSearch(q);
        if (id === reqId.current) setRemote(res);
      } catch {
        if (id === reqId.current) setRemote([]);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [value, onSearch]);

  // Local first (the vocabulary we want to converge on), remote after, no dupes.
  const seen = new Set(suggestions.map((s) => s.toLowerCase()));
  const merged = [...suggestions, ...remote.filter((r) => !seen.has(r.toLowerCase()))];
  const show = open && (merged.length > 0 || searching);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          // Enter takes the top suggestion only when the field is untouched
          // since typing — never overrides a deliberate full entry.
          if (e.key === "Enter" && open && merged.length > 0 && value.trim() !== merged[0]) {
            e.preventDefault();
            pick(merged[0]);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={
          inputClassName ??
          "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
        }
      />
      {show ? (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {merged.map((s) => (
            <button
              key={s}
              type="button"
              // onMouseDown fires before the input's blur — without this the
              // list would close before the click landed.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 active:bg-blue-100"
            >
              {s}
            </button>
          ))}
          {searching ? (
            <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
          ) : null}
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}
