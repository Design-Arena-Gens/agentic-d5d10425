"use client";

import { useId } from "react";

interface SliderControlProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}

export function SliderControl({
  label,
  min,
  max,
  step = 1,
  value,
  onChange
}: SliderControlProps) {
  const id = useId();

  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <span className="control-label">{label}</span>
      <input
        id={id}
        className="slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-800"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-xs text-neutral-600">{value}</span>
    </label>
  );
}
