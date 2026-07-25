"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { CIVILIZATION_FLAGS, CIVILIZATIONS, type Civilization } from "@/lib/aoe4/civilizations";
import { formatCivilization } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CivilizationSelect({
  defaultValue,
  name = "civilization",
  placeholder = "Any civilization",
}: {
  defaultValue?: string;
  name?: string;
  placeholder?: string;
}) {
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
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-sm border border-[#2b332f] bg-[#0b0e0d] px-3 text-left text-sm text-[#e8e3d4] outline-none transition hover:border-gold"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <Image
              src={CIVILIZATION_FLAGS[selected]}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : null}
          <span className={cn("truncate", !selected && "text-[#686d66]")}>
            {selected ? formatCivilization(selected) : placeholder}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#777b74]" />
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-sm border border-[#2b332f] bg-[#121715] p-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setValue("");
              setOpen(false);
            }}
            className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-[#d0cec4] hover:bg-[#1b211e]"
          >
            {placeholder}
          </button>
          {CIVILIZATIONS.map((civ) => (
            <button
              key={civ}
              type="button"
              onClick={() => {
                setValue(civ);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-[#d0cec4] hover:bg-[#1b211e]"
            >
              <Image
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
