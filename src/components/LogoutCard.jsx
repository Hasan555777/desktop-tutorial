import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';

function LogoutCard({ user }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        await signOut(auth);
        toast.success('👋 Logged out successfully');
        navigate('/login');
      } catch (error) {
        console.error("Logout error:", error);
        toast.error('Failed to logout');
      }
    }
  };

  return (
    <div className="category-item logout-item" onClick={handleLogout}>
      <div className="icon logout"><i className="fas fa-sign-out-alt"></i></div>
      <div className="content">
        <div className="title" style={{ color: '#b91c1c' }}>Logout</div>
        <div className="sub" style={{ color: '#b91c1c', opacity: 0.7 }}>
          Sign out of your account
        </div>
      </div>
      <div className="arrow" style={{ color: '#b91c1c' }}>
        <i className="fas fa-chevron-right"></i>
      </div>
    </div>
  );
}

export default LogoutCard;