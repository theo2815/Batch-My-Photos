/**
 * BatchLimitCard Component
 *
 * Shown when user has exceeded their monthly batch limit.
 * Provides upgrade CTA and reassurance about file safety.
 */

import React from 'react';
import { AlertTriangle, Crown, ArrowLeft, ShieldCheck, WifiOff, RefreshCw } from 'lucide-react';
import './StatusCards.css';

function BatchLimitCard({ limitInfo, onUpgrade, onGoBack, onRetry }) {
  const { message, usage, isExpired, isOfflineFree } = limitInfo;

  const usedCount = usage?.used ?? 0;
  const limitCount = usage?.limit ?? 2;
  const usagePercent = limitCount > 0 ? Math.min((usedCount / limitCount) * 100, 100) : 100;

  return (
    <div className={`status-card batch-limit ${isOfflineFree ? 'offline-free' : ''}`}>
      <div className="batch-limit-icon">
        {isOfflineFree ? <WifiOff size={56} /> : <AlertTriangle size={56} />}
      </div>

      <h2>
        {isOfflineFree
          ? 'No Internet Connection'
          : isExpired
            ? 'Subscription Expired'
            : 'Batch Limit Reached'}
      </h2>

      <p className="batch-limit-message">{message}</p>

      {usage && !isExpired && !isOfflineFree && (
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
        {isOfflineFree ? (
          <>
            <button className="btn primary" onClick={onRetry}>
              <RefreshCw size={18} />
              Try Again
            </button>
            <button className="btn secondary" onClick={onUpgrade}>
              <Crown size={18} />
              Upgrade to Pro
            </button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={onUpgrade}>
              <Crown size={18} />
              Upgrade to Pro
            </button>
            <button className="btn secondary" onClick={onGoBack}>
              <ArrowLeft size={18} />
              Go Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default BatchLimitCard;
