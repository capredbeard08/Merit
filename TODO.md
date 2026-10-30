# MERIT unfinished work

This list is based on the attached website audit. Timing references are intentionally omitted; the November deadline is not treated as a constraint.

## Verified in current implementation pass

- [x] Baseline response headers: no sniffing, frame denial, referrer policy, permissions policy, and a restrictive content security policy.
- [x] Executable, script, traversal, hidden-file, and ambiguous-binary upload blocking.
- [x] Quarantined upload events recorded by the Security Warden.
- [x] Audit metadata sanitization and bounded request context.
- [x] Six security regression tests passing and production build passing.
- [x] Dedicated `files:manage` permission for administrator-level upload and deletion operations.
- [x] Audited branch, feedback-status, invitation, member, workspace, and file mutations.
- [x] File deletion removes the private blob object and the database record.

## Public positioning and product proof

- [ ] Rewrite the hero around the customer-feedback operations workflow: collect feedback consistently, identify recurring issues, and improve operations.
- [ ] Add an above-the-fold product proof visual or workflow example that explains the product in under five seconds.
- [ ] Add a three-step “How it works” section: completed service, feedback request, operational insight.
- [ ] Add concrete use cases for service businesses without claiming a narrower vertical until selected.
- [ ] Rewrite capability cards around operational outcomes rather than abstract feature labels.
- [ ] Standardize the primary CTA as “Create your workspace” and add only verified setup reassurance.
- [ ] Expand the footer with product, company, legal, and contact destinations.

## Trust and legal

- [ ] Publish specific privacy safeguards only when they match the deployed implementation and contracts.
- [ ] Replace the privacy policy’s legal-identity placeholder after the owner supplies the operating entity, registered address, and representative details.
- [ ] Add Terms of Service.
- [ ] Add a security/trust page with verified claims.
- [ ] Add a clear privacy request and data-deletion route.
- [ ] Document subprocessors/providers after the deployed configuration is confirmed.

## Authentication and accessibility

- [ ] Add explicit `id`/`for` associations to signup and sign-in fields.
- [ ] Add `aria-describedby` relationships for helper and error text.
- [ ] Preserve the explicit 12-character password rule in markup and server validation.
- [ ] Make sign-in mode visually explicit and provide a password-reset path.
- [ ] Verify duplicate-account, invalid-input, server-failure, successful-signup, and sign-in states.
- [ ] Ensure errors are adjacent, specific, text-based, and announced to assistive technology.
- [ ] Run automated contrast and accessibility checks, then test keyboard and screen-reader flows.

## SEO and technical

- [ ] Add canonical URL metadata.
- [ ] Add Open Graph/Twitter metadata and a branded social preview image.
- [ ] Add `robots.txt` and `sitemap.xml`.
- [ ] Add a web manifest if an installable app experience is intended.
- [ ] Keep auth and private application routes out of indexing.
- [ ] Add and synchronize the route manifest required by the web project.

## Validation

- [ ] Verify direct loading of `/`, `/auth`, `/privacy`, terms, trust, and public feedback routes.
- [ ] Validate the authenticated app primarily at 1280 and 1440 pixel desktop widths for macOS and Windows PCs.
- [ ] Test 320, 375, and 768 pixel responsive fallbacks for public pages, auth, invitations, and customer feedback submission.
- [ ] Test Chrome, Safari, and Firefox where available.
- [ ] Test visible focus, reduced motion, form errors, cold uncached loads, and route refresh behavior.
- [ ] Run security tests, type diagnostics, production build, and endpoint checks before delivery.
