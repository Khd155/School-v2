"use client";

import { useState } from "react";
import { useAdminApi } from "./AdminContext";
import { LogoutIcon } from "../icons";

export function LogoutButton() {
  const api = useAdminApi();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await api("/api/admin/logout", {});
        window.location.href = "/admin/login";
      }}
    >
      <LogoutIcon />
      خروج
    </button>
  );
}
