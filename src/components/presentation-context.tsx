"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { PresentationDto } from "@/contracts/presentation";

const Context = createContext<PresentationDto | null>(null);
export function PresentationProvider({ value, children }: { value: PresentationDto; children: ReactNode }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useStorePresentation() { return useContext(Context); }
