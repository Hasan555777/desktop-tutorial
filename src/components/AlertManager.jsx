// components/AlertManager.jsx
import React, { useState, createContext, useContext } from 'react';
import CustomAlert from './CustomAlert';

const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);

  const showAlert = (message, type = 'info', duration = 3000, position = 'top-center') => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, message, type, duration, position }]);
  };

  const removeAlert = (id) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const alertFunctions = {
    success: (message, duration = 3000) => showAlert(message, 'success', duration),
    error: (message, duration = 4000) => showAlert(message, 'error', duration),
    warning: (message, duration = 3000) => showAlert(message, 'warning', duration),
    info: (message, duration = 3000) => showAlert(message, 'info', duration),
  };

  return (
    <AlertContext.Provider value={alertFunctions}>
      {children}
      <div className="alert-container">
        {alerts.map(alert => (
          <CustomAlert
            key={alert.id}
            type={alert.type}
            message={alert.message}
            duration={alert.duration}
            position={alert.position}
            onClose={() => removeAlert(alert.id)}
          />
        ))}
      </div>
    </AlertContext.Provider>
  );
};