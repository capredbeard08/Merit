type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export async function sendEmail(input: SendEmailInput) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email provider is not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Email provider rejected the request");
  return data as { id?: string };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function feedbackEmailHtml(args: {
  customerName?: string | null;
  businessName: string;
  branchName: string;
  feedbackUrl: string;
  optOutUrl: string;
}) {
  const customerName = args.customerName ? " " + escapeHtml(args.customerName) : "";
  const businessName = escapeHtml(args.businessName);
  const branchName = escapeHtml(args.branchName);
  const feedbackUrl = escapeHtml(args.feedbackUrl);
  const optOutUrl = escapeHtml(args.optOutUrl);

  return "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#173b2f;line-height:1.6\">" +
    "<h2>" + businessName + "</h2>" +
    "<p>Hi" + customerName + ",</p>" +
    "<p>Thanks for choosing us at " + branchName + ". We'd value your honest feedback about your experience.</p>" +
    "<p><a href=\"" + feedbackUrl + "\" style=\"display:inline-block;padding:12px 18px;background:#173b2f;color:#fff;text-decoration:none;border-radius:8px\">Share your feedback</a></p>" +
    "<p>Your feedback helps us understand what we're doing well and where we can improve.</p>" +
    "<p style=\"font-size:12px;color:#718178\">If you don't want to receive future feedback requests, <a href=\"" + optOutUrl + "\">unsubscribe from feedback requests</a>.</p>" +
    "</body></html>";
}
