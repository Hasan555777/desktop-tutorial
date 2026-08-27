// src/hooks/useUserRole.js
import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';

export const useUserRole = (chatContext, currentUser) => {
  const [userRole, setUserRole] = useState(null);
  const [postType, setPostType] = useState('hire');
  const [isPostOwner, setIsPostOwner] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const detectUserRoleAndPostType = async () => {
      if (!currentUser || !chatContext) {
        setRoleLoading(false);
        return;
      }

      try {
        const detectedPostType = chatContext?.type || chatContext?.postType || 'hire';
        setPostType(detectedPostType);

        const fullData = chatContext?.fullData || chatContext || {};
        const buyerId = fullData.buyerId || chatContext?.buyerId;
        const sellerId = fullData.sellerId || chatContext?.sellerId;

        let isOwner = false;
        if (detectedPostType === 'hire') {
          isOwner = buyerId === currentUser.uid;
        } else if (detectedPostType === 'service') {
          isOwner = sellerId === currentUser.uid;
        }

        setIsPostOwner(isOwner);
        let detectedRole = 'buyer';
        if (detectedPostType === 'hire') {
          detectedRole = isOwner ? 'buyer' : 'seller';
        } else if (detectedPostType === 'service') {
          detectedRole = isOwner ? 'seller' : 'buyer';
        }
        setUserRole(detectedRole);
      } catch (error) {
        logger.error('Error detecting user role:', error);
        setUserRole('buyer');
      } finally {
        setRoleLoading(false);
      }
    };

    detectUserRoleAndPostType();
  }, [currentUser, chatContext]);

  return { userRole, postType, isPostOwner, roleLoading };
};
