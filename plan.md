# MERIT implementation plan

## Product direction

MERIT is a customer-feedback operations app for service businesses. Its core loop is: completed service → feedback request → customer response → recurring issue/theme → operational follow-up.

The authenticated application is desktop-first for macOS and Windows PCs, where managers and operations teams will spend most of their time. Public pages, sign-in, invitations, and customer feedback submission should remain responsive and usable on smaller screens.

The current visual identity remains: warm ivory, forest green, restrained typography, generous space, and calm motion. The product experience should add proof and information density without becoming a generic dashboard.

## Scope from the audit

### Public website

- Reposition the landing page around collecting feedback consistently, identifying recurring issues, and improving operations.
- Add an above-the-fold product proof visual that explains the workflow in under five seconds.
- Add a three-step “How it works” section and concrete use cases.
- Rewrite capability cards around operational outcomes.
- Add specific, verifiable privacy safeguards.
- Standardize the primary CTA as “Create your workspace” and clarify setup expectations without inventing pricing or billing claims.
- Expand the footer with product, company, legal, and contact destinations.

### Signup and access

- Add explicit input IDs and label associations.
- Add accessible helper/error relationships and password constraints.
- Make sign-in mode visibly distinct and add password reset support if the current auth provider supports it.
- Test duplicate accounts, invalid input, server failures, successful signup, and sign-in.

### Trust and legal

- Add Terms of Service and a security/trust page where claims can be verified.
- Replace the privacy-policy legal-identity placeholder only after the owner supplies the legal entity, address, and representative details.
- Document data deletion/request handling and subprocessors/providers when confirmed.

### SEO and technical

- Add canonical metadata, Open Graph/Twitter metadata, and a branded social preview asset.
- Add `robots.txt`, `sitemap.xml`, and optionally a web manifest.
- Keep auth and private app routes out of indexing.
- Add a route manifest for the web project and keep it synchronized.

### Validation

- Run type diagnostics, security tests, production build, and route checks.
- Test 320, 375, 768, and 1440 pixel widths.
- Test keyboard focus, reduced motion, form errors, direct route loads, and cold-load behavior.

## Implementation order

1. Stabilize the repository and run existing checks.
2. Add SEO endpoints and metadata.
3. Improve landing-page positioning, workflow proof, outcome copy, privacy specifics, and footer.
4. Improve signup/sign-in accessibility and error states.
5. Add public trust/legal routes without inventing missing legal facts.
6. Validate routes, build, security tests, and responsive/accessibility behavior.

## Decisions intentionally deferred

- Initial vertical: keep copy focused on service businesses until the owner selects a narrower segment.
- Pricing, free-trial, and payment claims: do not invent these.
- Legal entity/address/DPO: require owner-provided facts before publication.
- Email/SMS provider and AI provider claims: describe only the deployed configuration.
