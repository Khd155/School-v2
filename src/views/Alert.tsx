import type { Child } from "hono/jsx";
import { AlertIcon, CheckCircleIcon, InfoIcon } from "./icons";

type Tone = "error" | "warning" | "success" | "info";

export function Alert({
  tone,
  title,
  children,
  id,
}: {
  tone: Tone;
  title?: string;
  children?: Child;
  id?: string;
}) {
  const Icon = tone === "success" ? CheckCircleIcon : tone === "info" ? InfoIcon : AlertIcon;
  return (
    <div className={`alert alert-${tone}`} id={id} role={tone === "error" ? "alert" : "status"}>
      <Icon />
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}
