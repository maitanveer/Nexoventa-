import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { whatsappUrl } from "@/lib/whatsapp";
import { OfficialLogo } from "@/components/branding/official-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <div className="brand footer-brand"><OfficialLogo variant="footer" /></div>
          <p className="footer-copy">Trusted medical billing & RCM support for healthcare teams that want cleaner claims and stronger revenue flow.</p>
        </div>
        <div className="footer-links"><strong>Explore</strong><Link href="/about">About</Link><Link href="/services">Services</Link><Link href="/training">Training</Link><Link href="/faq">FAQ</Link><Link href="/announcements">Announcements</Link><Link href="/contact">Contact</Link></div>
        <div className="footer-links"><strong>Services</strong><Link href="/services">Medical Billing</Link><Link href="/services">Revenue Cycle Management</Link><Link href="/services">Denial Management</Link><Link href="/services">Provider Credentialing</Link><Link href="/services">Billing Audits</Link><Link href="/services">Training & Mentorship</Link></div>
        <div className="footer-links"><strong>Reach us</strong><a href="tel:03169244682"><Phone size={15} /> 03169244682</a><a href={whatsappUrl()}><MessageCircle size={15} /> WhatsApp</a><a href="mailto:alijanbasharat@gmail.com"><Mail size={15} /> alijanbasharat@gmail.com</a><a className="location-link" href="https://www.google.com/maps/search/?api=1&query=Karim+Town%2C+Gilgit-Baltistan" target="_blank" rel="noopener noreferrer" aria-label="Find Karim Town, Gilgit-Baltistan on Google Maps"><MapPin size={15} /> Karim Town, Gilgit-Baltistan</a></div>
      </div>
      <div className="shell footer-bottom"><span>© 2026 Nexoventa Medical Billing & RCM</span><span><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></span></div>
    </footer>
  );
}
