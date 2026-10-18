import { AdminLogin } from "@/components/admin-login";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isPrivatePreviewEnabled } from "@/server/auth/private-preview";

export default async function AdminLoginPage() {
  await connection();
  if (await isPrivatePreviewEnabled()) redirect("/admin");
  return <AdminLogin />;
}
