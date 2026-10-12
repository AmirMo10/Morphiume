"use client";
import { useId } from "react";
import { iranLocations, provinceCities } from "@/lib/iran-locations";

type LocationInputProps = {
  id: string;
  kind: "province" | "city";
  value: string;
  province: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string;
};

/** Suggestions are a sourced snapshot, not an allowlist or a shipping-coverage promise. */
export function LocationInput({ id, kind, value, province, onChange, invalid = false, errorId }: LocationInputProps) {
  const suggestionId = useId();
  const listId = `location-list-${suggestionId}`;
  const helpId = `location-help-${suggestionId}`;
  const options = kind === "province" ? iranLocations : provinceCities(province);
  return <>
    <input id={id} type="text" dir="rtl" value={value} list={listId} maxLength={80} autoComplete={kind === "province" ? "address-level1" : "address-level2"} required aria-invalid={invalid} aria-describedby={[helpId, errorId].filter(Boolean).join(" ")} onChange={event => onChange(event.target.value)} />
    <datalist id={listId}>{options.map(option => <option key={option.id} value={option.name} />)}</datalist>
    <p id={helpId} className="helper">{kind === "province" ? "از پیشنهادها انتخاب کنید یا نام استان را بنویسید." : "پیشنهادهای شهر بر اساس استان انتخاب‌شده نمایش داده می‌شوند. اگر شهر شما در فهرست نیست، نام آن را بنویسید."}</p>
  </>;
}
