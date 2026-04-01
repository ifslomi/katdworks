import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePortfolioData } from '../hooks/usePortfolioData';

export function Footer() {
  const { data } = usePortfolioData();
  const currentYear = new Date().getFullYear();
  const [activeModal, setActiveModal] = useState<null | 'privacy' | 'terms'>(null);

  if (!data) return null;

  return (
    <>
      <footer className="w-full py-8 md:py-12 px-6 md:px-8 bg-surface-container border-t border-outline-variant/30">
        <div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto gap-8">
          <div className="text-center md:text-left">
            <div className="font-headline font-bold text-2xl text-primary mb-2 flex items-center justify-center md:justify-start gap-3">
              <img
                src={data.ui.footerLogoUrl || '/favicon.svg'}
                alt="Footer brand"
                className="w-8 h-8 rounded-lg object-cover border border-outline-variant/20"
                referrerPolicy="no-referrer"
              />
              {data.ui.footerTitle}
            </div>
            <p className="text-secondary font-body text-sm">© {currentYear} {data.ui.footerTitle}. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <button
              onClick={() => setActiveModal('privacy')}
              className="text-secondary font-medium hover:text-primary transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setActiveModal('terms')}
              className="text-secondary font-medium hover:text-primary transition-colors cursor-pointer"
            >
              Terms of Service
            </button>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setActiveModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low">
                <h3 className="font-headline text-xl font-bold text-primary">
                  {activeModal === 'privacy' && 'Privacy Policy'}
                  {activeModal === 'terms' && 'Terms of Service'}
                </h3>
                <button onClick={() => setActiveModal(null)} className="text-secondary hover:text-primary">
                  <span className="material-symbols-outlined" data-icon="close">close</span>
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm text-on-surface-variant max-h-[70vh] overflow-y-auto">
                {activeModal === 'privacy' && (
                  <div className="space-y-4">
                    <p className="text-primary font-semibold">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    
                    <div>
                      <h4 className="font-semibold text-primary mb-2">1. Introduction</h4>
                      <p>This portfolio website ("Site") is operated by {data.ui.footerTitle}. This Privacy Policy explains how we collect, use, and protect information when you visit our Site.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">2. Information We Collect</h4>
                      <p>We collect minimal information to improve your experience:</p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li><strong>Analytics Data:</strong> We collect anonymous usage data including page views, time spent on site, and referral sources to understand how visitors interact with our portfolio.</li>
                        <li><strong>Contact Information:</strong> If you submit a contact form or inquiry, we collect the information you provide (name, email, message) solely to respond to your request.</li>
                        <li><strong>Cookies:</strong> We use minimal cookies to track visitor sessions and improve site functionality.</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">3. How We Use Your Information</h4>
                      <p>Information collected is used to:</p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li>Respond to inquiries and communication requests</li>
                        <li>Improve website content and user experience</li>
                        <li>Analyze site traffic and visitor behavior</li>
                        <li>Maintain site security and prevent abuse</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">4. Data Sharing</h4>
                      <p>We do not sell, trade, or rent your personal information to third parties. Analytics data is processed through Firebase and may be subject to Google's privacy policies. We may share information only when required by law or to protect our rights.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">5. Data Security</h4>
                      <p>We implement reasonable security measures to protect your information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">6. Your Rights</h4>
                      <p>You have the right to request access to, correction of, or deletion of any personal information we hold about you. Contact us using the information provided on this Site.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">7. Contact</h4>
                      <p>For privacy-related questions or concerns, please contact us through the contact form on this Site or via the email address provided in the Contact section.</p>
                    </div>
                  </div>
                )}

                {activeModal === 'terms' && (
                  <div className="space-y-4">
                    <p className="text-primary font-semibold">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    
                    <div>
                      <h4 className="font-semibold text-primary mb-2">1. Acceptance of Terms</h4>
                      <p>By accessing and using this portfolio website, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use this Site.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">2. Use of Site</h4>
                      <p>This Site is a professional portfolio showcasing work, experience, and capabilities. You may:</p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li>View and browse the portfolio content</li>
                        <li>Download the portfolio PDF for personal review</li>
                        <li>Contact us for professional inquiries</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">3. Intellectual Property</h4>
                      <p>All content on this Site, including but not limited to text, images, graphics, logos, and design elements, is the property of {data.ui.footerTitle} and is protected by copyright and intellectual property laws. You may not reproduce, distribute, or create derivative works without explicit written permission.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">4. Portfolio Content</h4>
                      <p>Work samples and project descriptions are provided for informational purposes. Some projects may have been completed in collaboration with others or for previous employers/clients. All work is presented in accordance with applicable confidentiality agreements.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">5. Prohibited Uses</h4>
                      <p>You agree not to:</p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li>Use the Site for any unlawful purpose</li>
                        <li>Attempt to gain unauthorized access to any part of the Site</li>
                        <li>Copy, scrape, or harvest content without permission</li>
                        <li>Transmit viruses, malware, or harmful code</li>
                        <li>Impersonate or misrepresent your affiliation with any person or entity</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">6. External Links</h4>
                      <p>This Site may contain links to external websites. We are not responsible for the content, privacy policies, or practices of third-party sites.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">7. Disclaimer of Warranties</h4>
                      <p>This Site is provided "as is" without warranties of any kind, either express or implied. We do not guarantee that the Site will be error-free, uninterrupted, or free of viruses.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">8. Limitation of Liability</h4>
                      <p>To the fullest extent permitted by law, {data.ui.footerTitle} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of this Site.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">9. Changes to Terms</h4>
                      <p>We reserve the right to modify these Terms of Service at any time. Continued use of the Site after changes constitutes acceptance of the modified terms.</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-primary mb-2">10. Contact</h4>
                      <p>For questions about these Terms of Service, please contact us through the contact form on this Site.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
