"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onTurnstileReady?: () => void;
  }
}

const SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileReady";

/**
 * Cloudflare Turnstile (rule 8, issue #13), loaded only on the step that sends a code. The
 * widget adds a hidden `cf-turnstile-response` field to the surrounding form, which the server
 * verifies. The script is added by this component, so the page's nonce-based CSP trusts it
 * ('strict-dynamic'); its origin is allowed on /registration pages only (src/lib/csp.ts).
 */
export function Turnstile({ siteKey }: { siteKey: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    const render = () => {
      if (!container.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        size: "flexible",
        appearance: "always",
      });
    };
    if (window.turnstile) {
      render();
    } else {
      window.onTurnstileReady = render;
      if (!document.querySelector(`script[src="${SCRIPT}"]`)) {
        const script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        document.head.appendChild(script);
      }
    }
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-[65px]" />;
}
