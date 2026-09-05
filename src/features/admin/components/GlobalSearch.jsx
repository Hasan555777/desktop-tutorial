// src/pages/Admin/components/GlobalSearch.jsx

import React from 'react';
import { formatMoney, formatDate } from '../utils/adminUtils';
import styles from './GlobalSearch.module.css';

// ============================================================
// 🎯 GLOBAL SEARCH COMPONENT
// ============================================================

const SearchResultItem = ({ item, onSelect, formatMoney, formatDate }) => {
  const getIcon = (type) => {
    const icons = {
      'user': 'fa-solid fa-user',
      'post': 'fa-solid fa-file-alt',
      'deal': 'fa-solid fa-handshake',
      'withdrawal': 'fa-solid fa-money-bill-transfer',
      'deposit': 'fa-solid fa-money-bill-wave'
    };
    return icons[type] || 'fa-solid fa-search';
  };

  const getTypeLabel = (type) => {
    const labels = {
      'user': '👤 ইউজার',
      'post': '📄 পোস্ট',
      'deal': '🤝 ডিল',
      'withdrawal': '💳 উইথড্র',
      'deposit': '💰 ডিপোজিট'
    };
    return labels[type] || type;
  };

  const getTypeClass = (type) => {
    return type || 'unknown';
  };

  const getMetaInfo = () => {
    switch (item.type) {
      case 'user':
        return `রোল: ${item.role === 'client' ? 'ক্লায়েন্ট' : 'ফ্রিল্যান্সার'}`;
      case 'post':
        return `তারিখ: ${formatDate(item.createdAt)}`;
      case 'deal':
        return `স্ট্যাটাস: ${item.status || 'প্রক্রিয়াধীন'}`;
      case 'withdrawal':
        return `স্ট্যাটাস: ${item.status || 'পেন্ডিং'}`;
      case 'deposit':
        return `স্ট্যাটাস: ${item.status || 'পেন্ডিং'} | মেথড: ${item.method || 'N/A'}`;
      default:
        return '';
    }
  };

  return (
    <div className={styles.searchResultItem} onClick={() => onSelect(item)}>
      <div className={styles.resultIcon}>
        <i className={getIcon(item.type)}></i>
      </div>
      <div className={styles.resultInfo}>
        <h4>
          {item.displayTitle || item.displayName || 'Unnamed'}
          <span className={`${styles.resultTypeBadge} ${styles[getTypeClass(item.type)]}`}>
            {getTypeLabel(item.type)}
          </span>
        </h4>
        <p>
          {item.email && `📧 ${item.email}`}
          {item.uniqueId && ` | 🆔 ${item.uniqueId}`}
          {item.budget && ` | 💰 ${formatMoney(item.budget)}`}
          {item.amount && ` | 💰 ${formatMoney(item.amount)}`}
          {item.phone && ` | 📱 ${item.phone}`}
          {item.userDisplayName && ` | 👤 ${item.userDisplayName}`}
          {item.userEmail && ` | 📧 ${item.userEmail}`}
        </p>
        <small className={styles.resultMeta}>{getMetaInfo()}</small>
      </div>
    </div>
  );
};

const GlobalSearch = ({ 
  query, 
  onSearch, 
  isSearching, 
  results, 
  onResultSelect,
  formatMoney,
  formatDate 
}) => {
  const handleClear = () => {
    onSearch('');
  };

  return (
    <div className={styles.searchBarContainer}>
      <input
        type="text"
        className={styles.searchInput}
        placeholder="🔍 আইডি, নাম, ইমেইল, ফোন দিয়ে খুঁজুন..."
        value={query}
        onChange={(e) => onSearch(e.target.value)}
      />
      {isSearching && (
        <span className={styles.searchLoading}>
          <i className="fa-solid fa-spinner fa-spin"></i>
        </span>
      )}
      {query && results.length === 0 && !isSearching && (
        <span className={styles.searchNoResult}>
          <i className="fa-solid fa-search"></i> কোন ফলাফল পাওয়া যায়নি
        </span>
      )}
      {query && results.length > 0 && (
        <span className={styles.searchResultCount}>
          {results.length} টি ফলাফল
        </span>
      )}

      {/* Search Results Dropdown */}
      {results.length > 0 && (
        <div className={styles.searchResultsDropdown}>
          <div className={styles.searchResultsHeader}>
            <span>পাওয়া গেছে {results.length} টি ফলাফল</span>
            <button className={styles.clearSearch} onClick={handleClear}>
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
          {results.map((item, index) => (
            <SearchResultItem
              key={`${item.type}-${item.id}-${index}`}
              item={item}
              onSelect={onResultSelect}
              formatMoney={formatMoney}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;