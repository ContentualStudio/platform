# Contentual product UI

The approved reference is `design/index.html`, described in `design/DESIGN-HANDOFF.md`. Production tokens are owned by `web/src/app/globals.css`; use its semantic color, typography, radius and spacing utilities. Existing shared primitives in `web/src/components/ui` own keyboard and focus behavior.

Studio lesson details use the reference's desktop modal and mobile bottom sheet, shared metadata header, inline article, Vimeo media area, PDF preview with download action, and premium upgrade gate. Content comes from the authenticated app mirror. Loading, unavailable, failed and locked states occupy the same dialog; retries preserve the surrounding library filters. Radix Dialog owns focus containment, Escape, dismissal and focus restoration. Paid content is withheld by the API, never merely concealed by UI.

Post-task lesson nudges appear inline beneath saved completion feedback, using the shared Button and dashboard tokens. Opening or dismissing clears the prompt; a server-side user/programme/category claim prevents repeat prompts across devices. Studio related-set links retain their exact lesson scope through filter changes and reuse the existing gated lesson viewer.
