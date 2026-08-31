'use client'

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSubscription } from '../hooks/useSubscription';
import { Play, Menu, X } from 'lucide-react';
import PricingModal from './PricingModal';

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', action: 'pricing' },
  { label: 'Demo', href: '/demo', external: true },
  { label: 'FAQ', href: '/#faq' },
  { label: 'Contact', href: 'mailto:batchmyphotos@gmail.com', external: true },
];

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const mobileMenuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const pathname = usePathname();
  const router = useRouter();
  const isLanding = pathname === '/';
  // Billing data + actions come from the shared hook (no duplicated fetches)
  const { subscription, loading: subLoading, createCheckout, startFreeTrial, validateCoupon } = useSubscription();

  // Handle hash links (e.g. /#faq) — scroll if on landing, navigate if not
  const handleHashClick = (e, href) => {
    e.preventDefault();
    const hash = href.split('#')[1];
    if (isLanding && hash) {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      router.push(href);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Track scroll for background transition
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on click outside
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(e.target)
      ) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [mobileOpen]);

  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push('/');
    } finally {
      setLoggingOut(false);
    }
  };

  // Pricing modal: if guest → login, if logged in → create checkout directly and redirect to PayMongo
  const handlePricingUpgrade = async (couponCode = null) => {
    if (!user) {
      setPricingOpen(false);
      router.push('/login');
      return;
    }
    try {
      setCheckoutLoading(true);
      const checkoutUrl = await createCheckout(couponCode);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      setCheckoutLoading(false);
      throw err; // PricingModal will catch this and display the error inline
    }
  };

  // Free trial activation (no payment required)
  const handleStartTrial = async () => {
    if (!user) {
      setPricingOpen(false);
      router.push('/login');
      return;
    }
    await startFreeTrial();

    // Trial activated — close modal and go to dashboard for success feedback
    // (the hook refetches the subscription; the toast flag travels via sessionStorage)
    setPricingOpen(false);
    sessionStorage.setItem('bmp_nav_state', JSON.stringify({ trialActivated: true }));
    router.push('/dashboard');
  };

  // Coupon validation for logged-in users
  const handleValidateCoupon = async (code) => {
    if (!user) return { valid: false, reason: 'Not authenticated' };
    return validateCoupon(code);
  };

  return (
    <>
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-bg-surface/80 backdrop-blur-xl border-b border-border-subtle'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <img
                src="/app_icon.png"
                alt="BatchMyPhotos"
                className="w-8 h-8 rounded-lg group-hover:scale-105 transition-transform"
              />
              <span
                className="text-base font-display font-bold tracking-tight transition-colors text-text-primary"
              >
                BatchMyPhotos
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) =>
                link.action === 'pricing' ? (
                  <button
                    key={link.label}
                    onClick={() => setPricingOpen(true)}
                    className="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  >
                    {link.label}
                  </button>
                ) : link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target={link.href.startsWith('mailto') ? undefined : '_blank'}
                    rel={link.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                    className="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  >
                    {link.label}
                  </a>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={(e) => handleHashClick(e, link.href)}
                    className="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  >
                    {link.label}
                  </a>
                )
              )}
            </div>

            {/* Desktop right side */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium px-3.5 py-2 rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-text-secondary bg-bg-elevated hover:bg-bg-surface disabled:opacity-50"
                  >
                    {loggingOut && (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {loggingOut ? 'Logging out…' : 'Logout'}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium px-3.5 py-2 rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  >
                    Login
                  </Link>
                  <a
                    href="/demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-md shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-px transition-all"
                  >
                    <Play className="w-3.5 h-3.5" /> Try Demo
                  </a>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              ref={hamburgerRef}
              className="md:hidden p-2 rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          ref={mobileMenuRef}
          className={`md:hidden overflow-hidden transition-all duration-300 ${
            mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div
            className="px-6 pb-6 pt-2 space-y-1 bg-bg-surface/95 backdrop-blur-xl border-t border-border-subtle"
          >
            {NAV_LINKS.map((link) =>
              link.action === 'pricing' ? (
                <button
                  key={link.label}
                  onClick={() => {
                    setPricingOpen(true);
                    setMobileOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                >
                  {link.label}
                </button>
              ) : link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith('mailto') ? undefined : '_blank'}
                  rel={link.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                  className="block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                  onClick={(e) => {
                    handleHashClick(e, link.href);
                    setMobileOpen(false);
                  }}
                >
                  {link.label}
                </a>
              )
            )}

            <div className="pt-3 border-t border-border-subtle space-y-2">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="block px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    {loggingOut && (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {loggingOut ? 'Logging out…' : 'Logout'}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary"
                  >
                    Login
                  </Link>
                  <a
                    href="/demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Play className="w-3.5 h-3.5" /> Try Demo
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Pricing Modal — opened from navbar */}
      <PricingModal
        isOpen={pricingOpen}
        onClose={() => {
          setPricingOpen(false);
          setCheckoutLoading(false);
        }}
        onUpgrade={handlePricingUpgrade}
        onStartTrial={handleStartTrial}
        checkoutLoading={checkoutLoading}
        onValidateCoupon={user ? handleValidateCoupon : null}
        isPro={subscription?.plan === 'pro'}
        freeTrialUsed={!!subscription?.free_trial_used}
        subscriptionLoading={subLoading}
        isTrialActive={!!subscription?.free_trial_used && subscription?.plan === 'pro' && subscription?.free_trial_end_at && new Date(subscription.free_trial_end_at) >= new Date()}
      />
    </>
  );
}
