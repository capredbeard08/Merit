import Link from "next/link";
import MeritMark from "@/components/MeritMark";

const sections = [
  {
    title: "1. Who we are and what this policy covers",
    body: [
      "MERIT (“MERIT”, “we”, “us” or “our”) provides customer-feedback workflows and customer-intelligence tools to organisations, including establishments and corporations. This Privacy Policy explains how personal data may be collected, used, disclosed, stored and protected when you visit our website, create or use a MERIT workspace, receive a feedback request sent through a MERIT customer, submit feedback, contact us, or otherwise interact with our services.",
      "This policy is intended to cover both people who use MERIT on behalf of an organisation (“workspace users”) and people whose information is submitted to, collected through, or processed by a customer’s MERIT workspace (“respondents” or “customers”). Different rules apply depending on the context and on whether MERIT or a business customer determines the purposes and means of processing.",
      "MERIT is being developed and its features, integrations and providers may change. We will update this notice when our actual practices materially change. A description of a possible or planned feature is not a representation that the feature is currently enabled or available."
    ]
  },
  {
    title: "2. Our role: service provider, controller and processor",
    body: [
      "When an organisation uses MERIT to manage its customer relationships, feedback and operational insights, that organisation generally decides why customer information is collected and what it is used for. In that situation, the organisation is typically the controller or equivalent business under applicable law, and MERIT generally processes information on the organisation’s instructions to provide the service.",
      "MERIT may act as a controller for information it handles for its own purposes, such as workspace account administration, service security, billing if introduced, website operations, support, product communications and compliance with legal obligations. The legal role depends on the activity and applicable law, not simply on the label used in this policy.",
      "If you received a feedback request from a business using MERIT, that business is usually the best first contact for questions about why it contacted you, the service you received, its feedback practices, or how it uses your response. We will help route or respond to privacy requests where appropriate and where we are able to identify the relevant workspace and data."
    ]
  },
  {
    title: "3. Information we may collect",
    body: [
      "Account and workspace information: name, work email address, authentication identifiers, workspace or organisation name, role, membership, invitation status, preferences and account settings. Passwords and authentication secrets should be handled by the authentication system; we do not intend to display plaintext passwords to workspace members.",
      "Customer and feedback information: contact details supplied by a workspace customer, service or appointment context, dates and status of feedback requests, delivery and interaction events, survey answers, ratings, written comments, follow-up messages and information an organisation chooses to associate with a customer or service event.",
      "Business operations information: branch or location identifiers, team-member and permission records, service-completion events, integration configuration, webhook events, audit events and actions taken by workspace users. These records may be used to operate workflows, investigate problems, maintain accountability and protect workspaces.",
      "Files and content: files a user deliberately uploads, file names, file type, size, storage identifiers, access permissions, security or quarantine status, and content needed to provide the requested file or analysis feature. Do not upload information you are not authorised to share or information that is unnecessary for the task.",
      "Technical and usage information: IP address, browser and device details, approximate timestamps, request and error logs, authentication and security events, and information about how the service is accessed. Hosting, security or analytics providers may independently process some technical data under their own terms where applicable.",
      "Support and communications: messages and attachments you send to us, the contact details used to reply, and relevant records of troubleshooting or privacy requests.",
      "Integration data: information received from a service or platform you connect to MERIT, which may include identifiers, service status, appointment or transaction references, and event metadata necessary for the integration you enabled. The exact fields depend on the provider and your configuration.",
      "We do not ask users to submit sensitive personal information unless a specific lawful use case is supported and the organisation has established the necessary safeguards. Avoid placing health information, payment-card details, government identifiers, passwords, children’s information or other highly sensitive information in free-text feedback or uploaded files unless it is strictly necessary, lawful and specifically authorised."
    ]
  },
  {
    title: "4. How information reaches us",
    body: [
      "We may receive information directly from you when you register, use a workspace, submit feedback, upload a file, configure an integration, or contact support.",
      "We may receive customer or service-event information from the organisation that uses MERIT, including through an integration, API or webhook configured by that organisation. A business using MERIT is responsible for having an appropriate legal basis, providing required notices, and obtaining any permissions or consents required for the data it submits.",
      "We may receive technical information automatically when a browser or device communicates with our service. We may also receive information from infrastructure, authentication, email-delivery, database, security and other providers needed to operate the service."
    ]
  },
  {
    title: "5. Why we use information",
    body: [
      "We use information to create and administer accounts and workspaces; authenticate users; enforce membership and role-based access; deliver feedback requests and related service messages; receive and display responses; maintain activity histories; generate summaries and operational insights requested by an organisation; store and retrieve authorised files; operate integrations; provide support; diagnose errors; detect abuse, fraud or security incidents; maintain audit records; improve reliability and usability; comply with applicable law; and establish, exercise or defend legal claims.",
      "We may use limited, aggregated or de-identified information to understand service performance and improve MERIT, provided it is handled in a way consistent with applicable law and the commitments made to the relevant customer. We do not intend to sell customer feedback or personal data, and we do not use customer content for unrelated advertising.",
      "We do not use feedback summaries or automated insights as a substitute for an organisation’s own judgement. Organisations are responsible for reviewing insights and making their own operational decisions."
    ]
  },
  {
    title: "6. Legal bases for processing",
    body: [
      "Where a law requires a legal basis, the applicable basis depends on the activity and jurisdiction. It may include performance of a contract or steps requested before entering one; compliance with a legal obligation; consent where validly obtained; legitimate interests such as service security, support and product reliability where those interests are not overridden by individual rights; or another basis permitted by law.",
      "For customer information processed on behalf of a business customer, that customer is responsible for determining and documenting the appropriate basis for its collection and use. Where processing relies on consent, the party responsible for obtaining consent must make the choice clear and provide a practical way to withdraw it. Withdrawal does not invalidate processing that lawfully occurred before withdrawal, and another legal basis may apply to some records.",
      "We will not treat this general description as a substitute for the more specific notice that may be required for a particular feature, integration, jurisdiction or category of information."
    ]
  },
  {
    title: "7. Feedback requests, email and messaging",
    body: [
      "A workspace may use MERIT to send a feedback request after a service or other event. The organisation using MERIT determines the audience, purpose and timing of its workflow, and must ensure it is lawful, proportionate and consistent with any promises made to its customers.",
      "We may process contact details and delivery events such as queued, sent, delivered, bounced, clicked or replied where supported by the configured provider. These records help the organisation understand the status of a request and help diagnose delivery problems. A status event does not necessarily prove that a person read or understood a message.",
      "Feedback or operational messages are not automatically permission to send unrelated marketing. Where a message is promotional or local law gives the recipient an opt-out right, the responsible sender must honour that requirement. You can contact the business that sent a request to ask why you received it or to ask that it stop contacting you.",
      "Email and messaging delivery depends on third-party systems, network conditions, recipient settings and provider rules. MERIT cannot guarantee delivery, timing or inbox placement."
    ]
  },
  {
    title: "8. Artificial intelligence and analytics",
    body: [
      "Where AI-powered features are enabled, MERIT may process feedback text and related context to group recurring themes, summarise trends, highlight operational patterns or produce suggestions for authorised workspace users. The exact inputs and outputs depend on the feature and the configuration used by the workspace.",
      "AI-generated results may be incomplete, inaccurate, biased or misleading. They should be treated as assistance, not as verified facts or professional advice. An organisation should check material conclusions against the underlying context before acting on them.",
      "Access to customer-level information and insights should be limited by workspace membership and permissions. A user should not receive access to another workspace’s information merely because they use MERIT. We aim to minimise unnecessary exposure of raw customer data when presenting aggregate insights, but aggregation does not always guarantee that an individual cannot be identified.",
      "MERIT’s current AI feedback-analysis implementation uses Groq’s API when the feature is enabled and a Groq API key is configured. To generate an analysis, MERIT sends a limited set of recent feedback ratings and written feedback text, together with aggregate response counts and rating averages. It does not intentionally send customer names, email addresses, phone numbers, workspace identifiers or individual feedback timestamps as part of this AI request. MERIT applies automated pattern-based redaction to email addresses and phone-number-like strings in feedback text before sending it, but this filtering may miss personal information or redact text incorrectly; do not treat it as a guarantee of anonymisation. Feedback text may itself identify a person or contain sensitive information, so workspace users should avoid submitting unnecessary personal or sensitive details.",
      "Groq processes the information it receives to return the requested AI response. The transfer is to an external provider and may involve processing outside the country where the workspace or respondent is located. Groq’s applicable privacy notice, API terms, retention settings and data-use commitments govern its handling of the request; these terms and the account configuration must be checked before launch and whenever they change. MERIT does not promise that Groq never retains submitted data or never uses data for model improvement unless that commitment has been verified for the specific service and configuration in use. The AI API key is intended to remain server-side and must not be exposed in the browser or included in client responses.",
      "MERIT stores the generated insight in the relevant workspace, including the summary, themes, recommendations and limited aggregate evidence needed to display it. Authorised workspace users may be able to view those results according to their permissions. Generated insights may reproduce or infer details from the source feedback, so they should be handled with the same care as other customer information. Workspace administrators should enable AI features only when they have authority to process the relevant feedback and have provided any notices or obtained any consent required by applicable law.",
      "MERIT is not intended to make solely automated decisions that produce legal or similarly significant effects on individuals. If a feature is introduced that does so, we will provide additional information and safeguards where required by law."
    ]
  },
  {
    title: "9. File uploads and content safety",
    body: [
      "Uploaded files may be stored using managed storage infrastructure and made available only to users authorised for the relevant workspace, subject to the permissions and implementation of the feature. File names, metadata and content may be processed to store, scan, classify, retrieve or analyse the file when those operations are part of the requested service.",
      "Files may be rejected, restricted or quarantined if their type or behaviour presents a security risk. Uploading a file does not grant MERIT ownership of it. You and your organisation retain whatever rights you have in uploaded content, while granting the limited permissions necessary to host, process and display it for the service you requested.",
      "You are responsible for having the rights and authority to upload content and for checking that it does not unlawfully disclose another person’s information, infringe intellectual-property rights or contain malicious code. Never upload executable files or credentials unless a specific supported workflow expressly requires them.",
      "No online storage system can be guaranteed perfectly secure. Do not use MERIT as the sole repository for a critical original file, and maintain your own lawful backups where appropriate."
    ]
  },
  {
    title: "10. How we share information",
    body: [
      "We may disclose information to infrastructure and service providers that help us host, secure, authenticate, store, deliver messages, process integrations, support customers or provide enabled AI features. These providers should receive only information reasonably needed for their function and are subject to applicable contractual, confidentiality and data-protection requirements.",
      "We may share information with the organisation that controls the workspace and with its authorised users, in accordance with its settings, roles, permissions and instructions. If you submit feedback to a business, that business will generally receive your response and may associate it with the service interaction. Do not assume feedback is anonymous unless the relevant survey or business clearly says so.",
      "We may disclose information where reasonably necessary to comply with a valid legal obligation or lawful request, protect rights and safety, investigate suspected abuse, enforce agreements, or establish or defend legal claims. Where lawful and appropriate, we will seek to limit the disclosure to what is required.",
      "If MERIT is involved in a merger, acquisition, financing, restructuring or sale of assets, information may be transferred as part of that transaction subject to appropriate safeguards and applicable law.",
      "We do not sell personal information for money. We do not share personal information for cross-context behavioural advertising as a business model. If our practices change in a way that triggers a legal notice or opt-out obligation, we will provide the disclosures and controls required by law before relying on that practice."
    ]
  },
  {
    title: "11. Cookies, local storage and similar technologies",
    body: [
      "MERIT may use strictly necessary cookies or similar technologies to maintain authentication, security, session state and essential preferences. These technologies help the service work and may not be optional where they are strictly necessary.",
      "Depending on the features deployed, service providers may also use technical logs or measurement technologies to diagnose errors, prevent abuse or understand service reliability. We do not claim that optional analytics or advertising cookies are currently used unless they are actually enabled.",
      "You can control cookies through your browser settings, although blocking necessary technologies may prevent sign-in or other parts of the service from working. Where consent is legally required for a non-essential technology, it should not be activated before the required choice is obtained."
    ]
  },
  {
    title: "12. Security safeguards",
    body: [
      "We aim to apply reasonable technical and organisational safeguards appropriate to the nature of the information and the risks involved. Depending on the deployed feature, these may include encrypted transport, authentication controls, workspace separation, access permissions, secret management, logging, restricted administrative access, dependency updates, backups and security monitoring.",
      "Security depends on both MERIT and its users. Workspace administrators should assign the minimum permissions needed, promptly remove access when someone leaves, protect account credentials, secure integration tokens and notify us if they suspect unauthorised access. Do not share passwords or private API keys in support messages.",
      "No method of transmission, storage or processing is completely secure. We cannot promise that unauthorised access, loss or disclosure will never occur. If we become aware of a personal-data breach, we will assess it and make notifications required by applicable law and our contractual commitments."
    ]
  },
  {
    title: "13. Retention and deletion",
    body: [
      "We retain personal data only for as long as reasonably necessary for the purposes described in this policy, including providing the service, maintaining security and auditability, resolving disputes, enforcing agreements and meeting legal obligations. Actual retention periods depend on the data type, workspace settings, applicable law, technical requirements and any agreement with the organisation using MERIT.",
      "When information is no longer required, we aim to delete it, anonymise it or securely restrict it, subject to lawful exceptions and technical limitations. Residual copies may remain temporarily in protected backups or logs until those systems rotate or are securely overwritten. Audit, fraud-prevention, billing or legal records may need to be retained for a longer period where permitted or required by law.",
      "Workspace administrators should use available product controls to correct or delete records where supported and should contact us for assistance when a record cannot be managed through the interface. Deleting an account or workspace may not immediately remove every record held by an organisation, provider, backup or legal record system. We will explain material limitations when responding to a valid request.",
      "A business customer may have separate obligations to retain or delete customer feedback. If you are a respondent, contact that business about its records; MERIT will assist as appropriate under the applicable service arrangement."
    ]
  },
  {
    title: "14. International data transfers",
    body: [
      "MERIT and its providers may process or store information in countries other than the country where you live or where the organisation using MERIT is located. The country and location may depend on hosting configuration, provider infrastructure, support arrangements and enabled integrations.",
      "Where applicable law restricts international transfers, we will seek to use a lawful transfer mechanism and appropriate safeguards, which may include contractual protections, adequacy decisions or another recognised mechanism. You may contact us for further information about the safeguards relevant to a particular transfer, subject to security and confidentiality limitations."
    ]
  },
  {
    title: "15. Your privacy rights",
    body: [
      "Depending on your location and the applicable law, you may have the right to request access to personal data, receive information about how it is used, correct inaccurate information, request deletion, restrict or object to certain processing, receive a portable copy, withdraw consent, opt out of certain uses or disclosures, and complain to a competent data-protection authority. Some rights are subject to exceptions, identity verification and the rights of other people.",
      "To make a request about information controlled by a business using MERIT, contact that business first. If you contact MERIT directly, tell us which organisation or workspace is involved, what information you are asking about and how we can safely verify your identity. Do not send passwords, full identity-document numbers or other unnecessary sensitive information in an initial request.",
      "We may need to verify your identity or authority before acting, and may refer a request to the relevant workspace administrator or controller. We will respond within the time required by applicable law. If we cannot fulfil a request, we will explain the reason where legally permitted and describe any available review or complaint options.",
      "We do not intend to discriminate against people for exercising applicable privacy rights. A business customer remains responsible for responding to requests for data it controls, and MERIT will provide reasonable assistance consistent with our role and agreements."
    ]
  },
  {
    title: "16. Additional information for certain jurisdictions",
    body: [
      "Nigeria: We aim to handle personal data consistently with applicable Nigerian data-protection law, including the Nigeria Data Protection Act 2023 where it applies. This includes attention to lawful and fair processing, transparency, purpose limitation, data minimisation, accuracy, storage limitation, security and accountability. Individuals may have rights under the Act and may be able to raise concerns with the Nigeria Data Protection Commission.",
      "European Economic Area and United Kingdom: Where the GDPR or UK GDPR applies, the rights and lawful bases available to you depend on the circumstances. You may also have the right to complain to your local supervisory authority. Where MERIT acts only as a processor for a business, requests concerning that business’s processing may need to be directed to it.",
      "California and other United States states: Where a state privacy law applies, residents may have rights such as knowing, accessing, correcting or deleting covered personal information, and opting out of certain sales, sharing or targeted advertising. The precise rights, thresholds, exceptions and required notices vary. We do not state that every statutory obligation applies to MERIT in every jurisdiction, and we will provide additional notices or controls when legally required.",
      "These jurisdictional summaries are general information, not a claim that MERIT has established every registration, representative, assessment, contract, notice or compliance programme that a particular law may require. Applicability depends on the facts, our size and activities, the data involved and the law in force."
    ]
  },
  {
    title: "17. Children and age restrictions",
    body: [
      "MERIT is a business service and is not designed for children to create accounts independently. Workspace administrators should not knowingly submit children’s personal data unless the use is lawful, necessary for a supported purpose and accompanied by any safeguards and authorisations required by law. If you believe a child’s information has been submitted to MERIT inappropriately, contact us so we can assess the request."
    ]
  },
  {
    title: "18. Third-party websites and services",
    body: [
      "MERIT may link to or integrate with third-party websites and platforms. Those services operate under their own privacy notices and terms, and MERIT does not control their independent practices. Reviewing a provider’s privacy notice and configuration is important before connecting an account or enabling an integration.",
      "A connection to a third-party service may be disabled or disconnected through available controls or by contacting the relevant administrator. Disconnection may stop future transfers but does not automatically delete data already held by the third party or data previously imported into a MERIT workspace."
    ]
  },
  {
    title: "19. Changes to this policy",
    body: [
      "We may update this Privacy Policy to reflect changes in the service, technology, providers, law or our data practices. The “Last updated” date at the top indicates when this notice was most recently revised. Where required by law, we will give additional notice or seek consent before a material change takes effect.",
      "Your continued use of MERIT after an updated policy takes effect does not replace any consent that the law requires us to obtain separately."
    ]
  },
  {
    title: "20. Contact and privacy requests",
    body: [
      "For privacy questions, requests or concerns, contact meritsupportdesk@gmail.com and include “Privacy request” in the subject line. Please identify the relevant workspace or organisation and describe your request without including unnecessary sensitive information.",
      "MERIT’s operating legal entity, registered address and any designated data-protection officer or representative should be added here once formally confirmed. The support email is a contact channel, not a substitute for any additional company identity or representative information required by applicable law."
    ]
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen px-6 py-7 md:px-12 md:py-10">
      <article className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dfe4df] pb-6">
          <Link href="/" aria-label="MERIT home" className="merit-brand">
            <MeritMark size={40} />
            <span className="merit-brand-name">MERIT</span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#315b49] hover:underline">
            Back to home
          </Link>
        </header>

        <div className="py-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#47795f]">
            Trust and privacy
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#17211c] md:text-6xl">
            Privacy Policy
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[#69756e]">
            A detailed explanation of how MERIT handles information across our website,
            workspaces, feedback workflows and related services.
          </p>
          <p className="mt-4 text-sm text-[#69756e]">Last updated: 23 October 2026</p>
          <div className="mt-8 rounded-2xl border border-[#dfe4df] bg-white/55 p-5 text-sm leading-7 text-[#526158]">
            <strong className="text-[#17211c]">Please read this notice carefully.</strong>{" "}
            This policy describes our intended approach to privacy, but it does not replace
            a contract, a workspace-specific notice or legal advice. MERIT is still evolving;
            details about providers, retention periods, company identity and enabled features
            must be checked against the live service before launch and updated when they change.
          </div>
        </div>

        <nav aria-label="Privacy policy contents" className="mb-12 rounded-2xl border border-[#dfe4df] bg-white/45 p-6">
          <h2 className="text-lg font-semibold text-[#123c2d]">In this policy</h2>
          <ol className="mt-4 grid gap-x-8 gap-y-2 text-sm text-[#526158] sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.title}>
                <a className="hover:text-[#123c2d] hover:underline" href={`#section-${index + 1}`}>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-10">
          {sections.map((section, index) => (
            <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-8">
              <h2 className="text-2xl font-semibold tracking-tight text-[#123c2d]">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-[15px] leading-8 text-[#526158]">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-col gap-4 border-t border-[#dfe4df] py-8 text-sm text-[#69756e] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} MERIT. Customer intelligence, quietly automated.</span>
          <Link href="/" className="font-semibold text-[#315b49] hover:underline">Return to MERIT</Link>
        </footer>
      </article>
    </main>
  );
}
