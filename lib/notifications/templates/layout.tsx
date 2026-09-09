import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import type { TemplateBusiness } from "@/lib/notifications/templates/types";

const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const BRAND_COLOR = "#1B367B";

const styles = {
  body: { backgroundColor: "#F4F5F7", margin: 0, padding: "32px 0", fontFamily: FONT_STACK },
  container: {
    backgroundColor: "#FFFFFF",
    maxWidth: "480px",
    margin: "0 auto",
    borderRadius: "8px",
    overflow: "hidden",
  },
  header: { backgroundColor: BRAND_COLOR, padding: "24px 32px" },
  businessName: { color: "#FFFFFF", fontSize: "20px", fontWeight: 600, margin: 0 },
  content: { padding: "32px" },
  hr: { borderColor: "#E5E7EB", margin: "0" },
  footer: { padding: "20px 32px", color: "#6B7280", fontSize: "13px", lineHeight: "20px" },
};

/**
 * Shared shell for every template: business name in the header, whatever
 * `children` the template renders, business address/phone in the footer.
 * Plain inline styles, no Tailwind — one less dependency, and this layout
 * is simple enough that the abstraction wouldn't earn its keep.
 */
export function EmailLayout({
  previewText,
  business,
  children,
}: {
  previewText: string;
  business: TemplateBusiness;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.businessName}>{business.name}</Text>
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Hr style={styles.hr} />
          <Section style={styles.footer}>
            <Text style={{ margin: 0 }}>{business.name}</Text>
            {business.address ? <Text style={{ margin: 0 }}>{business.address}</Text> : null}
            {business.phone ? <Text style={{ margin: 0 }}>{business.phone}</Text> : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = {
  heading: { color: "#111827", fontSize: "22px", fontWeight: 600, margin: "0 0 16px" },
  paragraph: { color: "#374151", fontSize: "15px", lineHeight: "22px", margin: "0 0 16px" },
  code: {
    display: "inline-block",
    backgroundColor: "#F4F5F7",
    color: BRAND_COLOR,
    fontSize: "24px",
    fontWeight: 700,
    letterSpacing: "2px",
    padding: "12px 20px",
    borderRadius: "6px",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: BRAND_COLOR,
    color: "#FFFFFF",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 24px",
    borderRadius: "6px",
    textDecoration: "none",
    display: "inline-block",
  },
  small: { color: "#6B7280", fontSize: "13px", lineHeight: "20px", margin: "16px 0 0" },
} as const;

function footerLines(business: TemplateBusiness): string {
  return [business.name, business.address, business.phone].filter(Boolean).join("\n");
}

/** The text-email counterpart of EmailLayout's chrome — every template's plain-text body ends with this. */
export function textFooter(business: TemplateBusiness): string {
  return `\n\n---\n${footerLines(business)}`;
}
