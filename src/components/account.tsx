"use client";
import { useState, useSyncExternalStore } from "react";
import { customerAuth } from "./auth-clients";
import { authMessage, errorMessage, Notice, useCommerce } from "./commerce-client";
import { CustomerSessionError, invalidateCustomerPrivateState, useCustomerSession } from "./customer-session";
import { OrdersList } from "./orders";
import { PhoneVerification } from "./phone-verification";
import { AddressBook } from "./addresses";
import { WishlistContent } from "./wishlist";
import { AccountNotifications } from "./notifications";

const subscribeHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export function AccountContent() {
  const identity = useCustomerSession(), {ready,error,refreshCart} = useCommerce();
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverSnapshot);
  // Keep only the guest form alive across a same-guest check. Private account children
  // still unmount while checking; an identity/privacy scope change discards phone and code.
  const guestForm = hydrated && !identity.ownerId ? <div className="auth-page" hidden={identity.pending} inert={identity.pending}><PhoneVerification key={`${identity.ownerId ?? "guest"}:${identity.guestResetGeneration}`} paused={identity.pending} onVerified={identity.revalidate} /></div> : null;
  const content = identity.pending ? identity.error ? <CustomerSessionError /> : <p role="status">در حال بررسی حساب…</p> : identity.ownerId ? !ready ? error ? <Notice error>{error}<button className="text-button" onClick={() => void refreshCart().catch(() => {})}>بررسی دوبارهٔ سبد حساب</button></Notice> : <p role="status">در حال اتصال سبد این مرورگر به حساب…</p> : <AccountForActor key={identity.scopeKey} /> : null;
  return <>{guestForm}{content}</>;
}
function AccountForActor() {
  const session = customerAuth.useSession();
  const [tab, setTab] = useState("orders");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const profile = async () => { setBusy(true); setError(""); setNotice(""); try { const result = await customerAuth.updateUser({ name: name.trim() }); if (result.error) throw new Error(authMessage(result.error)); setNotice("نام شما ذخیره شد."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const logout = async () => { setBusy(true); setError(""); try { const result = await customerAuth.signOut(); if (result.error) throw new Error(authMessage(result.error)); invalidateCustomerPrivateState(); setName(""); setNotice(""); window.location.assign("/account"); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const revokeOthers = async () => { setBusy(true); setError(""); setNotice(""); try { const result = await customerAuth.revokeOtherSessions(); if (result.error) throw new Error(authMessage(result.error)); setNotice("ورود حساب در دستگاه‌های دیگر پایان یافت."); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  if (session.isPending) return <p role="status">در حال بررسی حساب…</p>;
  if (!session.data?.user) return <div className="auth-page"><PhoneVerification onVerified={() => { session.refetch(); }} /></div>;
  return <><div className="section-heading"><p>خوش آمدید، <bdi>{session.data.user.name}</bdi></p><button className="text-button" disabled={busy} onClick={logout}>خروج از حساب</button></div><nav className="account-nav" aria-label="بخش‌های حساب"><button className={tab === "orders" ? "" : "secondary"} onClick={() => setTab("orders")}>سفارش‌ها و پیگیری</button><button className={tab === "profile" ? "" : "secondary"} onClick={() => { setTab("profile"); setName(session.data?.user.name ?? ""); }}>مشخصات حساب</button><button className={tab === "addresses" ? "" : "secondary"} onClick={() => setTab("addresses")}>نشانی‌ها</button><button className={tab === "wishlist" ? "" : "secondary"} onClick={() => setTab("wishlist")}>علاقه‌مندی‌ها</button><button className={tab === "notifications" ? "" : "secondary"} onClick={() => setTab("notifications")}>اعلان‌های حساب</button></nav>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{tab === "orders" ? <OrdersList /> : tab === "addresses" ? <AddressBook /> : tab === "wishlist" ? <WishlistContent /> : tab === "notifications" ? <AccountNotifications /> : <section className="form-section narrow"><h2>مشخصات حساب</h2><p className="muted">تکمیل نام اختیاری است.</p><form onSubmit={e => { e.preventDefault(); profile(); }}><label htmlFor="profile-name">نام شما</label><input id="profile-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={120} /><div className="actions"><button disabled={busy || !name.trim()}>{busy ? "در حال ذخیره…" : "ذخیرهٔ نام"}</button></div></form><hr /><h2>ورود در این دستگاه</h2><p>پس از پایان کار، از حساب این دستگاه خارج شوید.</p><div className="actions"><button className="secondary" disabled={busy} onClick={logout}>خروج از این دستگاه</button><button className="secondary" disabled={busy} onClick={revokeOthers}>خروج حساب از دستگاه‌های دیگر</button></div></section>}</>;
}
