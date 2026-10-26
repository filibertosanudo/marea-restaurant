import type { Metadata } from "next";
import { productName } from "@/lib/product";

export function generateMetadata(): Metadata {
  return { title: productName() };
}

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
