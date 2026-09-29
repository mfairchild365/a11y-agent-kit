import React from "react";

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button style={{ background: "#2b6cb0", color: "#fff", padding: "8px 16px" }} {...props} />;
}
