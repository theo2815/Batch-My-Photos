import React, { useState, useRef, useEffect } from 'react'
import { User, LogOut, Crown, ExternalLink } from 'lucide-react'
import './ProfileDropdown.css'

export function ProfileDropdown({ user, subscription, onLogout, onViewProfile, onUpgrade }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const isPro = subscription?.plan === 'pro' && subscription?.status === 'active'
  const usageText = subscription?.usage
    ? `${subscription.usage.used} / ${subscription.usage.limit == null ? '∞' : subscription.usage.limit} batches`
    : ''

  // Derive display name and initial
  const firstName = user.name
    ? user.name.split(' ')[0]
    : user.email.split('@')[0]
  const initial = firstName.charAt(0).toUpperCase()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="profile-dropdown" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="profile-trigger"
      >
        <div className="profile-avatar">
          <span className="avatar-initial">{initial}</span>
        </div>
        <span className="profile-name">{firstName}</span>
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <div className="dropdown-header">
            <div className="header-label">Signed in as</div>
            <div className="header-email">{user.email}</div>
            {isPro && (
              <div className="header-plan">
                <Crown className="plan-icon" />
                Pro
              </div>
            )}
            {usageText && (
              <div className="header-usage">{usageText} used</div>
            )}
          </div>

          <div className="dropdown-divider" />

          <div className="dropdown-items">
            <button
              onClick={() => {
                onViewProfile()
                setIsOpen(false)
              }}
              className="dropdown-item"
            >
              <User className="item-icon" />
              View Profile
              <ExternalLink className="item-icon-right" />
            </button>

            {!isPro && (
              <button
                onClick={() => {
                  onUpgrade()
                  setIsOpen(false)
                }}
                className="dropdown-item upgrade-item"
              >
                <Crown className="item-icon" />
                Upgrade to Pro
                <ExternalLink className="item-icon-right" />
              </button>
            )}

            <div className="dropdown-divider" />

            <button
              onClick={() => {
                onLogout()
                setIsOpen(false)
              }}
              className="dropdown-item logout-item"
            >
              <LogOut className="item-icon" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
