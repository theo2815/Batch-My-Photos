/**
 * BatchLimitCard Component
 *
 * Shown when user has exceeded their monthly batch limit.
 * Provides upgrade CTA and reassurance about file safety.
 */

import React from 'react';
import { AlertTriangle, Crown, ArrowLeft, ShieldCheck } from 'lucide-react';
import './StatusCards.css';

function BatchLimitCard({ limitInfo, onUpgrade, onGoBack }) {
  const { message, usage, isExpired } = limitInfo;

  const usedCount = usage?.used ?? 0;
  const limitCount = usage?.limit ?? 2;
  const usagePercent = limitCount > 0 ? Math.min((usedCount / limitCount) * 100, 100) : 100;

  return (
    <div className="status-card batch-limit">
      <div className="batch-limit-icon">
        <AlertTriangle size={56} />
      </div>

      <h2>{isExpired ? 'Subscription Expired' : 'Batch Limit Reached'}</h2>

      <p className="batch-limit-message">{message}</p>

      {usage && !isExpired && (
        <div className="batch-limit-usage">
          <div className="usage-label">
            <span>Monthly Usage</span>
            <span className="usage-count">{usedCount} / {limitCount} batches</span>
          </div>
          <div className="usage-bar">
            <div className="usage-bar-fill" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      )}

      <div className="batch-limit-reassurance">
        <ShieldCheck size={16} />
        <span>Your files are safe — no changes were made.</span>
      </div>

      <div className="batch-limit-actions">
        <button className="btn primary" onClick={onUpgrade}>
          <Crown size={18} />
          Upgrade to Pro
        </button>
        <button className="btn secondary" onClick={onGoBack}>
          <ArrowLeft size={18} />
          Go Back
        </button>
      </div>
    </div>
  );
}

export default BatchLimitCard;
