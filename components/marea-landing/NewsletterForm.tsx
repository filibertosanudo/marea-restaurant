"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { STR, type Lang } from "./content";
import { subscribeAction } from "@/lib/newsletter/actions";

type SubmitState = "idle" | "submitting" | "success" | "error" | "invalid";

export function NewsletterForm({ lang }: { lang: Lang }) {
  const t = STR[lang].footer;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    const result = await subscribeAction(email, lang);
    if (result.ok) {
      setState("success");
      setEmail("");
      return;
    }
    setState(result.error === "invalid_input" ? "invalid" : "error");
  }

  if (state === "success") {
    return <p className="ml-news-success">{t.subscribeSuccess}</p>;
  }

  return (
    <>
      <form className="ml-news" onSubmit={handleSubmit}>
        <div className="field">
          <Input
            id="news-email"
            label=""
            placeholder={t.emailPh}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button variant="secondary" type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? t.subscribing : t.subscribe}
        </Button>
      </form>
      {(state === "error" || state === "invalid") && (
        <p role="alert" className="ml-news-error">
          {state === "invalid" ? t.invalidEmail : t.subscribeError}
        </p>
      )}
      <Link href="/privacidad" className="ml-news-privacy">
        {t.privacyNotice}
      </Link>
    </>
  );
}
