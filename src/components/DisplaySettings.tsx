"use client";

import { useSyncExternalStore } from "react";
import { DISPLAY_KEYS } from "@/lib/display";

type Theme = "system" | "light" | "dark";
type Prefs = { theme: Theme; large: boolean; contrast: boolean };

const DEFAULTS: Prefs = { theme: "system", large: false, contrast: false };
let memory: Prefs = DEFAULTS; // used if the browser blocks localStorage
let cached: { key: string; value: Prefs } | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  let next = memory;
  try {
    const t = localStorage.getItem(DISPLAY_KEYS.theme);
    next = {
      theme: t === "light" || t === "dark" ? t : "system",
      large: localStorage.getItem(DISPLAY_KEYS.large) === "1",
      contrast: localStorage.getItem(DISPLAY_KEYS.contrast) === "1",
    };
  } catch {}
  const key = `${next.theme}|${next.large}|${next.contrast}`;
  if (cached?.key !== key) cached = { key, value: next };
  return cached.value;
}

function save(p: Prefs) {
  memory = p;
  try {
    localStorage.setItem(DISPLAY_KEYS.theme, p.theme);
    localStorage.setItem(DISPLAY_KEYS.large, p.large ? "1" : "0");
    localStorage.setItem(DISPLAY_KEYS.contrast, p.contrast ? "1" : "0");
  } catch {}
  const root = document.documentElement;
  if (p.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p.theme);
  root.classList.toggle("large", p.large);
  root.classList.toggle("contrast", p.contrast);
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function DisplaySettings() {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULTS);

  return (
    <div className="max-w-md">
      <fieldset className="mb-2">
        <legend className="mb-2 font-bold">Colour scheme</legend>
        <div className="flex overflow-hidden rounded-xl border-[1.5px] border-line">
          {THEMES.map((t) => (
            <label
              key={t.value}
              className="flex-1 cursor-pointer border-line bg-surface px-1.5 py-2.5 text-center text-[0.9em] not-first:border-l-[1.5px] has-[:checked]:bg-ink has-[:checked]:font-bold has-[:checked]:text-surface has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-(--focus)"
            >
              <input
                type="radio"
                name="theme"
                className="sr-only"
                checked={prefs.theme === t.value}
                onChange={() => save({ ...prefs, theme: t.value })}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      {(
        [
          ["large", "Larger text"],
          ["contrast", "High contrast"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex cursor-pointer items-center justify-between border-b border-line py-3">
          {label}
          <input
            type="checkbox"
            className="size-[22px] accent-teal"
            checked={prefs[key]}
            onChange={(e) => save({ ...prefs, [key]: e.target.checked })}
          />
        </label>
      ))}
      <p className="mt-2 text-[0.85em] text-ink-2">Saved on this device only.</p>
    </div>
  );
}
