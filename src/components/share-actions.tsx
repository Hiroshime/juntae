"use client";

import { useState } from "react";

type ShareActionsProps = {
  title: string;
  text: string;
  path: string;
};

export function ShareActions({ title, text, path }: ShareActionsProps) {
  const [message, setMessage] = useState("");

  function absoluteUrl() {
    return new URL(path, window.location.origin).toString();
  }

  async function share() {
    const url = absoluteUrl();
    setMessage("");

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        setMessage("Compartilhado.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage("Não foi possível abrir o compartilhamento.");
      }
      return;
    }

    const whatsappText = `${text}\n\n${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(whatsappText)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setMessage("WhatsApp aberto em uma nova aba.");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setMessage("Link copiado.");
    } catch {
      setMessage("Não foi possível copiar. Use o botão Compartilhar.");
    }
  }

  return (
    <div className="share-actions">
      <button className="button secondary" onClick={share} type="button">
        Compartilhar
      </button>
      <button className="button ghost" onClick={copyLink} type="button">
        Copiar link
      </button>
      <span aria-live="polite" className="share-message" role="status">
        {message}
      </span>
    </div>
  );
}
