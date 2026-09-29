import React from "react";

export function CheckoutModal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <span className="close" onClick={onClose}>x</span>
        {children}
      </div>
    </div>
  );
}
