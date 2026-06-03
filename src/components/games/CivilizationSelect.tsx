"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CIVILIZATION_FLAGS, CIVILIZATIONS, type Civilization } from "@/lib/aoe4/civilizations";
import { formatCivilization } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CivilizationSelect({ defaultValue }: { defaultValue?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = value ? (value as Civilization) : null;

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name="civilization" value={value} />
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-900 px-3 text-left text-white outline-none transition hover:border-white/20"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <img
              src={CIVILIZATION_FLAGS[selected]}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : null}
          <span className={cn("truncate", !selected && "text-slate-400")}>
            {selected ? formatCivilization(selected) : "Any civilization"}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-white/10 bg-slate-950 p-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setValue("");
              setOpen(false);
            }}
            className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-slate-300 hover:bg-white/10"
          >
            Any civilization
          </button>
          {CIVILIZATIONS.map((civ) => (
            <button
              key={civ}
              type="button"
              onClick={() => {
                setValue(civ);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
            >
              <img
                src={CIVILIZATION_FLAGS[civ]}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded-full object-cover"
              />
              <span className="truncate">{formatCivilization(civ)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
