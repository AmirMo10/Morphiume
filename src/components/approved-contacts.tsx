"use client";
import { useEffect, useState } from "react";
import { api } from "./commerce-client";
type Contacts = { contactPhone: string | null; email: string | null; address: string | null };
export function ApprovedContacts() {
  const [contacts, setContacts] = useState<Contacts | null>(null);
  useEffect(() => { api<Contacts>("/api/settings").then(setContacts).catch(() => {}); }, []);
  if (!contacts || (!contacts.contactPhone && !contacts.email && !contacts.address)) return null;
  return <address className="approved-contacts">{contacts.contactPhone && <p>تلفن: <bdi dir="ltr">{contacts.contactPhone}</bdi></p>}{contacts.email && <p>ایمیل: <bdi dir="ltr">{contacts.email}</bdi></p>}{contacts.address && <p>{contacts.address}</p>}</address>;
}
