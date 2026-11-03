import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { SITE_URL } from "@/lib/site";

const description =
  "Six Frites is an invite-only messaging app made in Madagascar: encrypted chats, voice and video calls, games with friends and anonymous messages. In English, French and Malagasy.";

export const metadata: Metadata = {
  title: "Six Frites · Chat with the people who matter",
  description,
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Six Frites",
  url: SITE_URL,
  description,
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web, Android",
  inLanguage: ["en", "fr", "mg"],
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function WelcomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
